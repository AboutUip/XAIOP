"""`#` annotation ignore (Node hash.annotation.test.js)."""

from __future__ import annotations

import pytest

from xaiop import DotCheckpointEngine, parse_sync


def wire(*lines: str) -> str:
    return "\n".join(lines)


def test_hash_ignored_anywhere() -> None:
    assert parse_sync(wire(">", "# top", "x:1", "# mid", "y:2", "# end")) == {
        "x": 1,
        "y": 2,
    }


def test_cursor_stable_across_hash() -> None:
    assert parse_sync(wire(">", ">a", "# note", "x:1", "# more", "y:2")) == {
        "a": {"x": 1, "y": 2}
    }


def test_content_value_may_contain_hash() -> None:
    assert parse_sync(wire(">", "msg:hello # world")) == {"msg": "hello # world"}


def test_leading_whitespace_before_hash_is_syntax_error_or_content() -> None:
    # Leading U+0020 before # is NOT an annotation line (must start with #)
    with pytest.raises(Exception):
        parse_sync(wire(">", " # not-anno", "x:1"))


def test_phases_with_hash_between_dots() -> None:
    assert parse_sync(
        wire(">", "a:1", "# phase1", ".", "# between", ">", "b:2")
    ) == {"a": 1, "b": 2}


def test_fragment_plus_hash() -> None:
    from xaiop import XaiopFragment

    doc = parse_sync(wire(">a", "# c", "x:1"))
    assert isinstance(doc, XaiopFragment)
    assert doc.entries == {"a": {"x": 1}}


def test_span_mini_protocol_on_hash() -> None:
    captured: list = []

    def handler(ann_lines, view):
        captured.append(list(ann_lines) if not isinstance(ann_lines, str) else [ann_lines])
        return {"note": True}

    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "onChunk": lambda *_a, **_k: None,
        }
    )
    eng.on_annotation_span(handler)
    eng.push(">\nx:1\n# span-line\ny:2\n.\n")
    eng.finish()
    assert captured
    assert eng.snapshot is not None


def test_upload_ignores_hash_without_span() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.push(">\n# ignored\na:1\n.\n")
    eng.finish()
    assert eng.snapshot == {"a": 1}
