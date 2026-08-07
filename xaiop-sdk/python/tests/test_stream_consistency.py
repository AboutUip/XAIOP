"""Framing-independent stream consistency (Node stream.consistency.test.js)."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from xaiop import (
    DotCheckpointEngine,
    STREAM_MODES,
    STREAM_STATUS,
    parse_sync,
    XaiopStream,
    chunks_of,
)

FIXTURES = Path(__file__).resolve().parents[2] / "conformance" / "fixtures"
COMPLEX = FIXTURES / "complex.xaiop"
COMPLEX_EXPECTED = FIXTURES / "complex.expected.json"


def _wait(stream: XaiopStream, want: str, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while stream.status != want:
        if stream.status == STREAM_STATUS["ERROR"] and want != STREAM_STATUS["ERROR"]:
            raise AssertionError(stream.last_error)
        if time.monotonic() > deadline:
            raise AssertionError(f"timeout {want} got {stream.status}")
        time.sleep(0.01)


def _run_raw(source: str, *, merge: bool = False) -> object:
    stream = XaiopStream("raw://c", merge_chunk_window=merge)
    done: list = []
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_done(done.append)
    stream.send_raw(chunks_of(source))
    _wait(stream, STREAM_STATUS["COMPLETED"])
    return done[0]


def _engine_final(source: str, *, merge: bool = False) -> object:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": merge, "onChunk": lambda *_a, **_k: None}
    )
    eng.push(source)
    eng.finish()
    return eng.snapshot


OVERWRITE_CASES = [
    (
        "hierarchy id overwrite after .",
        ">\nid:1\n.\n>\nid:2\n",
        {"id": 2},
    ),
    (
        "named sections accumulate",
        ">\n>a\nx:1\n.\n>b\ny:2\n.\n>c\nz:3\n",
        {"a": {"x": 1}, "b": {"y": 2}, "c": {"z": 3}},
    ),
    (
        "same key overwrite across phases",
        ">\n>meta\nname:v1\nver:1\n.\n>meta\nname:v2\nver:2\n",
        {"meta": {"name": "v2", "ver": 2}},
    ),
    (
        "array grow then sibling",
        ">\n>tags-\n:a\n:b\n.\n>user\nid:1\n",
        {"tags": ["a", "b"], "user": {"id": 1}},
    ),
    (
        "root array no further dot",
        "-\n:a\n:b\n:c\n",
        ["a", "b", "c"],
    ),
]


@pytest.mark.parametrize("name,source,expected", OVERWRITE_CASES, ids=[c[0] for c in OVERWRITE_CASES])
def test_oneshot_matches_expected(name: str, source: str, expected: object) -> None:
    assert parse_sync(source) == expected


@pytest.mark.parametrize("name,source,expected", OVERWRITE_CASES, ids=[c[0] for c in OVERWRITE_CASES])
def test_char_chunked_engine(name: str, source: str, expected: object) -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    for ch in source:
        eng.push(ch)
    eng.finish()
    assert eng.snapshot == expected


@pytest.mark.parametrize("name,source,expected", OVERWRITE_CASES, ids=[c[0] for c in OVERWRITE_CASES])
def test_sized_chunks_stream(name: str, source: str, expected: object) -> None:
    # 3-byte framing
    parts = [source[i : i + 3] for i in range(0, len(source), 3)]
    stream = XaiopStream("raw://sized", merge_chunk_window=False)
    done: list = []
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_done(done.append)
    stream.send_raw(iter(parts))
    _wait(stream, STREAM_STATUS["COMPLETED"])
    assert done[0] == expected


def test_crlf_overwrite() -> None:
    source = ">\r\nid:1\r\n.\r\n>\r\nid:2\r\n"
    assert parse_sync(source) == {"id": 2}
    assert _engine_final(source) == {"id": 2}


def test_trailing_content_after_last_dot() -> None:
    source = ">\na:1\n.\n>\nb:2\n"
    assert parse_sync(source) == {"a": 1, "b": 2}
    assert _run_raw(source) == {"a": 1, "b": 2}


def test_complex_fixture_stream() -> None:
    import json

    wire = COMPLEX.read_text(encoding="utf-8")
    expected = json.loads(COMPLEX_EXPECTED.read_text(encoding="utf-8"))
    assert parse_sync(wire) == expected
    assert _engine_final(wire) == expected
    assert _run_raw(wire) == expected


def test_engine_equals_stream() -> None:
    source = ">\n>a\nx:1\n.\n>b\ny:2\n.\n"
    assert _engine_final(source) == _run_raw(source)


def test_stream_processing_false_one_phase() -> None:
    stream = XaiopStream(
        "raw://off", merge_chunk_window=False, stream_processing=False
    )
    chunks: list = []
    done: list = []
    stream.on_chunk(lambda d, _m=None: chunks.append(d))
    stream.on_done(done.append)
    stream.send_raw(chunks_of(">\na:1\n.\n>\nb:2\n.\n"))
    _wait(stream, STREAM_STATUS["COMPLETED"])
    assert done[0] == {"a": 1, "b": 2}


def test_abort_terminates_busy() -> None:
    stream = XaiopStream("raw://abort2", merge_chunk_window=False)
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_done(lambda *_a: None)

    class Slow:
        def __iter__(self):
            yield ">\na:1\n.\n"
            time.sleep(0.4)

    stream.send_raw(Slow())
    _wait(stream, STREAM_STATUS["STREAMING"])
    assert stream.abort() is True
    _wait(stream, STREAM_STATUS["ABORTED"])


def test_inactive_async_iterator_still_callback() -> None:
    stream = XaiopStream(
        "raw://modes",
        merge_chunk_window=False,
        modes=[STREAM_MODES["CALLBACK"]],
    )
    chunks: list = []
    stream.on_chunk(lambda d, _m=None: chunks.append(d))
    stream.on_done(lambda *_a: None)
    stream.send_raw(chunks_of(">\na:1\n.\n"))
    _wait(stream, STREAM_STATUS["COMPLETED"])
    assert chunks == [{"a": 1}]
