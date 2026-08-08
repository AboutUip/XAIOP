"""Checkpoint window merge, D1/D2, emitDiff, push_async coalesce."""

from __future__ import annotations

from xaiop import DotCheckpointEngine, parse_sync

WIRE_AB = ">\n>a\nx:1\n.\n>b\ny:2\n.\n"


def _run(chunks: list[str], **opts) -> tuple[object, list[object]]:
    out: list[object] = []
    eng = DotCheckpointEngine({**opts, "onChunk": lambda d, _m=None: out.append(d)})
    for c in chunks:
        eng.push(c)
    eng.finish()
    return eng.committed_snapshot, out


def test_window_merge_on_one_diff() -> None:
    snap, diffs = _run([WIRE_AB], mergeChunkWindow=True)
    assert snap == {"a": {"x": 1}, "b": {"y": 2}}
    assert len(diffs) == 1
    assert diffs[0] == {"a": {"x": 1}, "b": {"y": 2}}


def test_window_merge_off_stepwise() -> None:
    snap, diffs = _run([WIRE_AB], mergeChunkWindow=False)
    assert snap == {"a": {"x": 1}, "b": {"y": 2}}
    assert diffs == [{"a": {"x": 1}}, {"b": {"y": 2}}]


def test_push_async_coalesce_merge_on() -> None:
    """mergeChunkWindow coalesces dots within one push; across push_async waits are sequential."""
    chunks: list = []
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": True, "onChunk": lambda d, _m=None: chunks.append(d)}
    )
    # Single async push containing two phases → one coalesced Diff
    eng.push_async(">\n>a\nx:1\n.\n>\n>b\ny:2\n.\n").wait(timeout=5)
    eng.finish_async().wait(timeout=5)
    assert eng.committed_snapshot == {"a": {"x": 1}, "b": {"y": 2}}
    assert len(chunks) == 1
    assert chunks[0] == {"a": {"x": 1}, "b": {"y": 2}}

    # Separately awaited push_async calls flush independently (still correct finals)
    chunks2: list = []
    eng2 = DotCheckpointEngine(
        {"mergeChunkWindow": True, "onChunk": lambda d, _m=None: chunks2.append(d)}
    )
    eng2.push_async(">\n>a\nx:1\n.\n").wait(timeout=5)
    eng2.push_async(">\n>b\ny:2\n.\n").wait(timeout=5)
    eng2.finish_async().wait(timeout=5)
    assert eng2.committed_snapshot == {"a": {"x": 1}, "b": {"y": 2}}
    assert len(chunks2) == 2


def test_sync_alongside_async_merge_off() -> None:
    chunks: list = []
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda d, _m=None: chunks.append(d)}
    )
    eng.push_async(">\na:1\n.\n").wait(timeout=5)
    eng.push(">\nb:2\n.\n")
    eng.finish()
    assert eng.committed_snapshot == {"a": 1, "b": 2}
    assert len(chunks) >= 2


def test_d1_named_enter_after_dot() -> None:
    p1 = ">\n>meta\nname:x\n.\n"
    p2 = ">rules-\n>\nid:R1\n<\n.\n"
    full = p1 + p2
    expected = {"meta": {"name": "x"}, "rules": [{"id": "R1"}]}
    assert parse_sync(full) == expected
    one, _ = _run([full], mergeChunkWindow=True)
    split, chunks = _run([p1, p2], mergeChunkWindow=False)
    assert one == expected
    assert split == expected
    assert chunks[0] == {"meta": {"name": "x"}}
    assert chunks[1] == {"rules": [{"id": "R1"}]}


def test_d1_locate_cumulative_diff() -> None:
    p1 = ">\n>a\nx:1\n.\n"
    p2 = "=a\ny:2\n.\n"
    snap, chunks = _run([p1, p2], mergeChunkWindow=False)
    assert snap == {"a": {"x": 1, "y": 2}}
    assert chunks[0] == {"a": {"x": 1}}
    # second diff is locate merge into a
    assert chunks[1] == {"a": {"x": 1, "y": 2}} or (
        isinstance(chunks[1], dict) and chunks[1].get("a", {}).get("y") == 2
    )


def test_d2_at_orders_append() -> None:
    p0 = ">\n>orders-\n.\n"
    p1 = "@orders\n>\na:1\n<\n.\n"
    p2 = "@orders\n>\na:1\n<\n>\nb:2\n<\n.\n"
    assert parse_sync(p0 + p1) == {"orders": [{"a": 1}]}
    assert parse_sync(p0 + p1 + p2) == {
        "orders": [{"a": 1}, {"a": 1}, {"b": 2}]
    }
    snap, chunks = _run([p0, p1, p2], mergeChunkWindow=False)
    assert snap == {"orders": [{"a": 1}, {"a": 1}, {"b": 2}]}
    assert chunks[0] == {"orders": []}
    assert chunks[1] == {"orders": [{"a": 1}]}
    assert chunks[2] == {"orders": [{"a": 1}, {"a": 1}, {"b": 2}]}


def test_d2_workarounds_locate_and_enter() -> None:
    base = ">\n>orders-\n.\n"
    via_eq = base + "=orders\n>\na:1\n<\n.\n"
    via_enter = base + ">orders-\n>\na:1\n<\n.\n"
    assert parse_sync(via_eq) == {"orders": [{"a": 1}]}
    assert parse_sync(via_enter) == {"orders": [{"a": 1}]}


def test_emit_diff_false_no_on_chunk_ok() -> None:
    eng = DotCheckpointEngine({"emitDiff": False, "mergeChunkWindow": False})
    eng.push(">\na:1\n.\n")
    eng.finish()
    assert eng.committed_snapshot == {"a": 1}


def test_emit_diff_false_on_chunk_null() -> None:
    chunks: list = []
    eng = DotCheckpointEngine(
        {
            "emitDiff": False,
            "mergeChunkWindow": False,
            "onChunk": lambda d, _m=None: chunks.append(d),
        }
    )
    eng.push(">\na:1\n.\n")
    eng.finish()
    assert chunks == [None] or all(c is None for c in chunks)
    assert eng.committed_snapshot == {"a": 1}


def test_emit_diff_false_d2_still_commits() -> None:
    eng = DotCheckpointEngine({"emitDiff": False, "mergeChunkWindow": False})
    eng.push(">\n>orders-\n.\n")
    eng.push("@orders\n>\na:1\n<\n.\n")
    eng.finish()
    assert eng.committed_snapshot == {"orders": [{"a": 1}]}


def test_broadcast_mutation_isolation() -> None:
    wire = (
        ">\n>left\n>test\nx:1\n.\n"
        ">right\n>test\ny:2\n.\n"
        "!test\nz:9\n.\n"
    )
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda d, _m=None: None}
    )
    eng.push(wire)
    eng.finish()
    snap = eng.committed_snapshot
    assert snap["left"]["test"] == {"x": 1, "z": 9}
    assert snap["right"]["test"] == {"y": 2, "z": 9}


def test_stream_processing_false_one_chunk() -> None:
    chunks: list = []
    wire = WIRE_AB
    eng = DotCheckpointEngine(
        {
            "streamProcessing": False,
            "mergeChunkWindow": False,
            "onChunk": lambda d, _m=None: chunks.append(d),
        }
    )
    eng.push(wire)
    eng.finish()
    assert len(chunks) == 1
    assert chunks[0] == parse_sync(wire)


def test_forced_string_content() -> None:
    snap, _ = _run([">\nn: 42\n.\n"], mergeChunkWindow=False)
    assert snap == {"n": "42"}


def test_crlf_same_as_lf() -> None:
    lf = ">\na:1\n.\n>\nb:2\n.\n"
    crlf = lf.replace("\n", "\r\n")
    a, _ = _run([lf], mergeChunkWindow=False)
    b, _ = _run([crlf], mergeChunkWindow=False)
    assert a == b == {"a": 1, "b": 2}
