import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  PROTOCOL_VERSION,
  SDK_VERSION,
  LINE_KIND,
  classifyLine,
  emptyLineView,
  runLineInterceptChain,
  DotCheckpointEngine,
  XaiopStream,
  XaiopWs,
  TRANSPORT_KIND,
  STREAM_STATUS,
} from "../dist/index.js";
import {
  chunksOf,
  charChunks,
  runRawStream,
  waitStatus,
} from "./helpers/stream.js";

describe("line intercept ?versions + classify", () => {
  test("SDK / protocol versions", () => {
    assert.equal(PROTOCOL_VERSION, "0.7.0");
    assert.equal(SDK_VERSION, "0.16.0");
  });

  test("LINE_KIND is frozen with stable ids", () => {
    assert.equal(Object.isFrozen(LINE_KIND), true);
    assert.equal(LINE_KIND.PHASE, "phase");
    assert.equal(LINE_KIND.CONTENT, "content");
  });

  test("emptyLineView has all fixed slots", () => {
    const v = emptyLineView("raw", LINE_KIND.UNKNOWN);
    assert.deepEqual(Object.keys(v).sort(), [
      "annotationText",
      "key",
      "kind",
      "name",
      "path",
      "raw",
      "valueText",
    ]);
  });

  test("classifyLine ?kind matrix", () => {
    assert.equal(classifyLine(".").kind, LINE_KIND.PHASE);
    assert.equal(classifyLine("#note").annotationText, "note");
    assert.equal(classifyLine("k:null").valueText, "null");
    assert.equal(classifyLine("&a>b").path, "a>b");
    assert.equal(classifyLine("?id:A2").kind, LINE_KIND.SELECT);
    assert.equal(classifyLine("?id:A2").path, "id:A2");
    assert.equal(classifyLine("?*").kind, LINE_KIND.SELECT);
  });
});

describe("line intercept ?chain helpers", () => {
  test("order, rewrite, null short-circuit", () => {
    const out = runLineInterceptChain("a:1", [
      () => "a:2",
      ({ raw }) => raw,
    ]);
    assert.equal(out, "a:2");
    assert.equal(
      runLineInterceptChain("x", [
        () => "y",
        () => null,
        () => {
          throw new Error("no");
        },
      ]),
      null,
    );
  });
});

describe("line intercept ?DotCheckpointEngine", () => {
  test("skip line with null (?Content key:null)", () => {
    /** @type {unknown[]} */
    const diffs = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      compat: false,
      mergeChunkWindow: false,
      onChunk: (d) => diffs.push(d),
    });
    eng.onLineIntercept(({ view }) =>
      view.key === "skip" ? null : undefined,
    );
    eng.push(`>
keep:1
skip:99
empty:null
.
`);
    eng.finish();
    assert.deepEqual(diffs[0], { keep: 1, empty: null });
  });

  test("rewrite + registration order", () => {
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      compat: false,
      onChunk: () => {},
    });
    eng.onLineIntercept(({ raw }) => (raw === "a:1" ? "a:2" : undefined));
    eng.onLineIntercept(({ raw }) => {
      if (raw === "a:2") return "a:3";
      return undefined;
    });
    eng.push(`>
a:1
.
`);
    eng.finish();
    assert.deepEqual(eng.committedSnapshot, { a: 3 });
  });

  test("partial lines wait for newline", () => {
    const seen = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      compat: false,
      mergeChunkWindow: false,
      onChunk: () => {},
    });
    eng.onLineIntercept(({ raw }) => {
      seen.push(raw);
      return undefined;
    });
    eng.push(">\n");
    eng.push("a:");
    assert.deepEqual(seen, [">"]);
    eng.push("1\n.\n");
    eng.finish();
    assert.ok(seen.includes("a:1"));
  });

  test("streamProcessing defaults true ?intercept runs without explicit flag", () => {
    /** @type {string[]} */
    const seen = [];
    const eng = new DotCheckpointEngine({
      compat: false,
      onChunk: () => {},
      lineIntercept: ({ raw }) => {
        seen.push(raw);
        return undefined;
      },
    });
    assert.equal(eng.streamProcessing, true);
    eng.push(`>
a:1
.
`);
    eng.finish();
    assert.ok(seen.includes(">"));
    assert.ok(seen.includes("a:1"));
    assert.ok(seen.includes("."));
    assert.deepEqual(eng.committedSnapshot, { a: 1 });
  });

  test("streamProcessing false ?no intercept", () => {
    let calls = 0;
    const eng = new DotCheckpointEngine({
      streamProcessing: false,
      compat: false,
      onChunk: () => {},
      lineIntercept: () => {
        calls += 1;
        return null;
      },
    });
    eng.push(`>
a:1
`);
    eng.finish();
    assert.equal(calls, 0);
    assert.deepEqual(eng.committedSnapshot, { a: 1 });
  });
});

describe("line intercept ?Stream / WS", () => {
  test("RAW stream rewrite", async () => {
    const source = `>
x:1
.
`;
    const { done } = await runRawStream(source, chunksOf(source), {
      lineIntercept: ({ view }) => (view.key === "x" ? "x:77" : undefined),
      mergeChunkWindow: false,
    });
    assert.deepEqual(done, { x: 77 });
  });

  test("WS connect option skip", async () => {
    const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
    try {
      hub.onConnection(async (conn) => {
        conn.pushWire(`>
drop:1
keep:2
.
`);
        await conn.end();
      });
      const client = await XaiopWs.connect(hub.url(), {
        lineIntercept: ({ view }) =>
          view.key === "drop" ? null : undefined,
      });
      assert.deepEqual(await client.done, { keep: 2 });
    } finally {
      await hub.close();
    }
  });
});
