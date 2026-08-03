/**
 * Parse history — snapshot (read-only) + realtime (forward jump).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DotCheckpointEngine,
  HISTORY_NODE_KIND,
  ParseHistory,
  SDK_VERSION,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopStream,
} from "../src/index.js";
import { chunksOf, waitStatus } from "./helpers/stream.js";

function pushPhases(engine, text) {
  engine.push(text);
}

/**
 * Build an engine plus a chunk sink.
 * @param {object} [opts]
 */
function makeEngine(opts = {}) {
  /** @type {unknown[]} */
  const chunks = [];
  const engine = new DotCheckpointEngine({
    streamProcessing: true,
    onChunk: (d) => chunks.push(d),
    ...opts,
  });
  return { engine, chunks };
}

const THREE_PHASES = ">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n";

describe("ParseHistory defaults", () => {
  it("is off unless snapshot or realtime is true", () => {
    const h = new ParseHistory();
    assert.equal(h.enabled, false);
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      onChunk: () => {},
    });
    assert.equal(engine.history, null);
  });

  it("enabled when only snapshot is true", () => {
    const h = new ParseHistory({ snapshot: true });
    assert.equal(h.enabled, true);
    assert.equal(h.snapshotEnabled, true);
    assert.equal(h.realtimeEnabled, false);
  });

  it("enabled when only realtime is true", () => {
    const h = new ParseHistory({ realtime: true });
    assert.equal(h.enabled, true);
    assert.equal(h.snapshotEnabled, false);
    assert.equal(h.realtimeEnabled, true);
  });

  it("enabled when both flags are true", () => {
    const h = new ParseHistory({ snapshot: true, realtime: true });
    assert.equal(h.enabled, true);
    assert.equal(h.snapshotEnabled, true);
    assert.equal(h.realtimeEnabled, true);
  });

  it("record is a no-op while disabled", () => {
    const h = new ParseHistory();
    const node = h.record({
      bufferStart: 0,
      bufferEnd: 4,
      wire: ">\n.\n",
      before: null,
      after: { a: 1 },
      diff: { a: 1 },
    });
    assert.equal(node, null);
    assert.equal(h.length, 0);
  });

  it("starts with liveCursor -1 and null sourceKey", () => {
    const h = new ParseHistory({ snapshot: true, realtime: true });
    assert.equal(h.liveCursor, -1);
    assert.equal(h.sourceKey, null);
    assert.equal(h.length, 0);
  });

  it("engine.history is non-null when only historySnapshot is set", () => {
    const { engine } = makeEngine({ historySnapshot: true });
    assert.ok(engine.history);
    assert.equal(engine.history.snapshotEnabled, true);
    assert.equal(engine.history.realtimeEnabled, false);
  });

  it("engine.history is non-null when only historyRealtime is set", () => {
    const { engine } = makeEngine({ historyRealtime: true });
    assert.ok(engine.history);
    assert.equal(engine.history.snapshotEnabled, false);
    assert.equal(engine.history.realtimeEnabled, true);
  });
});

describe("historyInfo", () => {
  it("reports an all-off shape when history is disabled", () => {
    const { engine } = makeEngine({});
    assert.deepEqual(engine.historyInfo(), {
      snapshot: false,
      realtime: false,
      length: 0,
      liveCursor: -1,
      sourceKey: null,
      hasRangeView: false,
      rangeView: null,
    });
  });

  it("reports live counters when history is enabled", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    assert.deepEqual(engine.historyInfo(), {
      snapshot: true,
      realtime: false,
      length: 3,
      liveCursor: -1,
      sourceKey: null,
      hasRangeView: false,
      rangeView: null,
    });
  });

  it("reports the maintained range view", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    engine.history.viewRange(0, 1);
    const info = engine.historyInfo();
    assert.equal(info.hasRangeView, true);
    assert.deepEqual(info.rangeView, { from: 0, to: 1 });
  });

  it("reports sourceKey and liveCursor after bind + jump", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    engine.history.setSource("http://a");
    engine.jumpTo(1);
    const info = engine.historyInfo();
    assert.equal(info.sourceKey, "http://a");
    assert.equal(info.liveCursor, 1);
    assert.equal(info.length, 2);
    assert.equal(info.hasRangeView, false);
  });

  it("info() from ParseHistory matches engine.historyInfo()", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    assert.deepEqual(engine.historyInfo(), engine.history.info());
  });
});

describe("history mode gates", () => {
  it("exportTimeRoot requires snapshot", () => {
    const h = new ParseHistory({ realtime: true });
    assert.throws(() => h.exportTimeRoot(), /exportTimeRoot requires snapshot/);
  });

  it("compare requires snapshot", () => {
    const h = new ParseHistory({ realtime: true });
    assert.throws(() => h.compare(0, 0), /compare requires snapshot/);
  });

  it("viewRange requires snapshot", () => {
    const h = new ParseHistory({ realtime: true });
    assert.throws(() => h.viewRange(0, 0), /viewRange requires snapshot/);
  });

  it("setSource requires snapshot", () => {
    const h = new ParseHistory({ realtime: true });
    assert.throws(() => h.setSource("http://a"), /setSource requires snapshot/);
  });

  it("release requires snapshot", () => {
    const h = new ParseHistory({ realtime: true });
    assert.throws(() => h.release(), /release requires snapshot/);
  });

  it("jumpTo requires realtime", () => {
    const h = new ParseHistory({ snapshot: true });
    assert.throws(() => h.jumpTo(0), /jumpTo requires realtime/);
  });

  it("canJumpTo is false when realtime is off", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    assert.equal(engine.history.canJumpTo(0), false);
  });

  it("engine.jumpTo throws without historyRealtime", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    assert.throws(() => engine.jumpTo(0), /jumpTo requires historyRealtime/);
  });

  it("engine.jumpTo throws when history is fully off", () => {
    const { engine } = makeEngine({ mergeChunkWindow: false });
    engine.push(">\na:1\n.\n");
    assert.throws(() => engine.jumpTo(0), /jumpTo requires historyRealtime/);
  });
});

describe("historySnapshot", () => {
  it("records per-dot before/after/diff under window merge", () => {
    /** @type {unknown[]} */
    const chunks = [];
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: true,
      historySnapshot: true,
      onChunk: (d) => chunks.push(d),
    });
    pushPhases(engine, ">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n");
    engine.finish();

    const h = engine.history;
    assert.ok(h);
    assert.equal(h.length, 3);
    assert.equal(h.getNode(0).kind, HISTORY_NODE_KIND.DOT);
    assert.deepEqual(h.getBefore(0), null);
    assert.deepEqual(h.getAfter(0), { a: 1 });
    assert.deepEqual(h.getDiff(0), { a: 1 });
    assert.deepEqual(h.getAfter(1), { a: 1, b: 2 });
    assert.deepEqual(h.getAfter(2), { a: 1, b: 2, c: 3 });
    // Window merge: one push → one onChunk with cumulative tree
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], { a: 1, b: 2, c: 3 });

    const root = h.exportTimeRoot();
    assert.equal(root.length, 3);
    assert.deepEqual(root[2].after, { a: 1, b: 2, c: 3 });

    const cmp = h.compare(0, 2);
    assert.deepEqual(cmp.a, { a: 1 });
    assert.deepEqual(cmp.b, { a: 1, b: 2, c: 3 });

    const view = h.viewRange(0, 1);
    assert.equal(view.from, 0);
    assert.equal(view.to, 1);
    assert.deepEqual(view.json, { a: 1, b: 2 });
    // Cached
    const view2 = h.viewRange(0, 1);
    assert.deepEqual(view2.json, view.json);
  });

  it("setSource releases on URL change", () => {
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      historySnapshot: true,
      onChunk: () => {},
    });
    engine.push(">\na:1\n.\n");
    const h = engine.history;
    h.setSource("http://a");
    assert.equal(h.length, 1);
    const r = h.setSource("http://b");
    assert.equal(r.released, true);
    assert.equal(h.length, 0);
    assert.equal(h.sourceKey, "http://b");
  });

  it("release clears nodes", () => {
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      historySnapshot: true,
      onChunk: () => {},
    });
    engine.push(">\na:1\n.\n");
    engine.history.release();
    assert.equal(engine.history.length, 0);
  });

  it("stepwise mode emits one onChunk per dot and one node per dot", () => {
    const { engine, chunks } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    engine.finish();
    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks, [{ a: 1 }, { b: 2 }, { c: 3 }]);
    assert.equal(engine.history.length, chunks.length);
  });

  it("stepwise node diffs are phase-local while after stays cumulative", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    engine.finish();
    const root = engine.history.exportTimeRoot();
    assert.deepEqual(
      root.map((n) => n.diff),
      [{ a: 1 }, { b: 2 }, { c: 3 }],
    );
    assert.deepEqual(
      root.map((n) => n.after),
      [{ a: 1 }, { a: 1, b: 2 }, { a: 1, b: 2, c: 3 }],
    );
    assert.deepEqual(
      root.map((n) => n.before),
      [null, { a: 1 }, { a: 1, b: 2 }],
    );
  });

  it("node buffer offsets are contiguous and match the wire", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    engine.finish();
    const root = engine.history.exportTimeRoot();
    assert.equal(root[0].bufferStart, 0);
    for (let i = 0; i < root.length; i++) {
      assert.equal(
        root[i].wire,
        THREE_PHASES.slice(root[i].bufferStart, root[i].bufferEnd),
      );
      if (i > 0) assert.equal(root[i].bufferStart, root[i - 1].bufferEnd);
    }
    assert.equal(root[root.length - 1].bufferEnd, THREE_PHASES.length);
  });

  it("empty phase from consecutive dots records a null diff", () => {
    const { engine, chunks } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n.\n");
    engine.finish();
    const h = engine.history;
    assert.equal(h.length, 2);
    assert.equal(h.getDiff(1), null);
    assert.deepEqual(h.getAfter(1), { a: 1 });
    assert.deepEqual(h.getBefore(1), { a: 1 });
    assert.equal(h.getNode(1).wire, ".\n");
    assert.deepEqual(chunks, [{ a: 1 }, null]);
  });

  it("empty phase also records null diff under window merge", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: true,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n.\n");
    engine.finish();
    assert.equal(engine.history.length, 2);
    assert.equal(engine.history.getDiff(1), null);
  });

  it("EOF tail without a trailing dot records kind tail", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n>\nb:2\n");
    engine.finish();
    const root = engine.history.exportTimeRoot();
    assert.deepEqual(
      root.map((n) => n.kind),
      [HISTORY_NODE_KIND.DOT, HISTORY_NODE_KIND.TAIL],
    );
    assert.deepEqual(root[1].after, { a: 1, b: 2 });
    assert.equal(root[1].wire, ">\nb:2\n");
  });

  it("a dotless document records a single tail node", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n");
    engine.finish();
    const root = engine.history.exportTimeRoot();
    assert.equal(root.length, 1);
    assert.equal(root[0].kind, HISTORY_NODE_KIND.TAIL);
    assert.deepEqual(root[0].after, { a: 1 });
  });

  it("getNode returns a clone that cannot poison history", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    const h = engine.history;
    const node = h.getNode(0);
    node.after.a = 999;
    node.diff.a = 999;
    node.kind = "tail";
    assert.deepEqual(h.getAfter(0), { a: 1 });
    assert.deepEqual(h.getDiff(0), { a: 1 });
    assert.equal(h.getNode(0).kind, HISTORY_NODE_KIND.DOT);
  });

  it("getBefore/getAfter/getDiff hand out isolated clones", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n>\nb:2\n.\n");
    const h = engine.history;
    h.getAfter(1).a = 999;
    h.getBefore(1).a = 999;
    h.getDiff(1).b = 999;
    assert.deepEqual(h.getAfter(1), { a: 1, b: 2 });
    assert.deepEqual(h.getBefore(1), { a: 1 });
    assert.deepEqual(h.getDiff(1), { b: 2 });
    assert.notEqual(h.getAfter(1), h.getAfter(1));
  });

  it("exportTimeRoot returns clones detached from history", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    const h = engine.history;
    const root = h.exportTimeRoot();
    root[0].after.a = 999;
    assert.deepEqual(h.getAfter(0), { a: 1 });
    assert.notEqual(h.exportTimeRoot()[0], root[0]);
  });

  it("compare of the same index yields equal trees", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    const cmp = engine.history.compare(1, 1);
    assert.equal(cmp.indexA, 1);
    assert.equal(cmp.indexB, 1);
    assert.deepEqual(cmp.a, cmp.b);
    assert.deepEqual(cmp.a, { a: 1, b: 2 });
    assert.notEqual(cmp.a, cmp.b);
  });

  it("compare rejects out-of-range indices", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    assert.throws(() => engine.history.compare(0, 5), /out of range/);
    assert.throws(() => engine.history.compare(-1, 0), /out of range/);
  });

  it("viewRange throws when from > to", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    assert.throws(() => engine.history.viewRange(2, 1), RangeError);
    assert.throws(() => engine.history.viewRange(2, 1), /from \(2\) > to \(1\)/);
  });

  it("viewRange throws for out-of-range bounds", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    assert.throws(() => engine.history.viewRange(0, 3), /out of range/);
    assert.throws(() => engine.history.viewRange(-1, 2), /out of range/);
    assert.throws(() => engine.history.viewRange(0, 1.5), /out of range/);
  });

  it("viewRange over a single node re-parses just that wire", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    const view = engine.history.viewRange(1, 1);
    assert.equal(view.nodes.length, 1);
    assert.deepEqual(view.json, { b: 2 });
  });

  it("viewRange nodes are clones of the retained slice", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(THREE_PHASES);
    const h = engine.history;
    const view = h.viewRange(0, 2);
    view.nodes[0].after.a = 999;
    view.json.a = 999;
    assert.deepEqual(h.getAfter(0), { a: 1 });
    assert.deepEqual(h.viewRange(0, 2).json, { a: 1, b: 2, c: 3 });
  });

  it("viewRange without retained wire falls back to the after of `to`", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
      retainWireHistory: false,
    });
    engine.push(THREE_PHASES);
    const h = engine.history;
    assert.equal(h.getNode(0).wire, null);
    const view = h.viewRange(0, 1);
    assert.deepEqual(view.json, { a: 1, b: 2 });
    assert.deepEqual(view.json, h.getAfter(1));
  });

  it("recording past the range view invalidates the cache", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n>\nb:2\n.\n");
    const h = engine.history;
    h.viewRange(0, 1);
    assert.equal(h.info().hasRangeView, true);
    engine.push(">\nc:3\n.\n");
    assert.equal(h.info().hasRangeView, true);
    assert.deepEqual(h.viewRange(0, 2).json, { a: 1, b: 2, c: 3 });
  });

  it("setSource with the same key does not release", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    const h = engine.history;
    const first = h.setSource("http://a");
    assert.deepEqual(first, { released: false, previous: null });
    const second = h.setSource("http://a");
    assert.deepEqual(second, { released: false, previous: "http://a" });
    assert.equal(h.length, 1);
  });

  it("setSource(null) clears the binding and releases nodes", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    const h = engine.history;
    h.setSource("http://a");
    const r = h.setSource(null);
    assert.equal(r.released, true);
    assert.equal(r.previous, "http://a");
    assert.equal(h.sourceKey, null);
    assert.equal(h.length, 0);
  });

  it("setSource('') is treated as null", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    const h = engine.history;
    h.setSource("http://a");
    const r = h.setSource("");
    assert.equal(r.released, true);
    assert.equal(h.sourceKey, null);
  });

  it("setSource from null does not release retained nodes", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    const h = engine.history;
    const r = h.setSource(null);
    assert.equal(r.released, false);
    assert.equal(h.length, 1);
  });

  it("release resets nodes, cursor, range view and source key", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    const h = engine.history;
    h.setSource("http://a");
    h.viewRange(0, 1);
    engine.jumpTo(1);
    h.release();
    assert.deepEqual(h.info(), {
      snapshot: true,
      realtime: true,
      length: 0,
      liveCursor: -1,
      sourceKey: null,
      hasRangeView: false,
      rangeView: null,
    });
  });

  it("indexing errors name the current length", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    assert.throws(
      () => engine.history.getNode(3),
      /history index out of range: 3 \(length 1\)/,
    );
  });
});

describe("historyRealtime", () => {
  it("jumpTo keeps positioning node and discards after", () => {
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      historyRealtime: true,
      onChunk: () => {},
    });
    engine.push(">\na:1\n.\n");
    engine.push(">\nb:2\n.\n");
    engine.push(">\nc:3\n.\n");
    engine.finish();

    const h = engine.history;
    assert.equal(h.length, 3);
    assert.equal(h.liveCursor, -1);
    assert.equal(h.canJumpTo(1), true);
    assert.equal(h.canJumpTo(0), true);

    const result = engine.jumpTo(1);
    assert.equal(result.kept, 2);
    assert.equal(result.discarded, 1);
    assert.deepEqual(result.after, { a: 1, b: 2 });
    assert.equal(h.length, 2);
    assert.equal(h.liveCursor, 1);
    assert.deepEqual(engine.committedSnapshot, { a: 1, b: 2 });
    assert.equal(h.canJumpTo(1), false);
    assert.equal(h.canJumpTo(0), false);

    assert.throws(() => engine.jumpTo(0), /forward/);
    assert.throws(() => engine.jumpTo(1), /forward/);
  });

  it("after jump, further push continues from retained prefix", () => {
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      historyRealtime: true,
      onChunk: () => {},
    });
    engine.push(">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n");
    engine.jumpTo(0);
    assert.deepEqual(engine.committedSnapshot, { a: 1 });
    engine.push(">\nz:9\n.\n");
    assert.equal(engine.history.length, 2);
    assert.deepEqual(engine.history.getAfter(1), { a: 1, z: 9 });
  });

  it("jumpTo(0) discards everything after the first node", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    const r = engine.jumpTo(0);
    assert.equal(r.index, 0);
    assert.equal(r.kept, 1);
    assert.equal(r.discarded, 2);
    assert.deepEqual(r.after, { a: 1 });
    assert.equal(engine.history.length, 1);
    assert.deepEqual(engine.committedSnapshot, { a: 1 });
  });

  it("jumpTo the last index discards nothing", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    const r = engine.jumpTo(2);
    assert.equal(r.kept, 3);
    assert.equal(r.discarded, 0);
    assert.deepEqual(r.after, { a: 1, b: 2, c: 3 });
    assert.equal(engine.history.length, 3);
    assert.equal(engine.history.liveCursor, 2);
  });

  it("canJumpTo is false for negative, fractional and out-of-range indices", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    const h = engine.history;
    assert.equal(h.canJumpTo(-1), false);
    assert.equal(h.canJumpTo(3), false);
    assert.equal(h.canJumpTo(1.5), false);
    assert.equal(h.canJumpTo(Number.NaN), false);
    assert.equal(h.canJumpTo(2), true);
  });

  it("canJumpTo is false at or behind the live cursor", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    engine.jumpTo(1);
    const h = engine.history;
    assert.equal(h.canJumpTo(0), false);
    assert.equal(h.canJumpTo(1), false);
    assert.equal(h.canJumpTo(2), false);
  });

  it("jumpTo rejects out-of-range indices before the forward check", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(">\na:1\n.\n");
    assert.throws(() => engine.jumpTo(1), /out of range/);
    assert.throws(() => engine.jumpTo(-1), /out of range/);
  });

  it("jump after finish reopens the engine so push works again", () => {
    const { engine, chunks } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    engine.finish();
    assert.throws(() => engine.push(">\nq:0\n.\n"), /closed/);
    engine.jumpTo(1);
    engine.push(">\nz:9\n.\n");
    engine.finish();
    assert.equal(engine.history.length, 3);
    assert.deepEqual(engine.history.getAfter(2), { a: 1, b: 2, z: 9 });
    assert.deepEqual(engine.committedSnapshot, { a: 1, b: 2, z: 9 });
    assert.deepEqual(chunks[chunks.length - 1], { z: 9 });
  });

  it("wirePrefix rebuilds the buffer and matches committedSnapshot", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    const r = engine.jumpTo(1);
    assert.equal(r.wirePrefix, ">\na:1\n.\n>\nb:2\n.\n");
    assert.equal(engine.buffer, r.wirePrefix);
    assert.equal(engine.committedAt, r.wirePrefix.length);
    assert.equal(r.bufferEnd, r.wirePrefix.length);
    assert.deepEqual(engine.committedSnapshot, r.after);
  });

  it("wirePrefix is null when wire retention is off but commit still rebuilds", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
      retainWireHistory: false,
    });
    engine.push(THREE_PHASES);
    const r = engine.jumpTo(1);
    assert.equal(r.wirePrefix, null);
    assert.equal(engine.buffer, ">\na:1\n.\n>\nb:2\n.\n");
    assert.deepEqual(engine.committedSnapshot, { a: 1, b: 2 });
  });

  it("a discarded index cannot be jumped to again", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    engine.jumpTo(0);
    assert.equal(engine.history.canJumpTo(1), false);
    assert.throws(() => engine.jumpTo(1), /out of range/);
  });

  it("after a middle jump only newly recorded nodes are reachable", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n>\nd:4\n.\n");
    assert.equal(engine.history.length, 4);
    engine.jumpTo(1);
    assert.equal(engine.history.length, 2);
    assert.equal(engine.history.canJumpTo(2), false);
    engine.push(">\ne:5\n.\n>\nf:6\n.\n");
    assert.equal(engine.history.length, 4);
    assert.equal(engine.history.canJumpTo(2), true);
    const r = engine.jumpTo(3);
    assert.deepEqual(r.after, { a: 1, b: 2, e: 5, f: 6 });
    assert.equal(engine.history.liveCursor, 3);
  });

  it("getDiff works in realtime-only mode", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(">\na:1\n.\n>\nb:2\n.\n");
    const h = engine.history;
    assert.deepEqual(h.getDiff(0), { a: 1 });
    assert.deepEqual(h.getDiff(1), { b: 2 });
    assert.deepEqual(h.getBefore(1), { a: 1 });
    assert.deepEqual(h.getAfter(1), { a: 1, b: 2 });
    assert.equal(h.getNode(0).kind, HISTORY_NODE_KIND.DOT);
    assert.throws(() => h.exportTimeRoot(), /requires snapshot/);
  });

  it("jump clears the pending latest snapshot", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    engine.finish();
    assert.notEqual(engine.snapshot, undefined);
    engine.jumpTo(1);
    assert.equal(engine.snapshot, undefined);
  });
});

describe("dual history modes", () => {
  it("snapshot inspect then realtime truncate", () => {
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      historySnapshot: true,
      historyRealtime: true,
      onChunk: () => {},
    });
    engine.push(">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n");
    const h = engine.history;
    const cmp = h.compare(0, 2);
    assert.deepEqual(cmp.b, { a: 1, b: 2, c: 3 });
    engine.jumpTo(1);
    assert.equal(h.length, 2);
    assert.throws(() => h.compare(0, 2), /out of range/);
    assert.deepEqual(h.getAfter(1), { a: 1, b: 2 });
  });

  it("exportTimeRoot shrinks after a jump", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    const h = engine.history;
    assert.equal(h.exportTimeRoot().length, 3);
    const before = h.exportTimeRoot();
    engine.jumpTo(1);
    assert.equal(h.exportTimeRoot().length, 2);
    // Previously exported roots are detached snapshots and stay intact.
    assert.equal(before.length, 3);
  });

  it("a range view built before a jump is invalidated by the jump", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    const h = engine.history;
    assert.deepEqual(h.viewRange(0, 2).json, { a: 1, b: 2, c: 3 });
    assert.equal(h.info().hasRangeView, true);
    engine.jumpTo(1);
    assert.equal(h.info().hasRangeView, false);
    assert.throws(() => h.viewRange(0, 2), /out of range/);
    assert.deepEqual(h.viewRange(0, 1).json, { a: 1, b: 2 });
  });

  it("window merge still records one node per dot with both modes on", () => {
    const { engine, chunks } = makeEngine({
      mergeChunkWindow: true,
      historySnapshot: true,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    engine.finish();
    assert.equal(engine.history.length, 3);
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], { a: 1, b: 2, c: 3 });
    assert.deepEqual(
      engine.history.exportTimeRoot().map((n) => n.diff),
      [{ a: 1 }, { b: 2 }, { c: 3 }],
    );
  });

  it("window merge with a single dot delivers that node's diff", () => {
    const { engine, chunks } = makeEngine({
      mergeChunkWindow: true,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n");
    engine.push(">\nb:2\n.\n");
    engine.finish();
    assert.equal(engine.history.length, 2);
    assert.deepEqual(chunks, [{ a: 1 }, { b: 2 }]);
  });

  it("setSource release also resets the realtime cursor", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
      historyRealtime: true,
    });
    engine.push(THREE_PHASES);
    const h = engine.history;
    h.setSource("http://a");
    engine.jumpTo(1);
    assert.equal(h.liveCursor, 1);
    h.setSource("http://b");
    assert.equal(h.liveCursor, -1);
    assert.equal(h.length, 0);
  });
});

describe("history wire shapes", () => {
  it("CRLF wire still records phases", () => {
    const { engine, chunks } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\r\na:1\r\n.\r\n>\r\nb:2\r\n.\r\n");
    engine.finish();
    const root = engine.history.exportTimeRoot();
    assert.equal(root.length, 2);
    assert.equal(root[0].wire, ">\r\na:1\r\n.\r\n");
    assert.equal(root[1].wire, ">\r\nb:2\r\n.\r\n");
    assert.deepEqual(root[1].after, { a: 1, b: 2 });
    assert.deepEqual(chunks, [{ a: 1 }, { b: 2 }]);
  });

  it("CRLF wire supports viewRange re-parse", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\r\na:1\r\n.\r\n>\r\nb:2\r\n.\r\n");
    engine.finish();
    assert.deepEqual(engine.history.viewRange(0, 1).json, { a: 1, b: 2 });
  });

  it("named array append accumulates across dots in after trees", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\n>items-\n>\nid:1\n<\n.\n");
    engine.push(">\n>items-\n>\nid:2\n<\n>\nid:3\n<\n.\n");
    engine.finish();
    const root = engine.history.exportTimeRoot();
    assert.equal(root.length, 2);
    assert.deepEqual(root[0].after, { items: [{ id: 1 }] });
    assert.deepEqual(root[1].after, {
      items: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    assert.deepEqual(root[1].diff, { items: [{ id: 2 }, { id: 3 }] });
  });

  it("named array viewRange re-parse matches the cumulative tree", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\n>items-\n>\nid:1\n<\n.\n");
    engine.push(">\n>items-\n>\nid:2\n<\n>\nid:3\n<\n.\n");
    engine.finish();
    assert.deepEqual(engine.history.viewRange(0, 1).json, {
      items: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
  });

  it("emitDiff false records null diffs but keeps after trees", () => {
    const { engine, chunks } = makeEngine({
      mergeChunkWindow: true,
      historySnapshot: true,
      emitDiff: false,
    });
    engine.push(">\na:1\n.\n>\nb:2\n.\n");
    engine.finish();
    const root = engine.history.exportTimeRoot();
    assert.equal(root.length, 2);
    assert.deepEqual(
      root.map((n) => n.diff),
      [null, null],
    );
    assert.deepEqual(root[1].after, { a: 1, b: 2 });
    assert.deepEqual(chunks, [null]);
  });

  it("records across chunk splits that land mid-line", () => {
    const { engine } = makeEngine({
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    engine.push(">\na:");
    assert.equal(engine.history.length, 0);
    engine.push("1\n.\n>\nb:2\n");
    assert.equal(engine.history.length, 1);
    engine.push(".\n");
    engine.finish();
    assert.equal(engine.history.length, 2);
    assert.deepEqual(engine.history.getAfter(1), { a: 1, b: 2 });
  });
});

describe("history off keeps prior semantics", () => {
  it("no history allocation; window merge unchanged", () => {
    /** @type {unknown[]} */
    const chunks = [];
    const engine = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: true,
      onChunk: (d) => chunks.push(d),
    });
    engine.push(">\na:1\n.\n>\nb:2\n.\n");
    engine.finish();
    assert.equal(engine.history, null);
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], { a: 1, b: 2 });
  });

  it("stepwise diffs are identical with and without snapshot history", () => {
    const off = makeEngine({ mergeChunkWindow: false });
    const on = makeEngine({ mergeChunkWindow: false, historySnapshot: true });
    for (const { engine } of [off, on]) {
      engine.push(">\na:1\n.\n>\nb:2\n.\n>\nc:3\n");
      engine.finish();
    }
    assert.deepEqual(on.chunks, off.chunks);
    assert.deepEqual(on.engine.snapshot, off.engine.snapshot);
  });

  it("streamProcessing false leaves history empty", () => {
    const { engine, chunks } = makeEngine({
      streamProcessing: false,
      historySnapshot: true,
    });
    engine.push(">\na:1\n.\n>\nb:2\n.\n");
    engine.finish();
    assert.equal(engine.history.length, 0);
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], { a: 1, b: 2 });
  });
});

describe("XaiopStream history integration", () => {
  it("exposes history flags as getters", () => {
    const stream = new XaiopStream("raw://flags", {
      historySnapshot: true,
      historyRealtime: true,
    });
    assert.equal(stream.historySnapshot, true);
    assert.equal(stream.historyRealtime, true);
    assert.equal(stream.history, null);
  });

  it("defaults both history flags to false", () => {
    const stream = new XaiopStream("raw://flags");
    assert.equal(stream.historySnapshot, false);
    assert.equal(stream.historyRealtime, false);
  });

  it("jumpTo without an active engine throws", () => {
    const stream = new XaiopStream("raw://flags", { historyRealtime: true });
    assert.throws(() => stream.jumpTo(0), /requires an active send\/engine/);
  });

  it("history stays null on the engine when flags are off", async () => {
    const stream = new XaiopStream("raw://plain", { mergeChunkWindow: false });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.equal(stream.history, null);
    assert.throws(() => stream.jumpTo(0), /requires historyRealtime/);
  });

  it("records nodes for each phase after send completes", async () => {
    const stream = new XaiopStream("raw://snap", {
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    /** @type {unknown[]} */
    const chunks = [];
    stream.onChunk((d) => chunks.push(d));
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n", ">\nb:2\n.\n", ">\nc:3\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    const h = stream.history;
    assert.ok(h);
    assert.equal(h.length, 3);
    assert.equal(h.length, chunks.length);
    assert.deepEqual(h.getAfter(2), { a: 1, b: 2, c: 3 });
    assert.deepEqual(h.exportTimeRoot().map((n) => n.diff), chunks);
  });

  it("binds the send url as the history source key", async () => {
    const stream = new XaiopStream("raw://bind", {
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.equal(stream.history.sourceKey, "raw://bind");
  });

  it("setUrl while idle releases the retained snapshot history", async () => {
    const stream = new XaiopStream("raw://first", {
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n>\nb:2\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.equal(stream.history.length, 2);
    assert.equal(stream.setUrl("raw://second"), true);
    assert.equal(stream.history.length, 0);
    assert.equal(stream.history.sourceKey, "raw://second");
    assert.equal(stream.url, "raw://second");
  });

  it("setUrl to the same url keeps retained history", async () => {
    const stream = new XaiopStream("raw://same", {
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.equal(stream.setUrl("raw://same"), true);
    assert.equal(stream.history.length, 1);
  });

  it("a fresh send installs a new engine history", async () => {
    const stream = new XaiopStream("raw://reuse", {
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n>\nb:2\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    const first = stream.history;
    assert.equal(first.length, 2);

    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\nz:9\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.notEqual(stream.history, first);
    assert.equal(stream.history.length, 1);
    assert.deepEqual(stream.history.getAfter(0), { z: 9 });
  });

  it("jumpTo rewinds committed snapshot and buffer", async () => {
    const stream = new XaiopStream("raw://jump", {
      mergeChunkWindow: false,
      historySnapshot: true,
      historyRealtime: true,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n", ">\nb:2\n.\n", ">\nc:3\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.deepEqual(stream.getCommittedSnapshot(), { a: 1, b: 2, c: 3 });

    const r = stream.jumpTo(1);
    assert.equal(r.kept, 2);
    assert.equal(r.discarded, 1);
    assert.deepEqual(stream.getCommittedSnapshot(), { a: 1, b: 2 });
    assert.deepEqual(stream.getCommittedSnapshot(), r.after);
    assert.equal(stream.getBufferedText(), ">\na:1\n.\n>\nb:2\n.\n");
    assert.equal(stream.getSnapshot(), undefined);
    assert.equal(stream.history.length, 2);
  });

  it("getCommittedSnapshot after jump matches history after tree", async () => {
    const stream = new XaiopStream("raw://match", {
      mergeChunkWindow: false,
      historySnapshot: true,
      historyRealtime: true,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    stream.jumpTo(0);
    assert.deepEqual(
      stream.getCommittedSnapshot(),
      stream.history.getAfter(stream.history.length - 1),
    );
  });

  it("records history with mergeChunkWindow on", async () => {
    const stream = new XaiopStream("raw://merged", {
      mergeChunkWindow: true,
      historySnapshot: true,
    });
    /** @type {unknown[]} */
    const chunks = [];
    stream.onChunk((d) => chunks.push(d));
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.equal(stream.history.length, 3);
    assert.equal(chunks.length, 1);
  });

  it("records history with asyncParse ingest", async () => {
    const stream = new XaiopStream("raw://async-hist", {
      mergeChunkWindow: true,
      asyncParse: true,
      historySnapshot: true,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n", ">\nb:2\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.equal(stream.history.length, 2);
    assert.deepEqual(stream.history.getAfter(1), { a: 1, b: 2 });
  });

  it("records a tail node when the wire ends without a dot", async () => {
    const stream = new XaiopStream("raw://tail", {
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n>\nb:2\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    const root = stream.history.exportTimeRoot();
    assert.deepEqual(
      root.map((n) => n.kind),
      [HISTORY_NODE_KIND.DOT, HISTORY_NODE_KIND.TAIL],
    );
  });

  it("retainWireHistory false drops per-node wire on the stream", async () => {
    const stream = new XaiopStream("raw://nowire", {
      mergeChunkWindow: false,
      historySnapshot: true,
      retainWireHistory: false,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n>\nb:2\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.deepEqual(
      stream.history.exportTimeRoot().map((n) => n.wire),
      [null, null],
    );
    assert.deepEqual(stream.history.viewRange(0, 1).json, { a: 1, b: 2 });
  });

  it("history still records when no chunk consumer wants diffs", async () => {
    const stream = new XaiopStream("raw://nodiff", {
      mergeChunkWindow: false,
      historySnapshot: true,
    });
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n>\nb:2\n.\n"),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    const root = stream.history.exportTimeRoot();
    assert.equal(root.length, 2);
    assert.deepEqual(
      root.map((n) => n.diff),
      [null, null],
    );
    assert.deepEqual(root[1].after, { a: 1, b: 2 });
  });
});

describe("history package surface", () => {
  it("exports the node kind constants", () => {
    assert.deepEqual(HISTORY_NODE_KIND, { DOT: "dot", TAIL: "tail" });
    assert.equal(Object.isFrozen(HISTORY_NODE_KIND), true);
  });

  it("exports SDK_VERSION 0.7.0", () => {
    assert.equal(SDK_VERSION, "0.7.0");
  });

  it("exports ParseHistory as a constructible class", () => {
    assert.equal(typeof ParseHistory, "function");
    assert.ok(new ParseHistory({ snapshot: true }) instanceof ParseHistory);
  });
});
