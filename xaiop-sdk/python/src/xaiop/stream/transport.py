"""Network transports for XaiopStream."""

from __future__ import annotations

import codecs
import http.client
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Iterator

TRANSPORT_KIND = {
    "HTTP": "http",
    "SSE": "sse",
    "RAW": "raw",
}

TransportKind = str


@dataclass
class TransportRequest:
    url: str = ""
    transport: TransportKind = TRANSPORT_KIND["HTTP"]
    method: str = "GET"
    headers: dict[str, str] | None = None
    body: str | bytes | None = None
    timeout_ms: int | None = None
    sse_events: set[str] | None = None
    source: Iterable[str | bytes] | None = None
    aborted: threading.Event | None = None


@dataclass
class TransportHandlers:
    on_text: Callable[[str], None]
    on_done: Callable[[], None]
    on_error: Callable[[Exception], None]


class TransportHandle:
    def __init__(self, abort_fn: Callable[[], None]) -> None:
        self.abort = abort_fn


def open_transport(
    req: TransportRequest | dict[str, Any],
    handlers: TransportHandlers | dict[str, Any],
) -> TransportHandle:
    if isinstance(req, dict):
        req = TransportRequest(**_normalize_transport_req(req))
    if isinstance(handlers, dict):
        handlers = TransportHandlers(
            on_text=handlers["onText"] if "onText" in handlers else handlers["on_text"],
            on_done=handlers["onDone"] if "onDone" in handlers else handlers["on_done"],
            on_error=handlers["onError"] if "onError" in handlers else handlers["on_error"],
        )

    aborted = req.aborted or threading.Event()

    def _abort() -> None:
        aborted.set()

    def _run() -> None:
        try:
            kind = req.transport or TRANSPORT_KIND["HTTP"]
            if kind == TRANSPORT_KIND["RAW"]:
                _run_raw(req, handlers, aborted)
            elif kind == TRANSPORT_KIND["SSE"]:
                _run_sse(req, handlers, aborted)
            else:
                _run_http(req, handlers, aborted)
            if not aborted.is_set():
                handlers.on_done()
        except Exception as err:
            if aborted.is_set():
                handlers.on_error(Exception("aborted"))
            else:
                handlers.on_error(err if isinstance(err, Exception) else Exception(str(err)))

    thread = threading.Thread(target=_run, name="xaiop-transport", daemon=True)
    thread.start()
    return TransportHandle(_abort)


def _normalize_transport_req(req: dict[str, Any]) -> dict[str, Any]:
    out = dict(req)
    if "transport" not in out and "kind" in out:
        out["transport"] = out.pop("kind")
    return out


def _emit_text(handlers: TransportHandlers, text: str) -> None:
    if text:
        handlers.on_text(text)


def _run_raw(
    req: TransportRequest,
    handlers: TransportHandlers,
    aborted: threading.Event,
) -> None:
    if req.source is None:
        raise TypeError("raw transport requires `source`")
    decoder = codecs.getincrementaldecoder("utf-8")()
    for piece in req.source:
        if aborted.is_set():
            raise Exception("aborted")
        if piece is None:
            continue
        if isinstance(piece, str):
            _emit_text(handlers, piece)
        elif isinstance(piece, (bytes, bytearray)):
            _emit_text(handlers, decoder.decode(bytes(piece)))
        else:
            raise TypeError("raw source yielded unsupported chunk type")
    tail = decoder.decode(b"", final=True)
    _emit_text(handlers, tail)


def _run_http(
    req: TransportRequest,
    handlers: TransportHandlers,
    aborted: threading.Event,
) -> None:
    try:
        import httpx  # type: ignore
    except ImportError:
        httpx = None  # type: ignore

    if httpx is not None:
        _run_http_httpx(req, handlers, aborted, httpx)
        return
    _run_http_stdlib(req, handlers, aborted)


def _run_http_httpx(req, handlers, aborted, httpx) -> None:
    timeout = None
    if req.timeout_ms and req.timeout_ms > 0:
        timeout = req.timeout_ms / 1000.0
    headers = dict(req.headers or {})
    with httpx.Client(timeout=timeout) as client:
        with client.stream(
            req.method or "GET",
            req.url,
            headers=headers,
            content=req.body,
        ) as response:
            if response.status_code < 200 or response.status_code >= 300:
                raise Exception(f"HTTP {response.status_code}")
            for chunk in response.iter_text():
                if aborted.is_set():
                    raise Exception("aborted")
                _emit_text(handlers, chunk)


def _run_http_stdlib(
    req: TransportRequest,
    handlers: TransportHandlers,
    aborted: threading.Event,
) -> None:
    headers = dict(req.headers or {})
    data = req.body
    if isinstance(data, str):
        data = data.encode("utf-8")
    request = urllib.request.Request(
        req.url,
        data=data,
        headers=headers,
        method=(req.method or "GET").upper(),
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=(req.timeout_ms / 1000.0) if req.timeout_ms else None,
        ) as response:
            decoder = codecs.getincrementaldecoder("utf-8")()
            while True:
                if aborted.is_set():
                    raise Exception("aborted")
                chunk = response.read(8192)
                if not chunk:
                    break
                _emit_text(handlers, decoder.decode(chunk))
            _emit_text(handlers, decoder.decode(b"", final=True))
    except urllib.error.HTTPError as err:
        raise Exception(f"HTTP {err.code} {err.reason}") from err


def _run_sse(
    req: TransportRequest,
    handlers: TransportHandlers,
    aborted: threading.Event,
) -> None:
    headers = {"Accept": "text/event-stream", **(req.headers or {})}
    sse_req = TransportRequest(
        url=req.url,
        transport=TRANSPORT_KIND["HTTP"],
        method=req.method,
        headers=headers,
        body=req.body,
        timeout_ms=req.timeout_ms,
    )
    allow = req.sse_events
    buf = ""

    def on_chunk(text: str) -> None:
        nonlocal buf
        buf += text
        parts = _split_sse_blocks(buf)
        buf = parts.pop() if parts else ""
        for block in parts:
            data = _parse_sse_block(block, allow)
            _emit_sse_data(handlers, data)

    wrapped = TransportHandlers(on_text=on_chunk, on_done=lambda: None, on_error=handlers.on_error)
    _run_http(sse_req, wrapped, aborted)
    if buf.strip():
        data = _parse_sse_block(buf, allow)
        _emit_sse_data(handlers, data)


def _emit_sse_data(handlers: TransportHandlers, data: str) -> None:
    """Emit SSE payload as wire text; ensure a trailing LF so '.' does not glue to next '>'."""
    if not data:
        return
    if not data.endswith("\n"):
        data = data + "\n"
    _emit_text(handlers, data)


def _split_sse_blocks(buf: str) -> list[str]:
    import re

    parts = re.split(r"\r?\n\r?\n", buf)
    return parts


def _parse_sse_block(block: str, allow: set[str] | None) -> str:
    event = "message"
    data_lines: list[str] = []
    for raw in block.splitlines():
        if not raw or raw.startswith(":"):
            continue
        if ":" in raw:
            field, value = raw.split(":", 1)
            if value.startswith(" "):
                value = value[1:]
        else:
            field, value = raw, ""
        if field == "event":
            event = value
        elif field == "data":
            data_lines.append(value)
    if allow is not None and event not in allow:
        return ""
    if not data_lines:
        return ""
    return "\n".join(data_lines)


def chunks_of(*pieces: str) -> Iterator[str]:
    yield from pieces
