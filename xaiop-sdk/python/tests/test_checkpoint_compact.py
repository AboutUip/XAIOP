"""Buffer compact + Diff isolation extras (Node checkpoint.*.test.js)."""

from __future__ import annotations

import pytest

from xaiop import DotCheckpointEngine, parse_sync


def test_buffer_stats_shapes() -> None:
    eng = DotCheckpointEngine({})
    empty = eng.buffer_stats()
    assert empty["length"] == 0
    assert empty["committedAt"] == 0
    assert empty["pendingBytes"] == 0
    eng.push(">\na:1\n")
    open_stats = eng.buffer_stats()
    assert open_stats["openPhase"] is True
    assert open_stats["pendingBytes"] > 0
    eng.push(".\n")
    closed_phase = eng.buffer_stats()
    assert closed_phase["committedAt"] == closed_phase["length"]
    assert closed_phase["pendingBytes"] == 0


def test_compact_drops_prefix_idempotent() -> None:
    eng = DotCheckpointEngine({"onChunk": lambda *_a, **_k: None})
    eng.push(">\na:1\n.\n>\nb:2\n.\n")
    before = eng.committed_snapshot
    s1 = eng.compact_committed()
    assert s1["discardedBytes"] > 0
    assert eng.committed_snapshot == before
    s2 = eng.compact_committed()
    assert s2["discardedBytes"] == 0
    eng.finish()
    assert eng.snapshot == {"a": 1, "b": 2}


def test_half_line_across_compact() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.push(">\na:1\n.\n")
    eng.compact_committed()
    eng.push(">\nb:")
    eng.push("2\n.\n")
    eng.finish()
    assert eng.snapshot == {"a": 1, "b": 2}


def test_crlf_after_compact() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.push(">\r\na:1\r\n.\r\n")
    eng.compact_committed()
    eng.push(">\r\nb:2\r\n.\r\n")
    eng.finish()
    assert eng.snapshot == {"a": 1, "b": 2}


def test_ops_after_compact() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.push(">\n>items-\n:a\n.\n")
    eng.compact_committed()
    eng.push("@items\n:b\n.\n")
    eng.push(">\n>meta\nn:1\n.\n")
    eng.push("=meta\nv:2\n.\n")
    eng.finish()
    assert eng.snapshot["items"] == ["a", "b"]
    assert eng.snapshot["meta"] == {"n": 1, "v": 2}


def test_char_stream_periodic_compact() -> None:
    wire = ">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n"
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    # Compact only between complete phases (safe boundary)
    eng.push(">\na:1\n.\n")
    eng.compact_committed()
    for ch in ">\nb:2\n.\n":
        eng.push(ch)
    eng.compact_committed()
    for ch in ">\nc:3\n.\n":
        eng.push(ch)
    eng.finish()
    assert eng.snapshot == parse_sync(wire)


def test_history_conflict_requires_drop() -> None:
    eng = DotCheckpointEngine(
        {
            "historySnapshot": True,
            "mergeChunkWindow": False,
            "onChunk": lambda *_a, **_k: None,
        }
    )
    eng.push(">\na:1\n.\n")
    with pytest.raises(RuntimeError, match="history"):
        eng.compact_committed()
    result = eng.compact_committed(drop_history=True)
    assert result["discardedBytes"] >= 0
    assert eng.history is not None
    assert eng.history.length == 0


def test_closed_engine_compact_throws() -> None:
    eng = DotCheckpointEngine({})
    eng.push(">\na:1\n.\n")
    eng.finish()
    with pytest.raises(RuntimeError, match="closed"):
        eng.compact_committed()


def test_d2_at_prior_named_array() -> None:
    chunks: list = []
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "onChunk": lambda d, _m=None: chunks.append(d),
        }
    )
    eng.push(">\n>rules-\n>\nid:1\n<\n.\n")
    eng.push("@rules\n>\nid:2\n<\n.\n")
    eng.finish()
    assert eng.snapshot == {"rules": [{"id": 1}, {"id": 2}]}
    assert chunks[0] == {"rules": [{"id": 1}]}


def test_mutating_diff_does_not_corrupt_commit() -> None:
    chunks: list = []
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "onChunk": lambda d, _m=None: chunks.append(d),
        }
    )
    eng.push(">\na:1\n.\n>\nb:2\n.\n")
    eng.finish()
    chunks[0]["a"] = 999  # type: ignore[index]
    assert eng.committed_snapshot == {"a": 1, "b": 2}


def test_mid_stream_committed_readable() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.push(">\na:1\n.\n")
    assert eng.committed_snapshot == {"a": 1}
    eng.push(">\nb:2\n.\n")
    eng.finish()
    assert eng.snapshot == {"a": 1, "b": 2}


def test_crlf_cr_lf_materialize_same() -> None:
    bodies = [
        ">\na:1\n.\n>\nb:2\n.\n",
        ">\r\na:1\r\n.\r\n>\r\nb:2\r\n.\r\n",
    ]
    expected = {"a": 1, "b": 2}
    for body in bodies:
        eng = DotCheckpointEngine(
            {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
        )
        eng.push(body)
        eng.finish()
        assert eng.snapshot == expected
        assert parse_sync(body) == expected
