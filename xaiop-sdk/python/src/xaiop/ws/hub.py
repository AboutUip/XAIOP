"""WebSocket hub — accept connections for skeleton / phase push."""

from __future__ import annotations

import threading
from typing import Any, Callable

from .connection import XaiopWsConnection

try:
    from websockets.sync.server import serve
except ImportError:  # pragma: no cover - optional extra
    serve = None  # type: ignore


class XaiopWsHub:
    def __init__(self, server: Any, connection_options: dict[str, Any] | None = None) -> None:
        if server is None:
            raise TypeError("XaiopWsHub requires a WebSocket server")
        self._server = server
        self._connection_options = connection_options or {}
        self._on_connection: Callable[[XaiopWsConnection, Any], None] | None = None
        self._on_error: Callable[[Exception], None] | None = None
        self._connections: set[XaiopWsConnection] = set()
        self._host = "127.0.0.1"
        self._port: int | None = None
        sock = getattr(server, "socket", None)
        if sock is not None:
            try:
                self._port = sock.getsockname()[1]
            except Exception:
                self._port = None

    @property
    def server(self) -> Any:
        return self._server

    @property
    def port(self) -> int | None:
        return self._port

    @property
    def connections(self) -> list[XaiopWsConnection]:
        return list(self._connections)

    def url(self, host: str = "127.0.0.1") -> str:
        if self._port is None:
            raise RuntimeError("hub has no bound port")
        return f"ws://{host}:{self._port}"

    def on_connection(
        self, fn: Callable[[XaiopWsConnection, Any], None] | None
    ) -> XaiopWsHub:
        self._on_connection = fn if callable(fn) else None
        return self

    def on_error(self, fn: Callable[[Exception], None] | None) -> XaiopWsHub:
        self._on_error = fn if callable(fn) else None
        return self

    def close(self) -> None:
        for conn in list(self._connections):
            try:
                conn.end()
            except Exception:
                pass
        shutdown = getattr(self._server, "shutdown", None)
        if callable(shutdown):
            shutdown()

    def _accept(self, ws: Any) -> XaiopWsConnection:
        conn = XaiopWsConnection(ws, **self._connection_options)

        def cleanup(_f: Any = None) -> None:
            self._connections.discard(conn)

        self._connections.add(conn)
        conn.closed.add_done_callback(cleanup)
        if self._on_connection:
            self._on_connection(conn, None)
        return conn


def listen(**options: Any) -> XaiopWsHub:
    if serve is None:
        raise ImportError("websockets is required for XaiopWs.listen (pip install xaiop[ws])")
    host = options.get("host", "127.0.0.1")
    port = options.get("port", 0)
    connection_options = {
        k: v
        for k, v in options.items()
        if k not in ("host", "port", "path", "protocols", "backlog", "max_payload")
    }

    hub_holder: list[XaiopWsHub] = []
    ready = threading.Event()

    def handler(ws: Any) -> None:
        if not hub_holder:
            return
        conn = hub_holder[0]._accept(ws)
        conn.closed.result()

    def run_server() -> None:
        with serve(handler, host, port) as server:
            hub = XaiopWsHub(server, connection_options)
            sock = server.socket
            if sock is not None:
                hub._port = sock.getsockname()[1]
                hub._host = host
            hub_holder.append(hub)
            ready.set()
            server.serve_forever()

    thread = threading.Thread(target=run_server, name="xaiop-ws-hub", daemon=True)
    thread.start()
    if not ready.wait(timeout=10):
        raise RuntimeError("WebSocket hub failed to start")
    return hub_holder[0]
