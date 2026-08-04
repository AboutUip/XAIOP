import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DOT_POLICY,
  DotCheckpointEngine,
  XaiopEncodeError,
  XaiopStream,
  TRANSPORT_KIND,
  encodeSync,
  parseSync,
} from "../dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureXaiop = path.resolve(
  here,
  "../../../docs/examples/complex.xaiop",
);
const fixtureJson = path.resolve(
  here,
  "../../../docs/examples/complex.expected.json",
);

/** @param {unknown} value @param {import("../dist/index.js").EncodeOptions} [opt] */
function rt(value, opt) {
  return parseSync(encodeSync(value, opt));
}

function countDots(wire) {
  return wire.split(/\r?\n/).filter((l) => l === ".").length;
}

/** Seeded LCG for deterministic pseudo-random JSON. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * @param {() => number} rnd
 * @param {number} depth
 * @returns {unknown}
 */
function randomJson(rnd, depth = 0) {
  const pick = rnd();
  if (depth > 4 || pick < 0.25) {
    const t = rnd();
    if (t < 0.2) return Math.floor(rnd() * 1000) - 500;
    if (t < 0.35) return Math.fround((rnd() - 0.5) * 1000);
    if (t < 0.42) return rnd() < 0.5;
    if (t < 0.48) return null;
    if (t < 0.55) return "";
    if (t < 0.7) return `s_${Math.floor(rnd() * 1e6)}`;
    // forced-string candidates
    if (t < 0.8) return String(Math.floor(rnd() * 100));
    if (t < 0.88) return String(rnd() * 10);
    if (t < 0.94) return "null";
    return rnd() < 0.5 ? "true" : "1e3";
  }
  if (pick < 0.55) {
    const n = Math.floor(rnd() * 5);
    /** @type {unknown[]} */
    const arr = [];
    for (let i = 0; i < n; i++) {
      let el = randomJson(rnd, depth + 1);
      if (el === undefined) el = 0;
      arr.push(el);
    }
    return arr;
  }
  const n = Math.floor(rnd() * 5) + (depth === 0 ? 1 : 0);
  /** @type {Record<string, unknown>} */
  const obj = {};
  for (let i = 0; i < n; i++) {
    const key = `k${Math.floor(rnd() * 1e6)}`;
    let v = randomJson(rnd, depth + 1);
    if (v === undefined) continue;
    obj[key] = v;
  }
  return obj;
}

const POLICIES = [
  { dotPolicy: DOT_POLICY.NONE },
  { dotPolicy: DOT_POLICY.PER_TOP_LEVEL_KEY },
  { dotPolicy: DOT_POLICY.PER_N_KEYS, phaseEvery: 2 },
  { dotPolicy: DOT_POLICY.PER_N_KEYS, phaseEvery: 3, maxPhases: 5 },
  {
    dotPolicy: DOT_POLICY.CUSTOM,
    shouldPhase: (ctx) => ctx.keysInPhase >= 2,
  },
];

test("determinism: identical input → identical wire", () => {
  const value = {
    meta: { name: "x", n: 1.5, flag: true },
    tags: ["a", "b", "1"],
    nested: [{ id: 1 }, { id: 2, t: "true" }],
  };
  for (const opt of POLICIES) {
    const a = encodeSync(value, opt);
    const b = encodeSync(value, opt);
    assert.equal(a, b, JSON.stringify(opt));
  }
});

test("double round-trip is idempotent on JSON value", () => {
  const value = JSON.parse(fs.readFileSync(fixtureJson, "utf8"));
  for (const opt of POLICIES) {
    const once = rt(value, opt);
    const twice = rt(once, opt);
    assert.deepEqual(once, value, JSON.stringify(opt));
    assert.deepEqual(twice, value, JSON.stringify(opt));
  }
});

test("parse(fixture) → encode → parse equals expected JSON", () => {
  const expected = JSON.parse(fs.readFileSync(fixtureJson, "utf8"));
  const fromWire = parseSync(fs.readFileSync(fixtureXaiop, "utf8"));
  assert.deepEqual(fromWire, expected);
  for (const opt of POLICIES) {
    assert.deepEqual(rt(fromWire, opt), expected, JSON.stringify(opt));
  }
});

test("wire always ends with a single trailing newline", () => {
  for (const value of [{}, { a: 1 }, [], { a: { b: [] } }]) {
    const wire = encodeSync(value, { dotPolicy: "none" });
    assert.ok(wire.endsWith("\n"));
    assert.ok(!wire.endsWith("\n\n"));
  }
});

test("no consecutive standalone dot lines under normal policies", () => {
  const value = { a: 1, b: 2, c: 3, d: 4 };
  for (const opt of [
    { dotPolicy: "perTopLevelKey" },
    { dotPolicy: "perNKeys", phaseEvery: 2 },
    { dotPolicy: "none" },
  ]) {
    const wire = encodeSync(value, opt);
    assert.doesNotMatch(wire, /\n\.\n\.\n/);
  }
});

test("phase count formula for perTopLevelKey / perNKeys", () => {
  const keys = ["a", "b", "c", "d", "e", "f", "g"];
  /** @type {Record<string, number>} */
  const value = {};
  for (const k of keys) value[k] = 1;

  assert.equal(countDots(encodeSync(value, { dotPolicy: "perTopLevelKey" })), 6);
  assert.equal(
    countDots(encodeSync(value, { dotPolicy: "perNKeys", phaseEvery: 3 })),
    2,
  );
  assert.equal(
    countDots(
      encodeSync(value, {
        dotPolicy: "perTopLevelKey",
        maxPhases: 3,
      }),
    ),
    2,
  );
  assert.equal(countDots(encodeSync(value, { dotPolicy: "none" })), 0);
});

test("unicode values and safe unicode keys round-trip", () => {
  const value = {
    名称: "萱",
    emoji: "🚀",
    mix: "café",
    arr: ["中文", "ok"],
  };
  assert.deepEqual(rt(value, { dotPolicy: "none" }), value);
  assert.deepEqual(rt(value, { dotPolicy: "perTopLevelKey" }), value);
});

test("number edge cases (safe int, float, -0 → 0)", () => {
  const value = {
    max: Number.MAX_SAFE_INTEGER,
    min: Number.MIN_SAFE_INTEGER,
    z: 0,
    nz: -0,
    f: 0.1 + 0.2,
    sci: 1e-7,
    bigf: 1.23e20,
  };
  const out = rt(value, { dotPolicy: "none" });
  assert.equal(out.max, Number.MAX_SAFE_INTEGER);
  assert.equal(out.min, Number.MIN_SAFE_INTEGER);
  assert.equal(out.z, 0);
  assert.equal(out.nz, 0); // JSON / XAIOP number surface collapses -0
  assert.equal(out.f, 0.1 + 0.2);
  assert.equal(out.sci, 1e-7);
  assert.equal(out.bigf, 1.23e20);
});

test("rejects keys that would corrupt structure (trailing -, operators)", () => {
  assert.throws(() => encodeSync({ "foo-": 1 }), /trailing "-"/);
  assert.throws(() => encodeSync({ "a>b": 1 }), /operator/);
  assert.throws(() => encodeSync({ "<x": 1 }), /operator/);
  assert.throws(() => encodeSync({ "=p": 1 }), /operator/);
  assert.throws(() => encodeSync({ "!n": 1 }), /operator/);
});

test("rejects BigInt and non-plain objects", () => {
  assert.throws(() => encodeSync({ a: 1n }), XaiopEncodeError);
  assert.throws(() => encodeSync({ a: new Set([1]) }), XaiopEncodeError);
  class C {
    constructor() {
      this.x = 1;
    }
  }
  assert.throws(() => encodeSync(new C()), /plain object/);
  assert.throws(() => encodeSync({ a: new C() }), /unsupported|plain/);
});

test("many siblings in one phase leave correctly", () => {
  const value = {
    a: { x: 1 },
    b: { y: 2 },
    c: [1, 2, { z: 3 }],
    d: "4",
    e: true,
  };
  assert.deepEqual(rt(value, { dotPolicy: "none" }), value);
  assert.deepEqual(
    rt(value, { dotPolicy: "perNKeys", phaseEvery: 10 }),
    value,
  );
});

test("deep array nesting round-trip", () => {
  const value = { tree: [[[[["leaf"], 1], true], { k: "v" }]] };
  assert.deepEqual(rt(value, { dotPolicy: "none" }), value);
});

test("empty containers at every level", () => {
  const value = {
    o: {},
    a: [],
    nest: { emptyObj: {}, emptyArr: [], mid: { again: [] } },
  };
  assert.deepEqual(rt(value, { dotPolicy: "none" }), value);
  assert.deepEqual(rt(value, { dotPolicy: "perTopLevelKey" }), value);
});

test("style relative vs reset agree for none policy values", () => {
  const value = { a: 1, b: { c: 2 }, d: [3] };
  const rel = encodeSync(value, { dotPolicy: "none", style: "relative" });
  const reset = encodeSync(value, { dotPolicy: "none", style: "reset" });
  assert.deepEqual(parseSync(rel), value);
  assert.deepEqual(parseSync(reset), value);
  // both are single-phase for none
  assert.equal(countDots(rel), 0);
  assert.equal(countDots(reset), 0);
});

test("finalDot does not change parsed value", () => {
  const value = { a: 1, b: 2 };
  const withDot = encodeSync(value, {
    dotPolicy: "perTopLevelKey",
    finalDot: true,
  });
  const without = encodeSync(value, {
    dotPolicy: "perTopLevelKey",
    finalDot: false,
  });
  assert.ok(withDot.trimEnd().endsWith("."));
  assert.deepEqual(parseSync(withDot), value);
  assert.deepEqual(parseSync(without), value);
});

test("null encode / omit / error policies", () => {
  assert.deepEqual(rt({ a: 1, b: null, c: 2 }, { dotPolicy: "none" }), {
    a: 1,
    b: null,
    c: 2,
  });
  assert.deepEqual(
    rt({ a: 1, b: null, c: 2 }, { dotPolicy: "none", nullPolicy: "omit" }),
    { a: 1, c: 2 },
  );
  assert.throws(
    () => encodeSync({ a: null }, { nullPolicy: "error" }),
    XaiopEncodeError,
  );
});

test("seeded random JSON corpus round-trips under all policies", () => {
  const rnd = makeRng(20260803);
  for (let i = 0; i < 40; i++) {
    let value = randomJson(rnd);
    // root must be object or array
    if (value === null || typeof value !== "object") {
      value = { v: value };
    }
    for (const opt of POLICIES) {
      try {
        assert.deepEqual(rt(value, opt), value, `seedCase=${i} ${JSON.stringify(opt)}`);
      } catch (e) {
        // attach wire for debugging
        const wire = encodeSync(value, opt);
        e.message += `\nwire:\n${wire}`;
        throw e;
      }
    }
  }
});

test("char-chunked stream of encoded wire matches parseSync", async () => {
  const value = JSON.parse(fs.readFileSync(fixtureJson, "utf8"));
  const wire = encodeSync(value, { dotPolicy: "perTopLevelKey" });
  const stream = new XaiopStream("raw://stability", { modes: ["promise"] });
  const done = await stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: (async function* () {
      for (const ch of wire) yield ch;
    })(),
  });
  assert.deepEqual(done, value);
});

test("DotCheckpointEngine committed snapshot ends at full document", () => {
  const value = { a: 1, b: { x: true }, c: ["y", 2] };
  const wire = encodeSync(value, { dotPolicy: "perTopLevelKey" });
  const engine = new DotCheckpointEngine({
    streamProcessing: true,
    onChunk: () => {},
  });
  // awkward chunking across dots
  for (let i = 0; i < wire.length; i += 5) {
    engine.push(wire.slice(i, i + 5));
  }
  engine.finish();
  assert.deepEqual(engine.snapshot, value);
  assert.deepEqual(engine.committedSnapshot, value);
});

test("array root ignores object dotPolicy (no top-level keys)", () => {
  const value = [1, { a: 2 }, ["b"]];
  const wire = encodeSync(value, { dotPolicy: "perTopLevelKey" });
  assert.equal(countDots(wire), 0);
  assert.ok(wire.startsWith("-\n"));
  assert.deepEqual(parseSync(wire), value);
});

test("sorted keyOrder is stable across encode calls", () => {
  const value = { z: 1, m: 2, a: 3 };
  const a = encodeSync(value, { dotPolicy: "none", keyOrder: "sorted" });
  const b = encodeSync(value, { dotPolicy: "none", keyOrder: "sorted" });
  assert.equal(a, b);
  assert.ok(a.indexOf("a:3") < a.indexOf("m:2"));
  assert.ok(a.indexOf("m:2") < a.indexOf("z:1"));
});

test("long string values round-trip", () => {
  const long = "x".repeat(10_000);
  const value = { body: long, n: 1 };
  assert.deepEqual(rt(value, { dotPolicy: "none" }), value);
});

test("DOT_POLICY constants match string literals", () => {
  assert.equal(DOT_POLICY.NONE, "none");
  assert.equal(DOT_POLICY.PER_TOP_LEVEL_KEY, "perTopLevelKey");
  assert.equal(DOT_POLICY.PER_N_KEYS, "perNKeys");
  assert.equal(DOT_POLICY.CUSTOM, "custom");
});
