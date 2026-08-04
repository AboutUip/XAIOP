/**
 * LiveXaiopParser ≡ parseSync, and live checkpoint Commit ≡ one-shot.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  DotCheckpointEngine,
  encodeSync,
  LiveXaiopParser,
  materializeSnapshot,
  parseSync,
  DOT_POLICY,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const complexXaiop = join(here, "../../../docs/examples/complex.xaiop");

/** @param {string} source @param {boolean|object} [compat] */
function liveParse(source, compat = false) {
  return materializeSnapshot(
    new LiveXaiopParser(compat).feedText(source).value(),
  );
}

test("LiveXaiopParser matches parseSync on complex fixture", () => {
  const source = readFileSync(complexXaiop, "utf8");
  assert.deepEqual(liveParse(source), materializeSnapshot(parseSync(source)));
});

test("LiveXaiopParser matches parseSync for = / ! / @ corpus", () => {
  const samples = [
    `>
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
.`,
    `>
>wrap
>a
>b
x:1
.
=a>b
z:3
.`,
    `>
>a
.
@b>c
n:1
.`,
    `>
id:1
.
>
id:2
.`,
  ];
  for (const s of samples) {
    assert.deepEqual(
      liveParse(s),
      materializeSnapshot(parseSync(s)),
      s.slice(0, 40),
    );
  }
});

test("LiveXaiopParser feedLine matches feedText", () => {
  const source = `>
>a
x:1
.
>b
y:2
`;
  const a = liveParse(source);
  const live = new LiveXaiopParser();
  // Same splitter as parse: feedText path already covered; line loop without trailing empty
  const lines = source.replace(/\n$/, "").split("\n");
  for (const line of lines) live.feedLine(line);
  assert.deepEqual(materializeSnapshot(live.value()), a);
});

test("LiveXaiopParser compatibility forcedRoot matches parseSync", () => {
  const source = `id:1
name:a
`;
  assert.deepEqual(liveParse(source, true), materializeSnapshot(parseSync(source, true)));
});

test("checkpoint live Commit equals parseSync for phased encode", () => {
  const value = {
    meta: { t: 1 },
    a: { x: 1, items: [1, 2, 3] },
    b: { y: "z", nested: { k: true } },
  };
  const wire = encodeSync(value, { dotPolicy: DOT_POLICY.PER_TOP_LEVEL_KEY });
  const eng = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    onChunk: () => {},
  });
  for (let i = 0; i < wire.length; i += 7) {
    eng.push(wire.slice(i, i + 7));
  }
  eng.finish();
  assert.deepEqual(eng.committedSnapshot, parseSync(wire));
  assert.deepEqual(eng.snapshot, parseSync(wire));
});

test("checkpoint emitDiff false skips Diff but Commit matches parseSync", () => {
  const value = {
    a: { x: 1 },
    b: { y: 2 },
    c: { z: 3 },
  };
  const wire = encodeSync(value, { dotPolicy: DOT_POLICY.PER_TOP_LEVEL_KEY });
  /** @type {unknown[]} */
  const diffs = [];
  const eng = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    emitDiff: false,
    onChunk: (d) => diffs.push(d),
  });
  eng.push(wire);
  eng.finish();
  assert.ok(diffs.every((d) => d === null));
  assert.deepEqual(eng.committedSnapshot, parseSync(wire));
  assert.deepEqual(eng.snapshot, parseSync(wire));
});

test("checkpoint live Commit equals parseSync with many phases", () => {
  const value = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`k${i}`, { v: i, s: `x${i}` }]),
  );
  const wire = encodeSync(value, {
    dotPolicy: DOT_POLICY.PER_N_KEYS,
    phaseEvery: 1,
  });
  const eng = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    onChunk: () => {},
  });
  eng.push(wire);
  eng.finish();
  assert.deepEqual(eng.committedSnapshot, parseSync(wire));
});
