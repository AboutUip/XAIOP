import pytest

from xaiop import XaiopFragment, XaiopSyntaxError, parse_sync


def wire(*lines: str) -> str:
    return "\n".join(lines)


def test_hash_comment_ignored() -> None:
    assert parse_sync(wire(">", "# comment", "x:1")) == {"x": 1}


def test_dot_resets_cursor() -> None:
    doc = parse_sync(wire(">", ">a", "x:1", ".", ">b", "y:2"))
    assert doc == {"a": {"x": 1}, "b": {"y": 2}}


def test_locate_fuzzy() -> None:
    doc = parse_sync(
        wire(">", ">wrap", ">a", ">b", "x:1", ".", "=a>b", "z:3")
    )
    assert doc == {"wrap": {"a": {"b": {"x": 1, "z": 3}}}}


def test_locate_not_found() -> None:
    with pytest.raises(XaiopSyntaxError, match="=path not found"):
        parse_sync(wire(">", ">a", "x:1", ".", "=missing"))


def test_exact_enter_creates_path() -> None:
    doc = parse_sync(wire("@a>b", "z:1"))
    assert doc == {"a": {"b": {"z": 1}}}


def test_exact_enter_no_fuzzy() -> None:
    doc = parse_sync(
        wire(">", ">wrap", ">a", ">b", "x:1", ".", "@a>b", "z:1")
    )
    assert doc == {
        "wrap": {"a": {"b": {"x": 1}}},
        "a": {"b": {"z": 1}},
    }


def test_broadcast_multi_match() -> None:
    doc = parse_sync(
        wire(
            ">",
            ">left",
            ">test",
            "x:1",
            ".",
            ">right",
            ">test",
            "y:2",
            ".",
            "!test",
            "z:9",
        )
    )
    assert doc == {
        "left": {"test": {"x": 1, "z": 9}},
        "right": {"test": {"y": 2, "z": 9}},
    }


def test_broadcast_requires_dot_before_at() -> None:
    with pytest.raises(XaiopSyntaxError, match="broadcast mode"):
        parse_sync(
            wire(">", ">a", "x:1", ".", ">b", ">a", "y:2", ".", "!a", "@a", "z:1")
        )


def test_delete_absolute() -> None:
    doc = parse_sync(wire(">", ">a", "x:1", ".", ">b", "y:2", "&a", "z:3"))
    assert doc == {"b": {"y": 2, "z": 3}}


def test_delete_cursor_chain_forbidden() -> None:
    with pytest.raises(XaiopSyntaxError, match="Cursor chain"):
        parse_sync(wire(">", ">a", "x:1", "&a"))


def test_delete_fragment_root_rejected() -> None:
    with pytest.raises(XaiopSyntaxError, match="object document root"):
        parse_sync(wire(">a", "x:1", "&a"))


def test_fragment_at_and_bang() -> None:
    at = parse_sync(wire(">a", ">b", "x:1", ".", "@a>b", "z:2"))
    assert isinstance(at, XaiopFragment)
    assert at.entries == {"a": {"b": {"x": 1, "z": 2}}}

    bang = parse_sync(
        wire(">left", ">t", "x:1", ".", ">right", ">t", "y:2", ".", "!t", "z:3")
    )
    assert isinstance(bang, XaiopFragment)
    assert bang.entries == {
        "left": {"t": {"x": 1, "z": 3}},
        "right": {"t": {"y": 2, "z": 3}},
    }
