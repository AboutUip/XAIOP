import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSync, PROTOCOL_VERSION, XaiopSyntaxError } from "../dist/index.js";

test("protocol version 0.6.0", () => {
  assert.equal(PROTOCOL_VERSION, "0.6.0");
});

test("@path exact from Root; sibling branch untouched", () => {
  const v = parseSync(`>
>a
>b
x:1
.
>c
>b
y:2
.
@a>b
z:3
`);
  assert.deepEqual(v, {
    a: { b: { x: 1, z: 3 } },
    c: { b: { y: 2 } },
  });
});

test("@path does not fuzzy-find nested path; creates Root path instead", () => {
  const v = parseSync(`>
>wrap
>a
>b
x:1
.
@a>b
z:1
`);
  assert.deepEqual(v, {
    wrap: { a: { b: { x: 1 } } },
    a: { b: { z: 1 } },
  });
});

test("@path creates missing segments (??)", () => {
  const v = parseSync(`>
@a>b
z:1
`);
  assert.deepEqual(v, { a: { b: { z: 1 } } });
});

test("@path with no prior root creates document object root", () => {
  const v = parseSync(`@meta>title
text:hi
`);
  assert.deepEqual(v, { meta: { title: { text: "hi" } } });
});

test("!path updates all sibling matches", () => {
  const v = parseSync(`>
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
`);
  assert.deepEqual(v, {
    left: { test: { x: 1, z: 9 } },
    right: { test: { y: 2, z: 9 } },
  });
});

test("!path outer match prunes nested same fragment", () => {
  const v = parseSync(`>
>test
k:1
>test
inner:1
.
!test
z:9
`);
  assert.deepEqual(v, {
    test: { k: 1, test: { inner: 1 }, z: 9 },
  });
});

test("!a>b matches every complete path fragment with prune", () => {
  const v = parseSync(`>
>p
>a
>b
x:1
.
>q
>a
>b
y:2
.
!a>b
z:3
`);
  assert.deepEqual(v, {
    p: { a: { b: { x: 1, z: 3 } } },
    q: { a: { b: { y: 2, z: 3 } } },
  });
});

test("!path into arrays appends on each match", () => {
  const v = parseSync(`>
>left
>items-
:1
.
>right
>items-
:2
.
!items
:9
`);
  assert.deepEqual(v, {
    left: { items: [1, 9] },
    right: { items: [2, 9] },
  });
});

test("! no match errors", () => {
  assert.throws(
    () =>
      parseSync(`>
>a
x:1
.
!missing
z:1
`),
    /!path no match/,
  );
});

test("broadcast requires . before @ = !", () => {
  assert.throws(
    () =>
      parseSync(`>
>a
x:1
.
>b
>a
y:2
.
!a
@a
z:1
`),
    /broadcast mode is active/,
  );
  assert.throws(
    () =>
      parseSync(`>
>a
x:1
.
>b
>a
y:2
.
!a
=a
z:1
`),
    /broadcast mode is active/,
  );
  assert.throws(
    () =>
      parseSync(`>
>a
x:1
.
>b
>a
y:2
.
!a
!a
z:1
`),
    /broadcast mode is active/,
  );
});

test(". clears broadcast; later write is single cursor", () => {
  const v = parseSync(`>
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
>only
v:1
`);
  assert.deepEqual(v, {
    left: { test: { x: 1, z: 9 } },
    right: { test: { y: 2, z: 9 } },
    only: { v: 1 },
  });
});

test("broadcast < at Root on any cursor fails all", () => {
  // After !test, cursors are on test objects (depth>1). Pop once to parent, pop again ok,
  // third pop from left/right parents hits root frame ?illegal.
  assert.throws(
    () =>
      parseSync(`>
>left
>test
x:1
.
>right
>test
y:2
.
!test
<
<
<
`),
    /< at Root is illegal/,
  );
});

test("= fuzzy still finds nested path (contrast with @)", () => {
  const v = parseSync(`>
>wrap
>a
>b
x:1
.
=a>b
z:3
`);
  assert.deepEqual(v, { wrap: { a: { b: { x: 1, z: 3 } } } });
});

test("partial label te does not match test", () => {
  assert.throws(
    () =>
      parseSync(`>
>test
x:1
.
!te
z:1
`),
    /!path no match/,
  );
});

test("@ into array then append element", () => {
  const v = parseSync(`>
>items-
:1
:2
.
@items
:3
`);
  assert.deepEqual(v, { items: [1, 2, 3] });
});

test("! type conflict overwrites object with array enter", () => {
  // At matched object cursors, >name- creates/replaces named array under each
  const v = parseSync(`>
>left
>box
k:1
.
>right
>box
k:2
.
!box
>tags-
:a
`);
  assert.deepEqual(v, {
    left: { box: { k: 1, tags: ["a"] } },
    right: { box: { k: 2, tags: ["a"] } },
  });
});

test("empty @ and ! paths error", () => {
  assert.throws(() => parseSync(`>\n>a\nx:1\n.\n@\n`), /empty @ path/);
  assert.throws(() => parseSync(`>\n>a\nx:1\n.\n!\n`), /empty ! path/);
});

test("!a>b prunes nested a>b under an outer match start", () => {
  // Under `p`, match starts at child `a` ?prune entire `p.a` (nested a>b not updated).
  // Under `q`, separate match updated.
  const v = parseSync(`>
>p
>a
>b
x:1
<
>nest
>a
>b
inner:1
.
>q
>a
>b
y:2
.
!a>b
z:9
`);
  assert.deepEqual(v, {
    p: { a: { b: { x: 1, z: 9 }, nest: { a: { b: { inner: 1 } } } } },
    q: { a: { b: { y: 2, z: 9 } } },
  });
});

test("stream: ! after . uses cumulative prefix (????)", async () => {
  const { STREAM_MODES, STREAM_STATUS, TRANSPORT_KIND, XaiopStream } =
    await import("../dist/index.js");
  const { chunksOf, waitStatus } = await import("./helpers/stream.js");
  const stream = new XaiopStream("raw://local", {
    modes: [STREAM_MODES.PROMISE, STREAM_MODES.CALLBACK],
  });
  /** @type {unknown[]} */
  const chunks = [];
  stream.onChunk((d) => chunks.push(d));
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
>only
v:1
`;
  const done = await stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(wire),
  });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  assert.deepEqual(done, {
    left: { test: { x: 1, z: 9 } },
    right: { test: { y: 2, z: 9 } },
    only: { v: 1 },
  });
  // Phase with ! uses cumulative prefix ?onChunk sees full tree at that boundary
  const bangChunk = chunks.find(
    (c) =>
      c &&
      typeof c === "object" &&
      c.left?.test?.z === 9 &&
      c.right?.test?.z === 9,
  );
  assert.ok(bangChunk, "expected cumulative chunk after ! phase");
});

test("stream: @ into prior-phase array uses cumulative Diff (D2)", async () => {
  const { STREAM_MODES, STREAM_STATUS, TRANSPORT_KIND, XaiopStream } =
    await import("../dist/index.js");
  const { chunksOf, waitStatus } = await import("./helpers/stream.js");
  const stream = new XaiopStream("raw://local", {
    modes: [STREAM_MODES.PROMISE, STREAM_MODES.CALLBACK],
    mergeChunkWindow: false,
  });
  /** @type {unknown[]} */
  const chunks = [];
  stream.onChunk((d) => chunks.push(d));
  const wire = `>
>orders-
.
@orders
>
a:1
<
.
@orders
>
a:1
<
>
b:2
<
.
`;
  const done = await stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(wire),
  });
  await waitStatus(stream, STREAM_STATUS.COMPLETED);
  const expected = { orders: [{ a: 1 }, { a: 1 }, { b: 2 }] };
  assert.deepEqual(done, expected);
  assert.ok(chunks.length >= 3);
  const mid = chunks.find(
    (c) =>
      c &&
      typeof c === "object" &&
      Array.isArray(c.orders) &&
      c.orders.length === 1 &&
      c.orders[0]?.a === 1,
  );
  assert.ok(mid, "expected array-shaped cumulative Diff after first @ phase");
  assert.deepEqual(chunks[chunks.length - 1], expected);
});

test("streamProcessing off: full-buffer parse applies ! across prior . phases", async () => {
  const { STREAM_MODES, TRANSPORT_KIND, XaiopStream } = await import(
    "../dist/index.js"
  );
  const { chunksOf } = await import("./helpers/stream.js");
  const stream = new XaiopStream("raw://local", {
    modes: [STREAM_MODES.PROMISE],
    streamProcessing: false,
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
>only
v:1
`;
  const done = await stream.send({
    transport: TRANSPORT_KIND.RAW,
    source: chunksOf(wire),
  });
  assert.deepEqual(done, {
    left: { test: { x: 1, z: 9 } },
    right: { test: { y: 2, z: 9 } },
    only: { v: 1 },
  });
});

test("same phase ! after building siblings (no mid . before !)", () => {
  const v = parseSync(`>
>left
>test
x:1
<
<
>right
>test
y:2
<
<
!test
z:9
.
>only
v:1
`);
  assert.deepEqual(v, {
    left: { test: { x: 1, z: 9 } },
    right: { test: { y: 2, z: 9 } },
    only: { v: 1 },
  });
});

test("fragment root supports @ and !", () => {
  const at = parseSync(`>a
>b
x:1
.
@a>b
z:2
`);
  assert.equal(at.isFragment, true);
  assert.deepEqual(at.entries, { a: { b: { x: 1, z: 2 } } });

  const bang = parseSync(`>left
>t
x:1
.
>right
>t
y:2
.
!t
z:3
`);
  assert.equal(bang.isFragment, true);
  assert.deepEqual(bang.entries, {
    left: { t: { x: 1, z: 3 } },
    right: { t: { y: 2, z: 3 } },
  });
});
