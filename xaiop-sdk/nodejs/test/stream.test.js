/**
 * Stream API / mode / lifecycle tests (raw transport).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  STREAM_MODES,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopStream,
} from "../src/index.js";
import { chunksOf, waitStatus } from "./helpers/stream.js";

test("stream: . segments emit per-phase parse", async () => {
  const stream = new XaiopStream("raw://local", { mergeChunkWindow: false });
  /** @type {unknown[]} */
  const chunks = [];
  let doneJson;
  stream.onChunk((d) => chunks.push(d));
  stream.onDone((j) => {
    doneJson = j;
  });

  stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(">\n>a\nx:", "1\n.\n>b\ny:2\n.\n>c\n", "z:3\n"),
  });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);

  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], { a: { x: 1 } });
  assert.deepEqual(chunks[1], { b: { y: 2 } });
  assert.deepEqual(chunks[2], { c: { z: 3 } });
  assert.deepEqual(doneJson, { a: { x: 1 }, b: { y: 2 }, c: { z: 3 } });
});

test("stream: consecutive . → empty content (null)", async () => {
  const stream = new XaiopStream("raw://local", { mergeChunkWindow: false });
  /** @type {unknown[]} */
  const chunks = [];
  stream.onChunk((d) => chunks.push(d));
  stream.onDone(() => {});
  stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(">\na:1\n.\n.\n"),
  });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  assert.deepEqual(chunks[0], { a: 1 });
  assert.equal(chunks[1], null);
});

test("stream: mergeChunkWindow batches multiple dots in one push", async () => {
  const stream = new XaiopStream("raw://local", { mergeChunkWindow: true });
  /** @type {unknown[]} */
  const chunks = [];
  stream.onChunk((d) => chunks.push(d));
  stream.onDone(() => {});
  stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(">\n>a\nx:1\n.\n>b\ny:2\n.\n"),
  });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  // One window with two complete `.` → one merged Diff (= committed after batch).
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0], { a: { x: 1 }, b: { y: 2 } });
});

test("stream: asyncParse coalesces ingest and matches one-shot done", async () => {
  const source = `>
>a
x:1
.
>b
y:2
.
`;
  const stream = new XaiopStream("raw://async", {
    mergeChunkWindow: true,
    asyncParse: true,
  });
  /** @type {unknown[]} */
  const chunks = [];
  /** @type {unknown} */
  let done;
  stream.onChunk((d) => chunks.push(d));
  stream.onDone((j) => {
    done = j;
  });
  stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(">\n>a\nx:1\n.\n", ">b\ny:2\n.\n"),
  });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  assert.deepEqual(done, { a: { x: 1 }, b: { y: 2 } });
  assert.ok(chunks.length >= 1);
});

test("stream: streamProcessing off → one parse, chunk then done", async () => {
  const stream = new XaiopStream("raw://local", { streamProcessing: false });
  /** @type {unknown[]} */
  const order = [];
  stream.onChunk((d) => order.push(["chunk", d]));
  stream.onDone((j) => order.push(["done", j]));
  stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(">\na:1\n.\n>b\nc:2\n"),
  });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  assert.equal(order[0][0], "chunk");
  assert.equal(order[1][0], "done");
  assert.deepEqual(order[0][1], order[1][1]);
});

test("stream: busy rejects second send and setUrl", async () => {
  const stream = new XaiopStream("raw://local");
  stream.onChunk(() => {});
  stream.onDone(() => {});
  let resolveGate;
  const gate = new Promise((r) => {
    resolveGate = r;
  });
  async function* slow() {
    yield ">\na:1\n";
    await gate;
    yield ".\n";
  }
  stream.send({ transport: TRANSPORT_KIND.RAW, source: slow() });
  await waitStatus(stream, STREAM_STATUS.STREAMING);
  assert.equal(stream.setUrl("http://example.com"), false);
  assert.throws(
    () => stream.send({ transport: TRANSPORT_KIND.RAW, source: chunksOf("") }),
    /busy/,
  );
  resolveGate();
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  assert.equal(stream.setUrl("http://example.com/ok"), true);
});

test("stream: promise / events / asyncIterator modes", async () => {
  const promiseStream = new XaiopStream("raw://local", {
    modes: [STREAM_MODES.PROMISE],
  });
  const json = await promiseStream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(">\nz:9\n.\n"),
  });
  assert.deepEqual(json, { z: 9 });

  const ev = new XaiopStream("raw://local", { modes: [STREAM_MODES.EVENTS] });
  /** @type {unknown[]} */
  const chunks = [];
  let done;
  ev.on("chunk", (d) => chunks.push(d));
  ev.on("done", (j) => {
    done = j;
  });
  ev.send({ transport: TRANSPORT_KIND.RAW, source: chunksOf(">\nq:1\n") });
  await waitStatus(ev, STREAM_STATUS.COMPLETED);
  assert.deepEqual(chunks[0], { q: 1 });
  assert.deepEqual(done, { q: 1 });

  const it = new XaiopStream("raw://local", {
    modes: [STREAM_MODES.ASYNC_ITERATOR, STREAM_MODES.PROMISE],
  });
  const p = it.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(">\na:1\n.\n>b\nc:2\n"),
  });
  /** @type {unknown[]} */
  const seen = [];
  for await (const d of it) seen.push(d);
  assert.deepEqual(seen[0], { a: 1 });
  assert.deepEqual(seen[1], { b: { c: 2 } });
  assert.deepEqual(await p, { a: 1, b: { c: 2 } });
});

test("stream: default compatibilityMode off; can send again", async () => {
  const stream = new XaiopStream("http://example.com");
  assert.equal(stream.compatibilityMode, false);
  assert.equal(stream.setCompatForcedRoot(false), false);
  stream.setCompatibilityMode(true);
  assert.equal(stream.setCompatForcedRoot(false), true);

  const s2 = new XaiopStream("raw://local");
  s2.onChunk(() => {});
  s2.onDone(() => {});
  s2.send({ transport: TRANSPORT_KIND.RAW, source: chunksOf(">\na:1\n") });
  await waitStatus(s2, STREAM_STATUS.COMPLETED);
  s2.send({ transport: TRANSPORT_KIND.RAW, source: chunksOf(">\nb:2\n") });
  await waitStatus(s2, STREAM_STATUS.COMPLETED);
  assert.deepEqual(s2.getSnapshot(), { b: 2 });
});

test("stream: getCommittedSnapshot mid-stream; getSnapshot stays final-only", async () => {
  const stream = new XaiopStream("raw://local", { modes: ["promise", "callback"] });
  /** @type {unknown[]} */
  const committedAtChunk = [];
  stream.onChunk(() => {
    committedAtChunk.push(stream.getCommittedSnapshot());
    // Final snapshot must remain unset until finish
    assert.equal(stream.getSnapshot(), undefined);
  });

  const done = stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(">\na:1\n.\n", ">\nb:2\n"),
  });
  assert.ok(done);
  const final = await done;
  assert.deepEqual(final, { a: 1, b: 2 });
  assert.equal(committedAtChunk.length, 2);
  assert.deepEqual(committedAtChunk[0], { a: 1 });
  // After second phase (tail), committed is full later-wins document
  assert.deepEqual(committedAtChunk[1], { a: 1, b: 2 });
  assert.deepEqual(stream.getSnapshot(), { a: 1, b: 2 });
  assert.deepEqual(stream.getCommittedSnapshot(), { a: 1, b: 2 });
  assert.equal(stream.getStatus().hasCommittedSnapshot, true);
  assert.equal(stream.getStatus().hasSnapshot, true);
});

test("stream: RAW binary chunks may split UTF-8 code points", async () => {
  const wire = ">\n名称:萱\n";
  const bytes = new TextEncoder().encode(wire);
  // Split inside the multi-byte UTF-8 sequence for 萱 (U+8431 → e8 90 b1)
  const idx = wire.indexOf("萱");
  const before = new TextEncoder().encode(wire.slice(0, idx));
  const charBytes = new TextEncoder().encode("萱");
  assert.ok(charBytes.length >= 2);
  const mid = Math.floor(charBytes.length / 2);
  const part1 = new Uint8Array([...before, ...charBytes.slice(0, mid)]);
  const part2 = new Uint8Array([
    ...charBytes.slice(mid),
    ...new TextEncoder().encode(wire.slice(idx + "萱".length)),
  ]);

  const stream = new XaiopStream("raw://utf8", { modes: ["promise"] });
  const done = await stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: (async function* () {
      yield part1;
      yield part2;
    })(),
  });
  assert.deepEqual(done, { 名称: "萱" });
});

test("stream: getStatus shape", () => {
  const stream = new XaiopStream("https://example.com/x", {
    modes: [STREAM_MODES.CALLBACK, STREAM_MODES.PROMISE],
  });
  const st = stream.getStatus();
  assert.equal(st.status, STREAM_STATUS.IDLE);
  assert.equal(st.url, "https://example.com/x");
  assert.equal(st.streamProcessing, true);
  assert.equal(st.compatibilityMode, false);
  assert.equal(st.busy, false);
  assert.equal(st.hasCommittedSnapshot, false);
  assert.deepEqual(st.modes.sort(), ["callback", "promise"]);
});
