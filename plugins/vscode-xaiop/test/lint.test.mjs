import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { lintText } = require(join(root, "src", "lint.js"));

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

const okDoc = lintText(">\nx:1\n");
if (!okDoc.ok) fail("object document should parse");
if (okDoc.fragment) fail(">\nx:1 should not be a fragment");
if (okDoc.json !== '{"x":1}') fail(`json ${okDoc.json}`);
if (okDoc.diagnostics.length) fail("clean document should have no diagnostics");

const arr = lintText("-\n:a\n:b\n");
if (arr.json !== '["a","b"]') fail(`array json ${arr.json}`);

const frag = lintText(">a\n");
if (frag.ok === false) fail("fragment is valid wire");
if (!frag.fragment) fail("expected fragment");
if (!frag.diagnostics.some((d) => d.code === "xaiop.fragment")) {
  fail("fragment warning missing");
}
if (frag.json !== '{"a":{}}') fail(`fragment entries ${frag.json}`);
if (frag.diagnostics[0]?.edit?.insertAtStart !== ">\n") {
  fail("fragment wrap edit missing");
}

const off = lintText(">a\n", { fragmentSeverity: "off" });
if (off.diagnostics.length) fail("fragmentSeverity off");

const bare = lintText("data\n");
if (bare.ok) fail("bare label should fail");
if (bare.diagnostics[0]?.code !== "xaiop.syntax") fail("bare label code");
if (bare.diagnostics[0]?.line !== 1) fail("bare label line");

const emptyLine = lintText(">\nx:1\n\ny:2\n");
if (emptyLine.ok) fail("empty line should fail");
if (emptyLine.diagnostics[0]?.line !== 3) fail("empty line number");
if (!/empty line/i.test(emptyLine.diagnostics[0]?.message ?? "")) {
  fail("empty line message");
}

const stacked = lintText(">\n>>x\n");
if (stacked.ok) fail("stacked enter should fail");

const popRoot = lintText(">\n<\n");
if (popRoot.ok) fail("< at root should fail");

const empty = lintText("");
if (!empty.ok || empty.json !== "{}") fail("empty wire → {}");

const fixture = readFileSync(
  join(root, "..", "..", "docs", "examples", "complex.xaiop"),
  "utf8",
);
const expected = JSON.parse(
  readFileSync(
    join(root, "..", "..", "docs", "examples", "complex.expected.json"),
    "utf8",
  ),
);
const complex = lintText(fixture);
if (!complex.ok) fail(`complex fixture: ${complex.diagnostics[0]?.message}`);
if (JSON.stringify(JSON.parse(complex.json)) !== JSON.stringify(expected)) {
  fail("complex fixture JSON mismatch");
}

const zh = lintText(">a\n", { zh: true });
if (!zh.diagnostics[0]?.message.includes("根片段")) fail("zh fragment message");

const spaced = ">editor.pasteAs.preferences -";
const spacedLint = lintText(`>\n${spaced}\n`, { zh: true });
if (spacedLint.ok) fail("spaced >name- should fail");
const d = spacedLint.diagnostics[0];
if (!d?.message.includes(">name-")) fail(`spaced message: ${d?.message}`);
if (!d?.message.includes("editor.pasteAs.preferences-")) {
  fail("spaced message should suggest glued form");
}
if (d.startColumn == null || d.endColumn == null) fail("spaced range missing");
if (spaced[d.startColumn] !== " ") fail("range should cover the space");
if (d.edit?.newText !== ">editor.pasteAs.preferences-") {
  fail(`fix ${d.edit?.newText}`);
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("ok  lint / parse / JSON materialize");
