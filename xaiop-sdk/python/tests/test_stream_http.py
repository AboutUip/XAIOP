"""HTTP and SSE stream integration via stdlib http.server (Java StreamHttpTest)."""

from __future__ import annotations

import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from xaiop import STREAM_STATUS, TRANSPORT_KIND, XaiopStream


def _wait_status(stream: XaiopStream, want: str, timeout: float = 8.0) -> None:
    deadline = time.monotonic() + timeout
    while stream.status != want:
        if stream.status == STREAM_STATUS["ERROR"] and want != STREAM_STATUS["ERROR"]:
            raise AssertionError(f"stream error: {stream.last_error}")
        if time.monotonic() > deadline:
            raise AssertionError(f"timeout waiting for {want}, got {stream.status}")
        time.sleep(0.01)


class _ThreadedHTTPServer(HTTPServer):
    allow_reuse_address = True


def _serve_once(handler_cls, body: bytes | None = None, content_type: str = "text/plain; charset=utf-8"):
    """Start a background HTTP server; return (url, server, thread)."""

    class Handler(handler_cls if handler_cls is not None else BaseHTTPRequestHandler):
        pass

    if body is not None:

        class Handler(BaseHTTPRequestHandler):  # type: ignore[no-redef]
            def log_message(self, *_args) -> None:
                return

            def do_GET(self) -> None:  # noqa: N802
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                # split write to exercise streaming decode
                mid = min(6, len(body))
                self.wfile.write(body[:mid])
                self.wfile.flush()
                if mid < len(body):
                    self.wfile.write(body[mid:])

    server = _ThreadedHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    url = f"http://{host}:{port}/xaiop"
    return url, server, thread


def test_http_body_stream() -> None:
    body = b">\na:1\n.\n>b\nc:2\n.\n"
    url, server, _thread = _serve_once(None, body=body)
    try:
        stream = XaiopStream(url)
        chunks: list = []
        done: list = []
        stream.on_chunk(lambda d, _m=None: chunks.append(d))
        stream.on_done(done.append)
        stream.send(transport=TRANSPORT_KIND["HTTP"])
        _wait_status(stream, STREAM_STATUS["COMPLETED"])
        assert done[0] == {"a": 1, "b": {"c": 2}}
        assert len(chunks) >= 1
    finally:
        server.shutdown()
        server.server_close()


def test_sse_data_events() -> None:
    sse = (
        "event: message\n"
        "data: >\n"
        "data: a:1\n"
        "data: .\n"
        "\n"
        "data: >\n"
        "data: b:2\n"
        "data: .\n"
        "\n"
    ).encode("utf-8")

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args) -> None:
            return

        def do_GET(self) -> None:  # noqa: N802
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(sse)))
            self.end_headers()
            self.wfile.write(sse)

    server = _ThreadedHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    url = f"http://{host}:{port}/sse"
    try:
        stream = XaiopStream(url, merge_chunk_window=False)
        chunks: list = []
        done: list = []
        stream.on_chunk(lambda d, _m=None: chunks.append(d))
        stream.on_done(done.append)
        stream.send(transport=TRANSPORT_KIND["SSE"])
        _wait_status(stream, STREAM_STATUS["COMPLETED"])
        assert chunks[0] == {"a": 1}
        assert chunks[1] == {"b": 2}
        assert done[0] == {"a": 1, "b": 2}
    finally:
        server.shutdown()
        server.server_close()


def test_http_error_status() -> None:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args) -> None:
            return

        def do_GET(self) -> None:  # noqa: N802
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"nope")

    server = _ThreadedHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    url = f"http://{host}:{port}/err"
    try:
        stream = XaiopStream(url)
        stream.on_chunk(lambda *_a, **_k: None)
        stream.on_done(lambda *_a, **_k: None)
        stream.send(transport=TRANSPORT_KIND["HTTP"])
        _wait_status(stream, STREAM_STATUS["ERROR"])
        assert stream.last_error is not None
    finally:
        server.shutdown()
        server.server_close()
