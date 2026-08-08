#!/usr/bin/env python3
"""XAIOP Python demo — parse / encode / LiveParser / materialize (no network).

Usage:
  python demo.py
  python demo.py path/to/file.xaiop
  Get-Content file.xaiop | python demo.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
sys.path.insert(0, str(REPO / "xaiop-sdk" / "python" / "src"))

from xaiop import (  # noqa: E402
    PROTOCOL_VERSION,
    LiveParser,
    XaiopEngine,
    XaiopFragment,
    XaiopSyntaxError,
    encode_sync,
    materialize,
    parse_sync,
)


def render(json_value: object, *, title: str, data_id: str | None = None) -> None:
    bar = "─" * 48
    print()
    print(bar)
    print(f" {title}  (protocol {PROTOCOL_VERSION})")
    if data_id is not None:
        print(f" data id: {data_id}")
    print(bar)
    if isinstance(json_value, XaiopFragment):
        print(" (root fragment — no outer anonymous object)")
        print(f" notation: {json_value.notation()}")
        print(" entries:")
        print(json.dumps(json_value.entries, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(json_value, indent=2, ensure_ascii=False))
    print(bar)
    print()


def render_error(err: BaseException) -> None:
    bar = "─" * 48
    print(bar, file=sys.stderr)
    print(" Parse failed", file=sys.stderr)
    print(bar, file=sys.stderr)
    if isinstance(err, XaiopSyntaxError):
        loc = f" @ line {err.line}" if err.line is not None else ""
        print(f"XaiopSyntaxError{loc}", file=sys.stderr)
        print(err, file=sys.stderr)
    else:
        print(err, file=sys.stderr)
    print(bar, file=sys.stderr)
    print(file=sys.stderr)


def read_source() -> str:
    if len(sys.argv) > 1:
        path = Path(sys.argv[1]).resolve()
        print(f"# file: {path}")
        return path.read_text(encoding="utf-8-sig")
    if not sys.stdin.isatty():
        return sys.stdin.read().lstrip("\ufeff")
    sample = REPO / "docs" / "examples" / "complex.xaiop"
    print(f"XAIOP Python demo (protocol {PROTOCOL_VERSION})")
    print("Paste XAIOP text. Finish with a line that is only: END")
    try:
        tip = sample.relative_to(Path.cwd())
    except ValueError:
        tip = sample
    print(f"Tip: try the fixture — python demo.py {tip}")
    print()
    lines: list[str] = []
    while True:
        try:
            line = input("> ")
        except EOFError:
            break
        if line.strip() == "END":
            break
        lines.append(line)
    return "\n".join(lines)


def short_path_demo(source: str) -> None:
    """parse_sync · encode_sync · LiveParser · materialize."""
    tree = parse_sync(source)
    wire = encode_sync(tree)
    live = LiveParser()
    live.feed_text(source)
    live_tree = live.value()
    mat = materialize(tree)
    render(mat, title="parse_sync → materialize")
    print("# encode_sync round-trip length:", len(wire))
    print("# LiveParser value type:", type(live_tree).__name__)


def main() -> int:
    source = read_source()
    if not source.strip():
        print("No XAIOP input.", file=sys.stderr)
        return 1

    try:
        short_path_demo(source)
        engine = XaiopEngine()
        data_id = engine.upload_sync(source)
        value = engine.get_sync(data_id)
        render(value, title="XaiopEngine.upload_sync → get_sync", data_id=data_id)
    except Exception as err:
        render_error(err)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
