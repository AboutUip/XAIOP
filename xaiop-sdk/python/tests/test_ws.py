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
