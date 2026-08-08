#!/usr/bin/env node
/**
 * Dump Node golden NDJSON for XAIOP encode / parse / stream cases.
 * Imports from ../../nodejs/dist after ensuring tsc build.
 *
 * Usage:
 *   node dump-goldens.mjs              # stdout (UTF-8)
 *   node dump-goldens.mjs --out path   # write UTF-8 file
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFORMANCE_ROOT = join(__dirname, "..");
const NODE_SDK = join(CONFORMANCE_ROOT, "..", "nodejs");
const FIXTURES = join(CONFORMANCE_ROOT, "fixtures");
const DIST_INDEX = join(NODE_SDK, "dist", "index.js");

function parseOutPath(argv) {
  const i = argv.indexOf("--out");
  if (i >= 0) return argv[i + 1] ?? join(CONFORMANCE_ROOT, "out", "node.ndjson");
  const eq = argv.find((a) => a.startsWith("--out="));
  if (eq) return eq.slice(6);
  return null;
}

function ensureBuild() {
  if (existsSync(DIST_INDEX)) return;
  const r = spawnSync("npm", ["run", "build:ts"], {
    cwd: NODE_SDK,
    stdio: ["ignore", "inherit", "inherit"],
    shell: true,
  });
  if (r.status !== 0) {
    console.error("failed to build nodejs SDK (npm run build:ts)");
    process.exit(r.status ?? 1);
  }
}

ensureBuild();

const {
  DotCheckpointEngine,
  encodeSync,
  materializeSnapshot,
  parseSync,
} = await import(pathToFileURL(DIST_INDEX).href);

const lines = [];

function emit(record) {
  lines.push(JSON.stringify(record));
}

function dumpEncode() {
  const corpus = JSON.parse(
    readFileSync(join(FIXTURES, "encode-corpus.json"), "utf8"),
  );
  corpus.forEach((value, i) => {
    emit({ case: `encode:${i}`, kind: "encode", wire: encodeSync(value) });
  });
}

function dumpParse() {
  for (const name of [
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
  ]) {
    const wire = readFileSync(join(FIXTURES, `${name}.xaiop`), "utf8");
    const tree = materializeSnapshot(parseSync(wire));
    emit({ case: `parse:${name}`, kind: "parse", tree });
  }
}

function dumpStream(name) {
  const wire = readFileSync(join(FIXTURES, `${name}.xaiop`), "utf8");
  const diffs = [];
  const engine = new DotCheckpointEngine({
    onChunk: (d) => diffs.push(d),
    mergeChunkWindow: false,
  });
  engine.push(wire);
  engine.finish();
  const caseName =
    name === "stream-phases"
      ? "phases"
      : name;
  emit({
    case: `stream:${caseName}`,
    kind: "stream",
    diffs,
    snapshot: engine.snapshot ?? null,
  });
}

dumpEncode();
dumpParse();
for (const name of [
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
]) {
  dumpStream(name);
}

const body = lines.join("\n") + "\n";
const outPath = parseOutPath(process.argv);
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, body, "utf8");
} else {
  process.stdout.write(body);
}
