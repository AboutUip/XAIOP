import pytest

from xaiop import XaiopSyntaxError, parse_sync


def test_bool_null_typing() -> None:
    assert parse_sync(">\nt:true\nf:false\nn:null\n") == {
        "t": True,
        "f": False,
        "n": None,
    }


def test_int_and_float() -> None:
    doc = parse_sync(">\ni:42\nf:1.5\ne:1e3\n")
    assert doc == {"i": 42, "f": 1.5, "e": 1000.0}
    assert isinstance(doc["i"], int)  # type: ignore[index]
    assert isinstance(doc["f"], float)  # type: ignore[index]


def test_forced_string_leading_space() -> None:
    assert parse_sync(">\ncount: 2\nscore: 10\n") == {"count": "2", "score": "10"}


def test_plain_string() -> None:
    assert parse_sync(">\nname:alice\n") == {"name": "alice"}


def test_empty_line_is_error() -> None:
    with pytest.raises(XaiopSyntaxError, match="empty line"):
        parse_sync(">\n\nx:1\n")


def test_bare_label_errors() -> None:
    with pytest.raises(XaiopSyntaxError, match="Bare Label"):
        parse_sync(">\nnotcontent\n")


def test_array_scalar_content() -> None:
    assert parse_sync("-\n:hello\n:42\n") == ["hello", 42]


def test_array_object_element() -> None:
    assert parse_sync("-\nkey:val\n") == [{"key": "val"}]
