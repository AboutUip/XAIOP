#!/usr/bin/env node
/**
 * Mutation fuzz for Node parseSync + DotCheckpointEngine.
 * XaiopSyntaxError is expected; other Errors fail the harness.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFORMANCE_ROOT = join(__dirname, "..");
const NODE_SDK = join(CONFORMANCE_ROOT, "..", "nodejs");
const SEEDS = join(__dirname, "seeds");
const DIST_INDEX = join(NODE_SDK, "dist", "index.js");

function parseArgs(argv) {
  let max = 200;
  let seed = Date.now() >>> 0;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--max=")) max = Math.max(1, Number(a.slice(6)) | 0);
    else if (a === "--max") max = Math.max(1, Number(argv[++i]) | 0);
    else if (a.startsWith("--seed=")) seed = Number(a.slice(7)) >>> 0;
    else if (a === "--seed") seed = Number(argv[++i]) >>> 0;
  }
  return { max, seed };
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INSERT_LINES = [">", "a:1", ".", "&x", "#note", "@a", "!a", "<", "-", ":item", "=a"];

function mutate(text, rnd) {
  const op = (rnd() * 4) | 0;
  if (op === 0 && text.length > 0) {
    // flip char
    const i = (rnd() * text.length) | 0;
    const code = 32 + ((rnd() * 95) | 0);
    return text.slice(0, i) + String.fromCharCode(code) + text.slice(i + 1);
  }
  if (op === 1) {
    // insert line
    const line = INSERT_LINES[(rnd() * INSERT_LINES.length) | 0];
    const lines = text.split(/\n/);
    const at = (rnd() * (lines.length + 1)) | 0;
    lines.splice(at, 0, line);
    return lines.join("\n");
  }
  if (op === 2 && text.length > 0) {
    // truncate
    const cut = (rnd() * text.length) | 0;
    return text.slice(0, cut);
  }
  // duplicate a line
  const lines = text.split(/\n/);
  if (lines.length === 0) return text + "\n>";
  const i = (rnd() * lines.length) | 0;
  lines.splice(i, 0, lines[i]);
  return lines.join("\n");
}

function ensureBuild() {
  if (existsSync(DIST_INDEX)) return;
  const r = spawnSync("npm", ["run", "build:ts"], {
    cwd: NODE_SDK,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

ensureBuild();
const { DotCheckpointEngine, parseSync, XaiopSyntaxError } = await import(
  pathToFileURL(DIST_INDEX).href
);

const { max, seed } = parseArgs(process.argv);
const rnd = mulberry32(seed);
const seeds = readdirSync(SEEDS)
  .filter((f) => f.endsWith(".xaiop"))
  .map((f) => readFileSync(join(SEEDS, f), "utf8"));

if (!seeds.length) {
  console.error("no seeds in", SEEDS);
  process.exit(1);
}

let syntax = 0;
let ok = 0;
const deadline = Date.now() + 30_000; // hard time budget 30s

for (let i = 0; i < max; i++) {
  if (Date.now() > deadline) {
    console.error(`fuzz-node: time budget hit after ${i} iterations`);
    break;
  }
  let text = seeds[(rnd() * seeds.length) | 0];
  const muts = 1 + ((rnd() * 4) | 0);
  for (let m = 0; m < muts; m++) text = mutate(text, rnd);

  try {
    parseSync(text);
    ok++;
  } catch (e) {
    if (e instanceof XaiopSyntaxError || e?.name === "XaiopSyntaxError") {
      syntax++;
    } else {
      console.error(`fuzz-node: unexpected parse error at iter ${i}:`, e);
      process.exit(1);
    }
  }

  try {
    const diffs = [];
    const engine = new DotCheckpointEngine({
      onChunk: (d) => diffs.push(d),
      mergeChunkWindow: false,
    });
    engine.push(text);
    engine.finish();
  } catch (e) {
    if (e instanceof XaiopSyntaxError || e?.name === "XaiopSyntaxError") {
      syntax++;
    } else {
      console.error(`fuzz-node: unexpected stream error at iter ${i}:`, e);
      process.exit(1);
    }
  }
}

console.log(
  `fuzz-node OK seed=${seed} max=${max} parseOk≈${ok} syntaxErrors≈${syntax}`,
);
