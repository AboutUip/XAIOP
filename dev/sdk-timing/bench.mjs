#!/usr/bin/env node
/**
 * XAIOP Node.js SDK stage timing harness.
 *
 * NOT the same as docs/performance.md (PERF-METRICS / LLM structure-rate).
 * This measures local SDK wall-clock per stage: encode / parse / checkpoint / stream.
 *
 * Usage:
 *   node bench.mjs
 *   node bench.mjs --quick
 *   BENCH_ITERS=200 BENCH_WARMUP=20 node bench.mjs
 */

import {
  DOT_POLICY,
  DotCheckpointEngine,
  encodeSync,
  materializeSnapshot,
  parseSync,
  STREAM_MODES,
  TRANSPORT_KIND,
  XaiopEngine,
  XaiopStream,
} from "xaiop";

const quick = process.argv.includes("--quick");
const ITERS = Number(process.env.BENCH_ITERS) || (quick ? 40 : 120);
const WARMUP = Number(process.env.BENCH_WARMUP) || (quick ? 5 : 15);

/** @param {number} n */
function hrMs(n) {
  return n / 1e6;
}

/**
 * @param {string} name
 * @param {() => void} fn
 * @param {{ iters?: number, warmup?: number, bytes?: number }} [opt]
 */
function bench(name, fn, opt = {}) {
  const iters = opt.iters ?? ITERS;
  const warmup = opt.warmup ?? WARMUP;
  for (let i = 0; i < warmup; i++) fn();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn();
  const ms = hrMs(Number(process.hrtime.bigint() - t0));
  const msPerOp = ms / iters;
  const ops = 1000 / msPerOp;
  return {
    name,
    iters,
    totalMs: ms,
    msPerOp,
    opsPerSec: ops,
    bytes: opt.bytes,
    mbPerSec:
      opt.bytes != null && msPerOp > 0
        ? (opt.bytes / 1e6) / (msPerOp / 1000)
        : undefined,
  };
}

/**
 * @param {string} name
 * @param {() => Promise<void>} fn
 * @param {{ iters?: number, warmup?: number, bytes?: number }} [opt]
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

  const bangWire = `>
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

  console.log("XAIOP Node.js SDK stage timing");
  console.log(
    "(Not LLM PERF-METRICS — see docs/performance.md for model evaluation.)\n",
  );
  console.log(
    `Node ${process.version}  iters=${ITERS}  warmup=${WARMUP}${quick ? "  (--quick)" : ""}`,
  );
  console.log(
    `fixture wire: none=${wireNone.length}B  phased=${wirePhased.length}B  dense=${wireDense.length}B\n`,
  );

  /** @type {ReturnType<typeof bench>[]} */
  const rows = [];

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

  rows.push(
    bench(
      "checkpoint/streamOn/phased",
      () => {
        const eng = new DotCheckpointEngine({
          compat: false,
          streamProcessing: true,
          onChunk: () => {},
        });
        eng.push(wirePhased);
        eng.finish();
      },
      { bytes: wirePhased.length },
    ),
  );
  rows.push(
    bench(
      "checkpoint/streamOff/phased",
      () => {
        const eng = new DotCheckpointEngine({
          compat: false,
          streamProcessing: false,
          onChunk: () => {},
        });
        eng.push(wirePhased);
        eng.finish();
      },
      { bytes: wirePhased.length },
    ),
  );
  rows.push(
    bench(
      "checkpoint/streamOn/dense",
      () => {
        const eng = new DotCheckpointEngine({
          compat: false,
          streamProcessing: true,
          onChunk: () => {},
        });
        eng.push(wireDense);
        eng.finish();
      },
      { bytes: wireDense.length },
    ),
  );
  rows.push(
    bench(
      "checkpoint/streamOn/bang+eq",
      () => {
        const eng = new DotCheckpointEngine({
          compat: false,
          streamProcessing: true,
          onChunk: () => {},
        });
        eng.push(bangWire);
        eng.finish();
      },
      { bytes: bangWire.length },
    ),
  );

  rows.push(
    bench("engine/uploadJsonSync+getSync", () => {
      const e = new XaiopEngine();
      const id = e.uploadJsonSync(fixture);
      e.getSync(id);
    }),
  );

  printTable(rows);

  console.log("\n— async stream stages —\n");
  /** @type {Awaited<ReturnType<typeof benchAsync>>[]} */
  const asyncRows = [];

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
      { bytes: wirePhased.length, iters: Math.max(10, Math.floor(ITERS / 3)) },
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
      { bytes: wirePhased.length, iters: Math.max(10, Math.floor(ITERS / 3)) },
    ),
  );

  asyncRows.push(
    await benchAsync(
      "stream.send/chunked/bang+eq",
      async () => {
        const stream = new XaiopStream("raw://bench", {
          modes: [STREAM_MODES.PROMISE],
        });
        const mid = Math.floor(bangWire.length / 2);
        await stream.send({
          transport: TRANSPORT_KIND.RAW,
          source: (async function* () {
            yield bangWire.slice(0, mid);
            yield bangWire.slice(mid);
          })(),
        });
      },
      { bytes: bangWire.length, iters: Math.max(10, Math.floor(ITERS / 3)) },
    ),
  );

  printTable(asyncRows);

  // Correctness smoke — one pass each stage result equals parseSync
  const eng = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    onChunk: () => {},
  });
  eng.push(wirePhased);
  eng.finish();
  const expected = parseSync(wirePhased);
  const same =
    JSON.stringify(eng.committedSnapshot) === JSON.stringify(expected);
  console.log(
    `\ncorrectness smoke (checkpoint vs parseSync): ${same ? "OK" : "FAIL"}`,
  );
  if (!same) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
