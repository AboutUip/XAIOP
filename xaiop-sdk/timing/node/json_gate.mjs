#!/usr/bin/env node
/**
 * Fair JSON gate: same logical tree — Node xaiop.parseSync vs JSON.parse (same process).
 *
 * Usage (from xaiop-sdk/timing):
 *   node node/json_gate.mjs
 *   node node/json_gate.mjs --quick
 *   npm run bench:node:json-gate
 *
 * Primary gate: parseSync / JSON.parse ≤ 1.2 (same V8, same tree shape).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";

const __dir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dir, "package.json"));
const { encodeSync, parseSync, SDK_VERSION } = require("xaiop");

const quick = process.argv.includes("--quick");
const depth = quick ? 2 : 3;
const breadth = quick ? 5 : 8;
const iters = Number(process.env.BENCH_ITERS) || (quick ? 200 : 400);
const warmup = Number(process.env.BENCH_WARMUP) || (quick ? 20 : 40);

function buildFixture(d, br) {
  function nest(level) {
    const o = {};
    for (let i = 0; i < br; i++) {
      const k = `k${i}`;
      if (level <= 0) {
        o[k] = i % 3 === 0 ? `v-${i}` : i % 3 === 1 ? i * 17 : i % 2 === 0;
      } else {
        o[k] = nest(level - 1);
      }
    }
    o.arr = Array.from({ length: br }, (_, j) => ({ id: j, tag: `t${j}` }));
    return o;
  }
  return { doc: nest(d), meta: { title: "sdk-timing", n: br * d } };
}

function bestOf(rounds, n, fn) {
  let best = Infinity;
  for (let r = 0; r < rounds; r++) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn();
    const ns = ((performance.now() - t0) / n) * 1e6;
    if (ns < best) best = ns;
  }
  return best;
}

const fixture = buildFixture(depth, breadth);
const jsonText = JSON.stringify(fixture);
const wire = encodeSync(fixture, { dotPolicy: "none" });

for (let i = 0; i < warmup; i++) {
  JSON.parse(jsonText);
  parseSync(wire);
}

const nodeJsonNs = bestOf(3, iters, () => JSON.parse(jsonText));
const nodeParseNs = bestOf(3, iters, () => parseSync(wire));

const ratio = nodeParseNs / nodeJsonNs;
const report = {
  quick,
  depth,
  breadth,
  iters,
  warmup,
  nodeJsonNsPerOp: nodeJsonNs,
  nodeParseNsPerOp: nodeParseNs,
  ratioParseOverNodeJSON: ratio,
  primaryGatePass: ratio <= 1.2,
  jsonBytes: Buffer.byteLength(jsonText),
  wireBytes: Buffer.byteLength(wire),
  sdk: SDK_VERSION,
};

const outPath = join(__dir, "last-json-gate.json");
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

console.log("XAIOP Node Parse <-> JSON gate");
console.log(`  fixture depth=${depth} breadth=${breadth} iters=${iters}`);
console.log(`  JSON.parse          ${(nodeJsonNs / 1e6).toFixed(4)} ms/op`);
console.log(`  xaiop.parseSync     ${(nodeParseNs / 1e6).toFixed(4)} ms/op`);
console.log(
  `  Parse / JSON.parse  ${ratio.toFixed(3)}x  (primary <= 1.2)  ${report.primaryGatePass ? "PASS" : "FAIL"}`,
);
console.log(`  wrote ${outPath}`);

if (!report.primaryGatePass && process.env.BENCH_FAIL_GATE === "1") {
  process.exit(2);
}
