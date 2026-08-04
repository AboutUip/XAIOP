import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DotCheckpointEngine,
  parseSync,
  SDK_VERSION,
} from "../dist/index.js";

/**
 * Diff isolation / cumulative locate — framing splits must match one-shot.
 * D1: later `>name` after `.` (synthetic object root).
 * D2: `@` into a prior-phase named array (cumulative Diff; not phase-local create {}).
 * Also: `emitDiff: false` without `onChunk` must not throw.
 */
describe("checkpoint Diff isolation (D1 + D2 + emitDiff)", () => {
  test("SDK_VERSION is 0.15.1", () => {
    assert.equal(SDK_VERSION, "0.15.1");
  });

  test("onChunk Diff mutation does not touch committedSnapshot", () => {
    const wire = ">\na:1\n.\n>\nb:2\n.\n";
    /** @type {unknown[]} */
    const chunks = [];
    const eng = new DotCheckpointEngine({
      mergeChunkWindow: false,
      onChunk: (d) => chunks.push(d),
    });
    eng.push(wire);
    eng.finish();
    assert.equal(chunks.length, 2);
    const first = /** @type {{ a: number }} */ (chunks[0]);
    first.a = 999;
    assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2 });
  });

  // -------------------------------------------------------------------------
  // D1 — named enter after `.`
  // -------------------------------------------------------------------------
  describe("D1: >name after prior .", () => {
    const p1 = ">\n>meta\nname:x\n.\n";
    const p2 = ">rules-\n>\nid:R1\n<\n.\n";
    const full = p1 + p2;
    const expected = { meta: { name: "x" }, rules: [{ id: "R1" }] };

    test("parseSync baseline", () => {
      assert.deepEqual(parseSync(full), expected);
    });

    test("one push ≡ split pushes (default mergeChunkWindow)", () => {
      const one = runEngine([full], {});
      const split = runEngine([p1, p2], {});
      assert.deepEqual(one.committed, expected);
      assert.deepEqual(split.committed, expected);
      assert.deepEqual(one.committed, split.committed);
    });

    test("one push ≡ split pushes (mergeChunkWindow: false)", () => {
      const opts = { mergeChunkWindow: false };
      const one = runEngine([full], opts);
      const split = runEngine([p1, p2], opts);
      assert.deepEqual(one.committed, expected);
      assert.deepEqual(split.committed, expected);
      assert.equal(one.chunks.length, 2);
      assert.equal(split.chunks.length, 2);
      assert.deepEqual(split.chunks[0], { meta: { name: "x" } });
      assert.deepEqual(split.chunks[1], { rules: [{ id: "R1" }] });
    });

    test("char-stream framing still equals parseSync", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      for (const ch of full) eng.push(ch);
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, expected);
    });

    test("locate phase (=) still uses cumulative Diff", () => {
      const phase1 = ">\n>a\nx:1\n.\n";
      const phase2 = "=a\ny:2\n.\n";
      const wire = phase1 + phase2;
      assert.deepEqual(parseSync(wire), { a: { x: 1, y: 2 } });
      const chunks = [];
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: (d) => chunks.push(d),
      });
      eng.push(phase1);
      eng.push(phase2);
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, { a: { x: 1, y: 2 } });
      assert.equal(chunks.length, 2);
      assert.deepEqual(chunks[1], { a: { x: 1, y: 2 } });
    });
  });

  // -------------------------------------------------------------------------
  // D2 — @ into prior-phase named array (researcher repro)
  // -------------------------------------------------------------------------
  describe("D2: @ into prior-phase named array", () => {
    const p0 = ">\n>orders-\n.\n";
    const p1 = "@orders\n>\na:1\n<\n.\n";
    const p2 = "@orders\n>\na:1\n<\n>\nb:2\n<\n.\n";
    const after1 = { orders: [{ a: 1 }] };
    const after2 = { orders: [{ a: 1 }, { a: 1 }, { b: 2 }] };
    const full = p0 + p1 + p2;

    test("parseSync baseline (one-shot)", () => {
      assert.deepEqual(parseSync(p0 + p1), after1);
      assert.deepEqual(parseSync(full), after2);
    });

    test("split pushes: Diff is array shape (not object); no throw", () => {
      const chunks = [];
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: (d) => chunks.push(d),
      });
      eng.push(p0);
      eng.push(p1);
      eng.push(p2);
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, after2);
      assert.equal(chunks.length, 3);
      assert.deepEqual(chunks[0], { orders: [] });
      // Cumulative Diff — must see array enter, not phase-local create {}
      assert.deepEqual(chunks[1], after1);
      assert.ok(Array.isArray(chunks[1].orders));
      assert.deepEqual(chunks[2], after2);
      assert.ok(Array.isArray(chunks[2].orders));
    });

    test("one push ≡ split pushes (mergeChunkWindow on/off)", () => {
      for (const mergeChunkWindow of [true, false]) {
        const opts = { mergeChunkWindow };
        const one = runEngine([full], opts);
        const split = runEngine([p0, p1, p2], opts);
        assert.deepEqual(one.committed, after2);
        assert.deepEqual(split.committed, after2);
        assert.deepEqual(one.committed, split.committed);
      }
    });

    test("char-stream framing still equals parseSync", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      for (const ch of full) eng.push(ch);
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, after2);
    });

    test("@ create-only later phase still commits (cumulative Diff includes siblings)", () => {
      const a = ">\n>meta\nname:x\n.\n";
      const b = "@fresh\nv:1\n.\n";
      const expected = { meta: { name: "x" }, fresh: { v: 1 } };
      assert.deepEqual(parseSync(a + b), expected);
      const chunks = [];
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: (d) => chunks.push(d),
      });
      eng.push(a);
      eng.push(b);
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, expected);
      assert.deepEqual(chunks[1], expected);
    });

    test("workarounds =orders / >orders- remain correct", () => {
      const base = ">\n>orders-\n.\n";
      const viaEq = base + "=orders\n>\na:1\n<\n.\n";
      const viaRe = base + ">orders-\n>\na:1\n<\n.\n";
      const expect = { orders: [{ a: 1 }] };
      assert.deepEqual(parseSync(viaEq), expect);
      assert.deepEqual(parseSync(viaRe), expect);
      for (const wire of [viaEq, viaRe]) {
        const split = wire === viaEq
          ? [base, "=orders\n>\na:1\n<\n.\n"]
          : [base, ">orders-\n>\na:1\n<\n.\n"];
        const r = runEngine(split, { mergeChunkWindow: false });
        assert.deepEqual(r.committed, expect);
        assert.ok(Array.isArray(r.chunks[1].orders));
      }
    });
  });

  // -------------------------------------------------------------------------
  // emitDiff: false without onChunk
  // -------------------------------------------------------------------------
  describe("emitDiff: false / missing onChunk", () => {
    test("emitDiff:false without onChunk does not throw", () => {
      const eng = new DotCheckpointEngine({ emitDiff: false });
      eng.push(">\na:1\n.\n");
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, { a: 1 });
      assert.deepEqual(eng.snapshot, { a: 1 });
    });

    test("emitDiff:false with empty onChunk still commits", () => {
      const seen = [];
      const eng = new DotCheckpointEngine({
        emitDiff: false,
        onChunk: (d) => seen.push(d),
      });
      eng.push(">\na:1\n.\n");
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, { a: 1 });
      // null Diff delivery when emitDiff off
      assert.ok(seen.length >= 1);
      assert.equal(seen[0], null);
    });

    test("missing onChunk with emitDiff:true still commits (Diff discarded)", () => {
      const eng = new DotCheckpointEngine({});
      eng.push(">\na:1\n.\n");
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, { a: 1 });
    });

    test("emitDiff:false + @ array multi-phase still commits", () => {
      const eng = new DotCheckpointEngine({ emitDiff: false });
      eng.push(">\n>orders-\n.\n");
      eng.push("@orders\n>\na:1\n<\n.\n");
      eng.push("@orders\n>\nb:2\n<\n.\n");
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, {
        orders: [{ a: 1 }, { b: 2 }],
      });
    });
  });
});

/**
 * @param {string[]} chunks
 * @param {object} opts
 */
function runEngine(chunks, opts) {
  /** @type {unknown[]} */
  const out = [];
  const eng = new DotCheckpointEngine({
    ...opts,
    onChunk: (d) => out.push(d),
  });
  for (const c of chunks) eng.push(c);
  eng.finish();
  return { committed: eng.committedSnapshot, chunks: out };
}
