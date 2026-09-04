import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { completionsFor } = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "complete.js"),
);

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

function labels(line, col, zh = false) {
  return completionsFor(line, col, zh).map((c) => c.label);
}

function has(arr, label) {
  if (!arr.includes(label)) fail(`missing ${label} in ${JSON.stringify(arr)}`);
}

function none(arr, label) {
  if (arr.includes(label)) fail(`unexpected ${label}`);
}

const empty = labels("", 0);
has(empty, ">");
has(empty, ">name");
has(empty, ">name-");
has(empty, "-");
has(empty, "<");
has(empty, ".");
has(empty, "=path");
has(empty, "@path");
has(empty, "#");
has(empty, "key:value");

const gt = labels(">", 1);
has(gt, ">");
has(gt, ">name");
has(gt, ">name-");
none(gt, "-");
none(gt, "<");

const named = labels(">meta", 5);
has(named, ">meta-");

const locate = completionsFor("=", 1, false, { paths: ["meta", "users"] }).map(
  (c) => c.label,
);
has(locate, "=meta");
has(locate, "=users");
has(locate, "=path");

const bare = labels("data", 4);
has(bare, ">data");
has(bare, ">data-");

const content = labels("name:alice", 10);
if (content.length) fail(`content line should not complete: ${JSON.stringify(content)}`);

const mid = labels(">", 0);
if (mid.length) fail("cursor before existing text is a suffix; skip");

const zhItem = completionsFor("", 0, true).find((c) => c.label === ">");
if (!zhItem?.detail.includes("匿名")) fail("zh catalog detail");

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("ok  completions");
