import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const extRoot = join(root, "..");
const repoRoot = join(extRoot, "..", "..");
const grammarPath = join(extRoot, "syntaxes", "xaiop.tmLanguage.json");
const injectionPath = join(
  extRoot,
  "syntaxes",
  "xaiop.markdown.injection.json",
);

const grammar = JSON.parse(readFileSync(grammarPath, "utf8"));
JSON.parse(readFileSync(injectionPath, "utf8"));

/** @type {[string, string][]} */
const CASES = [
  ["", "empty-line"],
  [" leading", "leading-whitespace"],
  ["\tindented", "leading-whitespace"],
  [">>x", "stacked-enter"],
  ["#!control", "annotation-control"],
  ["# note", "annotation"],
  ["#", "annotation"],
  [".", "phase"],
  ["<", "pop"],
  ["<name", "pop-enter"],
  ["<a>b", "pop-enter"],
  ["=a", "locate"],
  ["=a>b", "locate"],
  ["@users", "exact"],
  ["@a>b", "exact"],
  ["!t", "broadcast"],
  ["!a>b", "broadcast"],
  ["&", "delete"],
  ["&a", "delete"],
  ["&a>b", "delete"],
  ["?0", "select"],
  ["?2", "select"],
  ["?*", "select"],
  ["?id:1", "select"],
  ["?*status:pending", "select"],
  [">", "object-anon"],
  ["-", "array-anon"],
  [">tags-", "array-named"],
  [">a>b-", "array-named"],
  [">meta", "object-named"],
  [">a>b", "object-named"],
  [">-", "object-named"],
  ["count: 2", "content-forced-string"],
  ["flag: true", "content-forced-string"],
  ["name:alice", "content-typed"],
  [":alpha", "content-typed"],
  ["enabled:true", "content-typed"],
  ["empty:null", "content-typed"],
  ["ratio:1.5", "content-typed"],
  ["exp:1e3", "content-typed"],
  ["version:1", "content-typed"],
  ["note:line1\\nline2", "content-typed"],
  ["data", "bare-label"],
];

const INVALID = new Set([
  "empty-line",
  "leading-whitespace",
  "stacked-enter",
  "bare-label",
]);

let failed = 0;

function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

function classify(line) {
  for (const p of grammar.patterns) {
    if (!p.include?.startsWith("#")) {
      fail(`top-level pattern is not an include: ${JSON.stringify(p)}`);
      return null;
    }
    const key = p.include.slice(1);
    const rule = grammar.repository[key];
    if (!rule) {
      fail(`missing repository.${key}`);
      return null;
    }
    if (ruleMatches(rule, line)) return key;
  }
  return null;
}

function ruleMatches(rule, line) {
  const src = rule.match ?? rule.begin;
  if (src == null) {
    throw new Error(`repository rule has neither match nor begin`);
  }
  return new RegExp(src).test(line);
}

function* walkXaiop(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* walkXaiop(p);
    else if (ent.name.endsWith(".xaiop")) yield p;
  }
}

if (grammar.scopeName !== "source.xaiop") {
  fail(`scopeName: ${grammar.scopeName}`);
}

if (!Array.isArray(grammar.patterns) || grammar.patterns.length === 0) {
  fail("grammar.patterns is empty");
}

for (const [line, expected] of CASES) {
  const got = classify(line);
  if (got !== expected) {
    fail(`line ${JSON.stringify(line)} → ${got} (expected ${expected})`);
  }
}

const skip = new Set([join(extRoot, "examples", "highlight.xaiop")]);
const fixtureRoots = [
  join(repoRoot, "docs", "examples"),
  join(repoRoot, "xaiop-sdk", "conformance"),
];

for (const dir of fixtureRoots) {
  for (const file of walkXaiop(dir)) {
    if (skip.has(file)) continue;
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const kind = classify(line);
      if (!kind) {
        fail(`${file}:${i + 1} unmatched ${JSON.stringify(line)}`);
        continue;
      }
      if (INVALID.has(kind)) {
        fail(`${file}:${i + 1} ${kind} ${JSON.stringify(line)}`);
      }
    }
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}

console.log(`ok  ${CASES.length} cases · fixtures classified as legal wire lines`);
