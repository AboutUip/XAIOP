"""Protocol 0.7 Draft — `?` select + bare `&` × history / jumpTo / cover / stream."""

from __future__ import annotations

import time

import pytest

from xaiop import (
    HISTORY_NODE_KIND,
    LINE_KIND,
    STREAM_STATUS,
    DotCheckpointEngine,
    RangeError,
    XaiopStream,
    XaiopSyntaxError,
    chunks_of,
    parse_sync,
)

SEED = ">\n>orders-\n>\nid:A1\nstatus:pending\n<\n>\nid:A2\nstatus:pending\n<\n>\nid:A3\nstatus:done\n.\n"
SELECT_A2 = "@orders\n?id:A2\nstatus:shipped\n.\n"
SPLICE_A1 = "@orders\n?id:A1\n&\n.\n"
STAR_SHIPPED = "@orders\n?*status:shipped\nchecked:true\n.\n"
LOCATE_SELECT = "=orders\n?1\nnote:ok\n.\n"
FULL = SEED + SELECT_A2 + SPLICE_A1

AFTER_SEED = {
    "orders": [
        {"id": "A1", "status": "pending"},
        {"id": "A2", "status": "pending"},
        {"id": "A3", "status": "done"},
    ]
}
AFTER_SELECT = {
    "orders": [
        {"id": "A1", "status": "pending"},
        {"id": "A2", "status": "shipped"},
        {"id": "A3", "status": "done"},
    ]
}
AFTER_SPLICE = {
    "orders": [
        {"id": "A2", "status": "shipped"},
        {"id": "A3", "status": "done"},
    ]
}
AFTER_INTERCEPT = {
    "orders": [
        {"id": "A1", "status": "shipped"},
        {"id": "A2", "status": "pending"},
        {"id": "A3", "status": "done"},
    ]
}
AFTER_STAR = {
    "orders": [
        {"id": "A1", "status": "pending"},
        {"id": "A2", "status": "shipped", "checked": True},
        {"id": "A3", "status": "done"},
    ]
}


def _rewrite_select_a2(ctx: dict) -> str:
    view = ctx["view"]
    if view.kind == LINE_KIND["SELECT"] and view.path == "id:A2":
        return "?id:A1"
    return str(ctx["raw"])


def _make_engine(**opts):
    chunks: list = []
    eng = DotCheckpointEngine(
        {
            "streamProcessing": True,
            "mergeChunkWindow": False,
            "onChunk": lambda d, _m=None: chunks.append(d),
            **opts,
        }
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


def test_snapshot_after_trees() -> None:
    eng, _ = _make_engine(historySnapshot=True)
    eng.push(FULL)
    h = eng.history
    assert h is not None
    assert h.length == 3
    assert h.get_after(0) == AFTER_SEED
    assert h.get_after(1) == AFTER_SELECT
    assert h.get_after(2) == AFTER_SPLICE
    assert h.get_before(1) == AFTER_SEED
    cmp = h.compare(0, 2)
    assert cmp["a"] == AFTER_SEED
    assert cmp["b"] == AFTER_SPLICE
    assert h.view_range(0, 1)["json"] == AFTER_SELECT


def test_view_range_without_wire() -> None:
    eng, _ = _make_engine(historySnapshot=True, retainWireHistory=False)
    eng.push(FULL)
    h = eng.history
    assert h is not None
    assert h.get_node(1).wire is None
    assert h.view_range(0, 1)["json"] == AFTER_SELECT


def test_emit_diff_false_still_records_after() -> None:
    eng, chunks = _make_engine(historySnapshot=True, emitDiff=False)
    eng.push(FULL)
    assert eng.history is not None
    assert eng.history.get_after(2) == AFTER_SPLICE
    assert all(d is None for d in chunks)
    assert eng.history.get_diff(1) is None


def test_compat_true_strict_select_trees() -> None:
    eng, _ = _make_engine(historySnapshot=True, compat=True)
    eng.push(FULL)
    assert eng.history is not None
    assert eng.history.get_after(2) == AFTER_SPLICE


def test_eof_tail_open_select() -> None:
    eng, _ = _make_engine(historySnapshot=True)
    eng.push(SEED + "@orders\n?id:A2\nstatus:shipped\n")
    eng.finish()
    root = eng.history.export_time_root()
    assert [n.kind for n in root] == [HISTORY_NODE_KIND["DOT"], HISTORY_NODE_KIND["TAIL"]]
    assert root[1].after == AFTER_SELECT


def test_jump_to_before_splice_then_continue() -> None:
    eng, _ = _make_engine(historySnapshot=True, historyRealtime=True)
    eng.push(FULL)
    h = eng.history
    assert h is not None
    assert h.live_cursor == -1
    assert h.can_jump_to(1)
    jumped = eng.jump_to(1)
    assert jumped["kept"] == 2
    assert jumped["discarded"] == 1
    assert jumped["after"] == AFTER_SELECT
    assert h.length == 2
    assert h.live_cursor == 1
    assert eng.committed_snapshot == AFTER_SELECT
    assert not h.can_jump_to(1)
    with pytest.raises(RangeError):
        eng.jump_to(0)
    eng.push(STAR_SHIPPED)
    assert h.length == 3
    assert h.get_after(2) == AFTER_STAR


def test_jump_to_seed_then_matching_select() -> None:
    eng, _ = _make_engine(historyRealtime=True)
    eng.push(FULL)
    eng.jump_to(0)
    assert eng.committed_snapshot == AFTER_SEED
    eng.push(SELECT_A2)
    assert eng.history is not None
    assert eng.history.get_after(1) == AFTER_SELECT


def test_jump_to_seed_then_unmatched_star() -> None:
    eng, _ = _make_engine(historyRealtime=True)
    eng.push(FULL)
    eng.jump_to(0)
    with pytest.raises(XaiopSyntaxError, match=r"matched no array elements"):
        eng.push(STAR_SHIPPED)
    assert eng.history is not None
    assert eng.history.get_after(0) == AFTER_SEED


def test_retain_wire_false_jump_rebuild() -> None:
    eng, _ = _make_engine(
        historySnapshot=True, historyRealtime=True, retainWireHistory=False
    )
    eng.push(FULL)
    jumped = eng.jump_to(1)
    assert jumped["wirePrefix"] is None
    assert eng.committed_snapshot == AFTER_SELECT
    eng.push(STAR_SHIPPED)
    assert eng.history is not None
    assert eng.history.get_after(2) == AFTER_STAR


def test_jump_after_finish_reopens() -> None:
    eng, _ = _make_engine(historyRealtime=True)
    eng.push(FULL)
    eng.finish()
    eng.jump_to(1)
    eng.push(STAR_SHIPPED)
    assert eng.history is not None
    assert eng.history.get_after(2) == AFTER_STAR


def test_intercept_rewrite_reapplied_on_jump() -> None:
    eng, _ = _make_engine(
        historySnapshot=True,
        historyRealtime=True,
        lineIntercept=_rewrite_select_a2,
    )
    eng.push(SEED + SELECT_A2 + SPLICE_A1)
    assert eng.history is not None
    assert eng.history.get_after(1) == AFTER_INTERCEPT
    eng.jump_to(1)
    assert eng.committed_snapshot == AFTER_INTERCEPT
    eng.push("@orders\n?id:A3\nnote:x\n.\n")
    assert eng.history.get_after(2) == {
        "orders": [
            {"id": "A1", "status": "shipped"},
            {"id": "A2", "status": "pending"},
            {"id": "A3", "status": "done", "note": "x"},
        ]
    }


def test_skip_select_writes_at_array_level() -> None:
    def skip_select(ctx: dict):
        view = ctx["view"]
        if view.kind == LINE_KIND["SELECT"]:
            return None
        return str(ctx["raw"])

    eng, _ = _make_engine(historySnapshot=True, lineIntercept=skip_select)
    eng.push(SEED + SELECT_A2)
    assert eng.history is not None
    assert eng.history.get_after(1) == {
        "orders": [
            {"id": "A1", "status": "pending"},
            {"id": "A2", "status": "pending"},
            {"id": "A3", "status": "done"},
            {"status": "shipped"},
        ]
    }


def test_merge_chunk_window_one_chunk_three_nodes() -> None:
    eng, chunks = _make_engine(historySnapshot=True, mergeChunkWindow=True)
    eng.push(FULL)
    assert eng.history is not None
    assert eng.history.length == 3
    assert len(chunks) == 1
    assert eng.history.get_after(2) == AFTER_SPLICE


def test_char_chunked_predicate() -> None:
    eng, _ = _make_engine(historySnapshot=True)
    eng.push(SEED)
    for ch in SELECT_A2:
        eng.push(ch)
    assert eng.history is not None
    assert eng.history.get_after(1) == AFTER_SELECT


def test_cover_path_delete_after_select() -> None:
    wire = SEED + SELECT_A2 + "&orders\n.\n"
    eng, _ = _make_engine(cover=True, historySnapshot=True)
    eng.push(wire)
    eng.finish()
    assert eng.snapshot == parse_sync(wire)
    assert eng.snapshot == {}


def test_cover_cannot_restore_select_cursor_before_bare_amp() -> None:
    eng, _ = _make_engine(cover=True, historySnapshot=True)
    with pytest.raises(XaiopSyntaxError, match=r"cannot restore Cursor after \."):
        eng.push(SEED + SPLICE_A1)


def test_failed_later_select_keeps_prior_node() -> None:
    eng, _ = _make_engine(historySnapshot=True)
    eng.push(SEED)
    with pytest.raises(XaiopSyntaxError):
        eng.push("@orders\n?99\n.\n")
    assert eng.history is not None
    assert eng.history.length == 1
    assert eng.history.get_after(0) == AFTER_SEED


def test_compact_committed_refuses_until_drop() -> None:
    eng, _ = _make_engine(historySnapshot=True)
    eng.push(FULL)
    with pytest.raises(RuntimeError, match="history"):
        eng.compact_committed()
    eng.compact_committed(drop_history=True)
    assert eng.history is not None
    assert eng.history.length == 0
    assert eng.committed_snapshot == AFTER_SPLICE


def test_locate_then_select_later_phase() -> None:
    eng, _ = _make_engine(historySnapshot=True)
    eng.push(SEED + LOCATE_SELECT)
    assert eng.history is not None
    assert eng.history.get_after(1) == {
        "orders": [
            {"id": "A1", "status": "pending"},
            {"id": "A2", "status": "pending", "note": "ok"},
            {"id": "A3", "status": "done"},
        ]
    }


def test_stream_jump_to_select_write() -> None:
    stream = XaiopStream(
        "raw://select-hist",
        merge_chunk_window=False,
        history_snapshot=True,
        history_realtime=True,
    )
    stream.on_chunk(lambda _d, _m=None: None)
    stream.on_done(lambda _j: None)
    stream.send_raw(chunks_of(FULL))
    _wait_status(stream, STREAM_STATUS["COMPLETED"])
    assert stream.history is not None
    assert stream.history.length == 3
    assert stream.history.get_after(2) == AFTER_SPLICE
    jumped = stream.jump_to(1)
    assert jumped["kept"] == 2
    assert stream.get_committed_snapshot() == AFTER_SELECT
    assert stream.history.length == 2
