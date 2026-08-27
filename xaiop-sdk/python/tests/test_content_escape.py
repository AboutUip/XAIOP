import pytest

from xaiop import (
    DOT_POLICY,
    LiveParser,
    XaiopEncodeError,
    XaiopSyntaxError,
    encode_sync,
    merge_to_json,
    parse_sync,
)


def round_trip(value):
    return parse_sync(encode_sync(value, dot_policy=DOT_POLICY["NONE"]))


def test_round_trip_lf_cr_crlf_backslash() -> None:
    assert round_trip({"t": "hello\nworld"}) == {"t": "hello\nworld"}
    assert round_trip({"t": "a\rb"}) == {"t": "a\rb"}
    assert round_trip({"t": "a\r\nb"}) == {"t": "a\r\nb"}
    assert round_trip({"t": "a\\b"}) == {"t": "a\\b"}
    assert round_trip({"t": "a\\nb"}) == {"t": "a\\nb"}


def test_literal_backslash_n_is_not_a_newline() -> None:
    two_char = "a" + "\\" + "n" + "b"
    got = round_trip({"t": two_char})
    assert got["t"] == two_char
    assert got["t"] != "a\nb"


def test_real_newline_and_two_char_escape_are_distinct_on_the_wire() -> None:
    nl = encode_sync({"t": "a\nb"}, dot_policy=DOT_POLICY["NONE"])
    lit = encode_sync({"t": "a\\nb"}, dot_policy=DOT_POLICY["NONE"])
    assert "t:a\\nb" in nl
    assert "t:a\\\\nb" in lit
    assert nl != lit


def test_empty_only_newline_consecutive_and_unicode() -> None:
    assert round_trip({"t": ""}) == {"t": ""}
    assert round_trip({"t": "\n"}) == {"t": "\n"}
    assert round_trip({"t": "\n\n"}) == {"t": "\n\n"}
    assert round_trip({"t": "你好\n世界"}) == {"t": "你好\n世界"}


def test_array_scalar_and_colon_in_value() -> None:
    assert round_trip(["line1\nline2"]) == ["line1\nline2"]
    assert round_trip({"t": "a:b\nc"}) == {"t": "a:b\nc"}


def test_typing_after_unescape() -> None:
    assert parse_sync(">\nn:1\n") == {"n": 1}
    assert parse_sync(">\nf:true\n") == {"f": True}
    assert parse_sync(">\nz:null\n") == {"z": None}
    s = parse_sync(">\ns:1\\n2\n")["s"]
    assert isinstance(s, str)
    assert s == "1\n2"


def test_forced_string_then_unescape() -> None:
    assert parse_sync(">\ns: hello\\nworld\n")["s"] == "hello\nworld"
    assert parse_sync(">\ns: true\\n\n")["s"] == "true\n"
    assert parse_sync(">\ns:true\n")["s"] is True


def test_tab_literal_leading_space_still_rejected() -> None:
    assert round_trip({"t": "a\tb"}) == {"t": "a\tb"}
    with pytest.raises(XaiopEncodeError, match="SPACE|U\\+0020"):
        encode_sync({"t": " spaced"}, dot_policy=DOT_POLICY["NONE"])


def test_unknown_escape_and_trailing_backslash() -> None:
    for wire in (">\na:x\\ty\n", ">\na:x\\xy\n", ">\na:x\\Ny\n", ">\na:x\\0y\n"):
        with pytest.raises(XaiopSyntaxError, match="unknown Content escape"):
            parse_sync(wire)
    with pytest.raises(XaiopSyntaxError, match="incomplete Content escape"):
        parse_sync(">\na:end\\\n")


def test_physical_lf_still_starts_a_new_line() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(">\na:hello\nworld\n")


def test_complete_trailing_backslash_and_doubled() -> None:
    assert parse_sync(">\na:end\\\\\n")["a"] == "end\\"
    assert round_trip({"t": "\\"}) == {"t": "\\"}
    assert round_trip({"t": "\\\\"}) == {"t": "\\\\"}


def test_escapes_at_edges_and_mixed() -> None:
    assert round_trip({"t": "\nstart"}) == {"t": "\nstart"}
    assert round_trip({"t": "end\n"}) == {"t": "end\n"}
    assert round_trip({"t": "a\\\nb"}) == {"t": "a\\\nb"}


def test_encode_keeps_lf_inside_the_content_token() -> None:
    wire = encode_sync({"t": "a\nb"}, dot_policy=DOT_POLICY["NONE"])
    content = next(line for line in wire.splitlines() if line.startswith("t:"))
    assert content == "t:a\\nb"


def test_live_parser_concat() -> None:
    assert parse_sync(">\na:\\nhey\n")["a"] == "\nhey"
    live = LiveParser()
    live.feed_text(encode_sync({"t": "p1\np2"}, dot_policy=DOT_POLICY["NONE"]))
    assert live.value()["t"] == "p1\np2"


def test_feed_line_escaped_content() -> None:
    live = LiveParser()
    live.feed_line(">")
    live.feed_line("t:a\\nb")
    assert live.value()["t"] == "a\nb"


def test_emoji_consecutive_and_unknown_quote() -> None:
    assert round_trip({"t": "🙂\n🎉"}) == {"t": "🙂\n🎉"}
    assert parse_sync(">\ns:a\\n\\nb\n")["s"] == "a\n\nb"
    with pytest.raises(XaiopSyntaxError):
        parse_sync(">\na:x\\\"y\n")


def test_merge_overlay_unescapes_content() -> None:
    assert merge_to_json({"a": 1}, ">\ns:hello\\nworld\n") == {
        "a": 1,
        "s": "hello\nworld",
    }
