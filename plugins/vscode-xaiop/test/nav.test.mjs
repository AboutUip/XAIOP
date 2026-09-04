import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { analyzeStructure } = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "structure.js"),
);
const {
  pathAtLine,
  collectPaths,
  occurrencesOf,
  nameAt,
  isLegalLabel,
  selectionSpans,
} = require(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "nav.js"));

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

function eq(got, expected, label) {
  if (got !== expected) fail(`${label}: ${JSON.stringify(got)} !== ${JSON.stringify(expected)}`);
}

const src = ">\n>meta\nname:demo\n>author\nrole:x\n<\n<\n=meta>author\n";
const lines = src.replace(/\n$/, "").split("\n");
const { symbols } = analyzeStructure(lines);

eq(pathAtLine(symbols, 4).join(">"), "{}>meta>author", "path at role");
if (!collectPaths(symbols).includes("meta>author")) {
  fail(`paths ${JSON.stringify(collectPaths(symbols))}`);
}

const defs = occurrencesOf(lines, "author").filter((o) => o.definition);
if (!defs.length) fail("author definition missing");
const refs = occurrencesOf(lines, "author");
if (refs.length < 2) fail(`author refs ${refs.length}`);

const at = nameAt("=meta>author", 6);
eq(at?.name, "author", "nameAt author");

if (!isLegalLabel("pasteAs.preferences")) fail("dots are legal");
if (isLegalLabel("a b") || isLegalLabel("a:b") || isLegalLabel("")) {
  fail("illegal labels accepted");
}

const spans = selectionSpans(lines, 4, 0, symbols);
if (spans.length < 2) fail("selection spans");
if (spans[spans.length - 1].startLine !== 0) fail("outer span is root");

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("ok  nav / path / occurrences");
