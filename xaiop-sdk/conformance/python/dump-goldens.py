#!/usr/bin/env python3
"""Dump Python golden NDJSON (encode / parse / stream) for Node ↔ Python compare."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFORMANCE = ROOT.parent
FIXTURES = CONFORMANCE / "fixtures"
sys.path.insert(0, str(CONFORMANCE.parent / "python" / "src"))

from xaiop import (  # noqa: E402
    DotCheckpointEngine,
    encode_sync,
    materialize_snapshot,
    parse_sync,
)


PARSE_STREAM_FIXTURES = (
    "complex",
    "stream-phases",
    "overwrite-id",
    "delete-phases",
    "at-array-d2",
    "bang-broadcast",
    "d1-named-enter",
    "locate-equals",
    "hash-ignore",
    "at-exact",
)


def dump_encode(emit) -> None:
    corpus = json.loads((FIXTURES / "encode-corpus.json").read_text(encoding="utf-8"))
    for i, value in enumerate(corpus):
        emit({"case": f"encode:{i}", "kind": "encode", "wire": encode_sync(value)})


def dump_parse(emit) -> None:
    for name in PARSE_STREAM_FIXTURES:
        wire = (FIXTURES / f"{name}.xaiop").read_text(encoding="utf-8")
        tree = materialize_snapshot(parse_sync(wire))
        emit({"case": f"parse:{name}", "kind": "parse", "tree": tree})


def dump_stream(emit, name: str) -> None:
    wire = (FIXTURES / f"{name}.xaiop").read_text(encoding="utf-8")
    diffs: list = []
    engine = DotCheckpointEngine(
        {
            "onChunk": lambda d, _m=None: diffs.append(d),
            "mergeChunkWindow": False,
        }
    )
    engine.push(wire)
    engine.finish()
    case = "phases" if name == "stream-phases" else name
    emit(
        {
            "case": f"stream:{case}",
            "kind": "stream",
            "diffs": diffs,
            "snapshot": engine.snapshot,
        }
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    rows: list[str] = []

    def emit(obj: dict) -> None:
        rows.append(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))

    dump_encode(emit)
    dump_parse(emit)
    for name in PARSE_STREAM_FIXTURES:
        dump_stream(emit, name)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(f"wrote {len(rows)} cases → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
