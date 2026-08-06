from pathlib import Path

from xaiop import LiveParser, materialize, parse_sync

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "conformance"
    / "core-wire"
    / "complex.xaiop"
)


def test_live_matches_parse_sync_on_complex() -> None:
    source = FIXTURE.read_text(encoding="utf-8")
    expected = materialize(parse_sync(source))
    live = LiveParser()
    live.feed_text(source)
    assert materialize(live.value()) == expected


def test_feed_line_matches_feed_text() -> None:
    source = ">\n>a\nx:1\n.\n>b\ny:2\n"
    via_text = materialize(LiveParser().feed_text(source).value())
    live = LiveParser()
    for line in source.replace("\n", "\n").strip().split("\n"):
        live.feed_line(line)
    assert materialize(live.value()) == via_text


def test_cursor_restore_lines() -> None:
    live = LiveParser()
    live.feed_text(">\n>a\nx:1\n.\n>b\ny:1\n")
    assert live.cursor_restore_lines() == [">b"]


def test_live_ops_corpus() -> None:
    samples = [
        ">\n>left\n>test\nx:1\n.\n>right\n>test\ny:2\n.\n!test\nz:9\n.",
        ">\n>wrap\n>a\n>b\nx:1\n.\n=a>b\nz:3\n.",
        ">\n>a\n.\n@b>c\nn:1\n.",
    ]
    for s in samples:
        assert materialize(LiveParser().feed_text(s).value()) == materialize(
            parse_sync(s)
        )
