import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROTOCOL_VERSION,
  XaiopEngine,
  XaiopSyntaxError,
  parseSync,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureXaiop = path.resolve(
  here,
  "../../../docs/examples/complex.xaiop",
);
const fixtureJson = path.resolve(
  here,
  "../../../docs/examples/complex.expected.json",
);

test("protocol version", () => {
  assert.equal(PROTOCOL_VERSION, "0.1.0");
});

test("complex fixture", () => {
  const source = fs.readFileSync(fixtureXaiop, "utf8");
  const expected = JSON.parse(fs.readFileSync(fixtureJson, "utf8"));
  assert.deepEqual(parseSync(source), expected);
});

test("forced string and types", () => {
  const v = parseSync(">\nn:5\ns: 5\nflag:true\ntext:hi");
  assert.deepEqual(v, { n: 5, s: "5", flag: true, text: "hi" });
});

test("root array", () => {
  assert.deepEqual(parseSync("-\n:a\n:b"), ["a", "b"]);
});

test("no root opener", () => {
  assert.deepEqual(parseSync(">meta\nname:demo"), {
    meta: { name: "demo" },
  });
});

test("named array must be >name- (reject name: then -)", () => {
  assert.throws(
    () => parseSync(">\ntags:\n-\n:a"),
    XaiopSyntaxError,
  );
});

test("bare label rejected", () => {
  assert.throws(() => parseSync("data"), XaiopSyntaxError);
});

test("engine upload / get async + sync", async () => {
  const eng = new XaiopEngine();
  const id = await eng.upload(">\nx:1");
  assert.equal(typeof id, "string");
  assert.deepEqual(await eng.get(id), { x: 1 });

  const id2 = eng.uploadSync("-\n:a");
  assert.deepEqual(eng.getSync(id2), ["a"]);
});

test("static parse async + sync", async () => {
  assert.deepEqual(await XaiopEngine.parse(">\na:b"), { a: "b" });
  assert.deepEqual(XaiopEngine.parseSync(">\na:b"), { a: "b" });
});

test("unknown data id", () => {
  const eng = new XaiopEngine();
  assert.throws(() => eng.getSync("missing"), /unknown data id/);
});
