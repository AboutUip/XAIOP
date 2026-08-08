"""`&` delete semantics + cover tombstones (Node amp.delete.test.js)."""

from __future__ import annotations

import pytest

from xaiop import (
    DotCheckpointEngine,
    LiveParser,
    XaiopEncodeError,
    XaiopSyntaxError,
    encode_sync,
    parse_sync,
)


def wire(*lines: str) -> str:
    return "\n".join(lines)


def test_delete_key_cursor_unchanged() -> None:
    assert parse_sync(wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3")) == {
        "b": {"y": 2, "z": 3}
    }


def test_nested_deepest_only() -> None:
    assert parse_sync(
        wire(">", ">a", ">b", "x:1", "y:2", ".", ">c", "z:1", "&a>b", "keep:9")
    ) == {"a": {}, "c": {"z": 1, "keep": 9}}


def test_empty_parent_remains() -> None:
    assert parse_sync(wire(">", ">a", ">b", "x:1", ".", ">keep", "v:1", "&a>b")) == {
        "a": {},
        "keep": {"v": 1},
    }


def test_missing_noop() -> None:
    assert parse_sync(wire(">", ">a", "x:1", "&missing")) == {"a": {"x": 1}}
    assert parse_sync(wire(">", ">a", "x:1", "&a>nope>z")) == {"a": {"x": 1}}
    assert parse_sync(wire("&ghost", ">", "x:1")) == {"x": 1}


def test_delete_then_recreate() -> None:
    doc = parse_sync(
        wire(">", ">a", "old:1", ".", ">b", "t:1", "&a", ".", ">a", "new:2")
    )
    assert doc == {"b": {"t": 1}, "a": {"new": 2}}


def test_multiple_and_consecutive() -> None:
    assert parse_sync(
        wire(
            ">",
            ">a",
            "x:1",
            ".",
            ">b",
            "y:1",
            ".",
            ">c",
            "z:1",
            "&a",
            ".",
            ">d",
            "w:1",
            "&b",
        )
    ) == {"c": {"z": 1}, "d": {"w": 1}}
    assert parse_sync(
        wire(">", ">a", "x:1", ".", ">b", "y:1", ".", ">c", "z:1", "&a", "&b")
    ) == {"c": {"z": 1}}


def test_cursor_chain_forbidden_sibling_ok() -> None:
    with pytest.raises(XaiopSyntaxError, match="Cursor chain"):
        parse_sync(wire(">", ">a", "x:1", "&a"))
    with pytest.raises(XaiopSyntaxError, match="Cursor chain"):
        parse_sync(wire(">", ">a", ">b", "x:1", "&a"))
    assert parse_sync(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a")) == {"b": {"y": 1}}


def test_dot_then_delete_ok() -> None:
    assert parse_sync(wire(">", ">a", "x:1", ".", "&a", ">", "z:1")) == {"z": 1}


def test_array_delete_whole() -> None:
    assert parse_sync(
        wire(">", ">items-", ":a", ":b", ".", ">keep", "v:1", "&items")
    ) == {"keep": {"v": 1}}


def test_index_like_path_noop() -> None:
    # Named-array index paths do not delete elements via &
    doc = parse_sync(wire(">", ">items-", ":a", ":b", ".", "&items>0"))
    assert doc == {"items": ["a", "b"]}


def test_no_typed_null_left() -> None:
    doc = parse_sync(wire(">", ">a", "x:1", ".", ">b", "y:1", "&a"))
    assert "a" not in doc
    assert doc == {"b": {"y": 1}}


def test_content_null_not_delete() -> None:
    assert parse_sync(wire(">", "a:null")) == {"a": None}


def test_encode_rejects_amp_key() -> None:
    with pytest.raises(XaiopEncodeError):
        encode_sync({"&a": 1})


def test_live_equals_sync() -> None:
    text = wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3")
    live = LiveParser()
    live.feed_text(text)
    assert live.value() == parse_sync(text)


def test_stream_non_cover_prior_diff_unchanged() -> None:
    chunks: list = []
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "cover": False,
            "onChunk": lambda d, _m=None: chunks.append(d),
        }
    )
    eng.push(wire(">", ">a", "x:1", ".") + "\n")
    first = chunks[0]
    eng.push(wire(">", ">b", "y:2", "&a", ".") + "\n")
    eng.finish()
    assert chunks[0] == first == {"a": {"x": 1}}
    assert eng.snapshot == {"b": {"y": 2}}


def test_stream_non_cover_committed_and_final() -> None:
    text = wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", ".") + "\n"
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "cover": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.push(wire(">", ">a", "x:1", ".") + "\n")
    assert eng.committed_snapshot == {"a": {"x": 1}}
    eng.push(wire(">", ">b", "y:2", "&a", ".") + "\n")
    assert eng.committed_snapshot == {"b": {"y": 2}}
    eng.finish()
    assert eng.snapshot == parse_sync(text)


def test_cover_tombstone_diff() -> None:
    chunks: list = []
    text = wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", "z:2", ".") + "\n"
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "cover": True,
            "historySnapshot": True,
            "onChunk": lambda d, _m=None: chunks.append(d),
        }
    )
    eng.push(text)
    eng.finish()
    assert eng.snapshot == parse_sync(text)
    assert any(
        isinstance(c, dict) and c.get("a") is None for c in chunks
    )
    h = eng.history
    assert h is not None and h.length >= 2
    all_wire = "".join(h.get_node(i).wire or "" for i in range(h.length))
    assert "&a" in all_wire


def test_cover_nested_tombstone() -> None:
    chunks: list = []
    text = wire(">", ">a", ">b", "x:1", ".", ">c", "z:1", "&a>b", ".") + "\n"
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "cover": True,
            "onChunk": lambda d, _m=None: chunks.append(d),
        }
    )
    eng.push(text)
    eng.finish()
    tomb = next(
        (
            c
            for c in chunks
            if isinstance(c, dict)
            and isinstance(c.get("a"), dict)
            and c["a"].get("b") is None
        ),
        None,
    )
    assert tomb == {"a": {"b": None}}
    assert eng.snapshot == parse_sync(text)


def test_cover_restore_cursor_content() -> None:
    text = wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", "z:2", ".") + "\n"
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "cover": True, "onChunk": lambda *_a, **_k: None}
    )
    eng.push(text)
    eng.finish()
    assert eng.snapshot == {"b": {"y": 1, "z": 2}}


def test_cover_history_after_not_rewritten() -> None:
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "cover": True,
            "historySnapshot": True,
            "onChunk": lambda *_a, **_k: None,
        }
    )
    eng.push(wire(">", ">a", "x:1", ".") + "\n")
    h = eng.history
    assert h is not None
    after0 = h.get_after(0)
    eng.push(wire(">", ">b", "y:1", "&a", ".") + "\n")
    eng.finish()
    assert h.get_after(0) == after0 == {"a": {"x": 1}}


def test_cover_and_non_cover_finals_match() -> None:
    text = (
        wire(">", ">a", "x:1", ".", ">b", "y:1", "&a", "&missing", "z:2", ".") + "\n"
    )

    def run(cover: bool):
        eng = DotCheckpointEngine(
            {
                "mergeChunkWindow": False,
                "cover": cover,
                "onChunk": lambda *_a, **_k: None,
            }
        )
        eng.push(text)
        eng.finish()
        return eng.snapshot

    assert run(False) == run(True) == parse_sync(text)


def test_broadcast_relative_delete() -> None:
    text = wire(
        ">",
        ">box",
        ">a",
        ">meta",
        "k:1",
        "drop:9",
        "<",
        "<",
        ">b",
        ">meta",
        "k:2",
        "drop:8",
        ".",
        "!meta",
        "&drop",
    )
    assert parse_sync(text) == {
        "box": {"a": {"meta": {"k": 1}}, "b": {"meta": {"k": 2}}}
    }


def test_amp_under_broadcast_then_absolute() -> None:
    text = wire(">", ">a", "x:1", ".", ">b", "y:1", ".", "!a", "z:2", ".", "&b")
    assert parse_sync(text) == {"a": {"x": 1, "z": 2}}


def test_array_recreate_after_delete() -> None:
    text = wire(">", ">items-", ":a", ":b", ".", "&items", ".", ">items-", ":c")
    assert parse_sync(text) == {"items": ["c"]}


def test_bare_amp_syntax_errors() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(wire(">", "x:1", "&"))
    with pytest.raises(XaiopSyntaxError):
        parse_sync(wire(">", "x:1", "&>a"))


def test_cover_consecutive_amp_merged_tombstone() -> None:
    chunks: list = []
    text = wire(">", ">a", "x:1", ".", ">b", "y:1", ".", "&a", "&b", ".") + "\n"
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "cover": True,
            "onChunk": lambda d, _m=None: chunks.append(d),
        }
    )
    eng.push(text)
    eng.finish()
    assert any(
        isinstance(c, dict) and c.get("a") is None and c.get("b") is None for c in chunks
    )
    assert eng.snapshot == {}
