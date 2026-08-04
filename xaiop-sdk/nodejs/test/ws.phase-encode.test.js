/**
 * Phase encode helpers for WS push (no network).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  encodePhaseJson,
  encodePhaseObject,
  parseSync,
  XaiopEncodeError,
} from "../dist/index.js";

test("phase-encode: non-final appends .\\n", () => {
  const wire = encodePhaseJson("modA", { x: 1 });
  assert.ok(wire.endsWith(".\n"));
  assert.equal(wire.includes(".\n."), false);
  assert.deepEqual(parseSync(wire), { modA: { x: 1 } });
});

test("phase-encode: final omits trailing .", () => {
  const wire = encodePhaseJson("modA", { x: 1 }, { final: true });
  assert.ok(!wire.trimEnd().endsWith("."));
  assert.deepEqual(parseSync(wire), { modA: { x: 1 } });
});

test("phase-encode: object multi-key single phase", () => {
  const wire = encodePhaseObject({ a: 1, b: "2" });
  assert.ok(wire.endsWith(".\n"));
  assert.deepEqual(parseSync(wire), { a: 1, b: "2" });
});

test("phase-encode: rejects empty key / non-object", () => {
  assert.throws(() => encodePhaseJson("", 1), /non-empty/);
  assert.throws(() => encodePhaseObject(null), /plain object/);
  assert.throws(() => encodePhaseObject([1]), /plain object/);
});

test("phase-encode: hardened key still rejected", () => {
  assert.throws(() => encodePhaseJson("bad-", 1), (err) => {
    assert.ok(err instanceof XaiopEncodeError);
    return true;
  });
});

test("phase-encode: concatenating phases later-wins", () => {
  const a = encodePhaseJson("s1", { n: 1 });
  const b = encodePhaseJson("s2", { n: 2 });
  const c = encodePhaseJson("s1", { n: 9 }, { final: true });
  assert.deepEqual(parseSync(a + b + c), { s1: { n: 9 }, s2: { n: 2 } });
});
