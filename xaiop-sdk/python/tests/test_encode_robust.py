"""Encode robustness: path cuts, maxPhases, key_order, CR/LF, ES floats, should_phase."""

from __future__ import annotations

import pytest

from xaiop import (
    DOT_POLICY,
    DotCheckpointEngine,
    XaiopEncodeError,
    encode_sync,
    parse_sync,
)


def _dot_count(wire: str) -> int:
    return sum(1 for line in wire.splitlines() if line == ".")


def test_path_cut_a_x() -> None:
    value = {"a": {"x": 1, "y": 2}, "b": 3}
    wire = encode_sync(value, dot_policy=["a.x"])
    assert _dot_count(wire) == 1
    assert "\nx:1\n.\n" in wire or "x:1" in wire
    assert parse_sync(wire) == value


def test_path_cut_named_array_index() -> None:
    value = {
        "data": {
            "childs": [{"id": i} for i in range(4)],
            "meta": True,
        }
    }
    wire = encode_sync(value, dot_policy=["data.childs[2]"])
    assert _dot_count(wire) == 1
    assert ">childs-" in wire
    assert parse_sync(wire) == value


def test_path_cut_flat_items() -> None:
    value = {"items": [1, 2, 3, 4], "z": True}
    wire = encode_sync(value, dot_policy=["items[1]", "items[2]"])
    assert parse_sync(wire) == value


def test_path_cut_not_found() -> None:
    with pytest.raises(XaiopEncodeError):
        encode_sync({"a": 1}, dot_policy=["nope"])


def test_path_cut_ignores_phase_every() -> None:
    # Path-cut mode takes precedence; phase_every is not applied (Node rejects; Python ignores).
    wire = encode_sync({"a": 1, "b": 2}, dot_policy=["a"], phase_every=1)
    assert parse_sync(wire) == {"a": 1, "b": 2}
    assert _dot_count(wire) == 1


def test_path_cut_rejects_non_final_index() -> None:
    with pytest.raises(XaiopEncodeError):
        encode_sync({"items": [{"id": 1}]}, dot_policy=["items[0].id"])


def test_path_cut_rejects_duplicate() -> None:
    with pytest.raises(XaiopEncodeError):
        encode_sync({"a": 1}, dot_policy=["a", "a"])


def test_default_per_top_level_key() -> None:
    wire = encode_sync({"a": 1, "b": 2, "c": 3})
    assert _dot_count(wire) == 2


def test_none_policy_no_dots() -> None:
    wire = encode_sync({"a": 1, "b": 2}, dot_policy=DOT_POLICY["NONE"])
    assert _dot_count(wire) == 0
    assert wire.startswith(">\n")


def test_per_n_keys_phase_every() -> None:
    value = {"a": 1, "b": 2, "c": 3, "d": 4, "e": 5}
    wire = encode_sync(value, dot_policy=DOT_POLICY["PER_N_KEYS"], phase_every=2)
    assert _dot_count(wire) == 2
    assert parse_sync(wire) == value


def test_max_phases_merges_tail() -> None:
    value = {"a": 1, "b": 2, "c": 3, "d": 4}
    wire = encode_sync(value, dot_policy=DOT_POLICY["PER_TOP_LEVEL_KEY"], max_phases=2)
    assert _dot_count(wire) == 1
    assert parse_sync(wire) == value


def test_custom_should_phase() -> None:
    value = {"a": 1, "b": 2, "c": 3, "d": 4}

    def should(ctx):
        key = ctx.get("key")
        return key in ("b", "c")

    wire = encode_sync(
        value, dot_policy=DOT_POLICY["CUSTOM"], should_phase=should
    )
    assert _dot_count(wire) == 2
    assert parse_sync(wire) == value


def test_custom_requires_should_phase() -> None:
    with pytest.raises(XaiopEncodeError, match="should_phase"):
        encode_sync({"a": 1}, dot_policy=DOT_POLICY["CUSTOM"])


def test_key_order_sorted() -> None:
    wire = encode_sync({"b": 1, "a": 2}, key_order="sorted", dot_policy=DOT_POLICY["NONE"])
    # a should appear before b
    pos_a = wire.find("a:")
    pos_b = wire.find("b:")
    assert 0 <= pos_a < pos_b


def test_final_dot_true() -> None:
    wire = encode_sync({"a": 1}, dot_policy=DOT_POLICY["NONE"], final_dot=True)
    assert wire.rstrip("\n").endswith(".")


def test_cr_lf_rejected() -> None:
    with pytest.raises(XaiopEncodeError, match="CR/LF|CR|LF|newline"):
        encode_sync({"a": "x\ny"})
    with pytest.raises(XaiopEncodeError):
        encode_sync({"a": "x\ry"})


def test_leading_space_rejected() -> None:
    with pytest.raises(XaiopEncodeError, match="SPACE|U\\+0020"):
        encode_sync({"s": " spaced"})


def test_tab_and_empty_ok() -> None:
    assert parse_sync(encode_sync({"t": "\tok", "e": ""})) == {"t": "\tok", "e": ""}


def test_forced_string_tokens() -> None:
    value = {"a": "5", "b": "1.5", "c": "true", "d": "null"}
    wire = encode_sync(value, dot_policy=DOT_POLICY["NONE"])
    assert "a: 5" in wire
    assert "b: 1.5" in wire
    assert "c: true" in wire
    assert "d: null" in wire
    assert parse_sync(wire) == value


def test_unforced_strings() -> None:
    value = {"a": "hi", "b": "1e3x", "c": "NaN"}
    wire = encode_sync(value, dot_policy=DOT_POLICY["NONE"])
    assert "a:hi" in wire
    assert "b:1e3x" in wire
    assert "c:NaN" in wire


def test_es_float_tokens() -> None:
    cases = [
        (1e-7, "a:1e-7"),
        (1e21, "a:1e+21"),
        (0.1 + 0.2, "a:0.30000000000000004"),
        (5e-324, "a:5e-324"),
        (1.7976931348623157e308, "a:1.7976931348623157e+308"),
        (3.0, "a:3"),
    ]
    for value, expected_line in cases:
        wire = encode_sync({"a": value}, dot_policy=DOT_POLICY["NONE"])
        assert expected_line in wire.splitlines(), (value, wire)


def test_nan_inf_rejected() -> None:
    with pytest.raises(XaiopEncodeError):
        encode_sync({"a": float("nan")})
    with pytest.raises(XaiopEncodeError):
        encode_sync({"a": float("inf")})


def test_encode_aligns_with_checkpoint_phases() -> None:
    wire = encode_sync(
        {"a": {"x": 1}, "b": {"y": 2}, "c": 3},
        dot_policy=DOT_POLICY["PER_TOP_LEVEL_KEY"],
    )
    chunks: list = []
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda d, _m=None: chunks.append(d)}
    )
    eng.push(wire)
    eng.finish()
    assert chunks == [{"a": {"x": 1}}, {"b": {"y": 2}}, {"c": 3}]


def test_max_phases_positive() -> None:
    with pytest.raises(XaiopEncodeError):
        encode_sync({"a": 1}, max_phases=0)
