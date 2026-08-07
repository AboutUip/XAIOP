import pytest

from xaiop import (
    MERGE_CONFLICT,
    XaiopEngine,
    XaiopSyntaxError,
    encode_sync,
    merge_json,
    merge_to_json,
    merge_to_xaiop,
    parse_sync,
)


def test_merge_json_non_conflicting_keys() -> None:
    assert merge_json({"a": 1}, {"b": 2}) == {"a": 1, "b": 2}


def test_merge_json_overwrite_vs_keep() -> None:
    assert merge_json({"a": 1, "b": 2}, {"a": 9}, "overwrite") == {"a": 9, "b": 2}
    assert merge_json({"a": 1, "b": 2}, {"a": 9}, "keep") == {"a": 1, "b": 2}


def test_merge_json_deep_recurse() -> None:
    base = {"meta": {"name": "x", "n": 1}, "tags": ["a"]}
    overlay = {"meta": {"n": 2, "extra": True}, "tags": ["b"]}
    assert merge_json(base, overlay, "overwrite") == {
        "meta": {"name": "x", "n": 2, "extra": True},
        "tags": ["b"],
    }
    assert merge_json(base, overlay, "keep") == {
        "meta": {"name": "x", "n": 1, "extra": True},
        "tags": ["a"],
    }


def test_merge_json_does_not_mutate_inputs() -> None:
    base = {"a": {"x": 1}}
    overlay = {"a": {"y": 2}}
    out = merge_json(base, overlay)
    assert out == {"a": {"x": 1, "y": 2}}
    assert base == {"a": {"x": 1}}
    assert overlay == {"a": {"y": 2}}


def test_merge_to_json() -> None:
    wire = encode_sync({"b": 2, "a": 9}, dot_policy="none")
    assert merge_to_json({"a": 1, "c": 3}, wire, {"conflict": "overwrite"}) == {
        "a": 9,
        "c": 3,
        "b": 2,
    }
    assert merge_to_json({"a": 1, "c": 3}, wire, {"conflict": "keep"}) == {
        "a": 1,
        "c": 3,
        "b": 2,
    }


def test_merge_to_xaiop_roundtrip() -> None:
    wire_in = ">\nb:2\n"
    out = merge_to_xaiop({"a": 1}, wire_in, {"conflict": "overwrite"})
    assert isinstance(out, str)
    assert parse_sync(out) == {"a": 1, "b": 2}


def test_engine_merge_to_json() -> None:
    base = {"a": 1}
    wire = encode_sync({"b": 2}, dot_policy="none")
    engine = XaiopEngine()
    assert merge_to_json(base, wire) == engine.merge_to_json_sync(base, wire)


def test_inject_xaiop_mutates_store() -> None:
    engine = XaiopEngine()
    data_id = engine.upload_json_sync({"a": 1, "nested": {"x": 1}}, {"dot_policy": "none"})
    wire = encode_sync({"nested": {"y": 2}, "b": 3}, dot_policy="none")
    result = engine.inject_xaiop_sync(data_id, wire, {"conflict": "overwrite"})
    assert result == {"a": 1, "nested": {"x": 1, "y": 2}, "b": 3}
    assert engine.get_sync(data_id) == result


def test_inject_json_keep_policy() -> None:
    engine = XaiopEngine()
    data_id = engine.upload_json_sync({"a": 1, "b": 2}, {"dot_policy": "none"})
    engine.inject_json_sync(data_id, {"a": 9, "c": 3}, {"conflict": "keep"})
    assert engine.get_sync(data_id) == {"a": 1, "b": 2, "c": 3}


def test_inject_unknown_data_id() -> None:
    engine = XaiopEngine()
    with pytest.raises(ValueError, match="unknown data id"):
        engine.inject_json_sync("missing", {"a": 1})
    with pytest.raises(ValueError, match="unknown data id"):
        engine.inject_xaiop_sync("missing", ">\na:1\n")


def test_invalid_conflict() -> None:
    with pytest.raises(TypeError):
        merge_json({"a": 1}, {"a": 2}, "nope")  # type: ignore[arg-type]


def test_merge_to_json_rejects_non_string() -> None:
    with pytest.raises(TypeError):
        merge_to_json({"a": 1}, {"not": "string"})  # type: ignore[arg-type]


def test_inject_fragment_materializes() -> None:
    engine = XaiopEngine()
    data_id = engine.upload_sync("a:1\n")
    out = engine.inject_json_sync(data_id, {"b": 2})
    assert out == {"a": 1, "b": 2}
