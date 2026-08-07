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
