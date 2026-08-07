import pytest

from xaiop import (
    LABEL_ESCAPE_INTRODUCER,
    LiveParser,
    XaiopEncodeError,
    decode_wire_label,
    encode_sync,
    encode_wire_label,
    key_needs_symbol_escape,
    parse_sync,
)

ESC = LABEL_ESCAPE_INTRODUCER
OPT = {"dot_policy": "none", "symbol_keys": True}
PARSE = {"symbol_keys": True}


def round_trip(value, enc=None):
    enc = enc or OPT
    return parse_sync(encode_sync(value, **enc), PARSE)


def test_label_escape_helpers() -> None:
    assert key_needs_symbol_escape("#k") is True
    assert key_needs_symbol_escape("@k") is True
    assert key_needs_symbol_escape(">t") is True
    assert key_needs_symbol_escape(".k") is False
    assert key_needs_symbol_escape("normal") is False

    assert encode_wire_label("#k", False) == "#k"
    assert encode_wire_label("#k", True) == f"{ESC}#k"
    assert encode_wire_label(f"{ESC}h", True) == f"{ESC}{ESC}h"

    assert decode_wire_label(f"{ESC}#k", True) == "#k"
    assert decode_wire_label(f"{ESC}{ESC}h", True) == f"{ESC}h"
    assert decode_wire_label(f"{ESC}#k", False) == f"{ESC}#k"


def test_symbol_keys_off_rejects_operator_heads() -> None:
    for key in ["#k", "@k", ">test", "<x", "=y", "!z", "&a", f"{ESC}h"]:
        with pytest.raises(XaiopEncodeError):
            encode_sync({key: 1}, dot_policy="none")


def test_symbol_keys_on_roundtrip() -> None:
    cases = {
        "#k": 1,
        "@m": 2,
        ">test": "test",
        "<pop": True,
        "=eq": None,
        "!bang": 0,
        "&amp": "x",
        f"{ESC}hello": 3,
    }
    for key, val in cases.items():
        assert round_trip({key: val}) == {key: val}


def test_symbol_keys_wire_no_bare_hash_content() -> None:
    wire = encode_sync({"#k": 1, "a": 2}, **OPT)
    for line in wire.split("\n"):
        if line and line.startswith("#"):
            pytest.fail(f"bare annotation-looking Content: {line!r}")
    assert f"{ESC}#k:1" in wire
    assert parse_sync(wire, PARSE) == {"#k": 1, "a": 2}


def test_symbol_keys_nested() -> None:
    value = {"#root": {"@child": {"x": 1}, "ok": 2}}
    wire = encode_sync(value, **OPT)
    assert f">{ESC}#root" in wire
    assert round_trip(value) == value


def test_symbol_keys_off_encode_on_parse() -> None:
    wire = encode_sync({"#k": 1}, **OPT)
    assert parse_sync(wire) == {f"{ESC}#k": 1}


def test_true_hash_annotation_coexists() -> None:
    wire = f">\n# human note\n{ESC}#k:1\na:2\n"
    assert parse_sync(wire, PARSE) == {"#k": 1, "a": 2}


def test_live_parser_symbol_keys() -> None:
    live = LiveParser(PARSE)
    live.feed_text(encode_sync({"#k": 1, "@m": 2}, **OPT))
    assert live.value() == {"#k": 1, "@m": 2}


def test_double_escape_single_decode_layer() -> None:
    key = f"{ESC}#k"
    wire = encode_sync({key: 1}, **OPT)
    assert f"{ESC}{ESC}#k:1" in wire
    assert parse_sync(wire, PARSE) == {key: 1}
