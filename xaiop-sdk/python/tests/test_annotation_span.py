"""Annotation span stop rules, KEEP, remount, escapes, streamProcessing (Node annotation.span)."""

from __future__ import annotations

import pytest

from xaiop import (
    AnnotationSpan,
    DotCheckpointEngine,
    apply_annotation_spans,
    encode_as_sibling_lines,
    path_escapes_type_check,
    parse_sync,
)


def test_path_escapes_type_check() -> None:
    assert path_escapes_type_check("flex.x", ["flex"]) is True
    assert path_escapes_type_check("other", ["flex"]) is False
    assert path_escapes_type_check("anything", [""]) is True
    assert path_escapes_type_check("a.b", ["a.b.c"]) is False


def test_encode_as_sibling_lines_object() -> None:
    lines = encode_as_sibling_lines({"a": 1, "b": {"c": 2}})
    assert ">" not in lines
    assert any(l.startswith("a:") for l in lines)


def test_identity_no_handlers() -> None:
    lines = [">", "a:1", "#x", "b:2", "."]
    out = apply_annotation_spans(lines, [])
    assert out["lines"] == lines
    assert out["escape_paths"] == []


def test_empty_capture_keep() -> None:
    seen: list = []

    def keep(ann, view):
        seen.append((ann, view.get("json") if isinstance(view, dict) else getattr(view, "json", view)))
        return AnnotationSpan.KEEP

    out = apply_annotation_spans([">", "a:1", "# lone", "."], [keep])
    assert any("#" in l for l in out["lines"])
    assert seen
    assert seen[0][0].strip() == "lone" or "lone" in seen[0][0]


def test_remount_json_text() -> None:
    out = apply_annotation_spans([">", "# t", "a:1", "."], [lambda _a, _v: '{"z":9}'])
    assert not any(l.startswith("#") for l in out["lines"])
    assert any(l.startswith("z:") for l in out["lines"])


def test_remount_invalid_type() -> None:
    with pytest.raises((TypeError, ValueError)):
        apply_annotation_spans([">", "# t", "a:1", "."], [lambda _a, _v: 42])


def test_apply_annotation_spans_keep_sentinel() -> None:
    lines = [">", "a:1", "#x", "b:2", "."]
    out = apply_annotation_spans(lines, [])
    assert out["lines"] == lines

    def keep_handler(_ann, _view):
        return AnnotationSpan.KEEP

    out2 = apply_annotation_spans(lines, [keep_handler])
    assert out2["lines"] == lines
    assert "a" in out2["escape_paths"] or "b" in out2["escape_paths"]


def test_keep_escapes_capture_keys_not_before() -> None:
    def keep(_a, _v):
        return AnnotationSpan.KEEP

    out = apply_annotation_spans(
        [">", "a:1", "# x", "b:2", ">c", "z:1", "<", "."], [keep]
    )
    assert any(l.startswith("#") for l in out["lines"])
    assert "b" in out["escape_paths"]
    assert "c" in out["escape_paths"] or any(p.startswith("c") for p in out["escape_paths"])
    assert "a" not in out["escape_paths"]


def test_apply_annotation_spans_remount() -> None:
    def remount(_ann, _view):
        return {"z": 9}

    out = apply_annotation_spans([">", "a:1", "#tag", "b:2", "."], [remount])
    assert "#tag" not in out["lines"]
    assert any(l.startswith("z:") for l in out["lines"])


def test_handler_chain_first_wins() -> None:
    calls: list[str] = []

    def first(_ann, _view):
        calls.append("first")
        return {"a": 1}

    def second(_ann, _view):
        calls.append("second")
        return {"a": 2}

    out = apply_annotation_spans([">", "#x", "."], [first, second])
    assert calls == ["first"]
    assert any(l.startswith("a:") for l in out["lines"])


def test_chain_keep_then_remount() -> None:
    order: list[int] = []

    def keep(_a, _v):
        order.append(1)
        return AnnotationSpan.KEEP

    def remount(_a, _v):
        order.append(2)
        return {"a": 2}

    def third(_a, _v):
        order.append(3)
        return {"a": 3}

    out = apply_annotation_spans([">", "#x", "a:1", "."], [keep, remount, third])
    assert order == [1, 2]
    assert any(l.startswith("a:2") or l == "a:2" for l in out["lines"])


def test_null_short_circuit() -> None:
    def drop(_ann, _view):
        return None

    out = apply_annotation_spans([">", "a:1", "#gone", "b:2", "."], [drop])
    assert "#gone" not in out["lines"]
    assert out["lines"][0] == ">"


def test_null_preserves_keys_before_hash() -> None:
    out = apply_annotation_spans(
        [">", "keep:1", "#d", "gone:2", ">n", "x:1", "<", "."],
        [lambda _a, _v: None],
    )
    assert any(l.startswith("keep:") for l in out["lines"])
    assert not any(l.startswith("gone:") for l in out["lines"])
    assert out["escape_paths"] == []


def test_stop_at_at_bang_locate() -> None:
    anns: list[str] = []

    def remount(ann, _v):
        anns.append(ann.strip() if isinstance(ann, str) else str(ann))
        return {"ok": True}

    out = apply_annotation_spans(
        [">", "#one", "b:1", "@c", "c:2", "#two", "d:3", "."], [remount]
    )
    assert "one" in anns[0] or anns[0] == "one"
    assert len(anns) >= 2
    assert any(l.startswith("@") for l in out["lines"])


def test_stop_at_same_level_leave() -> None:
    views: list = []

    def keep(_a, view):
        j = view["json"] if isinstance(view, dict) else getattr(view, "json", None)
        views.append(j)
        return AnnotationSpan.KEEP

    apply_annotation_spans([">", ">box", "#in", "x:1", "<", "after:2", "."], [keep])
    assert views
    assert views[0] == {"x": 1} or (isinstance(views[0], dict) and views[0].get("x") == 1)


def test_first_hash_swallows_later_hash() -> None:
    anns: list[str] = []

    def keep(ann, view):
        anns.append(ann.strip() if isinstance(ann, str) else str(ann))
        j = view["json"] if isinstance(view, dict) else getattr(view, "json", {})
        assert "a" in j or "b" in j or j == {}
        return AnnotationSpan.KEEP

    apply_annotation_spans([">", "#first", "a:1", "#second", "b:2", "."], [keep])
    assert len(anns) == 1
    assert "first" in anns[0]


def test_amp_not_a_stop() -> None:
    views: list = []

    def keep(_a, view):
        j = view["json"] if isinstance(view, dict) else getattr(view, "json", {})
        views.append(j)
        return AnnotationSpan.KEEP

    out = apply_annotation_spans([">", "a:1", "#m", "b:2", "&c", "."], [keep])
    assert views and isinstance(views[0], dict) and views[0].get("b") == 2
    assert any(l.startswith("&") for l in out["lines"])


def test_drop_relocates_trailing_locate() -> None:
    out = apply_annotation_spans(
        [">", "#drop", "x:1", "=z", "z:9", "."], [lambda _a, _v: None]
    )
    assert not any(l.startswith("x:") for l in out["lines"])
    assert any("z" in l for l in out["lines"])


def test_nested_escape_prefix() -> None:
    out = apply_annotation_spans(
        [">", ">p", "#t", "k:1", "<", "."], [lambda _a, _v: {"k": "str"}]
    )
    assert any(p == "p.k" or p.startswith("p") for p in out["escape_paths"])


def test_array_remount() -> None:
    out = apply_annotation_spans(["-", "#t", ":1", ":2", "."], [lambda _a, _v: ["a", "b"]])
    assert out["escape_paths"] == [""] or any(
        p == "" or p.isdigit() for p in out["escape_paths"]
    )


def test_engine_span_remount() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_annotation_span(lambda _a, _v: {"fromSpan": True})
    eng.push(">\n#meta\nx:1\n.\n")
    eng.finish()
    assert eng.snapshot is not None
    assert eng.snapshot.get("fromSpan") is True or "fromSpan" in (eng.snapshot or {})


def test_engine_remount_before_diff() -> None:
    chunks: list = []
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda d, _m=None: chunks.append(d)}
    )
    eng.on_annotation_span(lambda _a, _v: {"rewritten": True})
    eng.push(">\nkeep:1\n# meta\ndrop:9\n.\n")
    eng.finish()
    assert chunks
    assert chunks[0] == {"keep": 1, "rewritten": True} or (
        isinstance(chunks[0], dict)
        and chunks[0].get("rewritten") is True
        and chunks[0].get("keep") == 1
    )
    assert "drop" not in (chunks[0] or {})


def test_engine_keep_escape_meta() -> None:
    metas: list = []
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "onChunk": lambda _d, m=None: metas.append(m),
        }
    )
    eng.on_annotation_span(lambda _a, _v: AnnotationSpan.KEEP)
    eng.push(">\n# s\nflex:1\n.\n")
    eng.finish()
    escapes = []
    for m in metas:
        if isinstance(m, dict) and m.get("typeCheckEscapePaths"):
            escapes.extend(m["typeCheckEscapePaths"])
    assert "flex" in escapes or eng.snapshot == {"flex": 1}


def test_engine_null_drop_no_escape() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_annotation_span(lambda _a, _v: None)
    eng.push(">\nkeep:1\n# s\nflex:1\n.\n")
    eng.finish()
    assert eng.snapshot == {"keep": 1}
    assert "flex" not in (eng.snapshot or {})


def test_stream_processing_false_skips_span() -> None:
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "streamProcessing": False,
            "onChunk": lambda *_a, **_k: None,
        }
    )
    eng.on_annotation_span(lambda _a, _v: {"a": 5})
    eng.push(">\n# x\na:1\n")
    eng.finish()
    # Without stream processing, spans do not rewrite — final equals parse of raw
    assert eng.snapshot == parse_sync(">\n# x\na:1\n") or eng.snapshot.get("a") == 1


def test_emit_diff_false_still_commits_remount() -> None:
    eng = DotCheckpointEngine({"emitDiff": False, "mergeChunkWindow": False})
    eng.on_annotation_span(lambda _a, _v: {"a": 7})
    eng.push(">\n# x\na:1\n.\n")
    eng.finish()
    assert eng.committed_snapshot.get("a") == 7


def test_fragmented_annotation_lines() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_annotation_span(lambda _a, _v: {"a": 7})
    eng.push(">\n#")
    eng.push(" tag\n")
    eng.push("a:1\n.\n")
    eng.finish()
    assert eng.snapshot == {"a": 7}


def test_multi_phase_remounts() -> None:
    chunks: list = []
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda d, _m=None: chunks.append(d)}
    )

    def remount(ann, _v):
        a = ann.strip() if isinstance(ann, str) else str(ann)
        if "p1" in a:
            return {"x": 1}
        return {"y": 2}

    eng.on_annotation_span(remount)
    eng.push(">\n# p1\nx:0\n.\n>\n# p2\ny:0\n.\n")
    eng.finish()
    assert {"x": 1} in chunks
    assert {"y": 2} in chunks


def test_line_intercept_skips_hash_before_span() -> None:
    span_calls = [0]
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_line_intercept(
        lambda ctx: None if ctx["raw"].startswith("#") else ctx["raw"]
    )
    eng.on_annotation_span(lambda _a, _v: (span_calls.__setitem__(0, span_calls[0] + 1), {"z": 1})[1])
    eng.push(">\n#meta\nx:1\n.\n")
    eng.finish()
    assert span_calls[0] == 0
    assert eng.snapshot == {"x": 1}


def test_content_hash_value_not_annotation() -> None:
    calls = [0]
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_annotation_span(lambda _a, _v: (calls.__setitem__(0, 1), None)[1])
    eng.push(">\ncmd:#run-now\n.\n")
    eng.finish()
    assert calls[0] == 0
    assert eng.snapshot == {"cmd": "#run-now"}


def test_mini_protocol_set_wipe() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )

    def handler(ann, _v):
        text = ann.strip() if isinstance(ann, str) else str(ann)
        if text.startswith("xaiop/v1 set "):
            import json

            return json.loads(text[len("xaiop/v1 set ") :])
        return AnnotationSpan.KEEP

    eng.on_annotation_span(handler)
    eng.push('>\n#xaiop/v1 set {"secret":99}\nvisible:1\n.\n')
    eng.finish()
    assert eng.snapshot == {"secret": 99}


def test_mini_protocol_drop() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )

    def handler(ann, _v):
        text = ann.strip() if isinstance(ann, str) else str(ann)
        if text == "xaiop/v1 drop":
            return None
        return AnnotationSpan.KEEP

    eng.on_annotation_span(handler)
    eng.push(">\nkeep:1\n#xaiop/v1 drop\nwiped:2\nalso:3\n.\n")
    eng.finish()
    assert eng.snapshot == {"keep": 1}
