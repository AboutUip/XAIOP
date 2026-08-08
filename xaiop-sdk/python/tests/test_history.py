"""ParseHistory + DotCheckpointEngine history integration (Node history.test.js)."""

from __future__ import annotations

import pytest

from xaiop import (
    DotCheckpointEngine,
    HISTORY_NODE_KIND,
    ParseHistory,
    RangeError,
    STREAM_STATUS,
    XaiopStream,
    chunks_of,
)
import time


THREE_PHASES = ">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n"


def _make_engine(**opts):
    chunks: list = []
    eng = DotCheckpointEngine(
        {**opts, "onChunk": lambda d, _m=None: chunks.append(d)}
    )
    return eng, chunks


def _wait_status(stream: XaiopStream, want: str, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while stream.status != want:
        if stream.status == STREAM_STATUS["ERROR"] and want != STREAM_STATUS["ERROR"]:
            raise AssertionError(f"stream error: {stream.last_error}")
        if time.monotonic() > deadline:
            raise AssertionError(f"timeout waiting for {want}, got {stream.status}")
        time.sleep(0.01)


def test_defaults_off() -> None:
    h = ParseHistory()
    assert h.enabled is False
    eng, _ = _make_engine()
    assert eng.history is None


def test_enabled_flags() -> None:
    assert ParseHistory(snapshot=True).enabled is True
    assert ParseHistory(realtime=True).enabled is True
    both = ParseHistory(snapshot=True, realtime=True)
    assert both.snapshot_enabled and both.realtime_enabled


def test_record_noop_when_disabled() -> None:
    h = ParseHistory()
    assert (
        h.record(
            {
                "bufferStart": 0,
                "bufferEnd": 4,
                "wire": ">\n.\n",
                "before": None,
                "after": {"a": 1},
                "diff": {"a": 1},
            }
        )
        is None
    )
    assert h.length == 0


def test_live_cursor_and_source_defaults() -> None:
    h = ParseHistory(snapshot=True, realtime=True)
    assert h.live_cursor == -1
    assert h.source_key is None


def test_engine_history_flags() -> None:
    eng_s, _ = _make_engine(historySnapshot=True)
    assert eng_s.history is not None
    assert eng_s.history.snapshot_enabled is True
    eng_r, _ = _make_engine(historyRealtime=True)
    assert eng_r.history is not None
    assert eng_r.history.realtime_enabled is True


def test_history_info_off_shape() -> None:
    eng, _ = _make_engine()
    assert eng.history_info() == {
        "snapshot": False,
        "realtime": False,
        "length": 0,
        "liveCursor": -1,
        "sourceKey": None,
        "hasRangeView": False,
        "rangeView": None,
    }


def test_window_merge_records_nodes() -> None:
    eng, chunks = _make_engine(
        historySnapshot=True, mergeChunkWindow=False
    )
    eng.push(THREE_PHASES)
    eng.finish()
    h = eng.history
    assert h is not None
    assert h.length == 3
    assert chunks == [{"a": 1}, {"b": 2}, {"c": 3}]
    assert h.get_after(0) == {"a": 1}
    assert h.get_after(1) == {"a": 1, "b": 2}
    assert h.get_after(2) == {"a": 1, "b": 2, "c": 3}
    assert h.get_diff(0) == {"a": 1}
    assert h.get_diff(1) == {"b": 2}
    assert h.get_before(1) == {"a": 1}


def test_empty_phase_null_diff() -> None:
    eng, chunks = _make_engine(
        historySnapshot=True, mergeChunkWindow=False
    )
    eng.push(">\na:1\n.\n.\n")
    eng.finish()
    assert chunks[1] is None
    h = eng.history
    assert h is not None
    assert h.get_diff(1) is None


def test_tail_kind_without_trailing_dot() -> None:
    eng, _ = _make_engine(historySnapshot=True, mergeChunkWindow=False)
    eng.push(">\na:1\n.\n>\nb:2\n")
    eng.finish()
    h = eng.history
    assert h is not None
    assert h.length >= 2
    tip = h.get_node(h.length - 1)
    assert tip.kind == HISTORY_NODE_KIND["TAIL"]


def test_clone_isolation_get_after() -> None:
    eng, _ = _make_engine(historySnapshot=True, mergeChunkWindow=False)
    eng.push(">\na:1\n.\n")
    eng.finish()
    h = eng.history
    assert h is not None
    after = h.get_after(0)
    assert isinstance(after, dict)
    after["a"] = 999
    assert h.get_after(0) == {"a": 1}
    node = h.get_node(0)
    node.after = {"hack": True}  # type: ignore[misc]
    assert h.get_after(0) == {"a": 1}


def test_export_time_root_and_compare() -> None:
    eng, _ = _make_engine(historySnapshot=True, mergeChunkWindow=False)
    eng.push(THREE_PHASES)
    eng.finish()
    h = eng.history
    assert h is not None
    root = h.export_time_root()
    assert len(root) == 3
    root[0].after = {"x": 1}  # type: ignore[misc]
    assert h.get_after(0) == {"a": 1}
    cmp = h.compare(0, 2)
    assert cmp["a"] == {"a": 1}
    assert cmp["b"] == {"a": 1, "b": 2, "c": 3}


def test_view_range() -> None:
    eng, _ = _make_engine(historySnapshot=True, mergeChunkWindow=False)
    eng.push(THREE_PHASES)
    eng.finish()
    h = eng.history
    assert h is not None
    view = h.view_range(0, 1)
    assert view["from"] == 0 and view["to"] == 1
    assert view["json"] == {"a": 1, "b": 2}
    again = h.view_range(0, 1)
    assert again["json"] == view["json"]
    with pytest.raises(RangeError, match="from"):
        h.view_range(2, 0)


def test_snapshot_apis_require_snapshot() -> None:
    h = ParseHistory(realtime=True)
    with pytest.raises(RuntimeError, match="snapshot mode"):
        h.export_time_root()
    with pytest.raises(RuntimeError, match="snapshot mode"):
        h.view_range(0, 0)


def test_set_source_release_on_change() -> None:
    eng, _ = _make_engine(historySnapshot=True, mergeChunkWindow=False)
    eng.push(">\na:1\n.\n")
    eng.finish()
    h = eng.history
    assert h is not None
    assert h.set_source("url-a")["released"] is False
    assert h.source_key == "url-a"
    assert h.length == 1
    rel = h.set_source("url-b")
    assert rel["released"] is True
    assert h.length == 0
    assert h.source_key == "url-b"


def test_release_clears() -> None:
    eng, _ = _make_engine(historySnapshot=True, mergeChunkWindow=False)
    eng.push(">\na:1\n.\n")
    eng.finish()
    h = eng.history
    assert h is not None
    h.set_source("x")
    h.release()
    assert h.length == 0
    assert h.source_key is None


def test_jump_to_requires_realtime() -> None:
    eng, _ = _make_engine(historySnapshot=True, mergeChunkWindow=False)
    eng.push(THREE_PHASES)
    eng.finish()
    with pytest.raises(RuntimeError, match="historyRealtime|realtime"):
        eng.jump_to(0)


def test_jump_to_truncates_forward() -> None:
    eng, _ = _make_engine(
        historyRealtime=True, historySnapshot=True, mergeChunkWindow=False
    )
    eng.push(THREE_PHASES)
    eng.finish()
    h = eng.history
    assert h is not None
    assert h.can_jump_to(1) is True
    assert h.can_jump_to(-1) is False
    result = eng.jump_to(1)
    assert result["kept"] == 2
    assert result["discarded"] == 1
    assert result["after"] == {"a": 1, "b": 2}
    assert h.length == 2
    assert h.live_cursor == 1
    with pytest.raises(RangeError, match="forward"):
        eng.jump_to(1)
    assert h.can_jump_to(0) is False


def test_jump_to_out_of_range() -> None:
    eng, _ = _make_engine(historyRealtime=True, mergeChunkWindow=False)
    eng.push(">\na:1\n.\n")
    eng.finish()
    with pytest.raises(RangeError, match="out of range"):
        eng.jump_to(5)


def test_stream_history_integration() -> None:
    stream = XaiopStream(
        "raw://hist",
        merge_chunk_window=False,
        history_snapshot=True,
        history_realtime=True,
    )
    stream.on_chunk(lambda _d, _m=None: None)
    stream.on_done(lambda _j: None)
    stream.send_raw(chunks_of(THREE_PHASES))
    _wait_status(stream, STREAM_STATUS["COMPLETED"])
    h = stream.history
    assert h is not None
    assert h.length == 3
    stream.jump_to(0)
    assert h.length == 1
    assert stream.get_committed_snapshot() == {"a": 1}


def test_retain_wire_history_false_view_range() -> None:
    eng, _ = _make_engine(
        historySnapshot=True, mergeChunkWindow=False, retainWireHistory=False
    )
    eng.push(THREE_PHASES)
    eng.finish()
    h = eng.history
    assert h is not None
    view = h.view_range(0, 1)
    assert view["json"] == {"a": 1, "b": 2}


def test_crlf_history_wires() -> None:
    eng, _ = _make_engine(historySnapshot=True, mergeChunkWindow=False)
    eng.push(">\r\na:1\r\n.\r\n>\r\nb:2\r\n.\r\n")
    eng.finish()
    h = eng.history
    assert h is not None
    assert h.length == 2
    assert h.get_after(1) == {"a": 1, "b": 2}


def test_named_array_after_trees() -> None:
    eng, chunks = _make_engine(historySnapshot=True, mergeChunkWindow=False)
    eng.push(">\n>meta\nn:1\n.\n>items-\n>\nid:1\n<\n.\n")
    eng.finish()
    h = eng.history
    assert h is not None
    assert h.get_after(1) == {"meta": {"n": 1}, "items": [{"id": 1}]}
    assert chunks[1] == {"items": [{"id": 1}]}


def test_jump_after_finish_reopens() -> None:
    eng, _ = _make_engine(
        historyRealtime=True, historySnapshot=True, mergeChunkWindow=False
    )
    eng.push(THREE_PHASES)
    eng.finish()
    eng.jump_to(0)
    assert eng.committed_snapshot == {"a": 1}
    # can still push after jump in realtime mode
    eng.push(">\nz:9\n.\n")
    eng.finish()
    assert eng.committed_snapshot.get("z") == 9 or eng.committed_snapshot == {
        "a": 1,
        "z": 9,
    }


def test_stream_set_url_releases_source() -> None:
    stream = XaiopStream(
        "raw://url-a",
        merge_chunk_window=False,
        history_snapshot=True,
    )
    stream.on_chunk(lambda *_a, **_k: None)
    stream.on_done(lambda *_a, **_k: None)
    stream.send_raw(chunks_of(">\na:1\n.\n"))
    _wait_status(stream, STREAM_STATUS["COMPLETED"])
    h = stream.history
    assert h is not None
    h.set_source("raw://url-a")
    assert stream.set_url("raw://url-b") is True
    # set_url may release via set_source when history active
    assert stream.url == "raw://url-b"
