/**
 * Protocol 0.7 Draft — `?` select + bare `&` across history / jumpTo / cover /
 * intercept / window / stream. Lockstep with Python, Java, Go.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DotCheckpointEngine,
  HISTORY_NODE_KIND,
  LINE_KIND,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopStream,
  XaiopSyntaxError,
  parseSync,
} from "../dist/index.js";
import { chunksOf, waitStatus } from "./helpers/stream.js";

const SEED = ">\n>orders-\n>\nid:A1\nstatus:pending\n<\n>\nid:A2\nstatus:pending\n<\n>\nid:A3\nstatus:done\n.\n";
const SELECT_A2 = "@orders\n?id:A2\nstatus:shipped\n.\n";
const SPLICE_A1 = "@orders\n?id:A1\n&\n.\n";
const STAR_SHIPPED = "@orders\n?*status:shipped\nchecked:true\n.\n";
const LOCATE_SELECT = "=orders\n?1\nnote:ok\n.\n";
const FULL = SEED + SELECT_A2 + SPLICE_A1;

const AFTER_SEED = {
  orders: [
    { id: "A1", status: "pending" },
    { id: "A2", status: "pending" },
    { id: "A3", status: "done" },
  ],
};
const AFTER_SELECT = {
  orders: [
    { id: "A1", status: "pending" },
    { id: "A2", status: "shipped" },
    { id: "A3", status: "done" },
  ],
};
const AFTER_SPLICE = {
  orders: [
    { id: "A2", status: "shipped" },
    { id: "A3", status: "done" },
  ],
};
const AFTER_INTERCEPT = {
  orders: [
    { id: "A1", status: "shipped" },
    { id: "A2", status: "pending" },
    { id: "A3", status: "done" },
  ],
};
const AFTER_STAR = {
  orders: [
    { id: "A1", status: "pending" },
    { id: "A2", status: "shipped", checked: true },
    { id: "A3", status: "done" },
  ],
};

function rewriteSelectA2({ view, raw }) {
  return view.kind === LINE_KIND.SELECT && view.path === "id:A2" ? "?id:A1" : raw;
}

function makeEngine(opts = {}) {
  const chunks = [];
  const engine = new DotCheckpointEngine({
    streamProcessing: true,
    mergeChunkWindow: false,
    onChunk: (d) => chunks.push(d),
    ...opts,
  });
  return { engine, chunks };
}

describe("array select × history snapshot", () => {
  it("records after-trees for seed / predicate / splice", () => {
    const { engine } = makeEngine({ historySnapshot: true });
    engine.push(FULL);
    const h = engine.history;
    assert.equal(h.length, 3);
    assert.deepEqual(h.getAfter(0), AFTER_SEED);
    assert.deepEqual(h.getAfter(1), AFTER_SELECT);
    assert.deepEqual(h.getAfter(2), AFTER_SPLICE);
    assert.deepEqual(h.getBefore(1), AFTER_SEED);
    assert.deepEqual(h.getBefore(2), AFTER_SELECT);
    const cmp = h.compare(0, 2);
    assert.deepEqual(cmp.a, AFTER_SEED);
    assert.deepEqual(cmp.b, AFTER_SPLICE);
    assert.deepEqual(h.viewRange(0, 1).json, AFTER_SELECT);
    assert.deepEqual(h.exportTimeRoot().map((n) => n.kind), [
      HISTORY_NODE_KIND.DOT,
      HISTORY_NODE_KIND.DOT,
      HISTORY_NODE_KIND.DOT,
    ]);
  });

  it("viewRange without retained wire falls back to after[to]", () => {
    const { engine } = makeEngine({ historySnapshot: true, retainWireHistory: false });
    engine.push(FULL);
    const h = engine.history;
    assert.equal(h.getNode(1).wire, null);
    assert.deepEqual(h.viewRange(0, 1).json, AFTER_SELECT);
  });

  it("emitDiff false still records after-trees", () => {
    const { engine, chunks } = makeEngine({ historySnapshot: true, emitDiff: false });
    engine.push(FULL);
    assert.deepEqual(engine.history.getAfter(2), AFTER_SPLICE);
    assert.ok(chunks.every((d) => d == null));
    assert.equal(engine.history.getDiff(1), null);
  });

  it("compat true does not change STRICT select after-trees", () => {
    const { engine } = makeEngine({ historySnapshot: true, compat: true });
    engine.push(FULL);
    assert.deepEqual(engine.history.getAfter(2), AFTER_SPLICE);
  });

  it("eof tail after an open select phase", () => {
    const { engine } = makeEngine({ historySnapshot: true });
    engine.push(SEED + "@orders\n?id:A2\nstatus:shipped\n");
    engine.finish();
    const root = engine.history.exportTimeRoot();
    assert.deepEqual(
      root.map((n) => n.kind),
      [HISTORY_NODE_KIND.DOT, HISTORY_NODE_KIND.TAIL],
    );
    assert.deepEqual(root[1].after, AFTER_SELECT);
  });
});

describe("array select × jumpTo", () => {
  it("jumpTo before splice restores the selected write, then continues", () => {
    const { engine } = makeEngine({ historySnapshot: true, historyRealtime: true });
    engine.push(FULL);
    const h = engine.history;
    assert.equal(h.liveCursor, -1);
    assert.equal(h.canJumpTo(1), true);
    const jumped = engine.jumpTo(1);
    assert.equal(jumped.kept, 2);
    assert.equal(jumped.discarded, 1);
    assert.deepEqual(jumped.after, AFTER_SELECT);
    assert.equal(h.length, 2);
    assert.equal(h.liveCursor, 1);
    assert.deepEqual(engine.committedSnapshot, AFTER_SELECT);
    assert.equal(h.canJumpTo(1), false);
    assert.throws(() => engine.jumpTo(0), RangeError);
    engine.push(STAR_SHIPPED);
    assert.equal(h.length, 3);
    assert.deepEqual(h.getAfter(2), AFTER_STAR);
  });

  it("jumpTo(0) drops select+splice; a later matching ? continues from seed", () => {
    const { engine } = makeEngine({ historyRealtime: true });
    engine.push(FULL);
    engine.jumpTo(0);
    assert.deepEqual(engine.committedSnapshot, AFTER_SEED);
    engine.push(SELECT_A2);
    assert.deepEqual(engine.history.getAfter(1), AFTER_SELECT);
  });

  it("jumpTo(0) then unmatched ?* is a syntax error", () => {
    const { engine } = makeEngine({ historyRealtime: true });
    engine.push(FULL);
    engine.jumpTo(0);
    assert.throws(() => engine.push(STAR_SHIPPED), XaiopSyntaxError);
    assert.deepEqual(engine.history.getAfter(0), AFTER_SEED);
  });

  it("retainWire false still rebuilds committed snapshot", () => {
    const { engine } = makeEngine({
      historySnapshot: true,
      historyRealtime: true,
      retainWireHistory: false,
    });
    engine.push(FULL);
    const jumped = engine.jumpTo(1);
    assert.equal(jumped.wirePrefix, null);
    assert.deepEqual(engine.committedSnapshot, AFTER_SELECT);
    engine.push(STAR_SHIPPED);
    assert.deepEqual(engine.history.getAfter(2), AFTER_STAR);
  });

  it("jump after finish reopens the engine for more select", () => {
    const { engine } = makeEngine({ historyRealtime: true });
    engine.push(FULL);
    engine.finish();
    engine.jumpTo(1);
    engine.push(STAR_SHIPPED);
    assert.deepEqual(engine.history.getAfter(2), AFTER_STAR);
  });
});

describe("array select × intercept / window / cover", () => {
  it("intercept rewrite ?id:A2→?id:A1 is re-applied on jumpTo rebuild", () => {
    const { engine } = makeEngine({
      historySnapshot: true,
      historyRealtime: true,
      lineIntercept: rewriteSelectA2,
    });
    engine.push(SEED + SELECT_A2 + SPLICE_A1);
    assert.deepEqual(engine.history.getAfter(1), AFTER_INTERCEPT);
    engine.jumpTo(1);
    assert.deepEqual(engine.committedSnapshot, AFTER_INTERCEPT);
    engine.push("@orders\n?id:A3\nnote:x\n.\n");
    assert.deepEqual(engine.history.getAfter(2), {
      orders: [
        { id: "A1", status: "shipped" },
        { id: "A2", status: "pending" },
        { id: "A3", status: "done", note: "x" },
      ],
    });
  });

  it("skipping a select line writes Content at array level", () => {
    const { engine } = makeEngine({
      historySnapshot: true,
      lineIntercept: ({ view, raw }) =>
        view.kind === LINE_KIND.SELECT ? null : raw,
    });
    engine.push(SEED + SELECT_A2);
    assert.deepEqual(engine.history.getAfter(1), {
      orders: [
        { id: "A1", status: "pending" },
        { id: "A2", status: "pending" },
        { id: "A3", status: "done" },
        { status: "shipped" },
      ],
    });
  });

  it("mergeChunkWindow true emits one chunk and three history nodes", () => {
    const { engine, chunks } = makeEngine({
      historySnapshot: true,
      mergeChunkWindow: true,
    });
    engine.push(FULL);
    assert.equal(engine.history.length, 3);
    assert.equal(chunks.length, 1);
    assert.deepEqual(engine.history.getAfter(2), AFTER_SPLICE);
  });

  it("char-chunked ?id:A2 still lands on A2", () => {
    const { engine } = makeEngine({ historySnapshot: true });
    engine.push(SEED);
    for (const ch of SELECT_A2) engine.push(ch);
    assert.deepEqual(engine.history.getAfter(1), AFTER_SELECT);
  });

  it("cover + &orders after select matches parseSync", () => {
    const wire = SEED + SELECT_A2 + "&orders\n.\n";
    const { engine } = makeEngine({ cover: true, historySnapshot: true });
    engine.push(wire);
    engine.finish();
    assert.deepEqual(engine.snapshot, parseSync(wire));
    assert.deepEqual(engine.snapshot, {});
  });

  it("cover cannot snapshot a ? array-element Cursor before bare &", () => {
    const { engine } = makeEngine({ cover: true, historySnapshot: true });
    assert.throws(
      () => engine.push(SEED + SPLICE_A1),
      (err) =>
        err instanceof XaiopSyntaxError &&
        /cannot restore Cursor after \./.test(err.message),
    );
  });
});

describe("array select × errors and compact", () => {
  it("failed later ? keeps the prior history node", () => {
    const { engine } = makeEngine({ historySnapshot: true });
    engine.push(SEED);
    assert.throws(() => engine.push("@orders\n?99\n.\n"), XaiopSyntaxError);
    assert.equal(engine.history.length, 1);
    assert.deepEqual(engine.history.getAfter(0), AFTER_SEED);
  });

  it("compactCommitted refuses while select history is retained", () => {
    const { engine } = makeEngine({ historySnapshot: true });
    engine.push(FULL);
    assert.throws(() => engine.compactCommitted(), /history/);
    engine.compactCommitted({ dropHistory: true });
    assert.equal(engine.history.length, 0);
    assert.deepEqual(engine.committedSnapshot, AFTER_SPLICE);
  });

  it("= then ? in a later phase is a cumulative history node", () => {
    const { engine } = makeEngine({ historySnapshot: true });
    engine.push(SEED + LOCATE_SELECT);
    assert.deepEqual(engine.history.getAfter(1), {
      orders: [
        { id: "A1", status: "pending" },
        { id: "A2", status: "pending", note: "ok" },
        { id: "A3", status: "done" },
      ],
    });
  });
});

describe("array select × XaiopStream jumpTo", () => {
  it("stream history jumpTo truncates after the select write", async () => {
    const stream = new XaiopStream("raw://select-hist", {
      mergeChunkWindow: false,
      historySnapshot: true,
      historyRealtime: true,
    });
    stream.onChunk(() => {});
    stream.onDone(() => {});
    stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(FULL),
    });
    await waitStatus(stream, STREAM_STATUS.COMPLETED);
    assert.equal(stream.history.length, 3);
    assert.deepEqual(stream.history.getAfter(2), AFTER_SPLICE);
    const jumped = stream.jumpTo(1);
    assert.equal(jumped.kept, 2);
    assert.deepEqual(stream.getCommittedSnapshot(), AFTER_SELECT);
    assert.equal(stream.history.length, 2);
  });
});
