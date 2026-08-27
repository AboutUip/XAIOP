import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  PROTOCOL_VERSION,
  SDK_VERSION,
  parseSync,
  XaiopEngine,
  XaiopFragment,
  DotCheckpointEngine,
} from "../dist/index.js";

describe("protocol 0.6.0 # custom annotation", () => {
  test("versions", () => {
    assert.equal(PROTOCOL_VERSION, "0.7.0");
    assert.equal(SDK_VERSION, "0.15.1");
  });

  test("standalone # lines are ignored anywhere", () => {
    const v = parseSync(`# meta: run=1
>
# before field
x:1
# mid
y:2
#
# trailing
`);
    assert.deepEqual(v, { x: 1, y: 2 });
  });

  test("# does not move Cursor or end Block", () => {
    const v = parseSync(`>
>a
# still inside a
b:1
<
c:2
`);
    assert.deepEqual(v, { a: { b: 1 }, c: 2 });
  });

  test("# with arbitrary payload after hash", () => {
    const v = parseSync(`>
#@!$%^&*() <> : = path
#{"json":true}
#  spaces and 中文
k:ok
`);
    assert.deepEqual(v, { k: "ok" });
  });

  test("Content value may contain # without being annotation", () => {
    const v = parseSync(`>
note:#not-an-annotation-line
`);
    assert.deepEqual(v, { note: "#not-an-annotation-line" });
  });

  test("fragment + # lines", () => {
    const frag = parseSync(`# header
>meta
name:demo
`);
    assert.equal(frag.isFragment, true);
    assert.deepEqual(frag.entries, { meta: { name: "demo" } });
  });

  test("phases with # between .", () => {
    /** @type {unknown[]} */
    const diffs = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      compat: false,
      onChunk: (d) => diffs.push(d),
    });
    eng.push(`>
a:1
#
.
# between phases
>
b:2
.
`);
    eng.finish();
    assert.deepEqual(eng.snapshot, { a: 1, b: 2 });
    assert.ok(diffs.length >= 1);
  });

  test("custom annotation + Annotation Span: app mini-protocol on same # lines", () => {
    /** @type {unknown[]} */
    const diffs = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      compat: false,
      mergeChunkWindow: false,
      onChunk: (d) => diffs.push(d),
    });
    eng.onAnnotationSpan((ann, view) => {
      const t = ann.trim();
      if (t.startsWith("xaiop/v1 patch ")) {
        return { ...view.json, ...JSON.parse(t.slice("xaiop/v1 patch ".length)) };
      }
      return undefined;
    });
    eng.push(`>
#xaiop/v1 patch {"role":"sys"}
msg:hi
.
`);
    eng.finish();
    assert.equal(diffs[0].msg, "hi");
    assert.equal(diffs[0].role, "sys");
  });

  test("engine upload ignores #", () => {
    const e = new XaiopEngine();
    const id = e.uploadSync(`# ann
>
z:9
`);
    assert.deepEqual(e.getSync(id), { z: 9 });
  });

  test("leading whitespace before # is not annotation (bare/illegal or content)", () => {
    // Space before # ??not startsWith('#') after... we don't trim; " #" is bare-ish
    assert.throws(() => parseSync(`>\n #\n`));
  });
});
