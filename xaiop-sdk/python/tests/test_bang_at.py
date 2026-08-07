"""`!` / `@` depth (Node bang.at.test.js)."""

from __future__ import annotations

import pytest

from xaiop import DotCheckpointEngine, XaiopFragment, XaiopSyntaxError, parse_sync


def wire(*lines: str) -> str:
    return "\n".join(lines)


def test_at_exact_vs_equals_fuzzy() -> None:
    fuzzy = parse_sync(
        wire(">", ">wrap", ">a", ">b", "x:1", ".", "=a>b", "z:3")
    )
    assert fuzzy == {"wrap": {"a": {"b": {"x": 1, "z": 3}}}}
    exact = parse_sync(
        wire(">", ">wrap", ">a", ">b", "x:1", ".", "@a>b", "z:1")
    )
    assert exact == {
        "wrap": {"a": {"b": {"x": 1}}},
        "a": {"b": {"z": 1}},
    }


def test_bang_outer_prune() -> None:
    # Nested same label under one outer: bang writes into matching fragments
    doc = parse_sync(
        wire(
            ">",
            ">box",
            ">t",
            "x:1",
            ".",
            ">box",
            ">nest",
            ">t",
            "y:2",
            ".",
            "!t",
            "z:9",
        )
    )
    assert doc["box"]["t"]["z"] == 9
    assert doc["box"]["nest"]["t"]["z"] == 9


def test_bang_multi_path() -> None:
    doc = parse_sync(
        wire(
            ">",
            ">left",
            ">a",
            ">b",
            "x:1",
            ".",
            ">right",
            ">a",
            ">b",
            "y:2",
            ".",
            "!a>b",
            "z:3",
        )
    )
    assert doc == {
        "left": {"a": {"b": {"x": 1, "z": 3}}},
        "right": {"a": {"b": {"y": 2, "z": 3}}},
    }


def test_bang_into_arrays_appends() -> None:
    doc = parse_sync(
        wire(
            ">",
            ">left",
            ">items-",
            ":a",
            ".",
            ">right",
            ">items-",
            ":b",
            ".",
            "!items",
            ":c",
        )
    )
    assert doc["left"]["items"] == ["a", "c"]
    assert doc["right"]["items"] == ["b", "c"]


def test_broadcast_requires_dot() -> None:
    with pytest.raises(XaiopSyntaxError, match="broadcast"):
        parse_sync(
            wire(">", ">a", "x:1", ".", ">b", ">a", "y:2", ".", "!a", "@a", "z:1")
        )


def test_dot_clears_broadcast() -> None:
    doc = parse_sync(
        wire(
            ">",
            ">left",
            ">t",
            "x:1",
            ".",
            ">right",
            ">t",
            "y:2",
            ".",
            "!t",
            "z:1",
            ".",
            ">solo",
            "w:1",
        )
    )
    assert doc["solo"] == {"w": 1}
    assert doc["left"]["t"]["z"] == 1


def test_empty_path_errors() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(wire(">", "x:1", ".", "@"))
    with pytest.raises(XaiopSyntaxError):
        parse_sync(wire(">", "x:1", ".", "!"))


def test_same_phase_bang_siblings() -> None:
    doc = parse_sync(
        wire(
            ">",
            ">a",
            ">t",
            "x:1",
            ".",
            ">b",
            ">t",
            "y:2",
            "!t",
            "z:3",
        )
    )
    assert doc["a"]["t"]["z"] == 3
    assert doc["b"]["t"]["z"] == 3


def test_stream_at_into_prior_array_d2() -> None:
    # D2: @ into named array from prior phase — Diff is array-shaped
    chunks: list = []
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "onChunk": lambda d, _m=None: chunks.append(d),
        }
    )
    eng.push(">\n>items-\n:a\n:b\n.\n")
    eng.push("@items\n:c\n.\n")
    eng.finish()
    assert eng.snapshot == {"items": ["a", "b", "c"]}
    assert isinstance(chunks[1], list) or (
        isinstance(chunks[1], dict) and "items" in chunks[1]
    )


def test_fragment_root_bang_at() -> None:
    at = parse_sync(wire(">a", ">b", "x:1", ".", "@a>b", "z:2"))
    assert isinstance(at, XaiopFragment)
    bang = parse_sync(
        wire(">left", ">t", "x:1", ".", ">right", ">t", "y:2", ".", "!t", "z:3")
    )
    assert isinstance(bang, XaiopFragment)
