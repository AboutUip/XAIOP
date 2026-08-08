#!/usr/bin/env python3
"""XAIOP Python SDK stage timing harness (same stages as timing/node/bench.mjs).

Goal: same-machine wall-clock regression / cross-runtime stage-name compare.
Not JSON-parse championship; not LLM PERF-METRICS.

Usage (from xaiop-sdk/timing):
  python python/bench.py
  npm run bench:python
  npm run bench:python:quick
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PYTHON_SRC = ROOT.parent.parent / "python" / "src"
if str(PYTHON_SRC) not in sys.path:
    sys.path.insert(0, str(PYTHON_SRC))

from xaiop import (  # noqa: E402
    DOT_POLICY,
    PROTOCOL_VERSION,
    SDK_VERSION,
    DotCheckpointEngine,
    STREAM_MODES,
    TRANSPORT_KIND,
    XaiopEngine,
    XaiopStream,
    encode_sync,
    materialize_snapshot,
    parse_sync,
)

LAST_PATH = ROOT / "last-bench.json"
BASELINE_PATH = ROOT / "baseline-bench.json"


def build_fixture(depth: int = 3, breadth: int = 8) -> dict:
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


def build_long_session_wire(phases: int) -> str:
    parts = []
    for i in range(phases):
        parts.append(f">p{i}\nn:{i}\ntag:t{i % 7}\n.\n")
    return "".join(parts)


D1_WIRE = """>
>meta
name:x
.
>rules-
>
id:R1
<
.
"""

D2_WIRE = """>
>orders-
>
id:1
sku:a
<
.
@orders
>
id:2
sku:b
<
.
"""

LOCATE_WIRE = """>
>left
>test
x:1
.
>right
>test
y:2
.
!test
z:9
.
=left>test
w:8
.
"""


def run_checkpoint(chunks: list[str], hooks: dict | None = None) -> DotCheckpointEngine:
    base = {
        "compat": False,
        "streamProcessing": True,
        "onChunk": lambda *_a, **_k: None,
    }
    if hooks:
        base.update(hooks)
    eng = DotCheckpointEngine(base)
    for c in chunks:
        eng.push(c)
    eng.finish()
    return eng


def bench(name: str, fn, *, iters: int, warmup: int, bytes_: int | None = None, note: str | None = None) -> dict:
    for _ in range(warmup):
        fn()
    t0 = time.perf_counter_ns()
    for _ in range(iters):
        fn()
    total_ms = (time.perf_counter_ns() - t0) / 1e6
    ms_per_op = total_ms / iters
    row = {
        "name": name,
        "iters": iters,
        "totalMs": total_ms,
        "msPerOp": ms_per_op,
        "opsPerSec": 1000.0 / ms_per_op if ms_per_op > 0 else 0.0,
        "bytes": bytes_,
        "note": note,
    }
    if bytes_ is not None and ms_per_op > 0:
        row["mbPerSec"] = (bytes_ / 1e6) / (ms_per_op / 1000.0)
    else:
        row["mbPerSec"] = None
    return row


def print_table(rows: list[dict]) -> None:
    cols = ["name", "ms/op", "ops/s", "iters", "bytes", "MB/s"]
    data = []
    for r in rows:
        data.append(
            {
                "name": r["name"],
                "ms/op": f"{r['msPerOp']:.4f}",
                "ops/s": f"{r['opsPerSec']:.1f}",
                "iters": str(r["iters"]),
                "bytes": str(r["bytes"]) if r.get("bytes") is not None else "—",
                "MB/s": f"{r['mbPerSec']:.2f}" if r.get("mbPerSec") is not None else "—",
            }
        )
    widths = [max(len(c), *(len(d[c]) for d in data)) for c in cols]

    def line(cells: list[str]) -> str:
        return "  ".join(str(v).ljust(widths[i]) for i, v in enumerate(cells))

    print(line(cols))
    print(line(["-" * w for w in widths]))
    for d in data:
        print(line([d[c] for c in cols]))


def print_delta(current: list[dict], baseline_rows: list[dict], meta: dict) -> dict:
    base_map = {r["name"]: r["msPerOp"] for r in baseline_rows}
    print("\n— vs baseline (negative % = faster) —\n")
    if meta:
        print(
            f"baseline: sdk={meta.get('sdk', '?')}  python={meta.get('python', '?')}  "
            f"saved={meta.get('savedAt', '?')}"
        )
    cols = ["name", "now", "base", "Δ%", "verdict"]
    data = []
    faster = slower = missing = 0
    for r in current:
        b = base_map.get(r["name"])
        if b is None or not (b > 0):
            missing += 1
            data.append(
                {
                    "name": r["name"],
                    "now": f"{r['msPerOp']:.4f}",
                    "base": "—",
                    "Δ%": "—",
                    "verdict": "new",
                }
            )
            continue
        pct = ((r["msPerOp"] - b) / b) * 100
        verdict = "≈"
        if pct <= -3:
            verdict = "faster"
            faster += 1
        elif pct >= 3:
            verdict = "slower"
            slower += 1
        data.append(
            {
                "name": r["name"],
                "now": f"{r['msPerOp']:.4f}",
                "base": f"{b:.4f}",
                "Δ%": f"{pct:+.1f}",
                "verdict": verdict,
            }
        )
    widths = [max(len(c), *(len(d[c]) for d in data)) for c in cols]

    def line(cells: list[str]) -> str:
        return "  ".join(str(v).ljust(widths[i]) for i, v in enumerate(cells))

    print(line(cols))
    print(line(["-" * w for w in widths]))
    for d in data:
        print(line([d[c] for c in cols]))
    print(f"\nfaster={faster}  slower={slower}  new/missing={missing}")
    return {"faster": faster, "slower": slower, "missing": missing}


def main() -> int:
    ap = argparse.ArgumentParser(description="XAIOP Python SDK stage timing")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--save-baseline", action="store_true")
    ap.add_argument("--no-baseline", action="store_true")
    args = ap.parse_args()

    quick = args.quick
    iters = int(os.environ.get("BENCH_ITERS") or (40 if quick else 120))
    warmup = int(os.environ.get("BENCH_WARMUP") or (5 if quick else 15))
    long_phases = int(os.environ.get("BENCH_LONG_PHASES") or (24 if quick else 80))

    fixture = build_fixture(2 if quick else 3, 5 if quick else 8)
    wire_none = encode_sync(fixture, dot_policy=DOT_POLICY["NONE"])
    wire_phased = encode_sync(fixture, dot_policy=DOT_POLICY["PER_TOP_LEVEL_KEY"])
    wire_dense = encode_sync(
        fixture, dot_policy=DOT_POLICY["PER_N_KEYS"], phase_every=1
    )
    long_wire = build_long_session_wire(long_phases)
    long_chunks: list[str] = []
    start = 0
    while True:
        i = long_wire.find(".\n", start)
        if i < 0:
            if start < len(long_wire):
                long_chunks.append(long_wire[start:])
            break
        long_chunks.append(long_wire[start : i + 2])
        start = i + 2

    rows: list[dict] = []
    extras: dict[str, int] = {}

    rows.append(
        bench(
            "encodeSync/none",
            lambda: encode_sync(fixture, dot_policy=DOT_POLICY["NONE"]),
            iters=iters,
            warmup=warmup,
        )
    )
    rows.append(
        bench(
            "encodeSync/perTopLevelKey",
            lambda: encode_sync(fixture, dot_policy=DOT_POLICY["PER_TOP_LEVEL_KEY"]),
            iters=iters,
            warmup=warmup,
        )
    )
    rows.append(
        bench(
            "parseSync/none-wire",
            lambda: parse_sync(wire_none),
            iters=iters,
            warmup=warmup,
            bytes_=len(wire_none),
        )
    )
    rows.append(
        bench(
            "parseSync/phased-wire",
            lambda: parse_sync(wire_phased),
            iters=iters,
            warmup=warmup,
            bytes_=len(wire_phased),
        )
    )
    rows.append(
        bench(
            "parseSync+materialize/none",
            lambda: materialize_snapshot(parse_sync(wire_none)),
            iters=iters,
            warmup=warmup,
            bytes_=len(wire_none),
        )
    )

    rows.append(
        bench(
            "checkpoint/streamOn/phased",
            lambda: run_checkpoint([wire_phased]),
            iters=iters,
            warmup=warmup,
            bytes_=len(wire_phased),
        )
    )
    rows.append(
        bench(
            "checkpoint/streamOff/phased",
            lambda: run_checkpoint([wire_phased], {"streamProcessing": False}),
            iters=iters,
            warmup=warmup,
            bytes_=len(wire_phased),
        )
    )
    rows.append(
        bench(
            "checkpoint/streamOn/dense",
            lambda: run_checkpoint([wire_dense]),
            iters=iters,
            warmup=warmup,
            bytes_=len(wire_dense),
        )
    )
    rows.append(
        bench(
            "checkpoint/emitDiffOn/dense",
            lambda: run_checkpoint(
                [wire_dense], {"emitDiff": True, "onChunk": lambda *_a, **_k: None}
            ),
            iters=iters,
            warmup=warmup,
            bytes_=len(wire_dense),
            note="default Diff delivery",
        )
    )
    rows.append(
        bench(
            "checkpoint/emitDiffOff/dense",
            lambda: run_checkpoint([wire_dense], {"emitDiff": False}),
            iters=iters,
            warmup=warmup,
            bytes_=len(wire_dense),
            note="Commit only; onChunk optional",
        )
    )

    mid = D1_WIRE.find(".\n") + 2
    rows.append(
        bench(
            "checkpoint/D1-split/>after-dot",
            lambda: run_checkpoint(
                [D1_WIRE[:mid], D1_WIRE[mid:]], {"mergeChunkWindow": False}
            ),
            iters=iters,
            warmup=warmup,
            bytes_=len(D1_WIRE),
            note="Diff isolation object-root cont.",
        )
    )
    rows.append(
        bench(
            "checkpoint/D2-@/named-array",
            lambda: run_checkpoint([D2_WIRE], {"mergeChunkWindow": False}),
            iters=iters,
            warmup=warmup,
            bytes_=len(D2_WIRE),
            note="cumulative @ Diff",
        )
    )
    rows.append(
        bench(
            "checkpoint/locate/bang+eq",
            lambda: run_checkpoint([LOCATE_WIRE]),
            iters=iters,
            warmup=warmup,
            bytes_=len(LOCATE_WIRE),
        )
    )

    long_iters = max(8, iters // 4)

    def grow() -> None:
        eng = run_checkpoint(
            long_chunks, {"mergeChunkWindow": False, "emitDiff": False}
        )
        extras["longGrowBufferBytes"] = eng.buffer_stats()["length"]

    rows.append(
        bench(
            "checkpoint/long/grow-buffer",
            grow,
            iters=long_iters,
            warmup=max(1, warmup // 2),
            bytes_=len(long_wire),
            note=f"{long_phases} phases, no compact",
        )
    )

    def compact_each() -> None:
        eng = DotCheckpointEngine(
            {
                "compat": False,
                "streamProcessing": True,
                "mergeChunkWindow": False,
                "emitDiff": False,
            }
        )
        for c in long_chunks:
            eng.push(c)
            if not eng.buffer_stats()["openPhase"]:
                eng.compact_committed()
        eng.finish()
        extras["longCompactBufferBytes"] = eng.buffer_stats()["length"]

    rows.append(
        bench(
            "checkpoint/long/compact-each-phase",
            compact_each,
            iters=long_iters,
            warmup=max(1, warmup // 2),
            bytes_=len(long_wire),
            note=f"{long_phases} phases + compactCommitted",
        )
    )

    rows.append(
        bench(
            "engine/uploadJsonSync+getSync",
            lambda: _engine_upload_get(fixture),
            iters=iters,
            warmup=warmup,
        )
    )

    async_iters = max(10, iters // 3)

    def stream_promise() -> None:
        stream = XaiopStream("raw://bench", modes=[STREAM_MODES["PROMISE"]])
        fut = stream.send(transport=TRANSPORT_KIND["RAW"], source=[wire_phased])
        assert fut is not None
        fut.result(timeout=30)

    rows.append(
        bench(
            "stream.send/PROMISE/phased",
            stream_promise,
            iters=async_iters,
            warmup=max(1, warmup // 2),
            bytes_=len(wire_phased),
            note="PROMISE alone → engine emitDiff false",
        )
    )

    def stream_callback() -> None:
        stream = XaiopStream("raw://bench", modes=[STREAM_MODES["CALLBACK"]])
        stream.on_chunk(lambda *_a, **_k: None)
        stream.on_done(lambda *_a, **_k: None)
        fut = stream.send(transport=TRANSPORT_KIND["RAW"], source=[wire_phased])
        # CALLBACK may not return promise — wait on status
        if fut is not None:
            fut.result(timeout=30)
        else:
            deadline = time.monotonic() + 30
            while stream.is_busy() and time.monotonic() < deadline:
                time.sleep(0.001)

    rows.append(
        bench(
            "stream.send/CALLBACK+onChunk/phased",
            stream_callback,
            iters=async_iters,
            warmup=max(1, warmup // 2),
            bytes_=len(wire_phased),
            note="forces phase Diff parse",
        )
    )

    def stream_off() -> None:
        stream = XaiopStream(
            "raw://bench",
            modes=[STREAM_MODES["PROMISE"]],
            stream_processing=False,
        )
        fut = stream.send(transport=TRANSPORT_KIND["RAW"], source=[wire_phased])
        assert fut is not None
        fut.result(timeout=30)

    rows.append(
        bench(
            "stream.send/PROMISE/streamOff",
            stream_off,
            iters=async_iters,
            warmup=max(1, warmup // 2),
            bytes_=len(wire_phased),
        )
    )

    def stream_chunked() -> None:
        stream = XaiopStream("raw://bench", modes=[STREAM_MODES["PROMISE"]])
        mid_loc = len(LOCATE_WIRE) // 2
        fut = stream.send(
            transport=TRANSPORT_KIND["RAW"],
            source=[LOCATE_WIRE[:mid_loc], LOCATE_WIRE[mid_loc:]],
        )
        assert fut is not None
        fut.result(timeout=30)

    rows.append(
        bench(
            "stream.send/chunked/bang+eq",
            stream_chunked,
            iters=async_iters,
            warmup=max(1, warmup // 2),
            bytes_=len(LOCATE_WIRE),
        )
    )

    # correctness smoke
    eng = run_checkpoint([wire_phased])
    expected = parse_sync(wire_phased)
    same = json.dumps(eng.committed_snapshot, sort_keys=True) == json.dumps(
        expected, sort_keys=True
    )
    d1 = run_checkpoint([D1_WIRE[:mid], D1_WIRE[mid:]], {"mergeChunkWindow": False})
    d1_ok = json.dumps(d1.committed_snapshot, sort_keys=True) == json.dumps(
        parse_sync(D1_WIRE), sort_keys=True
    )
    d2 = run_checkpoint([D2_WIRE], {"mergeChunkWindow": False})
    d2_ok = json.dumps(d2.committed_snapshot, sort_keys=True) == json.dumps(
        parse_sync(D2_WIRE), sort_keys=True
    )

    if "longGrowBufferBytes" not in extras:
        g = run_checkpoint(long_chunks, {"mergeChunkWindow": False, "emitDiff": False})
        extras["longGrowBufferBytes"] = g.buffer_stats()["length"]
    if "longCompactBufferBytes" not in extras:
        compact_each()

    report = {
        "kind": "xaiop-sdk-stage-timing",
        "harness": "0.2.1",
        "runtime": "python",
        "not": "JSON race · docs/performance.md PERF-METRICS",
        "sdk": SDK_VERSION,
        "protocol": PROTOCOL_VERSION,
        "python": sys.version.split()[0],
        "iters": iters,
        "warmup": warmup,
        "longPhases": long_phases,
        "quick": quick,
        "fixture": {
            "wireNone": len(wire_none),
            "wirePhased": len(wire_phased),
            "wireDense": len(wire_dense),
            "longWire": len(long_wire),
            "d1": len(D1_WIRE),
            "d2": len(D2_WIRE),
        },
        "extras": extras,
        "stages": [
            {
                "name": r["name"],
                "msPerOp": r["msPerOp"],
                "opsPerSec": r["opsPerSec"],
                "iters": r["iters"],
                "bytes": r.get("bytes"),
                "mbPerSec": r.get("mbPerSec"),
                "note": r.get("note"),
            }
            for r in rows
        ],
        "correctness": {
            "checkpointVsParseSync": same,
            "d1Split": d1_ok,
            "d2At": d2_ok,
        },
        "savedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    LAST_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if args.save_baseline:
        BASELINE_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    delta_summary = None
    if not args.no_baseline and BASELINE_PATH.exists():
        try:
            base = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
            report["baselineCompare"] = {
                "sdk": base.get("sdk"),
                "python": base.get("python"),
                "savedAt": base.get("savedAt"),
                "harness": base.get("harness"),
            }
            if not args.json:
                delta_summary = print_delta(
                    rows,
                    base.get("stages", []),
                    report["baselineCompare"],
                )
        except Exception:
            pass

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(
            f"XAIOP Python stage timing  harness={report['harness']}  "
            f"sdk={SDK_VERSION}  protocol={PROTOCOL_VERSION}  python={report['python']}"
        )
        print(
            f"iters={iters} warmup={warmup} longPhases={long_phases}"
            f"{'  --quick' if quick else ''}\n"
        )
        print_table(rows)
        print(
            f"\ncorrectness: checkpointVsParse={same}  d1Split={d1_ok}  d2At={d2_ok}"
        )
        print(f"wrote {LAST_PATH.name}")
        if args.save_baseline:
            print(f"wrote baseline {BASELINE_PATH.name}")

    fail_slower = os.environ.get("BENCH_FAIL_SLOWER") == "1"
    if fail_slower and delta_summary and delta_summary.get("slower", 0) > 0:
        return 1
    if not (same and d1_ok and d2_ok):
        return 2
    return 0


def _engine_upload_get(fixture: dict) -> None:
    e = XaiopEngine()
    data_id = e.upload_json_sync(fixture)
    e.get_sync(data_id)


if __name__ == "__main__":
    raise SystemExit(main())
