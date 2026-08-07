"""One WebSocket carrying XAIOP phases (push and/or consume)."""

from __future__ import annotations

import codecs
import threading
from concurrent.futures import Future
from typing import Any, Callable

from ..checkpoint import DotCheckpointEngine
from ..clone import clone_json
from ..compat import CompatPolicy
from ..control import (
    ControlPlaneHost,
    ResumeWireLog,
    XaiopControlError,
    stamp_wire_with_log_seq,
)
from ..phase_encode import encode_phase_json, encode_phase_object
from ..types import TypeFreezeSession, TypeRegistry, encode_type_schema_frame


class XaiopWsConnection:
    OPEN = 1

    def __init__(self, socket: Any, **options: Any) -> None:
        if socket is None or not callable(getattr(socket, "send", None)):
            raise TypeError("XaiopWsConnection requires a WebSocket-like socket")
        self._ws = socket
        self._stream_processing = options.get("stream_processing", options.get("streamProcessing", True)) is not False
        self._compatibility_mode = bool(options.get("compatibility_mode", options.get("compatibilityMode")))
        self._merge_chunk_window = options.get("merge_chunk_window", options.get("mergeChunkWindow", True)) is not False
        self._async_parse = options.get("async_parse", options.get("asyncParse")) is True
        self._cover = options.get("cover") is True
        self._symbol_keys = options.get("symbol_keys", options.get("symbolKeys")) is True
        self._type_check = bool(options.get("type_check", options.get("typeCheck"))) and not self._compatibility_mode
        self._compat = CompatPolicy()
        self._buffer = ""
        self._snapshot: Any = None
        self._committed_snapshot: Any = None
        self._committed_available = False
        self._last_error: Exception | None = None
        self._closed = False
        self._finished = False
        self._handlers_locked = False
        self._binary_decoder = codecs.getincrementaldecoder("utf-8")()

        on_phase = options.get("on_phase", options.get("onPhase"))
        on_chunk = options.get("on_chunk", options.get("onChunk"))
        self._on_phase: Callable[[Any, Any], None] | None = (
            on_phase if callable(on_phase) else on_chunk if callable(on_chunk) else None
        )
        self._on_done: Callable[[Any], None] | None = options.get("on_done", options.get("onDone"))
        self._on_error: Callable[[Exception], None] | None = options.get("on_error", options.get("onError"))

        self._type_session: TypeFreezeSession | None = (
            TypeFreezeSession(schema=options.get("type_schema", options.get("typeSchema")))
            if self._type_check
            else None
        )
        self._type_check_escape_paths: list[str] = []

        self._control = ControlPlaneHost(
            send=self.push_wire,
            get_committed_snapshot=self.get_committed_snapshot,
            session=options.get("session", False),
            auto_ack=options.get("auto_ack", options.get("autoAck")) is True,
            on_control_error=options.get("on_control_error", options.get("onControlError")),
            on_session=options.get("on_session", options.get("onSession")),
            on_resume=options.get("on_resume", options.get("onResume")),
            on_ack=options.get("on_ack", options.get("onAck")),
            on_snapshot=options.get("on_snapshot", options.get("onSnapshot")),
            on_types=lambda snap, _f: self._type_session.apply_schema(snap) if self._type_session else None,
        )

        self._outbound_seq = 0
        self._auto_record_outbound = bool(options.get("session")) or options.get(
            "retain_outbound", options.get("retainOutbound")
        ) is True
        self._outbound_log: ResumeWireLog | None = ResumeWireLog() if self._auto_record_outbound else None

        engine_hooks = {
            "streamProcessing": self._stream_processing,
            "compat": self._compat.snapshot() if self._compatibility_mode else False,
            "symbolKeys": self._symbol_keys,
            "mergeChunkWindow": self._merge_chunk_window,
            "cover": self._cover,
            "lineIntercept": options.get("line_intercept", options.get("lineIntercept")),
            "annotationSpan": options.get("annotation_span", options.get("annotationSpan")),
            "onChunk": self._on_engine_chunk,
        }
        self._engine = DotCheckpointEngine(engine_hooks)
        self._control.bind_checkpoint(self._engine)

        self._closed_future: Future[None] = Future()
        self._done_future: Future[Any] = Future()
        self._reader_thread: threading.Thread | None = None
        self._bind_socket()

        if options.get("auto_session", options.get("autoSession")) is True:
            try:
                self._control.send_session()
            except Exception:
                pass

    @property
    def ready_state(self) -> int:
        return getattr(self._ws, "state", self.OPEN)

    @property
    def closed(self) -> Future[None]:
        return self._closed_future

    @property
    def done(self) -> Future[Any]:
        return self._done_future

    @property
    def last_error(self) -> Exception | None:
        return self._last_error

    @property
    def type_check(self) -> bool:
        return self._type_check

    @property
    def handlers_locked(self) -> bool:
        return self._handlers_locked

    @property
    def session_id(self) -> str | None:
        return self._control.session_id

    @property
    def phase_seq(self) -> int:
        return self._engine.phase_seq

    @property
    def log_seq(self) -> int:
        return self._control.phase_seq

    @property
    def outbound_seq(self) -> int:
        return self._outbound_seq

    @property
    def acked_seq(self) -> int:
        return self._control.acked_seq

    @property
    def outbound_log(self) -> ResumeWireLog | None:
        return self._outbound_log

    def lock_handlers(self) -> XaiopWsConnection:
        self._handlers_locked = True
        return self

    def get_buffered_text(self) -> str:
        return self._buffer

    def get_snapshot(self) -> Any:
        return None if self._snapshot is None else clone_json(self._snapshot)

    def get_committed_snapshot(self) -> Any:
        if self._committed_snapshot is None:
            if not self._committed_available:
                return None
            c = self._engine.committed_snapshot
            if c is None:
                return None
            self._committed_snapshot = c
        return clone_json(self._committed_snapshot)

    def buffer_stats(self) -> dict[str, Any]:
        return self._engine.buffer_stats()

    def compact_committed(self, **options: Any) -> dict[str, int]:
        return self._engine.compact_committed(options)

    def on_phase(self, fn: Callable[[Any, Any], None] | None) -> XaiopWsConnection:
        self._assert_handlers_mutable("on_phase")
        self._on_phase = fn if callable(fn) else None
        return self

    def on_chunk(self, fn: Callable[[Any, Any], None] | None) -> XaiopWsConnection:
        return self.on_phase(fn)

    def on_done(self, fn: Callable[[Any], None] | None) -> XaiopWsConnection:
        self._assert_handlers_mutable("on_done")
        self._on_done = fn if callable(fn) else None
        return self

    def on_error(self, fn: Callable[[Exception], None] | None) -> XaiopWsConnection:
        self._assert_handlers_mutable("on_error")
        self._on_error = fn if callable(fn) else None
        return self

    def push_json(self, key: str, value: Any, *, final: bool = False, encode_options: dict | None = None) -> bool:
        wire = encode_phase_json(key, value, final=final, encode_options=encode_options)
        return self._push_outbound_phase(wire)

    def push_object(self, obj: dict[str, Any], *, final: bool = False, encode_options: dict | None = None) -> bool:
        wire = encode_phase_object(obj, final=final, encode_options=encode_options)
        return self._push_outbound_phase(wire)

    def _push_outbound_phase(self, wire: str) -> bool:
        if self._auto_record_outbound:
            nxt = self._outbound_seq + 1
            ok = self.push_wire(stamp_wire_with_log_seq(nxt, wire))
            if ok:
                self.note_outbound_phase(wire)
            return ok
        return self.push_wire(wire)

    def push_wire(self, text: str) -> bool:
        if not isinstance(text, str):
            raise TypeError("push_wire requires a string")
        if self._closed or self.ready_state != self.OPEN:
            return False
        self._ws.send(text)
        return True

    def push_wire_ln(self, text: str) -> bool:
        if not isinstance(text, str):
            raise TypeError("push_wire_ln requires a string")
        return self.push_wire(text if text.endswith("\n") else f"{text}\n")

    def push_type_consistency(self, source: Any) -> bool:
        if self._compatibility_mode:
            raise TypeError("push_type_consistency requires strict mode (compatibility_mode off)")
        if hasattr(source, "export_type_schema"):
            snapshot = source.export_type_schema()
        elif isinstance(source, TypeRegistry):
            snapshot = source.snapshot()
        elif isinstance(source, dict) and source.get("version") == 1 and isinstance(source.get("entries"), list):
            snapshot = source
        else:
            raise TypeError("push_type_consistency requires XaiopEngine, TypeRegistry, or schema snapshot")
        if not snapshot.get("entries"):
            raise TypeError("push_type_consistency requires a non-empty type registry")
        if hasattr(source, "type_check") and source.type_check is not True:
            raise TypeError("push_type_consistency requires the engine type_check flag enabled")
        return self.push_wire(encode_type_schema_frame(snapshot))

    def note_outbound_phase(self, wire: str | None = None, committed: Any = None) -> int:
        self._outbound_seq += 1
        if self._outbound_log and isinstance(wire, str):
            self._outbound_log.record({"seq": self._outbound_seq, "wire": wire, "committed": committed})
        return self._outbound_seq

    def replay_outbound_after(self, from_seq: int) -> str:
        if not self._outbound_log:
            raise TypeError("replay_outbound_after requires session=True (or retain_outbound=True)")
        return self._outbound_log.wires_after(from_seq)

    def send_session(self, extra: dict[str, Any] | None = None) -> bool:
        return self._control.send_session(extra)

    def send_ack(self, seq: int | None = None) -> bool:
        return self._control.send_ack(seq)

    def send_resume(self, body: dict[str, Any]) -> bool:
        return self._control.send_resume(body)

    def send_snapshot(self, json_value: Any = None) -> bool:
        return self._control.send_snapshot(json_value)

    def get_resume_state(self) -> dict[str, Any] | None:
        base = self._control.get_resume_state(self.get_committed_snapshot())
        if not base:
            return None
        return {
            **base,
            "logSeq": base.get("seq"),
            "inboundSeq": self.phase_seq,
            "outboundSeq": self._outbound_seq,
        }

    def end(self, *, code: int = 1000, reason: str = "") -> Future[None]:
        fut: Future[None] = Future()

        def close() -> None:
            if self._closed:
                fut.set_result(None)
                return
            try:
                self._ws.close(code, reason)
            except Exception:
                pass
            fut.set_result(None)

        threading.Thread(target=close, daemon=True).start()
        return fut

    def abort(self) -> bool:
        if self._closed:
            return False
        try:
            closer = getattr(self._ws, "close", None)
            if callable(closer):
                closer(1001, "aborted")
        except Exception:
            pass
        return True

    def _assert_handlers_mutable(self, api: str) -> None:
        if self._handlers_locked:
            raise TypeError(
                f"{api} after connect is locked — pass on_phase/on_done/on_error in connect options"
            )

    def _bind_socket(self) -> None:
        def reader() -> None:
            recv = getattr(self._ws, "recv", None)
            if not callable(recv):
                self._fail(RuntimeError("WebSocket missing recv"))
                return
            try:
                while not self._closed:
                    data = recv()
                    if data is None:
                        break
                    self._on_message(data)
            except Exception as err:
                if not self._closed:
                    name = type(err).__name__
                    if "ConnectionClosed" in name:
                        pass
                    else:
                        self._last_error = err if isinstance(err, Exception) else Exception(str(err))
                        if self._on_error:
                            self._on_error(self._last_error)
            finally:
                self._on_close()

        self._reader_thread = threading.Thread(target=reader, name="xaiop-ws-reader", daemon=True)
        self._reader_thread.start()

    def _on_message(self, data: Any) -> None:
        if self._finished:
            return
        try:
            if isinstance(data, str):
                text = data
            elif isinstance(data, (bytes, bytearray)):
                text = self._binary_decoder.decode(bytes(data))
            else:
                text = str(data)
            if not text:
                return
            wire = self._control.push(text)
            if not wire:
                return
            if self._async_parse:
                self._engine.push_async(wire).wait()
            else:
                self._engine.push(wire)
            self._buffer = self._engine.buffer
            self._sync_committed()
        except Exception as err:
            self._fail(err if isinstance(err, Exception) else Exception(str(err)))

    def _on_engine_chunk(self, diff: Any, meta: Any = None) -> None:
        self._buffer = self._engine.buffer
        self._sync_committed()
        self._control.note_phase_meta(meta if isinstance(meta, dict) else None)
        if isinstance(meta, dict) and meta.get("typeCheckEscapePaths"):
            self._type_check_escape_paths.extend(meta["typeCheckEscapePaths"])
        if self._type_session:
            if diff is not None:
                self._type_session.observe_tree(diff, escape_paths=self._type_check_escape_paths)
            committed = self._engine.committed_snapshot
            if committed is not None:
                self._type_session.reconcile_commit({} if committed is None else committed)
        if self._on_phase:
            self._on_phase(diff, meta)

    def _on_close(self) -> None:
        if self._finished:
            if not self._closed_future.done():
                self._closed_future.set_result(None)
            return
        try:
            tail = self._binary_decoder.decode(b"", final=True)
            wire = ""
            if tail:
                wire += self._control.push(tail)
            wire += self._control.flush()
            if wire and not self._finished:
                if self._async_parse:
                    self._engine.push_async(wire).wait()
                else:
                    self._engine.push(wire)
                self._buffer = self._engine.buffer
                self._sync_committed()
        except Exception:
            pass
        self._complete_from_peer_close()

    def _sync_committed(self) -> None:
        if self._engine.committed_at <= 0:
            return
        self._committed_snapshot = None
        self._committed_available = True

    def _complete_from_peer_close(self) -> None:
        if self._finished:
            self._closed = True
            if not self._closed_future.done():
                self._closed_future.set_result(None)
            return
        self._finished = True
        self._closed = True
        try:
            if self._async_parse:
                self._engine.finish_async().wait()
            else:
                self._engine.finish()
            self._buffer = self._engine.buffer
            self._sync_committed()
            self._snapshot = self._engine.snapshot
            final_json = {} if self._snapshot is None else clone_json(self._snapshot)
            if self._type_session and isinstance(final_json, dict):
                self._type_session.observe_tree(final_json, escape_paths=self._type_check_escape_paths)
                self._type_session.reconcile_commit(final_json)
            if self._on_done:
                self._on_done(final_json)
            if not self._done_future.done():
                self._done_future.set_result(final_json)
        except Exception as err:
            self._fail(err if isinstance(err, Exception) else Exception(str(err)))
        finally:
            if not self._closed_future.done():
                self._closed_future.set_result(None)

    def _fail(self, err: Exception) -> None:
        if self._finished:
            return
        self._finished = True
        self._last_error = err
        if self._on_error:
            self._on_error(err)
        if not self._done_future.done():
            self._done_future.set_exception(err)
        if not self._closed:
            try:
                self._ws.close(1011, str(err)[:120])
            except Exception:
                pass
        if not self._closed_future.done():
            self._closed_future.set_result(None)
