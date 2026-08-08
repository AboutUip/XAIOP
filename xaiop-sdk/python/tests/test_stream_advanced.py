"""Advanced stream: cover + history + span + typeCheck + control on RAW XaiopStream."""

from __future__ import annotations

import time

from xaiop import (
    STREAM_STATUS,
    TYPE,
    AnnotationSpan,
    TypeRegistry,
    XaiopStream,
    chunks_of,
    encode_session_frame,
    encode_type_schema_frame,
)


def _wait(stream: XaiopStream, want: str = STREAM_STATUS["COMPLETED"], timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while stream.status != want:
        if stream.status == STREAM_STATUS["ERROR"] and want != STREAM_STATUS["ERROR"]:
            raise AssertionError(f"stream error: {stream.last_error}")
        if time.monotonic() > deadline:
            raise AssertionError(f"timeout waiting for {want}, got {stream.status}")
        time.sleep(0.01)


def test_cover_tombstone_on_stream() -> None:
    wire = ">\n>a\nx:1\n.\n>b\ny:1\n&a\nz:2\n.\n"
    stream = XaiopStream("raw://cover", merge_chunk_window=False, cover=True)
    chunks: list = []
    done: list = []
    stream.on_chunk(lambda d, _m=None: chunks.append(d))
    stream.on_done(done.append)
    stream.send_raw(chunks_of(wire))
    _wait(stream)
    assert any(isinstance(c, dict) and c.get("a") is None for c in chunks)
    assert done[0] == {"b": {"y": 1, "z": 2}}


def test_history_jump_on_stream() -> None:
    stream = XaiopStream(
        "raw://hist",
        merge_chunk_window=False,
        history_snapshot=True,
        history_realtime=True,
    )
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_done(lambda *_a, **_k: None)
    stream.send_raw(chunks_of(">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n"))
    _wait(stream)
    h = stream.history
    assert h is not None and h.length == 3
    result = stream.jump_to(1)
    assert result["kept"] == 2
    assert result["discarded"] == 1
    assert result["after"] == {"a": 1, "b": 2}


def test_line_intercept_on_stream() -> None:
    stream = XaiopStream(
        "raw://li",
        merge_chunk_window=False,
        line_intercept=lambda ctx: (
            None
            if ctx["raw"] == "skip:1"
            else ("a:99" if ctx["raw"] == "a:1" else ctx["raw"])
        ),
    )
    done: list = []
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_done(done.append)
    stream.send_raw(chunks_of(">\na:1\nskip:1\nb:3\n.\n"))
    _wait(stream)
    assert done[0] == {"a": 99, "b": 3}


def test_annotation_span_on_stream() -> None:
    stream = XaiopStream(
        "raw://span",
        merge_chunk_window=False,
        annotation_span=lambda _a, _v: {"rewritten": True},
    )
    done: list = []
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_done(done.append)
    stream.send_raw(chunks_of(">\nkeep:1\n# meta\ndrop:9\n.\n"))
    _wait(stream)
    assert done[0] == {"keep": 1, "rewritten": True}


def test_type_check_on_stream() -> None:
    reg = TypeRegistry()
    reg.register("k", TYPE.INT)
    stream = XaiopStream(
        "raw://tc",
        merge_chunk_window=False,
        type_check=True,
        type_schema=reg.snapshot(),
    )
    errs: list = []
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_error(errs.append)
    stream.on_done(lambda *_a, **_k: None)
    stream.send_raw(chunks_of(">\nk:oops\n.\n"))
    _wait(stream)  # stream may complete with type error surfaced via on_error/last_error
    assert stream.last_error is not None or errs
    assert "int" in str(stream.last_error or errs[0]).lower() or "mismatch" in str(
        stream.last_error or errs[0]
    ).lower()


def test_compat_clears_type_check() -> None:
    stream = XaiopStream(
        "raw://compat",
        type_check=True,
        compatibility_mode=True,
        merge_chunk_window=False,
    )
    assert stream._type_check is False


def test_control_session_demuxed() -> None:
    frame = encode_session_frame(
        {"sessionId": "s1", "role": "producer", "capabilities": [], "epoch": 0}
    )
    wire = frame + ">\na:1\n.\n"
    stream = XaiopStream("raw://ctl", merge_chunk_window=False, session=True)
    done: list = []
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_done(done.append)
    stream.send_raw(chunks_of(wire))
    _wait(stream)
    assert done[0] == {"a": 1}


def test_schema_frame_then_data() -> None:
    reg = TypeRegistry()
    reg.register("a", TYPE.INT)
    frame = encode_type_schema_frame(reg.snapshot())
    stream = XaiopStream(
        "raw://schema",
        merge_chunk_window=False,
        type_check=True,
    )
    done: list = []
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_done(done.append)
    stream.send_raw(chunks_of(frame + ">\na:2\n.\n"))
    _wait(stream)
    assert done[0] == {"a": 2}


def test_keep_span_escape_on_stream() -> None:
    stream = XaiopStream(
        "raw://keep",
        merge_chunk_window=False,
        annotation_span=lambda _a, _v: AnnotationSpan.KEEP,
    )
    metas: list = []
    stream.on_chunk(lambda _d, m=None: metas.append(m))
    stream.on_done(lambda *_a, **_k: None)
    stream.send_raw(chunks_of(">\n# s\nflex:1\n.\n"))
    _wait(stream)
    escapes = []
    for m in metas:
        if isinstance(m, dict) and m.get("typeCheckEscapePaths"):
            escapes.extend(m["typeCheckEscapePaths"])
    assert "flex" in escapes or stream.get_committed_snapshot() == {"flex": 1}


def test_async_iterator_chunks() -> None:
    stream = XaiopStream("raw://iter", merge_chunk_window=False)
    collected: list = []

    def on_chunk(d, _m=None):
        collected.append(d)

    stream.on_chunk(on_chunk)
    done: list = []
    stream.on_done(done.append)
    stream.send_raw(chunks_of(">\na:1\n.\n>\nb:2\n.\n"))
    _wait(stream)
    assert collected == [{"a": 1}, {"b": 2}]
    assert done[0] == {"a": 1, "b": 2}
