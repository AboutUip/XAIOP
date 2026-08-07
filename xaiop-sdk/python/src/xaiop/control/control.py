"""SDK Control Root (`#!`) — demux, frame codec, and session helpers."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from typing import Any, Callable

CONTROL_NS = "xaiop"

CONTROL_NAME = {
    "TYPES": "types",
    "SESSION": "session",
    "RESUME": "resume",
    "ACK": "ack",
    "SNAPSHOT": "snapshot",
    "SEQ": "seq",
}

CONTROL_CAPABILITY = {
    "TYPES_V1": "xaiop/types/v1",
    "SESSION_V1": "xaiop/session/v1",
    "RESUME_V1": "xaiop/resume/v1",
    "ACK_V1": "xaiop/ack/v1",
    "SNAPSHOT_V1": "xaiop/snapshot/v1",
    "SEQ_V1": "xaiop/seq/v1",
}

_HEADER_RE = re.compile(
    r"^#!([A-Za-z][A-Za-z0-9_-]*)/([A-Za-z][A-Za-z0-9_-]*)/v(\d+)$"
)


class XaiopControlError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "CONTROL_ERROR",
        header: str | None = None,
        frame: Any = None,
        cause: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.header = header
        self.frame = frame
        self.cause = cause


@dataclass
class ControlFrame:
    ns: str
    name: str
    version: int
    id: str
    header: str
    body: str
    raw: str


def is_sdk_control_line(line: str) -> bool:
    return isinstance(line, str) and len(line) >= 2 and line[0] == "#" and line[1] == "!"


def parse_control_header(line: str) -> dict[str, Any] | None:
    if not is_sdk_control_line(line):
        return None
    m = _HEADER_RE.match(line)
    if not m:
        return None
    return {
        "ns": m.group(1),
        "name": m.group(2),
        "version": int(m.group(3)),
        "id": f"{m.group(1)}/{m.group(2)}/v{m.group(3)}",
        "header": line,
    }


def encode_control_frame(
    ns: str,
    name: str,
    version: int,
    body: Any = None,
) -> str:
    if not isinstance(ns, str) or not ns or not isinstance(name, str) or not name:
        raise TypeError("encode_control_frame requires ns and name")
    ver = int(version)
    if ver < 1:
        raise TypeError("encode_control_frame version must be a positive integer")
    header = f"#!{ns}/{name}/v{ver}"
    if body is None:
        body_text = ""
    elif isinstance(body, str):
        body_text = body
    else:
        body_text = json.dumps(body)
    if "\n" in body_text or "\r" in body_text:
        raise XaiopControlError(
            "control frame body must be a single logical line (no CR/LF)",
            code="CONTROL_BODY_MULTILINE",
            header=header,
        )
    return f"{header}\n{body_text}\n"


def encode_session_frame(body: Any) -> str:
    return encode_control_frame(CONTROL_NS, CONTROL_NAME["SESSION"], 1, body)


def encode_resume_frame(body: Any) -> str:
    return encode_control_frame(CONTROL_NS, CONTROL_NAME["RESUME"], 1, body)


def encode_ack_frame(body: Any) -> str:
    return encode_control_frame(CONTROL_NS, CONTROL_NAME["ACK"], 1, body)


def encode_snapshot_frame(body: Any) -> str:
    return encode_control_frame(CONTROL_NS, CONTROL_NAME["SNAPSHOT"], 1, body)


def encode_seq_frame(body: Any) -> str:
    seq = body if isinstance(body, int) else (body or {}).get("seq")
    n = int(seq)
    if n < 1:
        raise TypeError("encode_seq_frame requires seq >= 1")
    return encode_control_frame(CONTROL_NS, CONTROL_NAME["SEQ"], 1, {"seq": n})


def stamp_wire_with_log_seq(seq: int, wire: str) -> str:
    if not isinstance(wire, str):
        raise TypeError("stamp_wire_with_log_seq requires wire string")
    return encode_seq_frame(seq) + wire


def _looks_complete_json(text: str) -> bool:
    t = text.strip()
    if not t:
        return True
    try:
        json.loads(t)
        return True
    except json.JSONDecodeError:
        return False


class ControlDemux:
    def __init__(self) -> None:
        self._carry = ""
        self._pending_header: dict[str, Any] | None = None
        self._skip_body_after_bad_header: str | None = None
        self._skip_next_empty_wire_line = False

    def push(
        self,
        text: str,
        *,
        finalize_bodies: bool = False,
    ) -> dict[str, Any]:
        frames: list[ControlFrame] = []
        errors: list[XaiopControlError] = []
        wire_parts: list[str] = []

        if isinstance(text, str) and text:
            self._carry += text

        start = 0
        while start < len(self._carry):
            nl = self._carry.find("\n", start)
            if nl < 0:
                break
            line = self._carry[start:nl]
            if line.endswith("\r"):
                line = line[:-1]
            raw_line_with_nl = self._carry[start : nl + 1]
            start = nl + 1
            self._handle_complete_line(
                line, raw_line_with_nl, wire_parts, frames, errors
            )
        self._carry = self._carry[start:]

        if finalize_bodies:
            self._finalize_pending(wire_parts, frames, errors, True)
        elif self._pending_header and self._carry:
            if _looks_complete_json(self._carry):
                self._complete_frame(self._carry, frames)
                self._pending_header = None
                self._carry = ""
                self._skip_next_empty_wire_line = True
        elif self._skip_body_after_bad_header and self._carry:
            if _looks_complete_json(self._carry) or self._carry:
                self._skip_body_after_bad_header = None
                self._carry = ""
                self._skip_next_empty_wire_line = True

        return {
            "wireText": "".join(wire_parts),
            "frames": frames,
            "errors": errors,
        }

    def flush(self) -> dict[str, Any]:
        return self.push("", finalize_bodies=True)

    @property
    def has_pending(self) -> bool:
        return (
            bool(self._carry)
            or self._pending_header is not None
            or self._skip_body_after_bad_header is not None
        )

    def _handle_complete_line(
        self,
        line: str,
        raw_line_with_nl: str,
        wire_parts: list[str],
        frames: list[ControlFrame],
        errors: list[XaiopControlError],
    ) -> None:
        if self._skip_body_after_bad_header:
            self._skip_body_after_bad_header = None
            return

        if self._pending_header:
            self._complete_frame(line, frames)
            self._pending_header = None
            return

        if is_sdk_control_line(line):
            header = parse_control_header(line)
            if not header:
                errors.append(
                    XaiopControlError(
                        f"malformed control header: {line}",
                        code="CONTROL_HEADER_MALFORMED",
                        header=line,
                    )
                )
                self._skip_body_after_bad_header = line
                return
            self._pending_header = header
            return

        if line == "" and self._skip_next_empty_wire_line:
            self._skip_next_empty_wire_line = False
            return
        self._skip_next_empty_wire_line = False
        wire_parts.append(raw_line_with_nl)

    def _finalize_pending(
        self,
        wire_parts: list[str],
        frames: list[ControlFrame],
        errors: list[XaiopControlError],
        eof: bool,
    ) -> None:
        if not eof:
            return
        if self._carry:
            rem = self._carry
            self._carry = ""
            if self._pending_header:
                self._complete_frame(rem, frames)
                self._pending_header = None
                return
            if self._skip_body_after_bad_header:
                self._skip_body_after_bad_header = None
                return
            if is_sdk_control_line(rem):
                header = parse_control_header(rem)
                if not header:
                    errors.append(
                        XaiopControlError(
                            f"malformed control header: {rem}",
                            code="CONTROL_HEADER_MALFORMED",
                            header=rem,
                        )
                    )
                else:
                    self._pending_header = header
                    self._complete_frame("", frames)
                    self._pending_header = None
                return
            wire_parts.append(rem)
            return
        if self._skip_body_after_bad_header:
            self._skip_body_after_bad_header = None
            return
        if self._pending_header:
            self._complete_frame("", frames)
            self._pending_header = None

    def _complete_frame(self, body: str, frames: list[ControlFrame]) -> None:
        h = self._pending_header
        if not h:
            return
        body_text = body if isinstance(body, str) else ""
        frames.append(
            ControlFrame(
                ns=h["ns"],
                name=h["name"],
                version=h["version"],
                id=h["id"],
                header=h["header"],
                body=body_text,
                raw=f"{h['header']}\n{body_text}",
            )
        )


def parse_control_body_json(frame: ControlFrame) -> Any:
    t = (frame.body or "").strip()
    if not t:
        return None
    try:
        return json.loads(t)
    except json.JSONDecodeError as err:
        raise XaiopControlError(
            f"invalid control JSON for {frame.id}",
            code="CONTROL_BODY_JSON",
            header=frame.header,
            frame=frame,
            cause=err,
        ) from err


def dispatch_control_frame(
    frame: ControlFrame,
    handlers: dict[str, Any] | None = None,
) -> None:
    handlers = handlers or {}

    def report(err: XaiopControlError) -> None:
        fn = handlers.get("onControlError")
        if callable(fn):
            fn(err)

    if frame.ns != CONTROL_NS:
        report(
            XaiopControlError(
                f"unknown control namespace: {frame.ns}",
                code="CONTROL_UNKNOWN_NS",
                header=frame.header,
                frame=frame,
            )
        )
        return

    try:
        if frame.name == CONTROL_NAME["TYPES"]:
            if frame.version != 1:
                report(
                    XaiopControlError(
                        f"unsupported types version: v{frame.version}",
                        code="CONTROL_UNKNOWN_CAPABILITY",
                        header=frame.header,
                        frame=frame,
                    )
                )
                return
            body = parse_control_body_json(frame)
            if not body or body.get("version") != 1 or not isinstance(
                body.get("entries"), list
            ):
                raise XaiopControlError(
                    "invalid type schema frame payload",
                    code="CONTROL_TYPES_PAYLOAD",
                    header=frame.header,
                    frame=frame,
                )
            fn = handlers.get("onTypes")
            if callable(fn):
                fn(body, frame)
            return

        if frame.name == CONTROL_NAME["SESSION"]:
            if frame.version != 1:
                report(
                    XaiopControlError(
                        f"unsupported session version: v{frame.version}",
                        code="CONTROL_UNKNOWN_CAPABILITY",
                        header=frame.header,
                        frame=frame,
                    )
                )
                return
            body = parse_control_body_json(frame) or {}
            fn = handlers.get("onSession")
            if callable(fn):
                fn(body, frame)
            return

        if frame.name == CONTROL_NAME["RESUME"]:
            if frame.version != 1:
                report(
                    XaiopControlError(
                        f"unsupported resume version: v{frame.version}",
                        code="CONTROL_UNKNOWN_CAPABILITY",
                        header=frame.header,
                        frame=frame,
                    )
                )
                return
            body = parse_control_body_json(frame) or {}
            fn = handlers.get("onResume")
            if callable(fn):
                fn(body, frame)
            return

        if frame.name == CONTROL_NAME["ACK"]:
            if frame.version != 1:
                report(
                    XaiopControlError(
                        f"unsupported ack version: v{frame.version}",
                        code="CONTROL_UNKNOWN_CAPABILITY",
                        header=frame.header,
                        frame=frame,
                    )
                )
                return
            body = parse_control_body_json(frame) or {}
            fn = handlers.get("onAck")
            if callable(fn):
                fn(body, frame)
            return

        if frame.name == CONTROL_NAME["SNAPSHOT"]:
            if frame.version != 1:
                report(
                    XaiopControlError(
                        f"unsupported snapshot version: v{frame.version}",
                        code="CONTROL_UNKNOWN_CAPABILITY",
                        header=frame.header,
                        frame=frame,
                    )
                )
                return
            body = parse_control_body_json(frame)
            fn = handlers.get("onSnapshot")
            if callable(fn):
                fn(body, frame)
            return

        if frame.name == CONTROL_NAME["SEQ"]:
            if frame.version != 1:
                report(
                    XaiopControlError(
                        f"unsupported seq version: v{frame.version}",
                        code="CONTROL_UNKNOWN_CAPABILITY",
                        header=frame.header,
                        frame=frame,
                    )
                )
                return
            body = parse_control_body_json(frame) or {}
            n = int(body.get("seq", 0))
            if n < 1:
                raise XaiopControlError(
                    "invalid seq frame payload (need seq >= 1)",
                    code="CONTROL_SEQ_PAYLOAD",
                    header=frame.header,
                    frame=frame,
                )
            fn = handlers.get("onSeq")
            if callable(fn):
                fn(body, frame)
            return

        report(
            XaiopControlError(
                f"unknown control capability: {frame.id}",
                code="CONTROL_UNKNOWN_CAPABILITY",
                header=frame.header,
                frame=frame,
            )
        )
    except XaiopControlError as err:
        report(err)
    except Exception as err:
        report(
            XaiopControlError(
                str(err),
                code="CONTROL_DISPATCH",
                header=frame.header,
                frame=frame,
                cause=err,
            )
        )


class ControlIngest:
    def __init__(self, handlers: dict[str, Any] | None = None) -> None:
        self._demux = ControlDemux()
        self._handlers = handlers or {}

    def set_handlers(self, handlers: dict[str, Any]) -> None:
        self._handlers = handlers or {}

    def push(self, text: str) -> str:
        result = self._demux.push(text)
        self._emit_errors(result["errors"])
        for frame in result["frames"]:
            dispatch_control_frame(frame, self._handlers)
        return result["wireText"]

    def flush(self) -> str:
        result = self._demux.flush()
        self._emit_errors(result["errors"])
        for frame in result["frames"]:
            dispatch_control_frame(frame, self._handlers)
        return result["wireText"]

    def _emit_errors(self, errors: list[XaiopControlError]) -> None:
        fn = self._handlers.get("onControlError")
        if not callable(fn):
            return
        for err in errors:
            fn(err)


def _default_capabilities() -> list[str]:
    return list(CONTROL_CAPABILITY.values())


def create_session_id() -> str:
    return str(uuid.uuid4())


class ControlSessionState:
    def __init__(
        self,
        *,
        session_id: str | None = None,
        role: str = "duplex",
        capabilities: list[str] | None = None,
        epoch: int = 0,
    ) -> None:
        self.session_id = session_id if session_id else None
        self.role = role
        self.capabilities = (
            capabilities[:] if capabilities else _default_capabilities()
        )
        self.epoch = epoch if isinstance(epoch, int) and epoch >= 0 else 0
        self.phase_seq = 0
        self.acked_seq = 0
        self.peer_session_id: str | None = None
        self.peer_capabilities: list[str] | None = None

    def ensure_session_id(self) -> str:
        if not self.session_id:
            self.session_id = create_session_id()
        return self.session_id

    def next_phase_seq(self) -> int:
        self.phase_seq += 1
        return self.phase_seq

    def note_ack(self, seq: int) -> bool:
        n = int(seq)
        if n < 0:
            return False
        if n > self.acked_seq:
            self.acked_seq = n
            return True
        return False

    def apply_peer_session(self, body: Any) -> None:
        if not body or not isinstance(body, dict):
            return
        sid = body.get("sessionId")
        if isinstance(sid, str) and sid:
            self.peer_session_id = sid
            if not self.session_id:
                self.session_id = sid
        ep = body.get("epoch")
        if isinstance(ep, int) and ep >= 0:
            self.epoch = ep
        caps = body.get("capabilities")
        if isinstance(caps, list):
            self.peer_capabilities = caps[:]

    def to_session_body(self) -> dict[str, Any]:
        return {
            "sessionId": self.ensure_session_id(),
            "role": self.role,
            "capabilities": self.capabilities[:],
            "epoch": self.epoch,
        }

    def to_resume_state(self, committed_snapshot: Any = None) -> dict[str, Any]:
        out: dict[str, Any] = {
            "sessionId": self.ensure_session_id(),
            "seq": self.phase_seq,
            "epoch": self.epoch,
        }
        if committed_snapshot is not None:
            out["committedSnapshot"] = committed_snapshot
        return out


def _normalize_session_init(init: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if "sessionId" in init:
        out["session_id"] = init["sessionId"]
    elif "session_id" in init:
        out["session_id"] = init["session_id"]
    if "role" in init:
        out["role"] = init["role"]
    if "capabilities" in init:
        out["capabilities"] = init["capabilities"]
    if "epoch" in init:
        out["epoch"] = init["epoch"]
    return out


class ControlPlaneHost:
    """Shared control-plane host for WS / Stream surfaces."""

    def __init__(
        self,
        *,
        send: Callable[[str], bool],
        get_committed_snapshot: Callable[[], Any] | None = None,
        on_control_error: Callable[[XaiopControlError], None] | None = None,
        on_session: Callable[[Any, ControlFrame], None] | None = None,
        on_resume: Callable[[Any, ControlFrame], None] | None = None,
        on_ack: Callable[[Any, ControlFrame], None] | None = None,
        on_snapshot: Callable[[Any, ControlFrame], None] | None = None,
        on_types: Callable[[Any, ControlFrame], None] | None = None,
        on_seq: Callable[[Any, ControlFrame], None] | None = None,
        session: bool | dict[str, Any] = False,
        auto_ack: bool = False,
    ) -> None:
        if not callable(send):
            raise TypeError("ControlPlaneHost requires send(text)")
        self._send = send
        self._get_committed_snapshot = get_committed_snapshot
        self._on_control_error = on_control_error
        self._on_session = on_session
        self._on_resume = on_resume
        self._on_ack = on_ack
        self._on_snapshot = on_snapshot
        self._on_types = on_types
        self._on_seq_extra = on_seq
        self._auto_ack = auto_ack is True
        self._checkpoint: Any = None
        self._pending_log_seqs: list[int] = []
        self.last_snapshot: Any = None
        self._session: ControlSessionState | None = None
        if session:
            init = {} if session is True else _normalize_session_init(session)
            self._session = ControlSessionState(**init)
            self._session.ensure_session_id()
        self._ingest = ControlIngest(
            {
                "onControlError": self._report_control_error,
                "onTypes": self._handle_types,
                "onSession": self._handle_session,
                "onResume": self._handle_resume,
                "onAck": self._handle_ack,
                "onSnapshot": self._handle_snapshot,
                "onSeq": self._handle_seq,
            }
        )

    @property
    def session(self) -> ControlSessionState | None:
        return self._session

    @property
    def session_id(self) -> str | None:
        return self._session.session_id if self._session else None

    @property
    def phase_seq(self) -> int:
        return self._session.phase_seq if self._session else 0

    @property
    def acked_seq(self) -> int:
        return self._session.acked_seq if self._session else 0

    def bind_checkpoint(self, checkpoint: Any) -> ControlPlaneHost:
        if checkpoint is not None and callable(getattr(checkpoint, "note_log_seq", None)):
            self._checkpoint = checkpoint
        else:
            self._checkpoint = None
        if self._checkpoint and self._pending_log_seqs:
            for seq in self._pending_log_seqs:
                self._checkpoint.note_log_seq(seq)
            self._pending_log_seqs.clear()
        return self

    def push(self, text: str) -> str:
        return self._ingest.push(text)

    def flush(self) -> str:
        return self._ingest.flush()

    def note_phase_meta(self, meta: dict[str, Any] | None) -> None:
        if not meta or not self._session:
            return
        cursor = (
            meta.get("logSeq")
            if isinstance(meta.get("logSeq"), int)
            else meta.get("seq")
            if isinstance(meta.get("seq"), int)
            else None
        )
        if isinstance(cursor, int) and cursor > self._session.phase_seq:
            self._session.phase_seq = cursor
        if self._auto_ack and isinstance(cursor, int) and cursor > 0:
            self.send_ack(cursor)

    def send_session(self, extra: dict[str, Any] | None = None) -> bool:
        if not self._session:
            self._session = ControlSessionState()
        body = {**self._session.to_session_body(), **(extra or {})}
        return self._send(encode_session_frame(body))

    def send_ack(self, seq: int | None = None) -> bool:
        if not self._session:
            raise TypeError("send_ack requires session=True (or prior send_session)")
        n = self._session.phase_seq if seq is None else int(seq)
        if n < 0:
            raise TypeError("send_ack requires a non-negative integer seq")
        return self._send(
            encode_ack_frame(
                {
                    "sessionId": self._session.ensure_session_id(),
                    "seq": n,
                }
            )
        )

    def send_resume(self, body: dict[str, Any]) -> bool:
        if not body or not isinstance(body, dict):
            raise TypeError("send_resume requires { sessionId?, fromSeq }")
        from_seq = int(body.get("fromSeq", body.get("from_seq", -1)))
        if from_seq < 0:
            raise TypeError("send_resume.fromSeq must be a non-negative integer")
        session_id = body.get("sessionId") or body.get("session_id")
        if not session_id:
            if not self._session:
                raise TypeError("send_resume requires sessionId")
            session_id = self._session.ensure_session_id()
        payload: dict[str, Any] = {"sessionId": session_id, "fromSeq": from_seq}
        epoch = body.get("epoch")
        if isinstance(epoch, int) and epoch >= 0:
            payload["epoch"] = epoch
        return self._send(encode_resume_frame(payload))

    def send_snapshot(self, json_value: Any = None) -> bool:
        if not self._session:
            raise TypeError("send_snapshot requires session=True")
        tree = json_value
        if tree is None and self._get_committed_snapshot:
            tree = self._get_committed_snapshot()
        return self._send(
            encode_snapshot_frame(
                {
                    "sessionId": self._session.ensure_session_id(),
                    "seq": self._session.phase_seq,
                    "tree": tree,
                }
            )
        )

    def get_resume_state(self, committed_snapshot: Any = None) -> dict[str, Any] | None:
        if not self._session:
            return None
        snap = committed_snapshot
        if snap is None and self._get_committed_snapshot:
            snap = self._get_committed_snapshot()
        return self._session.to_resume_state(snap)

    def on_resume(self, fn: Callable[[Any, ControlFrame], None] | None) -> ControlPlaneHost:
        self._on_resume = fn if callable(fn) else None
        return self

    def on_session(self, fn: Callable[[Any, ControlFrame], None] | None) -> ControlPlaneHost:
        self._on_session = fn if callable(fn) else None
        return self

    def on_ack(self, fn: Callable[[Any, ControlFrame], None] | None) -> ControlPlaneHost:
        self._on_ack = fn if callable(fn) else None
        return self

    def on_snapshot(self, fn: Callable[[Any, ControlFrame], None] | None) -> ControlPlaneHost:
        self._on_snapshot = fn if callable(fn) else None
        return self

    def on_control_error(
        self, fn: Callable[[XaiopControlError], None] | None
    ) -> ControlPlaneHost:
        self._on_control_error = fn if callable(fn) else None
        return self

    def _queue_log_seq(self, seq: int) -> None:
        if self._checkpoint:
            self._checkpoint.note_log_seq(seq)
            return
        self._pending_log_seqs.append(seq)

    def _handle_types(self, body: Any, frame: ControlFrame) -> None:
        if self._on_types:
            self._on_types(body, frame)

    def _handle_session(self, body: Any, frame: ControlFrame) -> None:
        if self._session:
            self._session.apply_peer_session(body)
        if self._on_session:
            self._on_session(body, frame)

    def _handle_resume(self, body: Any, frame: ControlFrame) -> None:
        if self._on_resume:
            self._on_resume(body, frame)

    def _handle_ack(self, body: Any, frame: ControlFrame) -> None:
        if self._session and isinstance(body, dict):
            self._session.note_ack(int(body.get("seq", 0)))
        if self._on_ack:
            self._on_ack(body, frame)

    def _handle_snapshot(self, body: Any, frame: ControlFrame) -> None:
        if isinstance(body, dict) and "tree" in body:
            self.last_snapshot = body["tree"]
        if self._on_snapshot:
            self._on_snapshot(body, frame)

    def _handle_seq(self, body: Any, frame: ControlFrame) -> None:
        n = int(body.get("seq", 0)) if isinstance(body, dict) else 0
        if n >= 1:
            self._queue_log_seq(n)
        if self._on_seq_extra:
            self._on_seq_extra(body, frame)

    def _report_control_error(self, err: XaiopControlError) -> None:
        if self._on_control_error:
            self._on_control_error(err)
