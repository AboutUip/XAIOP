import pytest

from xaiop import XaiopFragment, XaiopSyntaxError, materialize, parse_sync


def test_empty_source_is_empty_object() -> None:
    assert parse_sync("") == {}


def test_fragment_root_content_without_opener() -> None:
    frag = parse_sync("a:1\nb:2")
    assert isinstance(frag, XaiopFragment)
    assert frag.is_fragment is True
    assert frag.entries == {"a": 1, "b": 2}
    assert frag.notation() == '"a":1,"b":2'


def test_fragment_named_object() -> None:
    frag = parse_sync(">a\nx:1\n")
    assert isinstance(frag, XaiopFragment)
    assert frag.entries == {"a": {"x": 1}}


def test_complete_object_root() -> None:
    assert parse_sync(">\nx:1\n") == {"x": 1}


def test_complete_array_root() -> None:
    assert parse_sync("-\n:1\n:2\n") == [1, 2]


def test_bare_gt_after_fragment_errors() -> None:
    with pytest.raises(XaiopSyntaxError, match="bare > after fragment"):
        parse_sync("a:1\n>\n")


def test_materialize_fragment() -> None:
    frag = parse_sync("a:1\n")
    snap = materialize(frag)
    assert snap == {"a": 1}
    snap["a"] = 99
    assert frag.entries["a"] == 1


def test_materialize_object() -> None:
    doc = parse_sync(">\nx:1\n")
    snap = materialize(doc)
    assert snap == {"x": 1}
    snap["x"] = 99
    assert doc["x"] == 1  # type: ignore[index]
