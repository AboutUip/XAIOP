#!/usr/bin/env node
/**
 * XAIOP Node.js SDK stage timing harness (regression / before-vs-after).
 *
 * Goal: measure wall-clock of SDK stages and compare against a saved baseline
 * on the same machine. Not JSON-parse championship; not LLM PERF-METRICS.
 *
 * Usage:
 *   node bench.mjs
 *   node bench.mjs --quick
 *   node bench.mjs --save-baseline     # write baseline-bench.json
 *   node bench.mjs --no-baseline       # skip delta table even if baseline exists
 *   node bench.mjs --json
 *   BENCH_ITERS=200 BENCH_WARMUP=20 node bench.mjs
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOT_POLICY,
  DotCheckpointEngine,
  encodeSync,
  materializeSnapshot,
  parseSync,
  PROTOCOL_VERSION,
  SDK_VERSION,
  STREAM_MODES,
  TRANSPORT_KIND,
  XaiopEngine,
  XaiopStream,
} from "xaiop";

const __dir = dirname(fileURLToPath(import.meta.url));
const LAST_PATH = join(__dir, "last-bench.json");
const BASELINE_PATH = join(__dir, "baseline-bench.json");

const quick = process.argv.includes("--quick");
const asJson = process.argv.includes("--json");
const saveBaseline = process.argv.includes("--save-baseline");
const noBaseline = process.argv.includes("--no-baseline");
const ITERS = Number(process.env.BENCH_ITERS) || (quick ? 40 : 120);
const WARMUP = Number(process.env.BENCH_WARMUP) || (quick ? 5 : 15);
/** Long-session phase count (compact scenarios). */
const LONG_PHASES = Number(process.env.BENCH_LONG_PHASES) || (quick ? 24 : 80);

/** @param {number} n */
function hrMs(n) {
  return n / 1e6;
}

/**
 * @param {string} name
 * @param {() => void} fn
 * @param {{ iters?: number, warmup?: number, bytes?: number, note?: string }} [opt]
 */
function bench(name, fn, opt = {}) {
  const iters = opt.iters ?? ITERS;
  const warmup = opt.warmup ?? WARMUP;
  for (let i = 0; i < warmup; i++) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn();
  const ms = hrMs(Number(process.hrtime.bigint() - t0));
  const msPerOp = ms / iters;
  return {
    name,
    iters,
    totalMs: ms,
    msPerOp,
    opsPerSec: 1000 / msPerOp,
    bytes: opt.bytes,
    mbPerSec:
      opt.bytes != null && msPerOp > 0
        ? (opt.bytes / 1e6) / (msPerOp / 1000)
        : undefined,
    note: opt.note,
  };
}

/**
 * @param {string} name
 * @param {() => Promise<void>} fn
 * @param {{ iters?: number, warmup?: number, bytes?: number, note?: string }} [opt]
 */
async function benchAsync(name, fn, opt = {}) {
  const iters = opt.iters ?? ITERS;
  const warmup = opt.warmup ?? WARMUP;
  for (let i = 0; i < warmup; i++) await fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) await fn();
  const ms = hrMs(Number(process.hrtime.bigint() - t0));
  const msPerOp = ms / iters;
  return {
    name,
    iters,
    totalMs: ms,
    msPerOp,
    opsPerSec: 1000 / msPerOp,
    bytes: opt.bytes,
    mbPerSec:
      opt.bytes != null && msPerOp > 0
        ? (opt.bytes / 1e6) / (msPerOp / 1000)
        : undefined,
    note: opt.note,
  };
}

/** Nested fixture roughly mid-size for SDK microbench. */
function buildFixture(depth = 3, breadth = 8) {
  /** @type {Record<string, unknown>} */
  const root = {};
  function nest(level) {
    /** @type {Record<string, unknown>} */
    const o = {};
    for (let i = 0; i < breadth; i++) {
      const k = `k${i}`;
      if (level <= 0) {
        o[k] = i % 3 === 0 ? `v-${i}` : i % 3 === 1 ? i * 17 : i % 2 === 0;
      } else {
        o[k] = nest(level - 1);
      }
    }
    o.arr = Array.from({ length: breadth }, (_, j) => ({
      id: j,
      tag: `t${j}`,
    }));
    return o;
  }
  root.doc = nest(depth);
  root.meta = { title: "sdk-timing", n: breadth * depth };
  return root;
}

/** Many top-level phases — long-session buffer / compact. */
function buildLongSessionWire(phases) {
  let s = "";
  for (let i = 0; i < phases; i++) {
    s += `>p${i}\nn:${i}\ntag:t${i % 7}\n.\n`;
  }
  return s;
}

/** D1: named enter after `.` (object-root continuation). */
const D1_WIRE = `>
>meta
name:x
.
>rules-
>
id:R1
<
.
`;

/** D2: `@` into prior-phase named array (cumulative Diff). */
const D2_WIRE = `>
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
`;

const LOCATE_WIRE = `>
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
`;

/**
 * @param {string[]} chunks
 * @param {object} [hooks]
 */
function runCheckpoint(chunks, hooks = {}) {
  const eng = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    onChunk: () => {},
    ...hooks,
  });
  for (const c of chunks) eng.push(c);
  eng.finish();
  return eng;
}

function printTable(rows) {
  const cols = ["name", "ms/op", "ops/s", "iters", "bytes", "MB/s"];
  const data = rows.map((r) => ({
    name: r.name,
    "ms/op": r.msPerOp.toFixed(4),
    "ops/s": r.opsPerSec.toFixed(1),
    iters: String(r.iters),
    bytes: r.bytes != null ? String(r.bytes) : "—",
    "MB/s": r.mbPerSec != null ? r.mbPerSec.toFixed(2) : "—",
  }));
  const widths = cols.map((c) =>
    Math.max(c.length, ...data.map((d) => String(d[c]).length)),
  );
  const line = (cells) =>
    cells.map((v, i) => String(v).padEnd(widths[i])).join("  ");
  console.log(line(cols));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const d of data) console.log(line(cols.map((c) => d[c])));
}

/**
 * @param {{ name: string, msPerOp: number }[]} current
 * @param {{ name: string, msPerOp: number }[]} baselineRows
 * @param {{ sdk?: string, node?: string, savedAt?: string }} meta
 */
function printDelta(current, baselineRows, meta) {
  const baseMap = new Map(baselineRows.map((r) => [r.name, r.msPerOp]));
  console.log("\n— vs baseline (negative % = faster) —\n");
  if (meta.sdk || meta.node || meta.savedAt) {
    console.log(
      `baseline: sdk=${meta.sdk ?? "?"}  node=${meta.node ?? "?"}  saved=${meta.savedAt ?? "?"}`,
    );
  }
  const cols = ["name", "now", "base", "Δ%", "verdict"];
  /** @type {Record<string, string>[]} */
  const data = [];
  let faster = 0;
  let slower = 0;
  let missing = 0;
  for (const r of current) {
    const b = baseMap.get(r.name);
    if (b == null || !(b > 0)) {
      missing++;
      data.push({
        name: r.name,
        now: r.msPerOp.toFixed(4),
        base: "—",
        "Δ%": "—",
        verdict: "new",
      });
      continue;
    }
    const pct = ((r.msPerOp - b) / b) * 100;
    let verdict = "≈";
    if (pct <= -3) {
      verdict = "faster";
      faster++;
    } else if (pct >= 3) {
      verdict = "slower";
      slower++;
    }
    data.push({
      name: r.name,
      now: r.msPerOp.toFixed(4),
      base: b.toFixed(4),
      "Δ%": `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}`,
      verdict,
    });
  }
  const widths = cols.map((c) =>
    Math.max(c.length, ...data.map((d) => String(d[c]).length)),
  );
  const line = (cells) =>
    cells.map((v, i) => String(v).padEnd(widths[i])).join("  ");
  console.log(line(cols));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const d of data) console.log(line(cols.map((c) => d[c])));
  console.log(
    `\nsummary: ${faster} faster (≥3%)  ${slower} slower (≥3%)  ${missing} new/missing`,
  );
  return { faster, slower, missing };
}

/**
 * @param {Record<string, number>} pairs nameA/nameB → ratio A/B
 */
function printRatios(rows, pairs) {
  const map = new Map(rows.map((r) => [r.name, r.msPerOp]));
  console.log("\n— same-run ratios (optimization levers) —\n");
  for (const [label, [a, b]] of Object.entries(pairs)) {
    const va = map.get(a);
    const vb = map.get(b);
    if (va == null || vb == null || !(vb > 0)) continue;
    console.log(`  ${label}: ${a} / ${b} = ${(va / vb).toFixed(2)}x`);
  }
}

async function main() {
  const fixture = buildFixture(quick ? 2 : 3, quick ? 5 : 8);
  const wireNone = encodeSync(fixture, { dotPolicy: DOT_POLICY.NONE });
  const wirePhased = encodeSync(fixture, {
    dotPolicy: DOT_POLICY.PER_TOP_LEVEL_KEY,
  });
  const wireDense = encodeSync(fixture, {
    dotPolicy: DOT_POLICY.PER_N_KEYS,
    phaseEvery: 1,
  });
  const longWire = buildLongSessionWire(LONG_PHASES);
  const longChunks = longWire
    .split(/(?<=\.\n)/)
    .filter((c) => c.length > 0);

  /** @type {ReturnType<typeof bench>[]} */
  const rows = [];
  /** Extra metrics not in ms/op table (buffer sizes). */
  /** @type {Record<string, number>} */
  const extras = {};

  // ---- encode / parse ----
  rows.push(
    bench("encodeSync/none", () => {
      encodeSync(fixture, { dotPolicy: DOT_POLICY.NONE });
    }),
  );
  rows.push(
    bench("encodeSync/perTopLevelKey", () => {
      encodeSync(fixture, { dotPolicy: DOT_POLICY.PER_TOP_LEVEL_KEY });
    }),
  );
  rows.push(
    bench(
      "parseSync/none-wire",
      () => {
        parseSync(wireNone);
      },
      { bytes: wireNone.length },
    ),
  );
  rows.push(
    bench(
      "parseSync/phased-wire",
      () => {
        parseSync(wirePhased);
      },
      { bytes: wirePhased.length },
    ),
  );
  rows.push(
    bench(
      "parseSync+materialize/none",
      () => {
        materializeSnapshot(parseSync(wireNone));
      },
      { bytes: wireNone.length },
    ),
  );

  // ---- checkpoint stream on/off ----
  rows.push(
    bench(
      "checkpoint/streamOn/phased",
      () => {
        runCheckpoint([wirePhased]);
      },
      { bytes: wirePhased.length },
    ),
  );
  rows.push(
    bench(
      "checkpoint/streamOff/phased",
      () => {
        runCheckpoint([wirePhased], { streamProcessing: false });
      },
      { bytes: wirePhased.length },
    ),
  );
  rows.push(
    bench(
      "checkpoint/streamOn/dense",
      () => {
        runCheckpoint([wireDense]);
      },
      { bytes: wireDense.length },
    ),
  );

  // ---- emitDiff tax (0.14.3+) ----
  rows.push(
    bench(
      "checkpoint/emitDiffOn/dense",
      () => {
        runCheckpoint([wireDense], { emitDiff: true, onChunk: () => {} });
      },
      { bytes: wireDense.length, note: "default Diff delivery" },
    ),
  );
  rows.push(
    bench(
      "checkpoint/emitDiffOff/dense",
      () => {
        runCheckpoint([wireDense], { emitDiff: false });
      },
      {
        bytes: wireDense.length,
        note: "Commit only; onChunk optional",
      },
    ),
  );

  // ---- D1 / D2 / locate ----
  rows.push(
    bench(
      "checkpoint/D1-split/>after-dot",
      () => {
        const mid = D1_WIRE.indexOf(".\n") + 2;
        runCheckpoint([D1_WIRE.slice(0, mid), D1_WIRE.slice(mid)], {
          mergeChunkWindow: false,
        });
      },
      { bytes: D1_WIRE.length, note: "Diff isolation object-root cont." },
    ),
  );
  rows.push(
    bench(
      "checkpoint/D2-@/named-array",
      () => {
        runCheckpoint([D2_WIRE], { mergeChunkWindow: false });
      },
      { bytes: D2_WIRE.length, note: "cumulative @ Diff" },
    ),
  );
  rows.push(
    bench(
      "checkpoint/locate/bang+eq",
      () => {
        runCheckpoint([LOCATE_WIRE]);
      },
      { bytes: LOCATE_WIRE.length },
    ),
  );

  // ---- long session: grow vs compact (0.15.0+) ----
  const longIters = Math.max(8, Math.floor(ITERS / 4));
  rows.push(
    bench(
      "checkpoint/long/grow-buffer",
      () => {
        const eng = runCheckpoint(longChunks, {
          mergeChunkWindow: false,
          emitDiff: false,
        });
        extras.longGrowBufferBytes = eng.bufferStats().length;
      },
      {
        bytes: longWire.length,
        iters: longIters,
        note: `${LONG_PHASES} phases, no compact`,
      },
    ),
  );
  rows.push(
    bench(
      "checkpoint/long/compact-each-phase",
      () => {
        const eng = new DotCheckpointEngine({
          compat: false,
          streamProcessing: true,
          mergeChunkWindow: false,
          emitDiff: false,
        });
        for (const c of longChunks) {
          eng.push(c);
          if (!eng.bufferStats().openPhase) eng.compactCommitted();
        }
        eng.finish();
        extras.longCompactBufferBytes = eng.bufferStats().length;
      },
      {
        bytes: longWire.length,
        iters: longIters,
        note: `${LONG_PHASES} phases + compactCommitted`,
      },
    ),
  );

  rows.push(
    bench("engine/uploadJsonSync+getSync", () => {
      const e = new XaiopEngine();
      const id = e.uploadJsonSync(fixture);
      e.getSync(id);
    }),
  );

  // ---- async stream ----
  /** @type {Awaited<ReturnType<typeof benchAsync>>[]} */
  const asyncRows = [];
  const asyncIters = Math.max(10, Math.floor(ITERS / 3));

  asyncRows.push(
    await benchAsync(
      "stream.send/PROMISE/phased",
      async () => {
        const stream = new XaiopStream("raw://bench", {
          modes: [STREAM_MODES.PROMISE],
        });
        await stream.send({
          transport: TRANSPORT_KIND.RAW,
          source: (async function* () {
            yield wirePhased;
          })(),
        });
      },
      {
        bytes: wirePhased.length,
        iters: asyncIters,
        note: "PROMISE alone → engine emitDiff false",
      },
    ),
  );
  asyncRows.push(
    await benchAsync(
      "stream.send/CALLBACK+onChunk/phased",
      async () => {
        const stream = new XaiopStream("raw://bench", {
          modes: [STREAM_MODES.CALLBACK],
        });
        stream.onChunk(() => {});
        await stream.send({
          transport: TRANSPORT_KIND.RAW,
          source: (async function* () {
            yield wirePhased;
          })(),
        });
      },
      {
        bytes: wirePhased.length,
        iters: asyncIters,
        note: "forces phase Diff parse",
      },
    ),
  );
  asyncRows.push(
    await benchAsync(
      "stream.send/PROMISE/streamOff",
      async () => {
        const stream = new XaiopStream("raw://bench", {
          modes: [STREAM_MODES.PROMISE],
          streamProcessing: false,
        });
        await stream.send({
          transport: TRANSPORT_KIND.RAW,
          source: (async function* () {
            yield wirePhased;
          })(),
        });
      },
      { bytes: wirePhased.length, iters: asyncIters },
    ),
  );
  asyncRows.push(
    await benchAsync(
      "stream.send/chunked/bang+eq",
      async () => {
        const stream = new XaiopStream("raw://bench", {
          modes: [STREAM_MODES.PROMISE],
        });
        const mid = Math.floor(LOCATE_WIRE.length / 2);
        await stream.send({
          transport: TRANSPORT_KIND.RAW,
          source: (async function* () {
            yield LOCATE_WIRE.slice(0, mid);
            yield LOCATE_WIRE.slice(mid);
          })(),
        });
      },
      { bytes: LOCATE_WIRE.length, iters: asyncIters },
    ),
  );

  const allRows = [...rows, ...asyncRows];

  // Correctness smoke
  const eng = runCheckpoint([wirePhased]);
  const expected = parseSync(wirePhased);
  const same =
    JSON.stringify(eng.committedSnapshot) === JSON.stringify(expected);
  const d1 = runCheckpoint(
    (() => {
      const mid = D1_WIRE.indexOf(".\n") + 2;
      return [D1_WIRE.slice(0, mid), D1_WIRE.slice(mid)];
    })(),
    { mergeChunkWindow: false },
  );
  const d1Ok =
    JSON.stringify(d1.committedSnapshot) === JSON.stringify(parseSync(D1_WIRE));
  const d2 = runCheckpoint([D2_WIRE], { mergeChunkWindow: false });
  const d2Ok =
    JSON.stringify(d2.committedSnapshot) === JSON.stringify(parseSync(D2_WIRE));

  // One-shot sample for buffer extras if not filled (quick path always runs)
  if (extras.longGrowBufferBytes == null) {
    const g = runCheckpoint(longChunks, {
      mergeChunkWindow: false,
      emitDiff: false,
    });
    extras.longGrowBufferBytes = g.bufferStats().length;
  }
  if (extras.longCompactBufferBytes == null) {
    const engC = new DotCheckpointEngine({
      compat: false,
      mergeChunkWindow: false,
      emitDiff: false,
    });
    for (const c of longChunks) {
      engC.push(c);
      if (!engC.bufferStats().openPhase) engC.compactCommitted();
    }
    engC.finish();
    extras.longCompactBufferBytes = engC.bufferStats().length;
  }

  const report = {
    kind: "xaiop-sdk-stage-timing",
    harness: "0.2.0",
    not: "JSON race · docs/performance.md PERF-METRICS",
    sdk: SDK_VERSION,
    protocol: PROTOCOL_VERSION,
    node: process.version,
    iters: ITERS,
    warmup: WARMUP,
    longPhases: LONG_PHASES,
    quick,
    fixture: {
      wireNone: wireNone.length,
      wirePhased: wirePhased.length,
      wireDense: wireDense.length,
      longWire: longWire.length,
      d1: D1_WIRE.length,
      d2: D2_WIRE.length,
    },
    extras,
    stages: allRows.map((r) => ({
      name: r.name,
      msPerOp: r.msPerOp,
      opsPerSec: r.opsPerSec,
      iters: r.iters,
      bytes: r.bytes,
      mbPerSec: r.mbPerSec,
      note: r.note,
    })),
    correctness: {
      checkpointVsParseSync: same,
      d1Split: d1Ok,
      d2At: d2Ok,
    },
    savedAt: new Date().toISOString(),
  };

  writeFileSync(LAST_PATH, JSON.stringify(report, null, 2), "utf8");
  if (saveBaseline) {
    writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2), "utf8");
  }

  /** @type {{ faster: number, slower: number, missing: number } | null} */
  let deltaSummary = null;
  if (!noBaseline && existsSync(BASELINE_PATH)) {
    try {
      const base = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
      report.baselineCompare = {
        sdk: base.sdk,
        node: base.node,
        savedAt: base.savedAt,
        harness: base.harness,
      };
    } catch {
      /* ignore corrupt baseline */
    }
  }

  if (asJson) {
    if (!noBaseline && existsSync(BASELINE_PATH)) {
      try {
        const base = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
        const baseRows = base.stages || [];
        const baseMap = new Map(baseRows.map((r) => [r.name, r.msPerOp]));
        report.deltas = allRows.map((r) => {
          const b = baseMap.get(r.name);
          if (b == null || !(b > 0)) return { name: r.name, pct: null };
          return { name: r.name, pct: ((r.msPerOp - b) / b) * 100 };
        });
      } catch {
        /* ignore */
      }
    }
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("XAIOP Node.js SDK stage timing");
    console.log(
      "(Regression harness — compare to baseline on this machine, not vs JSON.parse.)",
    );
    console.log(
      "(Not LLM PERF-METRICS — see docs/performance.md for model evaluation.)\n",
    );
    console.log(
      `SDK ${SDK_VERSION}  protocol ${PROTOCOL_VERSION}  harness ${report.harness}`,
    );
    console.log(
      `Node ${process.version}  iters=${ITERS}  warmup=${WARMUP}  longPhases=${LONG_PHASES}${quick ? "  (--quick)" : ""}`,
    );
    console.log(
      `fixture wire: none=${wireNone.length}B  phased=${wirePhased.length}B  dense=${wireDense.length}B  long=${longWire.length}B\n`,
    );

    console.log("— sync stages —\n");
    printTable(rows);
    console.log("\n— async stream stages —\n");
    printTable(asyncRows);

    printRatios(allRows, {
      "streamOn / streamOff (phased)": [
        "checkpoint/streamOn/phased",
        "checkpoint/streamOff/phased",
      ],
      "emitDiffOn / emitDiffOff (dense)": [
        "checkpoint/emitDiffOn/dense",
        "checkpoint/emitDiffOff/dense",
      ],
      "CALLBACK+onChunk / PROMISE (stream)": [
        "stream.send/CALLBACK+onChunk/phased",
        "stream.send/PROMISE/phased",
      ],
      "long grow / compact-each": [
        "checkpoint/long/grow-buffer",
        "checkpoint/long/compact-each-phase",
      ],
    });

    console.log("\n— long-session buffer sample (one pass) —\n");
    console.log(
      `  grow buffer length:    ${extras.longGrowBufferBytes} B`,
    );
    console.log(
      `  after compact/phase:   ${extras.longCompactBufferBytes} B`,
    );

    if (saveBaseline) {
      console.log(
        "\n(baseline saved — next `npm run bench` will print Δ% against this run)",
      );
    } else if (!noBaseline && existsSync(BASELINE_PATH)) {
      try {
        const base = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
        deltaSummary = printDelta(allRows, base.stages || [], {
          sdk: base.sdk,
          node: base.node,
          savedAt: base.savedAt,
        });
      } catch (e) {
        console.log(`\n(baseline present but unreadable: ${e})`);
      }
    } else if (!noBaseline) {
      console.log(
        "\n(no baseline-bench.json — run with --save-baseline once, then re-bench after changes)",
      );
    }

    console.log(
      `\ncorrectness: checkpoint=${same ? "OK" : "FAIL"}  D1=${d1Ok ? "OK" : "FAIL"}  D2=${d2Ok ? "OK" : "FAIL"}`,
    );
    console.log(`Wrote ${LAST_PATH}`);
    if (saveBaseline) console.log(`Wrote baseline ${BASELINE_PATH}`);
  }

  if (!same || !d1Ok || !d2Ok) process.exitCode = 1;
  if (deltaSummary && deltaSummary.slower > 0 && process.env.BENCH_FAIL_SLOWER === "1") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
