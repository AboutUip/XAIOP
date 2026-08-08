#!/usr/bin/env node
/**
 * Fair JSON gate: same logical tree → Node JSON.parse vs Go xaiop.Parse / encoding/json.
 *
 * Usage (from xaiop-sdk/timing):
 *   node go/json_gate.mjs
 *   node go/json_gate.mjs --quick
 *   npm run bench:go:json-gate
 *
 * Primary gate: Go Parse / Node JSON.parse ≤ 1.2
 * Secondary: Go Parse / encoding/json (reported)
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const __dir = dirname(fileURLToPath(import.meta.url));
const TIMING = join(__dir, "..");
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

const fixture = buildFixture(depth, breadth);
const jsonText = JSON.stringify(fixture);

for (let i = 0; i < warmup; i++) JSON.parse(jsonText);
let nodeNs = Infinity;
for (let round = 0; round < 3; round++) {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) JSON.parse(jsonText);
  const ns = ((performance.now() - t0) / iters) * 1e6;
  if (ns < nodeNs) nodeNs = ns;
}

const goArgs = ["run", "./jsongate", `-iters=${iters}`, `-warmup=${warmup}`];
if (quick) goArgs.push("-quick");
const r = spawnSync("go", goArgs, {
  cwd: join(TIMING, "go"),
  encoding: "utf8",
  env: process.env,
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status ?? 1);
}
const go = JSON.parse(r.stdout.trim().split(/\r?\n/).filter(Boolean).pop());

const ratioNode = go.goParseNsPerOp / nodeNs;
const ratioGoJSON = go.goParseNsPerOp / go.goJsonNsPerOp;
const report = {
  quick,
  depth,
  breadth,
  iters,
  warmup,
  nodeJsonNsPerOp: nodeNs,
  goJsonNsPerOp: go.goJsonNsPerOp,
  goParseNsPerOp: go.goParseNsPerOp,
  ratioParseOverNodeJSON: ratioNode,
  ratioParseOverGoJSON: ratioGoJSON,
	primaryGatePass: ratioNode <= 1.2,
  secondaryGatePass: ratioGoJSON <= 1.2,
  goJsonOverNodeJSON: go.goJsonNsPerOp / nodeNs,
  jsonBytes: go.jsonBytes,
  wireBytes: go.wireBytes,
  sdk: go.sdk,
};

const outPath = join(__dir, "last-json-gate.json");
writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

console.log("XAIOP Go Parse ↔ JSON gate");
console.log(`  fixture depth=${depth} breadth=${breadth} iters=${iters}`);
console.log(`  Node JSON.parse     ${(nodeNs / 1e6).toFixed(4)} ms/op`);
console.log(`  Go encoding/json    ${(go.goJsonNsPerOp / 1e6).toFixed(4)} ms/op`);
console.log(`  Go xaiop.Parse      ${(go.goParseNsPerOp / 1e6).toFixed(4)} ms/op`);
console.log(
  `  Parse / NodeJSON    ${ratioNode.toFixed(3)}×  (primary ≤ 1.2)  ${report.primaryGatePass ? "PASS" : "FAIL"}`,
);
console.log(
  `  Parse / GoJSON      ${ratioGoJSON.toFixed(3)}×  (secondary ≤ 1.2)  ${report.secondaryGatePass ? "PASS" : "FAIL"}`,
);
if (report.goJsonOverNodeJSON > 1.2) {
  console.log(
    `  note: Go encoding/json is ${report.goJsonOverNodeJSON.toFixed(2)}× Node JSON.parse (V8/runtime floor for map[string]any)`,
  );
}
console.log(`  wrote ${outPath}`);

if (!report.primaryGatePass && process.env.BENCH_FAIL_GATE === "1") {
  process.exit(2);
}
