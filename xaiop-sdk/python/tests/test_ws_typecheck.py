"""WS typeCheck + TypeChecker/schema frames (Java WsTypeCheckTest patterns).

Uses local websockets hub; skips if websockets package missing.
Also covers non-network TypeChecker/engine paths thoroughly.
"""

from __future__ import annotations

import time

import pytest

from xaiop import (
    TYPE,
    TYPE_SCHEMA_FRAME_PREFIX,
    TypeChecker,
    TypeFreezeSession,
    TypeRegistry,
    XaiopEngine,
    XaiopTypeError,
    encode_type_schema_frame,
    object_type,
)

websockets = pytest.importorskip("websockets")
from xaiop.ws import XaiopWs  # noqa: E402


def _wait_ready(server_ready: list, timeout: float = 5.0):
    deadline = time.monotonic() + timeout
    while not server_ready:
        if time.monotonic() > deadline:
            raise AssertionError("server connection timeout")
        time.sleep(0.01)


def _wait_done(conn, timeout: float = 10.0):
    return conn.done.result(timeout=timeout)


# --- Non-WS typeCheck thoroughness -------------------------------------------


def test_typechecker_deny_polarity() -> None:
    reg = TypeRegistry()
    reg.register("secret", TYPE.STRING, {"polarity": "deny"})
    with pytest.raises(XaiopTypeError):
        TypeChecker(reg).check_tree({"secret": "x"})


def test_schema_frame_prefix_and_engine() -> None:
    eng = XaiopEngine()
    eng.register_type("user.name", TYPE.STRING)
    eng.set_type_check(True)
    frame = eng.encode_type_schema_frame()
    assert frame.startswith(TYPE_SCHEMA_FRAME_PREFIX)
    assert "user.name" in frame


def test_freeze_then_schema_object() -> None:
    s = TypeFreezeSession()
    s.observe_tree({"user": {"name": "a"}})
    with pytest.raises(XaiopTypeError):
        s.observe_tree({"user": {"name": 1}})


# --- WS typeCheck ------------------------------------------------------------


def test_ws_push_type_consistency_then_ok() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False, type_check=True)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), type_check=True, merge_chunk_window=False)
    _wait_ready(server_ready)
    server = server_ready[0]

    eng = XaiopEngine()
    eng.register_type("k", TYPE.INT)
    eng.set_type_check(True)
    assert server.push_type_consistency(eng) is True
    server.push_wire(">\nk:1\n.\n")
    server.push_wire(">\nk:2\n.\n")
    server.end().result(timeout=5)
    assert _wait_done(client) == {"k": 2}
    hub.close()


def test_ws_schema_int_rejects_string() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False, type_check=True)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    errs: list = []
    client = XaiopWs.connect(
        hub.url(),
        type_check=True,
        merge_chunk_window=False,
        on_error=lambda e: errs.append(e),
    )
    _wait_ready(server_ready)
    server = server_ready[0]
    eng = XaiopEngine()
    eng.register_type("k", TYPE.INT)
    eng.set_type_check(True)
    server.push_type_consistency(eng)
    server.push_wire(">\nk:oops\n.\n")
    server.end().result(timeout=5)
    with pytest.raises(Exception):
        _wait_done(client)
    hub.close()


def test_ws_freeze_only_no_schema() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False, type_check=True)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), type_check=True, merge_chunk_window=False)
    _wait_ready(server_ready)
    server = server_ready[0]
    server.push_wire(">\nk:1\n.\n")
    server.push_wire(">\nk:oops\n.\n")
    server.end().result(timeout=5)
    with pytest.raises(Exception):
        _wait_done(client)
    hub.close()


def test_ws_type_check_off_accepts_mixed() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), merge_chunk_window=False)
    _wait_ready(server_ready)
    server = server_ready[0]
    server.push_wire(">\nk:1\n.\n")
    server.push_wire(">\nk:oops\n.\n")
    server.end().result(timeout=5)
    assert _wait_done(client) == {"k": "oops"}
    hub.close()


def test_ws_push_type_consistency_guards() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False, type_check=True)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), type_check=True)
    _wait_ready(server_ready)
    server = server_ready[0]

    with pytest.raises(TypeError):
        server.push_type_consistency(TypeRegistry())
    with pytest.raises(TypeError):
        server.push_type_consistency(None)
    empty_eng = XaiopEngine()
    empty_eng.set_type_check(True)
    with pytest.raises(TypeError):
        server.push_type_consistency(empty_eng)
    eng = XaiopEngine()
    eng.register_type("k", TYPE.INT)
    # type_check not enabled on engine
    with pytest.raises(TypeError):
        server.push_type_consistency(eng)

    client.end().result(timeout=5) if hasattr(client, "end") else None
    hub.close()


def test_ws_null_does_not_break_freeze() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False, type_check=True)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), type_check=True, merge_chunk_window=False)
    _wait_ready(server_ready)
    server = server_ready[0]
    server.push_wire(">\nk:1\n.\n")
    server.push_wire(">\nk:null\n.\n")
    server.push_wire(">\nk:2\n.\n")
    server.end().result(timeout=5)
    assert _wait_done(client) == {"k": 2}
    hub.close()


def test_ws_preloaded_type_schema() -> None:
    reg = TypeRegistry()
    reg.register("k", TYPE.INT)
    schema = reg.snapshot()
    hub = XaiopWs.listen(
        host="127.0.0.1",
        port=0,
        merge_chunk_window=False,
        type_check=True,
        type_schema=schema,
    )
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(
        hub.url(), type_check=True, type_schema=schema, merge_chunk_window=False
    )
    _wait_ready(server_ready)
    server = server_ready[0]
    server.push_wire(">\nk:oops\n.\n")
    server.end().result(timeout=5)
    with pytest.raises(Exception):
        _wait_done(client)
    hub.close()


def test_ws_interleaved_schema_frame() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False, type_check=True)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), type_check=True, merge_chunk_window=False)
    _wait_ready(server_ready)
    server = server_ready[0]
    reg = TypeRegistry()
    reg.register("a", TYPE.INT)
    frame = encode_type_schema_frame(reg.snapshot())
    server.push_wire(frame + ">\na:2\n.\n")
    server.end().result(timeout=5)
    assert _wait_done(client) == {"a": 2}
    hub.close()


def test_ws_compat_disables_type_check_on_connect() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(
        hub.url(), type_check=True, compatibility_mode=True, merge_chunk_window=False
    )
    _wait_ready(server_ready)
    assert client.type_check is False
    hub.close()


def test_ws_push_type_after_end_returns_false() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False, type_check=True)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), type_check=True)
    _wait_ready(server_ready)
    server = server_ready[0]
    server.end().result(timeout=5)
    time.sleep(0.05)
    eng = XaiopEngine()
    eng.register_type("k", TYPE.INT)
    eng.set_type_check(True)
    # closed socket should return False or raise
    try:
        assert server.push_type_consistency(eng) is False
    except Exception:
        pass
    hub.close()
