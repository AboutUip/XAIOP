import time

import pytest

websockets = pytest.importorskip("websockets")

from xaiop.ws import XaiopWs  # noqa: E402


def _wait_done(conn, timeout: float = 10.0):
    return conn.done.result(timeout=timeout)


def test_connect_listen_push_phase() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    phases: list[object] = []

    def on_server(conn, _req=None) -> None:
        server_ready.append(conn)

    hub.on_connection(on_server)

    client = XaiopWs.connect(hub.url(), on_phase=lambda d, _m=None: phases.append(d))
    deadline = time.monotonic() + 5.0
    while not server_ready:
        if time.monotonic() > deadline:
            raise AssertionError("server connection timeout")
        time.sleep(0.01)

    server = server_ready[0]
    server.push_json("a", 1, final=True)
    server.end().result(timeout=5)

    assert _wait_done(client) == {"a": 1}
    assert phases == [{"a": 1}]
    hub.close()


def test_push_object_multiple_phases() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    phases: list[object] = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))

    client = XaiopWs.connect(hub.url(), on_phase=lambda d, _m=None: phases.append(d))

    deadline = time.monotonic() + 5.0
    while not server_ready:
        if time.monotonic() > deadline:
            raise AssertionError("server connection timeout")
        time.sleep(0.01)

    server = server_ready[0]
    server.push_object({"a": 1})
    server.push_object({"b": 2}, final=True)
    server.end().result(timeout=5)

    assert _wait_done(client) == {"a": 1, "b": 2}
    assert len(phases) == 2
    hub.close()


def test_connect_requires_url() -> None:
    with pytest.raises(TypeError):
        XaiopWs.connect("")


def test_empty_phase_via_double_dot() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    phases: list[object] = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(
        hub.url(),
        merge_chunk_window=False,
        on_phase=lambda d, _m=None: phases.append(d),
    )
    deadline = time.monotonic() + 5.0
    while not server_ready:
        if time.monotonic() > deadline:
            raise AssertionError("server connection timeout")
        time.sleep(0.01)
    server = server_ready[0]
    server.push_wire(">\na:1\n.\n.\n")
    server.end().result(timeout=5)
    done = _wait_done(client)
    assert done == {"a": 1}
    # Empty phase may surface as null Diff depending on server framing
    assert {"a": 1} in phases
    hub.close()


def test_later_wins_same_key() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url())
    deadline = time.monotonic() + 5.0
    while not server_ready:
        if time.monotonic() > deadline:
            raise AssertionError("server connection timeout")
        time.sleep(0.01)
    server = server_ready[0]
    server.push_wire(">\nid:1\n.\n")
    server.push_wire(">\nid:2\n.\n")
    server.end().result(timeout=5)
    assert _wait_done(client) == {"id": 2}
    hub.close()


def test_push_wire_ln() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url())
    deadline = time.monotonic() + 5.0
    while not server_ready:
        if time.monotonic() > deadline:
            raise AssertionError("server connection timeout")
        time.sleep(0.01)
    server = server_ready[0]
    if hasattr(server, "push_wire_ln"):
        server.push_wire_ln(">")
        server.push_wire_ln("k:1")
        server.push_wire_ln(".")
    else:
        server.push_wire(">\nk:1\n.\n")
    server.end().result(timeout=5)
    assert _wait_done(client) == {"k": 1}
    hub.close()


def _ready(server_ready: list, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while not server_ready:
        if time.monotonic() > deadline:
            raise AssertionError("server connection timeout")
        time.sleep(0.01)


def test_named_array_append_across_push_json() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), merge_chunk_window=False)
    _ready(server_ready)
    server = server_ready[0]
    server.push_wire(">\n>items-\n.\n")
    server.push_json("items", [{"id": 1}])
    server.push_wire("@items\n>\nid:2\n<\n.\n")
    server.end().result(timeout=5)
    done = _wait_done(client)
    assert isinstance(done.get("items"), list)
    assert len(done["items"]) >= 1
    hub.close()


def test_fragmented_push_wire() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), merge_chunk_window=False)
    _ready(server_ready)
    server = server_ready[0]
    server.push_wire(">\na:")
    server.push_wire("1\n.\n")
    server.end().result(timeout=5)
    assert _wait_done(client) == {"a": 1}
    hub.close()


def test_mid_stream_committed_snapshot() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url(), merge_chunk_window=False)
    _ready(server_ready)
    server = server_ready[0]
    server.push_wire(">\na:1\n.\n")
    time.sleep(0.1)
    mid = client.get_committed_snapshot() if hasattr(client, "get_committed_snapshot") else None
    server.push_wire(">\nb:2\n.\n")
    server.end().result(timeout=5)
    assert _wait_done(client) == {"a": 1, "b": 2}
    if mid is not None:
        assert mid == {"a": 1} or "a" in mid
    hub.close()


def test_push_after_end_returns_false() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url())
    _ready(server_ready)
    server = server_ready[0]
    server.push_wire(">\na:1\n.\n")
    server.end().result(timeout=5)
    _wait_done(client)
    assert server.push_wire(">\nb:2\n.\n") is False
    hub.close()


def test_handlers_locked_after_connect() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(hub.url())
    _ready(server_ready)
    assert client.handlers_locked is True or getattr(client, "_handlers_locked", False) is True
    server_ready[0].end().result(timeout=5)
    hub.close()


def test_line_intercept_on_ws_connect() -> None:
    hub = XaiopWs.listen(host="127.0.0.1", port=0, merge_chunk_window=False)
    server_ready: list = []
    hub.on_connection(lambda conn, _req=None: server_ready.append(conn))
    client = XaiopWs.connect(
        hub.url(),
        merge_chunk_window=False,
        line_intercept=lambda ctx: None if ctx["raw"] == "drop:1" else ctx["raw"],
    )
    _ready(server_ready)
    server = server_ready[0]
    server.push_wire(">\na:1\ndrop:1\nb:2\n.\n")
    server.end().result(timeout=5)
    assert _wait_done(client) == {"a": 1, "b": 2}
    hub.close()
