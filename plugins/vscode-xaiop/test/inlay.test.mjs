import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { typeInlays, inlayLabel } = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "inlay.js"),
);
const { typeValue } = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "classify.js"),
);

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

if (inlayLabel(typeValue("1"), false) !== "int") fail("int inlay");
if (inlayLabel(typeValue("true"), false) !== "bool") fail("bool inlay");
if (inlayLabel(typeValue("alice"), false) != null) fail("plain string omitted");
if (inlayLabel(typeValue(" 1"), false) !== "forced-string") fail("forced inlay");

const lines = [">", "n:1", "name:alice", "flag:true", "?id:1"];
const hints = typeInlays(lines, 0, lines.length - 1, false);
const labels = hints.map((h) => `${h.line}:${h.label}`);
if (!labels.includes("1:int")) fail(`missing int ${JSON.stringify(labels)}`);
if (!labels.includes("3:bool")) fail("missing bool");
if (labels.some((x) => x.startsWith("2:"))) fail("alice should have no inlay");
if (!labels.includes("4:int")) fail("select predicate int");

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("ok  inlay types");
