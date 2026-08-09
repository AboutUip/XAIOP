#!/usr/bin/env node
/**
 * Tiny Node JSON.parse wall-clock probe.
 * Usage: node node_json_probe.mjs <json-file> <iters> <warmup>
 * Prints best ns/op to stdout.
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const file = process.argv[2];
const iters = Number(process.argv[3] || 200);
const warmup = Number(process.argv[4] || 20);
if (!file) {
  console.error("usage: node node_json_probe.mjs <json-file> <iters> <warmup>");
  process.exit(1);
}

const jsonText = readFileSync(file, "utf8");
for (let i = 0; i < warmup; i++) JSON.parse(jsonText);
let best = Infinity;
for (let r = 0; r < 3; r++) {
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) JSON.parse(jsonText);
  const ns = ((performance.now() - t0) / iters) * 1e6;
  if (ns < best) best = ns;
}
process.stdout.write(String(best));
