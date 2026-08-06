import pytest

from xaiop import XaiopEncodeError, encode_sync, parse_sync


def test_roundtrip_simple_object() -> None:
    value = {"a": 1, "b": "x", "c": True, "d": None}
    wire = encode_sync(value)
    assert parse_sync(wire) == value


def test_roundtrip_nested() -> None:
    value = {
        "meta": {"name": "test", "count": 2},
        "items": [1, {"k": "v"}, ["a", "b"]],
    }
    assert parse_sync(encode_sync(value)) == value


def test_forced_string_encoding() -> None:
    value = {"a": "5", "b": "true", "c": "null"}
    wire = encode_sync(value)
    assert "a: 5" in wire
    assert parse_sync(wire) == value


def test_array_root() -> None:
    value = [1, "x", {"a": 1}]
    wire = encode_sync(value, root="array")
    assert wire.startswith("-\n")
    assert parse_sync(wire) == value


def test_fragment_root() -> None:
    value = {"a": 1, "b": {"x": 2}}
    wire = encode_sync(value, root="fragment")
    assert not wire.startswith(">")
    parsed = parse_sync(wire)
    assert parsed.is_fragment  # type: ignore[attr-defined]
    assert parsed.entries == value  # type: ignore[attr-defined]


def test_non_finite_rejected() -> None:
    with pytest.raises(XaiopEncodeError):
        encode_sync({"a": float("nan")})


def test_leading_space_string_rejected() -> None:
    with pytest.raises(XaiopEncodeError, match="U\\+0020 SPACE"):
        encode_sync({"s": " spaced"})


def test_invalid_key_rejected() -> None:
    with pytest.raises(XaiopEncodeError, match="invalid label"):
        encode_sync({"a b": 1})
