"""XaiopWs — first-class WebSocket session for skeleton / phase streaming."""

from __future__ import annotations

import threading
from concurrent.futures import Future
from typing import Any

from ..phase_encode import encode_phase_json, encode_phase_object
from .connection import XaiopWsConnection
from .hub import XaiopWsHub, listen

try:
    from websockets.sync.client import connect as ws_connect
except ImportError:  # pragma: no cover
    ws_connect = None  # type: ignore

DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000


class XaiopWs:
    encode_phase_json = staticmethod(encode_phase_json)
    encode_phase_object = staticmethod(encode_phase_object)

    @staticmethod
    def connect(url: str, **options: Any) -> XaiopWsConnection:
        if ws_connect is None:
            raise ImportError("websockets is required for XaiopWs.connect (pip install xaiop[ws])")
        if not isinstance(url, str) or not url:
            raise TypeError("XaiopWs.connect requires a non-empty url")
        timeout_ms = options.get("handshake_timeout_ms", options.get("handshakeTimeoutMs", DEFAULT_HANDSHAKE_TIMEOUT_MS))
        protocols = options.get("protocols")
        headers = options.get("headers")
        open_timeout = timeout_ms / 1000.0 if timeout_ms and timeout_ms > 0 else None
        kwargs: dict[str, Any] = {}
        if open_timeout is not None:
            kwargs["open_timeout"] = open_timeout
        if protocols:
            kwargs["subprotocols"] = protocols if isinstance(protocols, list) else [protocols]
        if headers:
            kwargs["additional_headers"] = list(headers.items())
        try:
            ws = ws_connect(url, **kwargs)
        except Exception as err:
            raise RuntimeError(f"WebSocket handshake failed: {err}") from err
        conn = XaiopWsConnection(ws, **options)
        conn.lock_handlers()
        return conn

    @staticmethod
    def listen(**options: Any) -> XaiopWsHub:
        return listen(**options)
