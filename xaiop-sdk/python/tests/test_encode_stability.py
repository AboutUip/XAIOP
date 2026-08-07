"""Encode determinism / stability (Node encode.stability.test.js)."""

from __future__ import annotations

import random

import pytest

from xaiop import (
    DOT_POLICY,
    DotCheckpointEngine,
    XaiopEncodeError,
    encode_sync,
    parse_sync,
)


def test_identical_input_identical_wire() -> None:
    value = {"a": 1, "nested": {"k": "v"}, "arr": [1, True, None]}
    wires = [encode_sync(value) for _ in range(20)]
    assert len(set(wires)) == 1


def test_double_roundtrip_idempotent() -> None:
    value = {
        "meta": {"name": "x", "n": 2},
        "tags": ["a", "b"],
        "flag": False,
        "z": None,
    }
    w1 = encode_sync(value)
    v1 = parse_sync(w1)
    w2 = encode_sync(v1)
    assert parse_sync(w2) == v1
    assert w1 == w2


def test_trailing_newline_always() -> None:
    for v in ({}, {"a": 1}, [1, 2], {"x": {"y": []}}):
        wire = encode_sync(v)
        assert wire.endswith("\n")
        assert not wire.endswith("\n\n")


def test_unicode_keys_and_values() -> None:
    value = {"你好": "世界", "emoji": "🚀", "mix": {"α": 1}}
    assert parse_sync(encode_sync(value)) == value


def test_number_edges() -> None:
    value = {"i": 0, "neg": -0.0, "f": 0.1, "tiny": 1e-6, "big": 1e20}
    wire = encode_sync(value)
    out = parse_sync(wire)
    assert out["i"] == 0
    assert out["f"] == 0.1
    assert out["tiny"] == 1e-6
    # ES Number: -0 becomes 0 on wire
    assert out["neg"] == 0 or out["neg"] == -0.0


def test_seeded_corpus_all_dot_policies() -> None:
    rng = random.Random(42)

    def gen(depth: int = 0):
        if depth > 2:
            return rng.choice([1, "s", True, None])
        kind = rng.randrange(3)
        if kind == 0:
            return {f"k{i}": gen(depth + 1) for i in range(rng.randint(0, 3))}
        if kind == 1:
            return [gen(depth + 1) for _ in range(rng.randint(0, 3))]
        return rng.choice([0, 1, -2, 0.5, "hi", True, False, None])

    for i in range(40):
        value = gen()
        if not isinstance(value, (dict, list)):
            value = {"v": value}
        for policy in (
            DOT_POLICY["PER_TOP_LEVEL_KEY"],
            DOT_POLICY["NONE"],
            DOT_POLICY["PER_N_KEYS"],
        ):
            kwargs = {"dot_policy": policy}
            if policy == DOT_POLICY["PER_N_KEYS"]:
                kwargs["phase_every"] = 2
            wire = encode_sync(value, **kwargs)
            assert parse_sync(wire) == value, f"seed case {i} policy={policy}"


def test_char_chunked_encoded_wire() -> None:
    value = {"a": 1, "b": {"c": [1, 2]}, "d": "x"}
    wire = encode_sync(value)
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    for ch in wire:
        eng.push(ch)
    eng.finish()
    assert eng.snapshot == value


def test_key_order_sorted_stable() -> None:
    value = {"z": 1, "a": 2, "m": 3}
    w1 = encode_sync(value, key_order="sorted")
    w2 = encode_sync(value, key_order="sorted")
    assert w1 == w2
    # sorted keys: a before m before z
    assert w1.index("a:") < w1.index("m:") < w1.index("z:")


def test_deep_empty_containers() -> None:
    value = {"o": {}, "a": [], "n": {"x": {}, "y": []}}
    assert parse_sync(encode_sync(value)) == value


def test_long_string() -> None:
    value = {"s": "x" * 5000}
    assert parse_sync(encode_sync(value)) == value


def test_reject_operator_head_keys() -> None:
    # Line-operator introducers refused as object keys
    for bad in ("#a", "=a", "@a", "!a", "&a"):
        with pytest.raises(XaiopEncodeError):
            encode_sync({bad: 1})
    with pytest.raises(XaiopEncodeError):
        encode_sync({"name-": 1})
