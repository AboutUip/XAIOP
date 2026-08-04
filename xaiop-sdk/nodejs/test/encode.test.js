import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DOT_POLICY,
  DotCheckpointEngine,
  PROTOCOL_VERSION,
  XaiopEncodeError,
  XaiopEngine,
  XaiopStream,
  TRANSPORT_KIND,
  encode,
  encodeSync,
  parseSync,
} from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureJson = path.resolve(
  here,
  "../../../docs/examples/complex.expected.json",
);

/** @param {unknown} value @param {import("../dist/index.js").EncodeOptions} [opt] */
function roundTrip(value, opt) {
  const wire = encodeSync(value, opt);
  return parseSync(wire);
}

/** Count standalone `.` lines in wire. */
function countDotLines(wire) {
  return wire.split(/\r?\n/).filter((l) => l === ".").length;
}

test("protocol version unchanged by encode feature", () => {
  assert.equal(PROTOCOL_VERSION, "0.6.0");
});

test("static + free encodeSync / encode agree", async () => {
  const value = { a: 1, b: "x" };
  const a = encodeSync(value, { dotPolicy: DOT_POLICY.NONE });
  const b = XaiopEngine.encodeSync(value, { dotPolicy: DOT_POLICY.NONE });
  const c = await encode(value, { dotPolicy: DOT_POLICY.NONE });
  const d = await XaiopEngine.encode(value, { dotPolicy: DOT_POLICY.NONE });
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(a, d);
});

test("instance encode mirrors static", async () => {
  const engine = new XaiopEngine();
  const value = { nested: { ok: true }, n: 2 };
  const opt = { dotPolicy: "none" };
  assert.equal(engine.encodeSync(value, opt), XaiopEngine.encodeSync(value, opt));
  assert.equal(await engine.encode(value, opt), await XaiopEngine.encode(value, opt));
});

test("uploadJson stores round-trippable JSON", async () => {
  const engine = new XaiopEngine();
  const value = { user: { id: 1, name: "ada" }, tags: ["a", "b"] };
  const id = engine.uploadJsonSync(value, { dotPolicy: "none" });
  assert.deepEqual(engine.getSync(id), value);
  const id2 = await engine.uploadJson(value, { dotPolicy: "perTopLevelKey" });
  assert.deepEqual(await engine.get(id2), value);
});

// --- scalars / typing ---

test("round-trip ints, floats, bools, strings", () => {
  const value = {
    i: 0,
    j: -7,
    f: 1.5,
    g: -2.25,
    h: 1e3,
    t: true,
    f2: false,
    s: "hello",
    empty: "",
  };
  assert.deepEqual(roundTrip(value, { dotPolicy: "none" }), value);
  assert.strictEqual(typeof roundTrip(value, { dotPolicy: "none" }).f, "number");
});

test("forced string for numeric-looking and bool-looking text", () => {
  const value = {
    a: "5",
    b: "1.5",
    c: "1e3",
    d: "true",
    e: "false",
    i: "null",
    f: "-2.5E-2",
    g: ".5",
    h: "5.",
  };
  const wire = encodeSync(value, { dotPolicy: "none" });
  assert.match(wire, /a: 5/);
  assert.match(wire, /b: 1\.5/);
  assert.match(wire, /d: true/);
  assert.match(wire, /i: null/);
  assert.deepEqual(parseSync(wire), value);
});

test("plain strings that are not typed tokens stay unforced", () => {
  const wire = encodeSync({ s: "hi", t: "1e3x", u: "NaN" }, { dotPolicy: "none" });
  assert.match(wire, /^s:hi$/m);
  assert.match(wire, /^t:1e3x$/m);
  assert.match(wire, /^u:NaN$/m);
  assert.deepEqual(parseSync(wire), { s: "hi", t: "1e3x", u: "NaN" });
});

test("non-finite numbers rejected", () => {
  assert.throws(() => encodeSync({ a: NaN }), XaiopEncodeError);
  assert.throws(() => encodeSync({ a: Infinity }), XaiopEncodeError);
  assert.throws(() => encodeSync({ a: -Infinity }), XaiopEncodeError);
});

test("CR/LF in strings rejected", () => {
  assert.throws(() => encodeSync({ a: "x\ny" }), /CR\/LF/);
  assert.throws(() => encodeSync({ a: "x\ry" }), /CR\/LF/);
});

test("invalid keys rejected", () => {
  assert.throws(() => encodeSync({ "": 1 }), /non-empty/);
  assert.throws(() => encodeSync({ "a b": 1 }), /invalid label/);
  assert.throws(() => encodeSync({ "a:b": 1 }), /invalid label/);
  assert.throws(() => encodeSync({ "foo-": 1 }), /trailing "-"/);
  assert.throws(() => encodeSync({ "a>b": 1 }), /operator/);
});

test("unsupported types rejected", () => {
  assert.throws(() => encodeSync({ a: () => {} }), /unsupported/);
  assert.throws(() => encodeSync({ a: Symbol("x") }), /unsupported/);
  assert.throws(() => encodeSync({ a: new Date() }), /unsupported/);
  assert.throws(() => encodeSync({ a: new Map() }), /unsupported/);
});

test("null object / array values encode by default", () => {
  assert.deepEqual(
    roundTrip({ a: 1, b: null, c: undefined }, { dotPolicy: "none" }),
    { a: 1, b: null },
  );
  assert.deepEqual(roundTrip({ a: [1, null, 2] }, { dotPolicy: "none" }), {
    a: [1, null, 2],
  });
  assert.deepEqual(roundTrip([null, true], { root: "array" }), [null, true]);
});

test("nullPolicy omit drops object null keys; arrays still encode null", () => {
  assert.deepEqual(
    roundTrip(
      { a: 1, b: null, c: 2 },
      { dotPolicy: "none", nullPolicy: "omit" },
    ),
    { a: 1, c: 2 },
  );
  assert.deepEqual(
    roundTrip({ a: [null] }, { dotPolicy: "none", nullPolicy: "omit" }),
    { a: [null] },
  );
});

test("nullPolicy / undefinedPolicy error", () => {
  assert.throws(
    () => encodeSync({ a: null }, { nullPolicy: "error" }),
    XaiopEncodeError,
  );
  assert.throws(
    () => encodeSync({ a: [null] }, { nullPolicy: "error" }),
    XaiopEncodeError,
  );
  assert.throws(
    () => encodeSync({ a: undefined }, { undefinedPolicy: "error" }),
    XaiopEncodeError,
  );
});

test("root null/undefined rejected", () => {
  assert.throws(() => encodeSync(null), /null/);
  assert.throws(() => encodeSync(undefined), /undefined/);
});

// --- structures ---

test("empty object and empty array", () => {
  assert.deepEqual(roundTrip({}, { dotPolicy: "none" }), {});
  assert.deepEqual(roundTrip([], { root: "array" }), []);
  assert.deepEqual(roundTrip({ a: {}, b: [] }, { dotPolicy: "none" }), {
    a: {},
    b: [],
  });
});

test("nested objects and mixed arrays", () => {
  const value = {
    meta: { name: "x", n: 1 },
    items: [
      { id: 1, ok: true },
      "plain",
      3,
      false,
      ["x", "y"],
      { a: "solo" },
    ],
  };
  assert.deepEqual(roundTrip(value, { dotPolicy: "none" }), value);
  assert.deepEqual(roundTrip(value, { dotPolicy: "perTopLevelKey" }), value);
});

test("array document root", () => {
  const value = [{ a: 1 }, "z", 2, true, ["n"]];
  assert.deepEqual(roundTrip(value), value);
  assert.deepEqual(roundTrip(value, { root: "array" }), value);
  assert.throws(() => encodeSync({ a: 1 }, { root: "array" }), /array/);
  assert.throws(() => encodeSync([1], { root: "object" }), /plain object/);
});

test("sparse array elements rejected; null array elements encode", () => {
  assert.deepEqual(roundTrip({ a: [null] }, { dotPolicy: "none" }), {
    a: [null],
  });
  const sparse = [];
  sparse[1] = 1;
  assert.throws(() => encodeSync({ a: sparse }), /sparse|undefined/);
});

test("sibling after named array stays on parent object", () => {
  const value = { tags: ["a", "b"], n: 1 };
  assert.deepEqual(roundTrip(value, { dotPolicy: "none" }), value);
});

test("complex fixture round-trip (encode JSON → parse)", () => {
  const expected = JSON.parse(fs.readFileSync(fixtureJson, "utf8"));
  for (const policy of ["none", "perTopLevelKey", "perNKeys"]) {
    const opt =
      policy === "perNKeys"
        ? { dotPolicy: policy, phaseEvery: 1 }
        : { dotPolicy: policy };
    assert.deepEqual(roundTrip(expected, opt), expected, policy);
  }
});

// --- dot policies ---

test("default dotPolicy is perTopLevelKey", () => {
  const wire = encodeSync({ a: 1, b: 2, c: 3 });
  assert.equal(countDotLines(wire), 2);
  assert.deepEqual(parseSync(wire), { a: 1, b: 2, c: 3 });
});

test("dotPolicy none emits no phase dots", () => {
  const wire = encodeSync({ a: 1, b: 2 }, { dotPolicy: "none" });
  assert.equal(countDotLines(wire), 0);
  assert.ok(wire.startsWith(">\n"));
});

test("perNKeys groups keys", () => {
  const wire = encodeSync(
    { a: 1, b: 2, c: 3, d: 4, e: 5 },
    { dotPolicy: "perNKeys", phaseEvery: 2 },
  );
  // phases: [a,b] [c,d] [e] → 2 dots
  assert.equal(countDotLines(wire), 2);
  assert.deepEqual(parseSync(wire), { a: 1, b: 2, c: 3, d: 4, e: 5 });
});

test("maxPhases merges tail", () => {
  const wire = encodeSync(
    { a: 1, b: 2, c: 3, d: 4 },
    { dotPolicy: "perTopLevelKey", maxPhases: 2 },
  );
  // would be 3 dots without max; with maxPhases=2 → 1 dot
  assert.equal(countDotLines(wire), 1);
  assert.deepEqual(parseSync(wire), { a: 1, b: 2, c: 3, d: 4 });
});

test("custom shouldPhase", () => {
  const wire = encodeSync(
    { a: 1, b: 2, c: 3, d: 4 },
    {
      dotPolicy: "custom",
      shouldPhase: (ctx) => ctx.key === "b" || ctx.key === "c",
    },
  );
  // cut after b and c → phases [a,b] [c] [d] → 2 dots
  assert.equal(countDotLines(wire), 2);
  assert.deepEqual(parseSync(wire), { a: 1, b: 2, c: 3, d: 4 });
});

test("custom without shouldPhase throws", () => {
  assert.throws(
    () => encodeSync({ a: 1 }, { dotPolicy: "custom" }),
    /shouldPhase/,
  );
});

test("finalDot appends trailing phase marker", () => {
  const wire = encodeSync({ a: 1 }, { dotPolicy: "none", finalDot: true });
  assert.ok(wire.trimEnd().endsWith("."));
  assert.deepEqual(parseSync(wire), { a: 1 });
});

test("keyOrder sorted", () => {
  const wire = encodeSync(
    { b: 1, a: 2 },
    { dotPolicy: "none", keyOrder: "sorted" },
  );
  const idxA = wire.indexOf("a:2");
  const idxB = wire.indexOf("b:1");
  assert.ok(idxA < idxB);
});

test("invalid options rejected", () => {
  assert.throws(() => encodeSync({ a: 1 }, { dotPolicy: "nope" }), /dotPolicy/);
  assert.throws(() => encodeSync({ a: 1 }, { phaseEvery: 0 }), /phaseEvery/);
  assert.throws(() => encodeSync({ a: 1 }, { maxPhases: 0 }), /maxPhases/);
  assert.throws(() => encodeSync({ a: 1 }, { style: "x" }), /style/);
  assert.throws(() => encodeSync({ a: 1 }, { root: "frag" }), /root/);
});

// --- stream / checkpoint alignment ---

test("perTopLevelKey phases align with DotCheckpointEngine chunks", () => {
  const value = { a: { x: 1 }, b: { y: 2 }, c: 3 };
  const wire = encodeSync(value, { dotPolicy: "perTopLevelKey" });
  /** @type {unknown[]} */
  const chunks = [];
  const engine = new DotCheckpointEngine({
    streamProcessing: true,
    mergeChunkWindow: false,
    onChunk: (diff) => chunks.push(diff),
  });
  engine.push(wire);
  engine.finish();

  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], { a: { x: 1 } });
  assert.deepEqual(chunks[1], { b: { y: 2 } });
  assert.deepEqual(chunks[2], { c: 3 });
  // full document later-wins merge via complete parse
  assert.deepEqual(parseSync(wire), value);
});

test("encode wire streams through XaiopStream RAW transport", async () => {
  const value = { left: 1, right: { ok: true } };
  const wire = encodeSync(value, { dotPolicy: "perTopLevelKey" });
  const stream = new XaiopStream("raw://encode-test", {
    modes: ["promise", "callback"],
  });
  /** @type {unknown[]} */
  const diffs = [];
  stream.onChunk((d) => diffs.push(d));
  const done = await stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: (async function* () {
      // feed in awkward chunk sizes to stress the buffer
      for (let i = 0; i < wire.length; i += 3) {
        yield wire.slice(i, i + 3);
      }
    })(),
  });
  assert.deepEqual(done, value);
  assert.equal(diffs.length, 2);
  assert.deepEqual(diffs[0], { left: 1 });
  assert.deepEqual(diffs[1], { right: { ok: true } });
});

test("reopening same array key across dots appends (hand wire); encode still one phase per named array", () => {
  const hand = `>
>items-
>
id:1
<
.
>
>items-
>
id:2
<
`;
  assert.deepEqual(parseSync(hand), {
    items: [{ id: 1 }, { id: 2 }],
  });

  // Encoder still keeps a named array inside one phase (product Diff clarity)
  const value = { items: [{ id: 1 }, { id: 2 }], other: 9 };
  const wire = encodeSync(value, { dotPolicy: "perTopLevelKey" });
  const phases = wire.split(/\n\.\n/);
  assert.equal(phases.length, 2);
  assert.match(phases[0], /items-/);
  assert.doesNotMatch(phases[1], /items-/);
  assert.deepEqual(parseSync(wire), value);
});

test("compatibility mode does not change encode output", () => {
  const engine = new XaiopEngine({ compatibilityMode: true });
  const value = { a: 1, b: "2" };
  assert.equal(
    engine.encodeSync(value, { dotPolicy: "none" }),
    encodeSync(value, { dotPolicy: "none" }),
  );
});

test("encode error includes path", () => {
  try {
    encodeSync({ ok: { bad: NaN } }, { dotPolicy: "none" });
    assert.fail("expected throw");
  } catch (e) {
    assert.ok(e instanceof XaiopEncodeError);
    assert.match(String(e.path), /bad/);
  }
});

test("null-prototype plain objects encode", () => {
  const o = Object.create(null);
  o.a = 1;
  assert.deepEqual(roundTrip(o, { dotPolicy: "none" }), { a: 1 });
});

test("deep nesting round-trip", () => {
  const value = { a: { b: { c: { d: { e: [1, { z: true }] } } } } };
  assert.deepEqual(roundTrip(value, { dotPolicy: "none" }), value);
});

test("large top-level key set with perNKeys + maxPhases", () => {
  /** @type {Record<string, number>} */
  const value = {};
  for (let i = 0; i < 20; i++) value[`k${i}`] = i;
  const wire = encodeSync(value, {
    dotPolicy: "perNKeys",
    phaseEvery: 3,
    maxPhases: 4,
  });
  assert.ok(countDotLines(wire) <= 3);
  assert.deepEqual(parseSync(wire), value);
});

// --- path-array dotPolicy ---

test("dotPolicy path array: nested object cut round-trips", () => {
  const value = { a: { x: 1, y: 2 }, b: 3 };
  const wire = encodeSync(value, { dotPolicy: ["a.x"] });
  assert.equal(countDotLines(wire), 1);
  assert.match(wire, /\nx:1\n\.\n/);
  assert.deepEqual(parseSync(wire), value);
});

test("dotPolicy path array: multiple cuts and array element index", () => {
  const value = {
    data: { childs: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }], meta: true },
  };
  const wire = encodeSync(value, { dotPolicy: ["data.childs[2]"] });
  assert.equal(countDotLines(wire), 1);
  assert.match(wire, />childs-/);
  // After `.`, named array reopens with `>childs-` (append).
  const phases = wire.split(/\n\.\n/);
  assert.equal(phases.length, 2);
  assert.match(phases[1], />childs-/);
  assert.deepEqual(parseSync(wire), value);

  const flat = { items: [1, 2, 3, 4], z: true };
  assert.deepEqual(
    roundTrip(flat, { dotPolicy: ["items[1]", "items[2]"] }),
    flat,
  );
});

test("dotPolicy path array: missing / mutex / mid-element reject", () => {
  assert.throws(
    () => encodeSync({ a: 1 }, { dotPolicy: ["nope"] }),
    (e) => e instanceof XaiopEncodeError && /not found/.test(e.message),
  );
  assert.throws(
    () => encodeSync({ a: 1 }, { dotPolicy: ["a"], phaseEvery: 2 }),
    (e) => e instanceof XaiopEncodeError && /mutually exclusive/.test(e.message),
  );
  assert.throws(
    () => encodeSync({ a: 1 }, { dotPolicy: ["a"], maxPhases: 2 }),
    (e) => e instanceof XaiopEncodeError && /mutually exclusive/.test(e.message),
  );
  assert.throws(
    () =>
      encodeSync({ a: 1 }, { dotPolicy: ["a"], shouldPhase: () => true }),
    (e) => e instanceof XaiopEncodeError && /mutually exclusive/.test(e.message),
  );
  assert.throws(
    () => encodeSync({ a: 1 }, { dotPolicy: ["a"], style: "relative" }),
    (e) => e instanceof XaiopEncodeError && /style:'reset'/.test(e.message),
  );
  assert.throws(
    () => encodeSync({ items: [{ id: 1 }] }, { dotPolicy: ["items[0].id"] }),
    (e) =>
      e instanceof XaiopEncodeError &&
      /index must be final/.test(e.message),
  );
  assert.throws(
    () => encodeSync({ a: 1 }, { dotPolicy: ["a", "a"] }),
    (e) => e instanceof XaiopEncodeError && /duplicate/.test(e.message),
  );
});

test("parseJsonPath / formatJsonPath", async () => {
  const { parseJsonPath, formatJsonPath } = await import("../dist/index.js");
  assert.deepEqual(parseJsonPath("data.childs[2].name"), [
    "data",
    "childs",
    2,
    "name",
  ]);
  assert.equal(formatJsonPath(["data", "childs", 2, "name"]), "data.childs[2].name");
  assert.throws(() => parseJsonPath("[0]"));
  assert.throws(() => parseJsonPath("a..b"));
});
