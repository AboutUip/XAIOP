/**
 * mergeChunkWindow (default ON) + pushAsync coalescing.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DotCheckpointEngine, parseSync } from "../dist/index.js";

test("mergeChunkWindow ON: one push with two dots → one Diff (= committed)", () => {
  /** @type {unknown[]} */
  const diffs = [];
  const engine = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    mergeChunkWindow: true,
    onChunk: (d) => diffs.push(d),
  });
  engine.push(`>
>a
x:1
.
>b
y:2
.
`);
  engine.finish();
  assert.equal(diffs.length, 1);
  assert.deepEqual(diffs[0], { a: { x: 1 }, b: { y: 2 } });
  assert.deepEqual(engine.committedSnapshot, { a: { x: 1 }, b: { y: 2 } });
  assert.deepEqual(engine.snapshot, { a: { x: 1 }, b: { y: 2 } });
});

test("mergeChunkWindow OFF: stepwise per-dot Diff", () => {
  /** @type {unknown[]} */
  const diffs = [];
  const engine = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    mergeChunkWindow: false,
    onChunk: (d) => diffs.push(d),
  });
  engine.push(`>
>a
x:1
.
>b
y:2
.
`);
  engine.finish();
  assert.equal(diffs.length, 2);
  assert.deepEqual(diffs[0], { a: { x: 1 } });
  assert.deepEqual(diffs[1], { b: { y: 2 } });
});

test("pushAsync coalesces two appends into one drain before scan", async () => {
  /** @type {unknown[]} */
  const diffs = [];
  const engine = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    mergeChunkWindow: true,
    onChunk: (d) => diffs.push(d),
  });
  const p1 = engine.pushAsync(`>
>a
x:1
.
`);
  const p2 = engine.pushAsync(`>
>b
y:2
.
`);
  await Promise.all([p1, p2]);
  await engine.finishAsync();
  // Coalesced window saw both complete phases → one merged emit (no tail).
  assert.equal(diffs.length, 1);
  assert.deepEqual(diffs[0], { a: { x: 1 }, b: { y: 2 } });
  assert.deepEqual(engine.snapshot, parseSync(`>
>a
x:1
.
>b
y:2
.
`));
});

test("push sync still works alongside pending pushAsync (no double scan corruption)", async () => {
  /** @type {unknown[]} */
  const diffs = [];
  const engine = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    mergeChunkWindow: false,
    onChunk: (d) => diffs.push(d),
  });
  const pending = engine.pushAsync(`>
a:1
.
`);
  engine.push(`>
b:2
.
`);
  await pending;
  engine.finish();
  assert.deepEqual(engine.snapshot, { a: 1, b: 2 });
  assert.ok(diffs.length >= 2);
});
