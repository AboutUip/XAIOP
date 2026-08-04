/**
 * Regression guards for stream checkpoint optimizations:
 * Diff/Commit isolation, finish reuse, CRLF parity.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DotCheckpointEngine,
  encodeSync,
  materializeSnapshot,
  parseSync,
  STREAM_MODES,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopStream,
} from "../dist/index.js";
import { chunksOf, waitStatus } from "./helpers/stream.js";

test("checkpoint: mutating onChunk Diff does not corrupt committed (! phase)", () => {
  /** @type {unknown[]} */
  const diffs = [];
  const engine = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    onChunk: (d) => {
      diffs.push(d);
      if (d && typeof d === "object" && d.left?.test) {
        d.left.test.mutated = true;
      }
    },
  });

  const wire = `>
>left
>test
x:1
.
>right
>test
y:2
.
!test
z:9
.
`;
  engine.push(wire);
  engine.finish();

  const committed = engine.committedSnapshot;
  assert.equal(committed?.left?.test?.mutated, undefined);
  assert.deepEqual(committed?.left?.test, { x: 1, z: 9 });
  assert.deepEqual(committed?.right?.test, { y: 2, z: 9 });
  assert.ok(diffs.some((d) => d?.left?.test?.mutated === true));
});

test("checkpoint: normal phase Diff �?Commit (later-wins phase-local Diff)", () => {
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

  assert.deepEqual(diffs[0], { a: { x: 1 } });
  assert.deepEqual(diffs[1], { b: { y: 2 } });
  assert.deepEqual(engine.committedSnapshot, { a: { x: 1 }, b: { y: 2 } });
  assert.deepEqual(engine.snapshot, { a: { x: 1 }, b: { y: 2 } });
});

test("checkpoint: committedSnapshot readable after . before finish (bare engine)", () => {
  /** @type {unknown[]} */
  const atChunk = [];
  const engine = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    mergeChunkWindow: false,
    onChunk: () => {
      atChunk.push(structuredClone(engine.committedSnapshot));
    },
  });
  engine.push(">\na:1\n.\n");
  assert.ok(engine.committedAt > 0);
  assert.deepEqual(engine.committedSnapshot, { a: 1 });
  assert.deepEqual(atChunk[0], { a: 1 });
  engine.push(">b\nc:2\n.\n");
  assert.deepEqual(engine.committedSnapshot, { a: 1, b: { c: 2 } });
  assert.deepEqual(atChunk[1], { a: 1, b: { c: 2 } });
  engine.finish();
  assert.deepEqual(engine.committedSnapshot, { a: 1, b: { c: 2 } });
});

test("checkpoint: finish snapshot aliases last commit when buffer fully committed", () => {
  const engine = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    onChunk: () => {},
  });
  engine.push(`>
>a
x:1
.
`);
  engine.finish();
  assert.equal(engine.committedAt, engine.buffer.length);
  assert.deepEqual(engine.snapshot, engine.committedSnapshot);
});

test("parse: CRLF / CR / LF documents materialize identically", () => {
  const lf = ">\n>a\nx:1\n.\n>b\ny:2\n";
  const crlf = lf.replace(/\n/g, "\r\n");
  const cr = lf.replace(/\n/g, "\r");
  assert.deepEqual(parseSync(lf), parseSync(crlf));
  assert.deepEqual(parseSync(lf), parseSync(cr));
  assert.deepEqual(materializeSnapshot(parseSync(crlf)), {
    a: { x: 1 },
    b: { y: 2 },
  });
});

test("parse: forced-string Content still strips leading spaces", () => {
  assert.deepEqual(parseSync(">\nn: 42\n"), { n: "42" });
  assert.deepEqual(parseSync(">\nn:  42\n"), { n: "42" });
});

test("stream: = across phases uses cumulative prefix (向前跨相)", async () => {
  const stream = new XaiopStream("raw://local", {
    modes: [STREAM_MODES.PROMISE],
  });
  const wire = `>
>wrap
>a
>b
x:1
.
=a>b
z:3
.
`;
  const done = await stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(wire),
  });
  assert.deepEqual(done, { wrap: { a: { b: { x: 1, z: 3 } } } });
});

test("stream: encode→stream→parse matches parseSync (phased wire)", async () => {
  const value = {
    a: { x: 1 },
    b: { y: 2 },
    c: { z: [1, 2, 3] },
  };
  const wire = encodeSync(value);
  const stream = new XaiopStream("raw://local", {
    modes: [STREAM_MODES.PROMISE],
  });
  const done = await stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(wire),
  });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  assert.deepEqual(done, value);
  assert.deepEqual(parseSync(wire), value);
});

test("checkpoint: mutating Diff on = phase does not corrupt commit", () => {
  const engine = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    onChunk: (d) => {
      if (d && typeof d === "object" && d.wrap?.a?.b) {
        d.wrap.a.b.poison = true;
      }
    },
  });
  engine.push(`>
>wrap
>a
>b
x:1
.
=a>b
z:3
.
`);
  engine.finish();
  assert.equal(engine.committedSnapshot?.wrap?.a?.b?.poison, undefined);
  assert.deepEqual(engine.committedSnapshot, {
    wrap: { a: { b: { x: 1, z: 3 } } },
  });
});

test("streamProcessing false: single chunk equals parseSync", async () => {
  const wire = `>
>a
x:1
.
>b
y:2
`;
  const stream = new XaiopStream("raw://local", {
    modes: [STREAM_MODES.PROMISE, STREAM_MODES.CALLBACK],
    streamProcessing: false,
  });
  /** @type {unknown[]} */
  const chunks = [];
  stream.onChunk((d) => chunks.push(d));
  const done = await stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(wire),
  });
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0], done);
  assert.deepEqual(done, parseSync(wire));
});
