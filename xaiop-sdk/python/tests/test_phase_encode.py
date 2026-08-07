import pytest

from xaiop import XaiopEncodeError, encode_phase_json, encode_phase_object, parse_sync


def test_phase_json_non_final() -> None:
    wire = encode_phase_json("modA", {"x": 1})
    assert wire.endswith(".\n")
    assert parse_sync(wire) == {"modA": {"x": 1}}


def test_phase_json_final() -> None:
    wire = encode_phase_json("modA", {"x": 1}, final=True)
    assert not wire.rstrip().endswith(".")
    assert parse_sync(wire) == {"modA": {"x": 1}}


def test_phase_object() -> None:
    wire = encode_phase_object({"a": 1, "b": "2"})
    assert wire.endswith(".\n")
    assert parse_sync(wire) == {"a": 1, "b": "2"}


def test_phase_rejects() -> None:
    with pytest.raises(TypeError):
        encode_phase_json("", 1)
    with pytest.raises(TypeError):
        encode_phase_object(None)
    with pytest.raises(XaiopEncodeError):
        encode_phase_json("bad-", 1)
