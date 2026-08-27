import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DotCheckpointEngine,
  parseSync,
  SDK_VERSION,
  STREAM_MODES,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopStream,
  XaiopWs,
} from "../dist/index.js";

/**
 * Normative contracts for bufferStats / compactCommitted (SDK 0.15.1+).
 * Align with docs/sdk/nodejs/notes/streaming-parse.md § Receive buffer compact.
 */
describe("bufferStats + compactCommitted (0.16.0)", () => {
  test("SDK_VERSION is 0.16.0", () => {
    assert.equal(SDK_VERSION, "0.16.0");
  });

  // -------------------------------------------------------------------------
  // bufferStats
  // -------------------------------------------------------------------------
  describe("bufferStats", () => {
    test("empty engine zeros", () => {
      const eng = new DotCheckpointEngine({ onChunk: () => {} });
      assert.deepEqual(eng.bufferStats(), {
        length: 0,
        committedAt: 0,
        pendingBytes: 0,
        openPhase: false,
      });
    });

    test("after full phase: pendingBytes 0, openPhase false", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      const s = eng.bufferStats();
      assert.ok(s.length > 0);
      assert.equal(s.committedAt, s.length);
      assert.equal(s.pendingBytes, 0);
      assert.equal(s.openPhase, false);
      assert.equal(s.pendingBytes, s.length - s.committedAt);
    });

    test("open phase: pendingBytes > 0, openPhase true", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      eng.push(">\nb:2\n");
      const s = eng.bufferStats();
      assert.ok(s.pendingBytes > 0);
      assert.equal(s.openPhase, true);
      assert.ok(s.committedAt < s.length);
      assert.equal(s.pendingBytes, s.length - s.committedAt);
    });

    test("stats match buffer / committedAt getters", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n>\nb:2\n");
      const s = eng.bufferStats();
      assert.equal(s.length, eng.buffer.length);
      assert.equal(s.committedAt, eng.committedAt);
    });
  });

  // -------------------------------------------------------------------------
  // compactCommitted — happy path
  // -------------------------------------------------------------------------
  describe("compactCommitted — core", () => {
    test("drops prefix; committedSnapshot unchanged", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\n>meta\nname:x\n.\n");
      eng.push(">rules-\n>\nid:R1\n<\n.\n");
      const expected = { meta: { name: "x" }, rules: [{ id: "R1" }] };
      assert.deepEqual(eng.committedSnapshot, expected);
      const before = eng.bufferStats();
      const r = eng.compactCommitted();
      assert.equal(r.discardedBytes, before.length);
      assert.equal(r.length, 0);
      assert.deepEqual(eng.bufferStats(), {
        length: 0,
        committedAt: 0,
        pendingBytes: 0,
        openPhase: false,
      });
      assert.deepEqual(eng.committedSnapshot, expected);
      assert.equal(eng.buffer, "");
    });

    test("second compact is no-op (idempotent when empty)", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      const first = eng.compactCommitted();
      assert.ok(first.discardedBytes > 0);
      assert.deepEqual(eng.compactCommitted(), {
        discardedBytes: 0,
        length: 0,
      });
      assert.deepEqual(eng.committedSnapshot, { a: 1 });
    });

    test("no-op when nothing committed", () => {
      const eng = new DotCheckpointEngine({ onChunk: () => {} });
      assert.deepEqual(eng.compactCommitted(), {
        discardedBytes: 0,
        length: 0,
      });
      eng.push(">\na:1\n");
      assert.deepEqual(eng.compactCommitted(), {
        discardedBytes: 0,
        length: eng.buffer.length,
      });
    });

    test("preserves uncommitted tail and continues", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      eng.push(">\nb:2\n");
      const pending = eng.buffer.slice(eng.committedAt);
      const r = eng.compactCommitted();
      assert.ok(r.discardedBytes > 0);
      assert.equal(eng.buffer, pending);
      assert.equal(eng.bufferStats().openPhase, true);
      eng.push(".\n");
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2 });
      assert.deepEqual(eng.snapshot, { a: 1, b: 2 });
    });

    test("half-line across compact: pending fragment still completes", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      eng.push(">\nb:"); // incomplete content line
      eng.compactCommitted();
      assert.ok(eng.bufferStats().length > 0);
      eng.push("2\n.\n");
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2 });
    });

    test("CRLF wire compact + continue", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\r\na:1\r\n.\r\n");
      eng.compactCommitted();
      eng.push(">\r\nb:2\r\n.\r\n");
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2 });
    });

    test("finish after compact reuses live commit (no discarded wire needed)", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n>\nb:2\n.\n");
      eng.compactCommitted();
      assert.equal(eng.buffer.length, 0);
      eng.finish();
      assert.deepEqual(eng.snapshot, { a: 1, b: 2 });
      assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2 });
    });

    test("throws when closed", () => {
      const eng = new DotCheckpointEngine({ onChunk: () => {} });
      eng.push(">\na:1\n.\n");
      eng.finish();
      assert.throws(() => eng.compactCommitted(), /closed/);
    });
  });

  // -------------------------------------------------------------------------
  // Operators after compact
  // -------------------------------------------------------------------------
  describe("compactCommitted — operators after compact", () => {
    test("@ into named array (D2)", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\n>orders-\n.\n");
      eng.compactCommitted();
      eng.push("@orders\n>\na:1\n<\n.\n");
      eng.compactCommitted();
      eng.push("@orders\n>\nb:2\n<\n.\n");
      assert.deepEqual(eng.committedSnapshot, {
        orders: [{ a: 1 }, { b: 2 }],
      });
    });

    test("= locate after compact", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\n>a\nx:1\n.\n");
      eng.compactCommitted();
      eng.push("=a\ny:2\n.\n");
      assert.deepEqual(eng.committedSnapshot, { a: { x: 1, y: 2 } });
    });

    test("! broadcast after compact", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\n>left\n>box\nk:1\n.\n");
      eng.push(">\n>right\n>box\nk:2\n.\n");
      eng.compactCommitted();
      eng.push("!box\nz:9\n.\n");
      assert.deepEqual(eng.committedSnapshot, {
        left: { box: { k: 1, z: 9 } },
        right: { box: { k: 2, z: 9 } },
      });
    });

    test("& delete after compact", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      eng.push(">\n>a\nx:1\n<\n>b\ny:2\n.\n");
      assert.deepEqual(eng.committedSnapshot, {
        a: { x: 1 },
        b: { y: 2 },
      });
      eng.compactCommitted();
      eng.push("&b\n.\n");
      assert.deepEqual(eng.committedSnapshot, { a: { x: 1 } });
    });
  });

  // -------------------------------------------------------------------------
  // Window / async / emitDiff
  // -------------------------------------------------------------------------
  describe("compactCommitted — ingest modes", () => {
    test("mergeChunkWindow true: compact after batch", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: true,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n>\nb:2\n.\n");
      assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2 });
      const r = eng.compactCommitted();
      assert.ok(r.discardedBytes > 0);
      assert.equal(eng.bufferStats().length, 0);
      eng.push(">\nc:3\n.\n");
      assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2, c: 3 });
    });

    test("pushAsync + compactCommitted", async () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        onChunk: () => {},
      });
      await eng.pushAsync(">\na:1\n.\n");
      await eng.pushAsync(">\nb:2\n.\n");
      eng.compactCommitted();
      await eng.pushAsync(">\nc:3\n.\n");
      await eng.finishAsync();
      assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2, c: 3 });
    });

    test("emitDiff false: compact without onChunk", () => {
      const eng = new DotCheckpointEngine({ emitDiff: false });
      eng.push(">\na:1\n.\n");
      eng.compactCommitted();
      eng.push(">\nb:2\n.\n");
      eng.finish();
      assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2 });
    });

    test("char-stream + periodic compact ≡ parseSync", () => {
      const phases = [];
      for (let i = 0; i < 40; i++) {
        phases.push(`>\nk${i}:${i}\n.\n`);
      }
      const full = phases.join("");
      assert.deepEqual(
        parseSync(full),
        Object.fromEntries(phases.map((_, i) => [`k${i}`, i])),
      );
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        emitDiff: false,
      });
      let maxLen = 0;
      for (const ch of full) {
        eng.push(ch);
        if (eng.committedAt > 0 && eng.committedAt === eng.buffer.length) {
          eng.compactCommitted();
        }
        maxLen = Math.max(maxLen, eng.bufferStats().length);
      }
      eng.finish();
      assert.ok(maxLen < 80, `maxLen=${maxLen}`);
      for (let i = 0; i < 40; i++) {
        assert.equal(eng.committedSnapshot[`k${i}`], i);
      }
    });

    test("repeated compact bounds length (200 phases)", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        emitDiff: false,
      });
      let maxLen = 0;
      for (let i = 0; i < 200; i++) {
        eng.push(`>\nk${i}:${i}\n.\n`);
        eng.compactCommitted();
        maxLen = Math.max(maxLen, eng.bufferStats().length);
      }
      assert.ok(maxLen < 64, `maxLen=${maxLen}`);
      assert.equal(eng.committedSnapshot.k0, 0);
      assert.equal(eng.committedSnapshot.k199, 199);
    });
  });

  // -------------------------------------------------------------------------
  // History conflicts (strategy A)
  // -------------------------------------------------------------------------
  describe("compactCommitted — history", () => {
    test("historyRealtime + retainWire rejects without dropHistory", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        historyRealtime: true,
        retainWireHistory: true,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      assert.throws(
        () => eng.compactCommitted(),
        /historyRealtime \+ retainWireHistory/,
      );
      assert.ok(eng.bufferStats().length > 0);
      assert.ok(eng.history.length >= 1);
    });

    test("dropHistory clears nodes and allows compact", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        historyRealtime: true,
        retainWireHistory: true,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      eng.push(">\nb:2\n.\n");
      assert.ok(eng.history.length >= 2);
      const r = eng.compactCommitted({ dropHistory: true });
      assert.ok(r.discardedBytes > 0);
      assert.equal(eng.history.length, 0);
      assert.equal(eng.history.realtimeEnabled, true);
      assert.deepEqual(eng.committedSnapshot, { a: 1, b: 2 });
      assert.throws(() => eng.jumpTo(0), /out of range|jumpTo/);
    });

    test("snapshot history with nodes rejects without dropHistory", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        historySnapshot: true,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      assert.throws(() => eng.compactCommitted(), /history buffer indices/);
      eng.compactCommitted({ dropHistory: true });
      assert.equal(eng.history.length, 0);
      assert.equal(eng.bufferStats().length, 0);
    });

    test("realtime + retainWire false: still rejects when nodes exist", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        historyRealtime: true,
        retainWireHistory: false,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      assert.ok(eng.history.length >= 1);
      assert.equal(eng.history.retainWireEnabled, false);
      assert.throws(() => eng.compactCommitted(), /history buffer indices/);
      eng.compactCommitted({ dropHistory: true });
      assert.equal(eng.buffer.length, 0);
    });

    test("history enabled but empty: compact allowed", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        historySnapshot: true,
        onChunk: () => {},
      });
      // No push yet — length 0
      assert.deepEqual(eng.compactCommitted(), {
        discardedBytes: 0,
        length: 0,
      });
      eng.push(">\na:1\n.\n");
      // Has nodes — must drop
      assert.throws(() => eng.compactCommitted(), /history buffer indices/);
    });

    test("ParseHistory.clear is used by dropHistory", () => {
      const eng = new DotCheckpointEngine({
        mergeChunkWindow: false,
        historySnapshot: true,
        onChunk: () => {},
      });
      eng.push(">\na:1\n.\n");
      eng.history.clear();
      assert.equal(eng.history.length, 0);
      // Now compact without dropHistory succeeds
      const r = eng.compactCommitted();
      assert.ok(r.discardedBytes > 0);
    });
  });

  // -------------------------------------------------------------------------
  // XaiopStream + WS surfaces
  // -------------------------------------------------------------------------
  describe("surfaces — XaiopStream / WS", () => {
    test("XaiopStream bufferStats before send is zeros", () => {
      const stream = new XaiopStream("raw://local", {
        modes: [STREAM_MODES.PROMISE],
      });
      assert.deepEqual(stream.bufferStats(), {
        length: 0,
        committedAt: 0,
        pendingBytes: 0,
        openPhase: false,
      });
      assert.throws(() => stream.compactCommitted(), /active send|engine/);
    });

    test("XaiopStream mid-stream compact; final JSON correct", async () => {
      const { chunksOf, waitStatus } = await import("./helpers/stream.js");
      const stream = new XaiopStream("raw://local", {
        modes: [STREAM_MODES.PROMISE, STREAM_MODES.CALLBACK],
        mergeChunkWindow: false,
      });
      let compacted = false;
      let discarded = 0;
      stream.onChunk(() => {
        if (!compacted && stream.bufferStats().committedAt > 0) {
          const r = stream.compactCommitted();
          discarded = r.discardedBytes;
          compacted = true;
        }
      });
      const wire = `>
>a
x:1
.
>b
y:2
.
`;
      const done = await stream.send({
        transport: TRANSPORT_KIND.RAW,
        source: chunksOf(wire),
      });
      await waitStatus(stream, STREAM_STATUS.COMPLETED);
      assert.equal(compacted, true);
      assert.ok(discarded > 0);
      assert.deepEqual(done, { a: { x: 1 }, b: { y: 2 } });
    });

    test("XaiopStream compact after complete throws (engine closed)", async () => {
      const { chunksOf, waitStatus } = await import("./helpers/stream.js");
      const stream = new XaiopStream("raw://local", {
        modes: [STREAM_MODES.PROMISE, STREAM_MODES.CALLBACK],
      });
      await stream.send({
        transport: TRANSPORT_KIND.RAW,
        source: chunksOf(">\na:1\n.\n"),
      });
      await waitStatus(stream, STREAM_STATUS.COMPLETED);
      assert.throws(() => stream.compactCommitted(), /closed|engine/);
    });

    test("WS connect: compactCommitted mid-session keeps commit", async () => {
      const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
      /** @type {import("../dist/index.js").XaiopWsConnection|null} */
      let serverConn = null;
      const serverReady = new Promise((resolve) => {
        hub.onConnection((conn) => {
          serverConn = conn;
          resolve(conn);
        });
      });
      try {
        const client = await XaiopWs.connect(hub.url(), {
          mergeChunkWindow: false,
          onPhase: () => {},
        });
        await serverReady;
        assert.ok(serverConn);
        assert.equal(serverConn.pushWire(">\na:1\n.\n"), true);
        await new Promise((r) => setTimeout(r, 30));
        assert.ok(client.bufferStats().committedAt > 0);
        const r = client.compactCommitted();
        assert.ok(r.discardedBytes > 0);
        assert.equal(serverConn.pushWire(">\nb:2\n.\n"), true);
        await new Promise((r) => setTimeout(r, 30));
        assert.deepEqual(client.getCommittedSnapshot(), { a: 1, b: 2 });
        client.abort();
      } finally {
        await hub.close();
      }
    });
  });
});
