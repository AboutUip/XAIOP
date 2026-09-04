import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  classifyLine,
  typeValue,
  tokenAt,
} = require(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "classify.js"));
const { hoverMarkdown } = require(join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "hover.js",
));

let failed = 0;

function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

function eq(got, expected, label) {
  if (got !== expected) fail(`${label}: ${JSON.stringify(got)} !== ${JSON.stringify(expected)}`);
}

/** @type {[string, string, boolean?][]} */
const TYPE_CASES = [
  ["1", "int"],
  ["+2", "int"],
  ["-3", "int"],
  ["01", "int"],
  ["1.5", "float"],
  [".5", "float"],
  ["5.", "float"],
  ["1e3", "float"],
  ["-2.5E-2", "float"],
  ["true", "bool"],
  ["false", "bool"],
  ["null", "null"],
  ["True", "string"],
  ["alice", "string"],
  ["NaN", "string"],
  ["Infinity", "string"],
  [" 1", "string", true],
  [" true", "string", true],
  ["line1\\nline2", "string"],
  ["", "string"],
];

for (const [wire, type, forced] of TYPE_CASES) {
  const got = typeValue(wire);
  eq(got.type, type, `type(${JSON.stringify(wire)})`);
  if (forced) {
    if (!got.forced) fail(`type(${JSON.stringify(wire)}) expected forced-string`);
  } else if (got.forced) {
    fail(`type(${JSON.stringify(wire)}) unexpectedly forced`);
  }
}

const bad = typeValue("a\\q");
eq(bad.type, "error", "unknown escape");

const trail = typeValue("ab\\");
eq(trail.type, "error", "trailing backslash");

eq(typeValue("line1\\nline2").value, "line1\nline2", "unescape \\n");
eq(typeValue("C:\\\\tmp").value, "C:\\tmp", "unescape \\\\");
eq(typeValue("true").value, true, "bool true");
eq(typeValue(" 1").value, "1", "forced int-looking");

eq(classifyLine(">").kind, "object_anon", ">");
eq(classifyLine(">meta").kind, "object_named", ">meta");
eq(classifyLine(">tags-").kind, "array_named", ">tags-");
eq(classifyLine(">>x").invalid, "stacked-enter", ">>x");
eq(classifyLine("data").invalid, "bare-label", "bare");
eq(classifyLine("").invalid, "empty", "empty");

function roleAt(line, col) {
  return tokenAt(line, col)?.role ?? null;
}

eq(roleAt(">", 0), "operator", "> @0");
eq(roleAt(">meta", 0), "operator", ">meta >");
eq(roleAt(">meta", 1), "path-segment", ">meta name");
eq(roleAt(">tags-", 0), "operator", ">tags- >");
eq(roleAt(">tags-", 1), "path-segment", ">tags- name");
eq(roleAt(">tags-", 5), "array-postfix", ">tags- -");
eq(roleAt("version:1", 0), "content-key", "key");
eq(roleAt("version:1", 7), "content-colon", "colon");
eq(roleAt("version:1", 8), "content-value", "int value");
eq(roleAt("count: 2", 6), "forced-string-mark", "forced spaces");
eq(roleAt("count: 2", 7), "content-value", "forced value");
eq(roleAt(":alpha", 0), "content-colon", "anon colon");
eq(roleAt(":alpha", 1), "content-value", "anon value");
eq(roleAt("=a>b", 0), "operator", "locate");
eq(roleAt("=a>b", 2), "path-separator", "path >");
eq(roleAt("?2", 1), "select-index", "?2");
eq(roleAt("?01", 1), "select-index", "?01");
eq(roleAt("?*", 1), "select-wildcard", "?*");
eq(roleAt("?id:A2", 4), "content-value", "select pred value");
eq(roleAt(".", 0), "operator", "phase");
eq(roleAt("&", 0), "operator", "bare &");
eq(roleAt("# note", 0), "operator", "#");
eq(roleAt("# note", 2), "annotation-body", "annotation body");

const intHover = hoverMarkdown(tokenAt("version:1", 8), "en");
if (!intHover?.includes("**int**")) fail("int hover missing type");

const forcedHover = hoverMarkdown(tokenAt("count: 2", 7), "zh-cn");
if (!forcedHover?.includes("string") || !forcedHover.includes("forced-string")) {
  fail("forced-string hover");
}

const gt = hoverMarkdown(tokenAt(">", 0), "zh-cn");
if (!gt?.includes("匿名对象")) fail("anon object hover zh");

const named = hoverMarkdown(tokenAt(">meta", 0), "en");
if (!named?.includes("`>name`")) fail("named object hover");

const phase = hoverMarkdown(tokenAt(".", 0), "en");
if (!phase?.includes("reset")) fail("phase hover");

const illegalIdx = hoverMarkdown(tokenAt("?01", 1), "en");
if (!illegalIdx?.toLowerCase().includes("illegal")) fail("?01 illegal hover");

const stacked = hoverMarkdown(tokenAt(">>x", 0), "en");
if (!stacked?.includes("stacking")) fail("stacked hover");

const boolH = hoverMarkdown(tokenAt("enabled:true", 8), "en");
if (!boolH?.includes("**bool**")) fail("bool hover");

const nullH = hoverMarkdown(tokenAt("empty:null", 6), "en");
if (!nullH?.includes("**null**")) fail("null hover");

const spaced = ">editor.pasteAs.preferences -";
eq(roleAt(spaced, spaced.indexOf(" ")), "label-gap", "space before -");
const gapHover = hoverMarkdown(tokenAt(spaced, spaced.indexOf(" ")), "zh-cn");
if (!gapHover?.includes(">name-") || !gapHover.includes("空格")) {
  fail("gap hover should explain glued >name-");
}
const nameHover = hoverMarkdown(tokenAt(spaced, 1), "zh-cn");
if (nameHover?.includes("这是 Label 名")) fail("invalid line should not say generic label");
if (!nameHover?.includes("editor.pasteAs.preferences-")) {
  fail("name hover should show the glued form");
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}

console.log("ok  hover / typing / token spans");
