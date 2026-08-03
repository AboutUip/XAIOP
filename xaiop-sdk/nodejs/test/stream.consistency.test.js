/**
 * Stream consistency: framing-independent final merge ≡ one-shot parse,
 * including protocol overwrite / later-wins scenarios.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DotCheckpointEngine,
  materializeSnapshot,
  parseSync,
  STREAM_MODES,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopStream,
} from "../src/index.js";
import {
  assertStreamMatchesOneShot,
  charChunks,
  chunksOf,
  expectedJson,
  runRawStream,
  sizedChunks,
  waitStatus,
} from "./helpers/stream.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const complexXaiop = path.resolve(
  here,
  "../../../docs/examples/complex.xaiop",
);
const complexJson = path.resolve(
  here,
  "../../../docs/examples/complex.expected.json",
);

// --- Framing independence -------------------------------------------------

const OVERWRITE_CASES = [
  {
    name: "hierarchy id overwrite after .",
    source: `>
id:1
.
>
id:2
`,
    expected: { id: 2 },
    phase0: { id: 1 },
    phase1: { id: 2 },
  },
  {
    name: "named sections accumulate across .",
    source: `>
>a
x:1
.
>b
y:2
.
>c
z:3
`,
    expected: { a: { x: 1 }, b: { y: 2 }, c: { z: 3 } },
  },
  {
    name: "same key overwrite across phases",
    source: `>
>meta
name:v1
ver:1
.
>meta
name:v2
ver:2
`,
    expected: { meta: { name: "v2", ver: 2 } },
  },
  {
    name: "array grow then sibling object",
    source: `>
>tags-
:a
:b
.
>user
id:1
`,
    expected: { tags: ["a", "b"], user: { id: 1 } },
  },
  {
    name: "root array then no further .",
    source: `-
:a
:b
:c
`,
    expected: ["a", "b", "c"],
  },
  {
    name: "CRLF line endings with overwrite",
    source: ">\r\nid:1\r\n.\r\n>\r\nid:9\r\n",
    expected: { id: 9 },
  },
  {
    name: "trailing content after last .",
    source: `>
>a
x:1
.
>b
y:2
`,
    expected: { a: { x: 1 }, b: { y: 2 } },
  },
  {
    name: "no dot entire document",
    source: `>
x:1
y:2
z:3
`,
    expected: { x: 1, y: 2, z: 3 },
  },
  {
    name: "nested then re-enter with > after .",
    source: `>
>wrap
>inner
v:1
.
>
>wrap
extra:yes
`,
    expected: { wrap: { inner: { v: 1 }, extra: "yes" } },
    phase0: { wrap: { inner: { v: 1 } } },
    phase1: { wrap: { extra: "yes" } },
  },
];

for (const c of OVERWRITE_CASES) {
  test(`consistency one-shot: ${c.name}`, () => {
    assert.deepEqual(expectedJson(c.source), c.expected);
  });

  test(`consistency whole-frame stream: ${c.name}`, async () => {
    const { done, chunks } = await runRawStream(c.source);
    assert.deepEqual(done, c.expected);
    if (c.phase0 !== undefined) {
      assert.deepEqual(chunks[0], c.phase0);
    }
    if (c.phase1 !== undefined) {
      assert.deepEqual(chunks[1], c.phase1);
    }
  });

  test(`consistency char-chunked stream: ${c.name}`, async () => {
    await assertStreamMatchesOneShot(c.source, charChunks(c.source));
  });

  test(`consistency sized-chunk stream: ${c.name}`, async () => {
    await assertStreamMatchesOneShot(c.source, sizedChunks(c.source, 3));
    await assertStreamMatchesOneShot(c.source, sizedChunks(c.source, 7));
  });
}

test("consistency: complex.xaiop fixture via stream (char + sized)", async () => {
  const source = fs.readFileSync(complexXaiop, "utf8");
  const expected = JSON.parse(fs.readFileSync(complexJson, "utf8"));
  assert.deepEqual(expectedJson(source), expected);

  await assertStreamMatchesOneShot(source, chunksOf(source));
  await assertStreamMatchesOneShot(source, sizedChunks(source, 16));
  await assertStreamMatchesOneShot(source, charChunks(source));
});

test("consistency: splits across . boundaries", async () => {
  const source = `>
>left
a:1
.
>right
b:2
.
>tail
c:3
`;
  const frames = [
    [">\n", ">left\na:1\n", ".\n", ">right\n", "b:2\n.\n>tail\nc:3\n"],
    [">\n>left\na:1\n.\n>right\nb:2\n.\n", ">tail\nc:3\n"],
    [">\n>left\na:1\n.\n", ">right\nb:2\n", ".\n>tail\nc:3\n"],
  ];

  for (const parts of frames) {
    assert.equal(parts.join(""), source);
    await assertStreamMatchesOneShot(source, chunksOf(...parts));
  }
});

test("consistency: streamProcessing off still matches one-shot", async () => {
  const source = `>
>a
x:1
.
>b
y:2
`;
  const { done, chunks } = await runRawStream(source, charChunks(source), {
    streamProcessing: false,
  });
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0], expectedJson(source));
  assert.deepEqual(done, expectedJson(source));
});

test("consistency: DotCheckpointEngine direct push matches XaiopStream", async () => {
  const source = `>
id:1
.
>
id:2
.
>
id:3
`;
  /** @type {unknown[]} */
  const engineChunks = [];
  const engine = new DotCheckpointEngine({
    streamProcessing: true,
    compat: false,
    onChunk: (d) => engineChunks.push(d),
  });
  for (const ch of source) engine.push(ch);
  engine.finish();

  const { chunks, done } = await runRawStream(source, charChunks(source));
  assert.deepEqual(engineChunks, chunks);
  assert.deepEqual(engine.snapshot, done);
  assert.deepEqual(done, { id: 3 });
});

test("consistency: multi-mode fan-out same done JSON", async () => {
  const source = `>
k:1
.
>
k:2
`;
  const stream = new XaiopStream("raw://x", {
    modes: [
      STREAM_MODES.CALLBACK,
      STREAM_MODES.EVENTS,
      STREAM_MODES.PROMISE,
      STREAM_MODES.ASYNC_ITERATOR,
    ],
  });
  /** @type {unknown[]} */
  const viaCb = [];
  /** @type {unknown[]} */
  const viaEv = [];
  stream.onChunk((d) => viaCb.push(d));
  stream.on("chunk", (d) => viaEv.push(d));
  let viaDoneCb;
  let viaDoneEv;
  stream.onDone((j) => {
    viaDoneCb = j;
  });
  stream.on("done", (j) => {
    viaDoneEv = j;
  });

  const p = stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: sizedChunks(source, 5),
  });
  /** @type {unknown[]} */
  const viaIter = [];
  for await (const d of stream) viaIter.push(d);
  const viaPromise = await p;

  const expected = expectedJson(source);
  assert.deepEqual(viaPromise, expected);
  assert.deepEqual(viaDoneCb, expected);
  assert.deepEqual(viaDoneEv, expected);
  assert.deepEqual(viaCb, viaEv);
  assert.deepEqual(viaCb, viaIter);
  assert.deepEqual(viaCb[0], { k: 1 });
  assert.deepEqual(viaCb[1], { k: 2 });
});

test("inactive mode does not receive deliveries", async () => {
  const stream = new XaiopStream("raw://x", {
    modes: [STREAM_MODES.CALLBACK],
  });
  let eventHits = 0;
  stream.on("chunk", () => {
    eventHits++;
  });
  stream.onChunk(() => {});
  stream.onDone(() => {});
  stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(">\na:1\n"),
  });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  assert.equal(eventHits, 0);
});

test("abort terminates busy stream", async () => {
  const stream = new XaiopStream("raw://x");
  stream.onChunk(() => {});
  stream.onDone(() => {});
  let err;
  stream.onError((e) => {
    err = e;
  });

  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  async function* blocked() {
    yield ">\na:1\n";
    await gate;
    yield ".\n";
  }

  stream.send({ transport: TRANSPORT_KIND.RAW, source: blocked() });
  await waitStatus(stream, STREAM_STATUS.STREAMING);
  assert.equal(stream.abort(), true);
  assert.equal(stream.status, STREAM_STATUS.ABORTED);
  release();
  assert.ok(err);
});

test("materializeSnapshot: fragment → entries object", () => {
  const f = parseSync(">a\nx:1");
  assert.equal(f.isFragment, true);
  assert.deepEqual(materializeSnapshot(f), { a: { x: 1 } });
});
