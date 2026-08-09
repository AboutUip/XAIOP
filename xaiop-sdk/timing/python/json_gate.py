#!/usr/bin/env python3
"""Fair JSON gate: Node JSON.parse vs Python json.loads vs xaiop.parse_sync.

Usage (from xaiop-sdk/timing):
  python python/json_gate.py
  python python/json_gate.py --quick
  npm run bench:python:json-gate
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TIMING = ROOT.parent
PYTHON_SRC = TIMING.parent / "python" / "src"
if str(PYTHON_SRC) not in sys.path:
    sys.path.insert(0, str(PYTHON_SRC))

from xaiop import SDK_VERSION, encode_sync, parse_sync  # noqa: E402


def build_fixture(depth: int, breadth: int) -> dict:
    def nest(level: int) -> dict:
        o: dict = {}
        for i in range(breadth):
            k = f"k{i}"
            if level <= 0:
                if i % 3 == 0:
                    o[k] = f"v-{i}"
                elif i % 3 == 1:
                    o[k] = i * 17
                else:
                    o[k] = i % 2 == 0
            else:
                o[k] = nest(level - 1)
        o["arr"] = [{"id": j, "tag": f"t{j}"} for j in range(breadth)]
        return o

    return {"doc": nest(depth), "meta": {"title": "sdk-timing", "n": breadth * depth}}


def best_of(rounds: int, iters: int, fn) -> float:
    best = float("inf")
    for _ in range(rounds):
        t0 = time.perf_counter()
        for _ in range(iters):
            fn()
        ns = (time.perf_counter() - t0) * 1e9 / iters
        if ns < best:
            best = ns
    return best


def node_json_ns(json_text: str, iters: int, warmup: int) -> float:
    probe = TIMING / "node_json_probe.mjs"
    tmp = ROOT / "_gate_fixture.json"
    tmp.write_text(json_text, encoding="utf-8")
    try:
        r = subprocess.run(
            ["node", str(probe), str(tmp), str(iters), str(warmup)],
            cwd=str(TIMING),
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        try:
            tmp.unlink()
        except OSError:
            pass
    if r.returncode != 0:
        print(r.stderr or r.stdout, file=sys.stderr)
        sys.exit(r.returncode or 1)
    return float(r.stdout.strip())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--iters", type=int, default=0)
    ap.add_argument("--warmup", type=int, default=0)
    args = ap.parse_args()

    depth, breadth = (2, 5) if args.quick else (3, 8)
    iters = args.iters or (200 if args.quick else 400)
    warmup = args.warmup or (20 if args.quick else 40)

    fixture = build_fixture(depth, breadth)
    json_text = json.dumps(fixture, separators=(",", ":"))
    wire = encode_sync(
        fixture,
        dot_policy="none",
        trailing_newline=True,
        key_order="insertion",
    )

    for _ in range(warmup):
        json.loads(json_text)
        parse_sync(wire)

    py_json_ns = best_of(3, iters, lambda: json.loads(json_text))
    py_parse_ns = best_of(3, iters, lambda: parse_sync(wire))
    node_ns = node_json_ns(json_text, iters, warmup)

    ratio_node = py_parse_ns / node_ns
    ratio_py = py_parse_ns / py_json_ns
    report = {
        "quick": args.quick,
        "depth": depth,
        "breadth": breadth,
        "iters": iters,
        "warmup": warmup,
        "nodeJsonNsPerOp": node_ns,
        "pyJsonNsPerOp": py_json_ns,
        "pyParseNsPerOp": py_parse_ns,
        "ratioParseOverNodeJSON": ratio_node,
        "ratioParseOverPyJSON": ratio_py,
        "primaryGatePass": ratio_node <= 1.2,
        "secondaryGatePass": ratio_py <= 1.2,
        "pyJsonOverNodeJSON": py_json_ns / node_ns,
        "jsonBytes": len(json_text.encode("utf-8")),
        "wireBytes": len(wire.encode("utf-8")),
        "sdk": SDK_VERSION,
    }

    out = ROOT / "last-json-gate.json"
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    def out_line(msg: str) -> None:
        try:
            print(msg)
        except UnicodeEncodeError:
            print(msg.encode("ascii", "replace").decode("ascii"))

    out_line("XAIOP Python Parse <-> JSON gate")
    out_line(f"  fixture depth={depth} breadth={breadth} iters={iters}")
    out_line(f"  Node JSON.parse     {node_ns / 1e6:.4f} ms/op")
    out_line(f"  Python json.loads   {py_json_ns / 1e6:.4f} ms/op")
    out_line(f"  Python parse_sync   {py_parse_ns / 1e6:.4f} ms/op")
    out_line(
        f"  Parse / NodeJSON    {ratio_node:.3f}x  (primary <= 1.2)  "
        f"{'PASS' if report['primaryGatePass'] else 'FAIL'}"
    )
    out_line(
        f"  Parse / PyJSON      {ratio_py:.3f}x  (secondary <= 1.2)  "
        f"{'PASS' if report['secondaryGatePass'] else 'FAIL'}"
    )
    if report["pyJsonOverNodeJSON"] > 1.2:
        out_line(
            f"  note: json.loads is {report['pyJsonOverNodeJSON']:.2f}x Node JSON.parse "
            f"(CPython/runtime floor)"
        )
    out_line(f"  wrote {out}")

    if not report["primaryGatePass"] and os.environ.get("BENCH_FAIL_GATE") == "1":
        sys.exit(2)


if __name__ == "__main__":
    main()
