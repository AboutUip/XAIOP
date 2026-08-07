from xaiop import DotCheckpointEngine, parse_sync


def _run_engine(chunks: list[str], **opts) -> tuple[object, list[object]]:
    out: list[object] = []
    eng = DotCheckpointEngine({**opts, "onChunk": lambda d, _m=None: out.append(d)})
    for c in chunks:
        eng.push(c)
    eng.finish()
    return eng.committed_snapshot, out


def test_empty_phase_null_diff() -> None:
    chunks: list[object] = []
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda d, _m=None: chunks.append(d)}
    )
    eng.push(".\n")
    eng.finish()
    assert chunks[0] is None


def test_diff_isolation_d1() -> None:
    p1 = ">\n>meta\nname:x\n.\n"
    p2 = ">rules-\n>\nid:R1\n<\n.\n"
    full = p1 + p2
    expected = {"meta": {"name": "x"}, "rules": [{"id": "R1"}]}
    assert parse_sync(full) == expected
    one, _ = _run_engine([full], mergeChunkWindow=True)
    split, chunks = _run_engine([p1, p2], mergeChunkWindow=False)
    assert one == expected
    assert split == expected
    assert chunks[0] == {"meta": {"name": "x"}}
    assert chunks[1] == {"rules": [{"id": "R1"}]}


def test_diff_mutation_isolated() -> None:
    wire = ">\na:1\n.\n>\nb:2\n.\n"
    chunks: list[object] = []
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda d, _m=None: chunks.append(d)}
    )
    eng.push(wire)
    eng.finish()
    first = chunks[0]
    assert isinstance(first, dict)
    first["a"] = 999
    assert eng.committed_snapshot == {"a": 1, "b": 2}


def test_finish_equals_parse_sync() -> None:
    wire = ">\n>meta\nname:x\n.\n>rules-\n>\nid:R1\n<\n.\n"
    eng = DotCheckpointEngine({})
    eng.push(wire)
    eng.finish()
    assert eng.committed_snapshot == parse_sync(wire)
    assert eng.snapshot == parse_sync(wire)


def test_emit_diff_false() -> None:
    eng = DotCheckpointEngine({"emitDiff": False})
    eng.push(">\na:1\n.\n")
    eng.finish()
    assert eng.committed_snapshot == {"a": 1}


def test_buffer_stats_and_compact() -> None:
    eng = DotCheckpointEngine({})
    eng.push(">\na:1\n.\n")
    stats = eng.buffer_stats()
    assert stats["length"] > 0
    assert stats["committedAt"] == stats["length"]
    result = eng.compact_committed()
    assert result["discardedBytes"] == stats["length"]
    eng.finish()
    assert eng.committed_snapshot == {"a": 1}
