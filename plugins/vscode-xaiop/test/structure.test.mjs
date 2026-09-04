import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { analyzeStructure, symbolName } = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "structure.js"),
);

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

function eq(got, expected, label) {
  if (got !== expected) {
    fail(`${label}: ${JSON.stringify(got)} !== ${JSON.stringify(expected)}`);
  }
}

function lines(src) {
  return src.replace(/\n$/, "").split("\n");
}

{
  const src = ">\n>a\nx:1\n<\n";
  const { pairOf, folds, symbols } = analyzeStructure(lines(src));
  eq(pairOf[1], 3, "named object pairs with <");
  eq(pairOf[3], 1, "< pairs with named object");
  eq(pairOf[0], -1, "unclosed root is unmatched");
  if (!folds.some((f) => f.start === 1 && f.end === 3)) {
    fail(`missing nested fold ${JSON.stringify(folds)}`);
  }
  if (folds.some((f) => f.start === 0 && f.end === 3)) {
    fail("should not fold unmatched whole-file root");
  }
  eq(symbols[0]?.name, "{}", "root name");
  eq(symbols[0]?.children[0]?.name, "a", "child name");
  eq(symbolName(symbols[0]), "{}:1", "anonymous outline label");
}

{
  const src = ">\n>a\nx:1\n<\n<\n";
  const { pairOf, folds } = analyzeStructure(lines(src));
  eq(pairOf[0], 4, "closed root pairs");
  if (!folds.some((f) => f.start === 0 && f.end === 4)) {
    fail("closed root should fold");
  }
}

{
  const src = ">\n>meta\nname:demo\n.\n>tags-\n:a\n";
  const { symbols, pairOf } = analyzeStructure(lines(src));
  eq(symbols.length, 1, "phase reset keeps one root");
  const names = symbols[0].children.map((c) => c.name);
  if (names[0] !== "meta" || names[1] !== "tags-") {
    fail(`phase children ${JSON.stringify(names)}`);
  }
  eq(pairOf[1], -1, "meta is not paired after phase reset");
  eq(symbols[0].children[0].end, 2, "meta ends before the phase line");
  eq(symbols[0].children[1].start, 4, "tags- starts after phase");
}

{
  const src = "-\n>\nid:1\n<\n>\nid:2\n<\n";
  const { symbols, pairOf } = analyzeStructure(lines(src));
  eq(symbols[0]?.name, "[]", "array root");
  eq(symbols[0]?.children.length, 2, "two array object elements");
  eq(pairOf[1], 3, "first element pair");
  eq(pairOf[4], 6, "second element pair");
}

{
  const src = ">\n>a\n<b\nx:1\n<\n";
  const { symbols, pairOf } = analyzeStructure(lines(src));
  eq(pairOf[1], 2, ">a pairs with <b pop");
  eq(symbols[0]?.children.map((c) => c.name).join(","), "a,b", "pop-enter sibling");
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("ok  structure / outline / pairs");
