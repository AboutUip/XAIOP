#!/usr/bin/env python3
"""Mutation fuzz for Python parse_sync + DotCheckpointEngine.

Mirrors xaiop-sdk/conformance/fuzz/fuzz-node.mjs:
syntax errors are expected; other exceptions fail the harness.
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SEEDS = ROOT / "seeds"
PYTHON_SRC = ROOT.parent.parent / "python" / "src"
if str(PYTHON_SRC) not in sys.path:
    sys.path.insert(0, str(PYTHON_SRC))

from xaiop import DotCheckpointEngine, XaiopSyntaxError, parse_sync  # noqa: E402

INSERT_LINES = [">", "a:1", ".", "&x", "#note", "@a", "!a", "<", "-", ":item", "=a"]


def mutate(text: str, rnd: random.Random) -> str:
    op = int(rnd.random() * 4)
    if op == 0 and text:
        i = int(rnd.random() * len(text))
        code = 32 + int(rnd.random() * 95)
        return text[:i] + chr(code) + text[i + 1 :]
    if op == 1:
        line = INSERT_LINES[int(rnd.random() * len(INSERT_LINES))]
        lines = text.split("\n")
        at = int(rnd.random() * (len(lines) + 1))
        lines.insert(at, line)
        return "\n".join(lines)
    if op == 2 and text:
        cut = int(rnd.random() * len(text))
        return text[:cut]
    lines = text.split("\n")
    if not lines:
        return text + "\n>"
    i = int(rnd.random() * len(lines))
    lines.insert(i, lines[i])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="XAIOP Python mutation fuzz")
    parser.add_argument("--max", type=int, default=200)
    parser.add_argument("--seed", type=int, default=int(time.time()) & 0xFFFFFFFF)
    args = parser.parse_args()
    max_iters = max(1, args.max)
    seed = args.seed & 0xFFFFFFFF
    rnd = random.Random(seed)

    seeds = [p.read_text(encoding="utf-8") for p in sorted(SEEDS.glob("*.xaiop"))]
    if not seeds:
        print(f"no seeds in {SEEDS}", file=sys.stderr)
        return 1

    syntax = 0
    ok = 0
    deadline = time.time() + 30.0

    for i in range(max_iters):
        if time.time() > deadline:
            print(f"fuzz-python: time budget hit after {i} iterations", file=sys.stderr)
            break
        text = seeds[int(rnd.random() * len(seeds))]
        muts = 1 + int(rnd.random() * 4)
        for _ in range(muts):
            text = mutate(text, rnd)

        try:
            parse_sync(text)
            ok += 1
        except XaiopSyntaxError:
            syntax += 1
        except Exception as e:
            print(f"fuzz-python: unexpected parse error at iter {i}: {e!r}", file=sys.stderr)
            return 1

        try:
            diffs: list = []
            engine = DotCheckpointEngine(
                {
                    "onChunk": lambda *_a, **_k: diffs.append(_a[0] if _a else None),
                    "mergeChunkWindow": False,
                }
            )
            engine.push(text)
            engine.finish()
        except XaiopSyntaxError:
            syntax += 1
        except Exception as e:
            print(f"fuzz-python: unexpected stream error at iter {i}: {e!r}", file=sys.stderr)
            return 1

    print(f"fuzz-python OK seed={seed} max={max_iters} parseOk≈{ok} syntaxErrors≈{syntax}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
