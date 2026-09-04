import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const { analyzeStructure } = require(join(dir, "structure.js"));
const {
  jsonPathAtLine,
  formatJsonPath,
  getAtPath,
  locateInPretty,
  buildInspectView,
} = require(join(dir, "inspect.js"));

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

function eq(got, expected, label) {
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    fail(`${label}: ${JSON.stringify(got)} !== ${JSON.stringify(expected)}`);
  }
}

const src = [
  ">",
  ">users-",
  ">",
  "id:1",
  "name:alice",
  "<",
  ">",
  "id:2",
  "name:bob",
  "<",
].join("\n");
const lines = src.split("\n");
const { symbols } = analyzeStructure(lines);
const value = {
  users: [
    { id: 1, name: "alice" },
    { id: 2, name: "bob" },
  ],
};

eq(jsonPathAtLine(lines, symbols, 4), ["users", 0, "name"], "alice path");
eq(jsonPathAtLine(lines, symbols, 8), ["users", 1, "name"], "bob path");
eq(getAtPath(value, ["users", 0, "name"]), "alice", "get alice");
eq(formatJsonPath(["users", 0, "name"]), "$.users[0].name", "format");

const pretty = JSON.stringify(value, null, 2);
const span = locateInPretty(pretty, ["users", 0, "name"]);
if (!span) fail("locate missing");
else if (pretty.slice(span.start, span.end) !== '"alice"') {
  fail(`highlight ${JSON.stringify(pretty.slice(span.start, span.end))}`);
}

const view = buildInspectView({
  value,
  pretty,
  path: ["users", 1, "id"],
  zh: false,
});
if (view.pathLabel !== "$.users[1].id") fail(`view path ${view.pathLabel}`);
if (view.focusPretty !== "2") fail(`focus ${view.focusPretty}`);
if (view.status !== "ok") fail("status");

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("ok  live inspect path / highlight");
