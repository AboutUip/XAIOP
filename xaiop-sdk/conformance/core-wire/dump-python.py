#!/usr/bin/env python3
"""Dump core-wire cases.json → NDJSON for Python ↔ Go comparison."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1] / "python" / "src"))

from xaiop import (  # noqa: E402
    LiveParser,
    XaiopEncodeError,
    XaiopFragment,
    XaiopSyntaxError,
    encode_sync,
    materialize,
    parse_sync,
)


def _jsonable(v):
    if isinstance(v, XaiopFragment):
        return {"__fragment__": True, "entries": materialize(v)}
    return materialize(v)


def run_case(case: dict) -> dict:
    cid = case["id"]
    kind = case["kind"]
    out: dict = {"case": cid, "kind": kind}

    if kind == "parse":
        wire = case["wire"]
        try:
            parsed = parse_sync(wire)
        except XaiopSyntaxError as e:
            return {**out, "error": str(e)}
        frag = isinstance(parsed, XaiopFragment)
        if case.get("fragment") and not frag:
            return {**out, "error": "expected fragment"}
        if not case.get("fragment") and frag:
            return {**out, "error": "unexpected fragment"}
        out["fragment"] = frag
        out["tree"] = materialize(parsed)
        return out

    if kind == "parse_file":
        wire = (ROOT / case["file"]).read_text(encoding="utf-8")
        parsed = parse_sync(wire)
        out["fragment"] = isinstance(parsed, XaiopFragment)
        out["tree"] = materialize(parsed)
        return out

    if kind == "parse_error":
        try:
            parse_sync(case["wire"])
            return {**out, "error": "expected syntax error"}
        except XaiopSyntaxError as e:
            return {**out, "ok": True, "message": str(e)}

    if kind == "live":
        live = LiveParser()
        for chunk in case["chunks"]:
            live.feed_text(chunk)
        parsed = live.value()
        out["fragment"] = isinstance(parsed, XaiopFragment)
        out["tree"] = materialize(parsed)
        return out

    if kind == "encode":
        root = case.get("root", "auto")
        key_order = case.get("key_order", "sorted")
        try:
            wire = encode_sync(case["value"], root=root, key_order=key_order)
        except XaiopEncodeError as e:
            return {**out, "error": str(e)}
        out["wire"] = wire
        return out

    if kind == "encode_error":
        root = case.get("root", "auto")
        try:
            encode_sync(case["value"], root=root)
            return {**out, "error": "expected encode error"}
        except XaiopEncodeError as e:
            return {**out, "ok": True, "message": str(e)}

    if kind == "roundtrip":
        value = case["value"]
        key_order = case.get("key_order", "sorted")
        wire = encode_sync(value, key_order=key_order)
        parsed = materialize(parse_sync(wire))
        out["wire"] = wire
        out["tree"] = parsed
        return out

    return {**out, "error": f"unknown kind {kind}"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--cases", default=str(ROOT / "cases.json"))
    args = ap.parse_args()
    doc = json.loads(Path(args.cases).read_text(encoding="utf-8"))
    lines = []
    for case in doc["cases"]:
        row = run_case(case)
        lines.append(json.dumps(row, ensure_ascii=False, separators=(",", ":")))
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {len(lines)} cases → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
