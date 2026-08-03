import assert from "node:assert/strict";
import test from "node:test";
import {
  MERGE_CONFLICT,
  XaiopEngine,
  encodeSync,
  mergeJson,
  mergeToJson,
  mergeToXaiop,
  parseSync,
} from "../src/index.js";

test("mergeJson: non-conflicting keys union", () => {
  assert.deepEqual(mergeJson({ a: 1 }, { b: 2 }), { a: 1, b: 2 });
});

test("mergeJson: overwrite vs keep on conflicting keys", () => {
  assert.deepEqual(
    mergeJson({ a: 1, b: 2 }, { a: 9 }, MERGE_CONFLICT.OVERWRITE),
    { a: 9, b: 2 },
  );
  assert.deepEqual(
    mergeJson({ a: 1, b: 2 }, { a: 9 }, MERGE_CONFLICT.KEEP),
    { a: 1, b: 2 },
  );
});

test("mergeJson: deep recurse; only leaf conflicts", () => {
  const base = { meta: { name: "x", n: 1 }, tags: ["a"] };
  const overlay = { meta: { n: 2, extra: true }, tags: ["b"] };
  assert.deepEqual(mergeJson(base, overlay, "overwrite"), {
    meta: { name: "x", n: 2, extra: true },
    tags: ["b"],
  });
  assert.deepEqual(mergeJson(base, overlay, "keep"), {
    meta: { name: "x", n: 1, extra: true },
    tags: ["a"],
  });
});

test("mergeJson: does not mutate inputs", () => {
  const base = { a: { x: 1 } };
  const overlay = { a: { y: 2 } };
  const out = mergeJson(base, overlay);
  assert.deepEqual(out, { a: { x: 1, y: 2 } });
  assert.deepEqual(base, { a: { x: 1 } });
  assert.deepEqual(overlay, { a: { y: 2 } });
});

test("mergeToJson: JSON base + XAIOP overlay", () => {
  const wire = encodeSync({ b: 2, a: 9 }, { dotPolicy: "none" });
  assert.deepEqual(mergeToJson({ a: 1, c: 3 }, wire, { conflict: "overwrite" }), {
    a: 9,
    c: 3,
    b: 2,
  });
  assert.deepEqual(mergeToJson({ a: 1, c: 3 }, wire, { conflict: "keep" }), {
    a: 1,
    c: 3,
    b: 2,
  });
});

test("mergeToXaiop: returns wire; round-trips", () => {
  const wireIn = `>
b:2
`;
  const out = mergeToXaiop({ a: 1 }, wireIn, { conflict: "overwrite" });
  assert.equal(typeof out, "string");
  assert.deepEqual(parseSync(out), { a: 1, b: 2 });
});

test("free + static + instance mergeToJson agree", async () => {
  const base = { a: 1 };
  const wire = encodeSync({ b: 2 }, { dotPolicy: "none" });
  const engine = new XaiopEngine();
  const a = mergeToJson(base, wire);
  const b = XaiopEngine.mergeToJson(base, wire);
  const c = engine.mergeToJsonSync(base, wire);
  const d = await engine.mergeToJson(base, wire);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.deepEqual(a, d);
});

test("injectXaiop mutates store; as xaiop returns wire", () => {
  const engine = new XaiopEngine();
  const id = engine.uploadJsonSync({ a: 1, nested: { x: 1 } }, {
    dotPolicy: "none",
  });
  const wire = encodeSync({ nested: { y: 2 }, b: 3 }, { dotPolicy: "none" });
  const json = engine.injectXaiopSync(id, wire, { conflict: "overwrite" });
  assert.deepEqual(json, { a: 1, nested: { x: 1, y: 2 }, b: 3 });
  assert.deepEqual(engine.getSync(id), json);

  const wireOut = engine.injectXaiopSync(
    id,
    encodeSync({ c: 4 }, { dotPolicy: "none" }),
    { as: "xaiop", conflict: "overwrite" },
  );
  assert.equal(typeof wireOut, "string");
  assert.deepEqual(parseSync(/** @type {string} */ (wireOut)), {
    a: 1,
    nested: { x: 1, y: 2 },
    b: 3,
    c: 4,
  });
  assert.deepEqual(engine.getSync(id), parseSync(/** @type {string} */ (wireOut)));
});

test("injectJson mutates store with keep policy", () => {
  const engine = new XaiopEngine();
  const id = engine.uploadJsonSync({ a: 1, b: 2 }, { dotPolicy: "none" });
  engine.injectJsonSync(id, { a: 9, c: 3 }, { conflict: "keep" });
  assert.deepEqual(engine.getSync(id), { a: 1, b: 2, c: 3 });
});

test("inject unknown dataId throws", () => {
  const engine = new XaiopEngine();
  assert.throws(() => engine.injectJsonSync("missing", { a: 1 }), /unknown data id/);
  assert.throws(() => engine.injectXaiopSync("missing", ">\na:1\n"), /unknown data id/);
});

test("invalid conflict / as rejected", () => {
  assert.throws(() => mergeJson({ a: 1 }, { a: 2 }, /** @type {any} */ ("nope")));
  const engine = new XaiopEngine();
  const id = engine.uploadJsonSync({ a: 1 }, { dotPolicy: "none" });
  assert.throws(() =>
    engine.injectJsonSync(id, { b: 2 }, /** @type {any} */ ({ as: "xml" })),
  );
});

test("mergeToXaiop: free + static + instance agree", async () => {
  const base = { a: 1 };
  const wireIn = encodeSync({ b: 2 }, { dotPolicy: "none" });
  const engine = new XaiopEngine();
  const a = mergeToXaiop(base, wireIn);
  const b = XaiopEngine.mergeToXaiop(base, wireIn);
  const c = engine.mergeToXaiopSync(base, wireIn);
  const d = await engine.mergeToXaiop(base, wireIn);
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(a, d);
  assert.deepEqual(parseSync(a), { a: 1, b: 2 });
});

test("mergeJson: type mismatch at key is atomic conflict", () => {
  assert.deepEqual(
    mergeJson({ a: { x: 1 } }, { a: 9 }, "overwrite"),
    { a: 9 },
  );
  assert.deepEqual(
    mergeJson({ a: { x: 1 } }, { a: 9 }, "keep"),
    { a: { x: 1 } },
  );
});

test("inject into stored fragment materializes then merges", () => {
  const engine = new XaiopEngine();
  const id = engine.uploadSync("a:1\n");
  const out = engine.injectJsonSync(id, { b: 2 });
  assert.deepEqual(out, { a: 1, b: 2 });
  assert.deepEqual(engine.getSync(id), { a: 1, b: 2 });
});

test("injectJson as xaiop returns wire; mergeToJson rejects non-string", () => {
  const engine = new XaiopEngine();
  const id = engine.uploadJsonSync({ a: 1 }, { dotPolicy: "none" });
  const wire = engine.injectJsonSync(id, { b: 2 }, { as: "xaiop" });
  assert.equal(typeof wire, "string");
  assert.deepEqual(parseSync(/** @type {string} */ (wire)), { a: 1, b: 2 });
  assert.throws(
    () => mergeToJson({ a: 1 }, /** @type {any} */ ({ not: "string" })),
    TypeError,
  );
});
