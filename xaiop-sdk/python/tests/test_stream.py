import time

import pytest

from xaiop.modes import STREAM_MODES
from xaiop.states import STREAM_STATUS
from xaiop.stream import TRANSPORT_KIND, XaiopStream, chunks_of


def _wait_status(stream: XaiopStream, want: str, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while stream.status != want:
        if stream.status == STREAM_STATUS["ERROR"] and want != STREAM_STATUS["ERROR"]:
            raise AssertionError(f"stream error: {stream.last_error}")
        if time.monotonic() > deadline:
            raise AssertionError(f"timeout waiting for {want}, got {stream.status}")
        time.sleep(0.01)


def test_per_phase_parse_with_stepwise_window() -> None:
    stream = XaiopStream("raw://local", merge_chunk_window=False)
    chunks: list[object] = []
    done: list[object] = []
    stream.on_chunk(lambda d, _m=None: chunks.append(d))
    stream.on_done(done.append)
    stream.send_raw(chunks_of(">\n>a\nx:", "1\n.\n>b\ny:2\n.\n>c\n", "z:3\n.\n"))
    _wait_status(stream, STREAM_STATUS["COMPLETED"])
    assert len(chunks) == 3
    assert chunks[0] == {"a": {"x": 1}}
    assert chunks[1] == {"b": {"y": 2}}
    assert chunks[2] == {"c": {"z": 3}}
    assert done[0] == {"a": {"x": 1}, "b": {"y": 2}, "c": {"z": 3}}


def test_empty_phase_yields_null_chunk() -> None:
    stream = XaiopStream("raw://local", merge_chunk_window=False)
    chunks: list[object] = []
    stream.on_chunk(lambda d, _m=None: chunks.append(d))
    stream.on_done(lambda _j: None)
    stream.send_raw(chunks_of(">\na:1\n.\n.\n"))
    _wait_status(stream, STREAM_STATUS["COMPLETED"])
    assert chunks[0] == {"a": 1}
    assert chunks[1] is None


def test_merge_chunk_window_batches_dots() -> None:
    stream = XaiopStream("raw://local", merge_chunk_window=True)
    chunks: list[object] = []
    stream.on_chunk(lambda d, _m=None: chunks.append(d))
    stream.on_done(lambda _j: None)
    stream.send_raw(chunks_of(">\n>a\nx:1\n.\n>b\ny:2\n.\n"))
    _wait_status(stream, STREAM_STATUS["COMPLETED"])
    assert len(chunks) == 1
    assert chunks[0] == {"a": {"x": 1}, "b": {"y": 2}}


def test_send_rejects_when_busy() -> None:
    stream = XaiopStream("raw://busy", merge_chunk_window=False)
    stream.on_chunk(lambda _d, _m=None: None)
    stream.on_done(lambda _j: None)

    class Slow:
        def __iter__(self):
            yield ">\na:1\n.\n"
            time.sleep(0.2)
            yield ">\nb:2\n.\n"

    stream.send(transport=TRANSPORT_KIND["RAW"], source=Slow())
    with pytest.raises(RuntimeError, match="busy"):
        stream.send_raw(chunks_of(".\n"))


def test_abort_marks_aborted() -> None:
    stream = XaiopStream("raw://abort", merge_chunk_window=False)
    stream.on_chunk(lambda _d, _m=None: None)
    stream.on_done(lambda _j: None)

    class Slow:
        def __iter__(self):
            yield ">\na:1\n.\n"
            time.sleep(0.5)

    stream.send(transport=TRANSPORT_KIND["RAW"], source=Slow())
    _wait_status(stream, STREAM_STATUS["STREAMING"])
    assert stream.abort() is True
    _wait_status(stream, STREAM_STATUS["ABORTED"])


def test_chunks_iterator_mode() -> None:
    stream = XaiopStream(
        "raw://iter",
        merge_chunk_window=False,
        modes=[STREAM_MODES["ASYNC_ITERATOR"], STREAM_MODES["CALLBACK"]],
    )
    stream.on_done(lambda _j: None)
    stream.send_raw(chunks_of(">\na:1\n.\n>\nb:2\n.\n"))
    _wait_status(stream, STREAM_STATUS["COMPLETED"])
    pulled = list(stream.chunks())
    assert pulled[0] == {"a": 1}
    assert pulled[1] == {"b": 2}


def test_get_snapshot_after_complete() -> None:
    stream = XaiopStream("raw://snap", merge_chunk_window=False)
    stream.on_chunk(lambda _d, _m=None: None)
    stream.on_done(lambda _j: None)
    stream.send_raw(chunks_of(">\na:1\n.\n"))
    _wait_status(stream, STREAM_STATUS["COMPLETED"])
    assert stream.get_snapshot() == {"a": 1}
