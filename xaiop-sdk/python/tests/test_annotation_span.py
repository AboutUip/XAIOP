from xaiop import (
    AnnotationSpan,
    apply_annotation_spans,
    encode_as_sibling_lines,
    path_escapes_type_check,
)


def test_path_escapes_type_check() -> None:
    assert path_escapes_type_check("flex.x", ["flex"]) is True
    assert path_escapes_type_check("other", ["flex"]) is False
    assert path_escapes_type_check("anything", [""]) is True


def test_encode_as_sibling_lines_object() -> None:
    lines = encode_as_sibling_lines({"a": 1, "b": {"c": 2}})
    assert ">" not in lines
    assert any(l.startswith("a:") for l in lines)


def test_apply_annotation_spans_keep_sentinel() -> None:
    lines = [">", "a:1", "#x", "b:2", "."]
    out = apply_annotation_spans(lines, [])
    assert out["lines"] == lines
    assert out["escape_paths"] == []

    def keep_handler(_ann, _view):
        return AnnotationSpan.KEEP

    out2 = apply_annotation_spans(lines, [keep_handler])
    assert out2["lines"] == lines
    assert "a" in out2["escape_paths"] or "b" in out2["escape_paths"]


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


def test_null_short_circuit() -> None:
    def drop(_ann, _view):
        return None

    out = apply_annotation_spans([">", "a:1", "#gone", "b:2", "."], [drop])
    assert "#gone" not in out["lines"]
    # Span consume may absorb following Content until stop — at least remount path runs
    assert out["lines"][0] == ">"


def test_engine_span_remount() -> None:
    from xaiop import DotCheckpointEngine

    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_annotation_span(lambda _a, _v: {"fromSpan": True})
    eng.push(">\n#meta\nx:1\n.\n")
    eng.finish()
    assert eng.snapshot is not None
