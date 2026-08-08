"""Line intercept edges — partial lines, chain order, streamProcessing off, classify matrix."""

from __future__ import annotations

from xaiop import (
    LINE_KIND,
    DotCheckpointEngine,
    classify_line,
    run_line_intercept_chain,
)


def test_classify_line_kinds() -> None:
    assert classify_line(".").kind == LINE_KIND["PHASE"]
    assert classify_line("#note").kind == LINE_KIND["ANNOTATION"]
    assert classify_line("=a>b").kind == LINE_KIND["LOCATE"]
    assert classify_line("key:value").kind == LINE_KIND["CONTENT"]
    assert classify_line("&a>b").kind == LINE_KIND["DELETE"]
    assert classify_line("&a>b").path == "a>b"


def test_classify_line_matrix() -> None:
    v = classify_line("k:null")
    assert v.kind == LINE_KIND["CONTENT"]
    assert v.value_text == "null"
    assert classify_line("@orders").kind == LINE_KIND["EXACT"]
    assert classify_line("!test").kind == LINE_KIND["BROADCAST"]
    assert classify_line(">name-").kind == LINE_KIND["ARRAY_NAMED"]
    assert classify_line(">obj").kind == LINE_KIND["OBJECT_NAMED"]
    assert classify_line("-").kind == LINE_KIND["ARRAY_ANON"]
    assert classify_line("<").kind == LINE_KIND["POP"]


def test_intercept_chain_skip_and_rewrite() -> None:
    def skip_hash(ctx):
        if ctx["view"].kind == LINE_KIND["ANNOTATION"]:
            return None
        return ctx["raw"]

    def rewrite(ctx):
        if ctx["raw"] == "a:1":
            return "a:9"
        return ctx["raw"]

    assert run_line_intercept_chain("#x", [skip_hash]) is None
    assert run_line_intercept_chain("a:1", [rewrite]) == "a:9"
    assert run_line_intercept_chain("b:2", [rewrite]) == "b:2"


def test_intercept_chain_order() -> None:
    def a1_to_2(ctx):
        return "a:2" if ctx["raw"] == "a:1" else ctx["raw"]

    def a2_to_3(ctx):
        return "a:3" if ctx["raw"] == "a:2" else ctx["raw"]

    assert run_line_intercept_chain("a:1", [a1_to_2, a2_to_3]) == "a:3"


def test_engine_line_intercept_rewrite() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_line_intercept(
        lambda ctx: "a:9" if ctx["raw"] == "a:1" else ctx["raw"]
    )
    eng.push(">\na:1\n.\n")
    eng.finish()
    assert eng.snapshot == {"a": 9}


def test_engine_line_intercept_skip_is_not_content_null() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_line_intercept(
        lambda ctx: None if ctx["raw"] == "drop:1" else ctx["raw"]
    )
    eng.push(">\na:1\ndrop:1\nb:2\n.\n")
    eng.finish()
    assert eng.snapshot == {"a": 1, "b": 2}
    assert "drop" not in eng.snapshot


def test_partial_line_waits_for_newline() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    seen: list[str] = []

    def track(ctx):
        seen.append(ctx["raw"])
        return ctx["raw"]

    eng.on_line_intercept(track)
    eng.push(">\na:")
    assert "a:1" not in seen
    eng.push("1\n.\n")
    eng.finish()
    assert "a:1" in seen
    assert eng.snapshot == {"a": 1}


def test_stream_processing_false_skips_intercept() -> None:
    calls = [0]
    eng = DotCheckpointEngine(
        {
            "mergeChunkWindow": False,
            "streamProcessing": False,
            "onChunk": lambda *_a, **_k: None,
        }
    )
    eng.on_line_intercept(
        lambda ctx: (
            calls.__setitem__(0, calls[0] + 1),
            "a:9" if ctx["raw"] == "a:1" else ctx["raw"],
        )[1]
    )
    eng.push(">\na:1\n.\n")
    eng.finish()
    assert calls[0] == 0
    assert eng.snapshot == {"a": 1}


def test_registration_order_chain_on_engine() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_line_intercept(lambda ctx: "a:2" if ctx["raw"] == "a:1" else ctx["raw"])
    eng.on_line_intercept(lambda ctx: "a:3" if ctx["raw"] == "a:2" else ctx["raw"])
    eng.push(">\na:1\n.\n")
    eng.finish()
    assert eng.snapshot == {"a": 3}


def test_clear_line_intercepts() -> None:
    eng = DotCheckpointEngine(
        {"mergeChunkWindow": False, "onChunk": lambda *_a, **_k: None}
    )
    eng.on_line_intercept(lambda ctx: "a:9" if ctx["raw"] == "a:1" else ctx["raw"])
    if hasattr(eng, "clear_line_intercepts"):
        eng.clear_line_intercepts()
        eng.push(">\na:1\n.\n")
        eng.finish()
        assert eng.snapshot == {"a": 1}
    else:
        eng.push(">\na:1\n.\n")
        eng.finish()
        assert eng.snapshot == {"a": 9}
