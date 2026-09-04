import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { encodeJsonText, encodeValue, parseJsonInput } = require(
  join(root, "src", "encode.js"),
);
const { lintText } = require(join(root, "src", "lint.js"));

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

{
  const parsed = parseJsonInput('{"x":1,"ok":true}');
  if (!parsed.ok) fail("parse object");
}

{
  const parsed = parseJsonInput(`{
    // comment
    "x": 1
  }`);
  if (!parsed.ok) fail(`jsonc ${parsed.message}`);
  if (parsed.value?.x !== 1) fail("jsonc value");
}

{
  const parsed = parseJsonInput("1");
  if (!parsed.ok) fail("scalar json parses");
  const enc = encodeJsonText("1");
  if (enc.ok) fail("bare scalar must not encode as a document");
}

{
  const enc = encodeJsonText('{"x":1,"n":null}');
  if (!enc.ok) fail(`encode object ${enc.message}`);
  const lint = lintText(enc.wire);
  if (!lint.ok) fail(`roundtrip lint ${lint.diagnostics[0]?.message}`);
  if (lint.fragment) fail("encoded object should be a document");
  if (lint.json !== '{"x":1,"n":null}') fail(`roundtrip json ${lint.json}`);
}

{
  const enc = encodeJsonText("[1,true,\"a\"]");
  if (!enc.ok) fail(`encode array ${enc.message}`);
  const lint = lintText(enc.wire);
  if (!lint.ok) fail(`array lint ${lint.diagnostics[0]?.message}`);
  if (lint.json !== '[1,true,"a"]') fail(`array json ${lint.json}`);
}

{
  const enc = encodeValue({ a: { b: 2 } });
  if (!enc.ok) fail(enc.message);
  if (!enc.wire.startsWith(">")) fail("relative object opens with >");
  if (enc.wire.split("\n").includes(">>b")) fail("must not stack enter");
}

{
  const nested = encodeJsonText('{"meta":{"name":"x"},"tags":["a","b"]}');
  if (!nested.ok) fail(nested.message);
  const lint = lintText(nested.wire);
  if (!lint.ok) fail(`nested lint ${lint.diagnostics[0]?.message}\n${nested.wire}`);
  const got = JSON.parse(lint.json);
  if (got.meta?.name !== "x" || got.tags?.[1] !== "b") {
    fail(`nested value ${lint.json}`);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("ok  encode JSON → XAIOP roundtrip");
