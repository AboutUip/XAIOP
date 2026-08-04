import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CONTROL_CAPABILITY,
  ControlDemux,
  ControlIngest,
  ControlPlaneHost,
  ControlSessionState,
  DotCheckpointEngine,
  ResumeWireLog,
  TRANSPORT_KIND,
  XaiopControlError,
  XaiopResumeLogError,
  XaiopStream,
  XaiopWs,
  dispatchControlFrame,
  encodeAckFrame,
  encodeControlFrame,
  encodeResumeFrame,
  encodeSessionFrame,
  encodeSnapshotFrame,
  encodeTypeSchemaFrame,
  parseControlBodyJson,
  parseControlHeader,
  stampWireWithLogSeq,
} from "../dist/index.js";
import { WebSocketServer } from "ws";
import { chunksOf, waitStatus } from "./helpers/stream.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("ResumeWireLog", () => {
  test("record / wiresAfter / entryAt / monotonic guard", () => {
    const log = new ResumeWireLog();
    log.record({ seq: 1, wire: ">\na:1\n.\n", committed: { a: 1 } });
    log.record({ seq: 2, wire: ">\nb:2\n.\n" });
    log.record({ seq: 3, wire: ">\nc:3\n.\n", committed: { a: 1, b: 2, c: 3 } });
    assert.equal(log.size, 3);
    assert.equal(log.highestSeq, 3);
    assert.equal(log.wiresAfterRaw(0), ">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n");
    assert.equal(log.wiresAfterRaw(1), ">\nb:2\n.\n>\nc:3\n.\n");
    assert.equal(log.wiresAfterRaw(3), "");
    assert.match(log.wiresAfter(1), /^#!xaiop\/seq\/v1\n\{"seq":2\}\n/);
    assert.ok(log.wiresAfter(1).includes('#!xaiop/seq/v1\n{"seq":3}\n'));
    assert.deepEqual(log.committedAt(1), { a: 1 });
    assert.equal(log.entryAt(9), null);
    assert.throws(
      () => log.record({ seq: 2, wire: "x" }),
      XaiopResumeLogError,
    );
    log.clear();
    assert.equal(log.size, 0);
  });
});

describe("control demux â€?edge cases", () => {
  test("flush completes header-only frame with empty body", () => {
    const demux = new ControlDemux();
    assert.equal(demux.push("#!xaiop/session/v1").frames.length, 0);
    const out = demux.flush();
    assert.equal(out.frames.length, 1);
    assert.equal(out.frames[0].body, "");
    assert.equal(out.wireText, "");
  });

  test("flush completes pending body without trailing LF", () => {
    const demux = new ControlDemux();
    demux.push("#!xaiop/ack/v1\n");
    // Compat path may finalize on push when body looks like complete JSON.
    const mid = demux.push('{"sessionId":"s","seq":2}');
    const out = mid.frames.length > 0 ? mid : demux.flush();
    assert.equal(out.frames.length, 1);
    assert.equal(JSON.parse(out.frames[0].body).seq, 2);
  });

  test("CRLF wire preserved when peeling control", () => {
    const demux = new ControlDemux();
    const text =
      ">\r\na:1\r\n.\r\n" +
      encodeSessionFrame({ sessionId: "s", role: "duplex", capabilities: [], epoch: 0 }) +
      ">\r\nb:2\r\n.\r\n";
    const out = demux.push(text);
    assert.equal(out.frames.length, 1);
    assert.equal(out.wireText, ">\r\na:1\r\n.\r\n>\r\nb:2\r\n.\r\n");
  });

  test("half-line wire carry across pushes", () => {
    const demux = new ControlDemux();
    assert.equal(demux.push(">\na:").wireText, ">\n");
    const out = demux.push("1\n.\n");
    assert.equal(out.wireText, "a:1\n.\n");
  });

  test("unsupported capability version reports and discards", () => {
    const errors = [];
    const ingest = new ControlIngest({
      onControlError: (e) => errors.push(e),
      onSession: () => {
        throw new Error("should not run");
      },
    });
    const wire = ingest.push("#!xaiop/session/v99\n{}\n>\na:1\n.\n");
    assert.equal(wire, ">\na:1\n.\n");
    assert.equal(errors[0].code, "CONTROL_UNKNOWN_CAPABILITY");
  });

  test("invalid types JSON body reports CONTROL_BODY_JSON / TYPES_PAYLOAD", () => {
    const errors = [];
    const ingest = new ControlIngest({
      onControlError: (e) => errors.push(e),
    });
    ingest.push("#!xaiop/types/v1\n{not-json}\n");
    assert.ok(
      errors.some(
        (e) => e.code === "CONTROL_BODY_JSON" || e.code === "CONTROL_TYPES_PAYLOAD",
      ),
    );
    errors.length = 0;
    ingest.push('#!xaiop/types/v1\n{"version":1}\n');
    assert.ok(errors.some((e) => e.code === "CONTROL_TYPES_PAYLOAD"));
  });

  test("dispatchControlFrame parseControlBodyJson empty â†?null", () => {
    const h = parseControlHeader("#!xaiop/ack/v1");
    const frame = {
      ...h,
      body: "   ",
      raw: "#!xaiop/ack/v1\n",
    };
    assert.equal(parseControlBodyJson(frame), null);
  });

  test("malformed header skips following body line only", () => {
    const errors = [];
    const ingest = new ControlIngest({
      onControlError: (e) => errors.push(e),
    });
    const wire = ingest.push("#!broken!!\n{\"x\":1}\n>\nok:1\n.\n");
    assert.equal(wire, ">\nok:1\n.\n");
    assert.equal(errors[0].code, "CONTROL_HEADER_MALFORMED");
  });
});

describe("phase seq â€?more coverage", () => {
  test("finish tail allocates a seq", () => {
    const metas = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      onChunk: (_d, meta) => metas.push(meta || {}),
    });
    eng.push(">\na:1\n.\n>\ntail:9\n");
    eng.finish();
    assert.equal(eng.phaseSeq, 2);
    assert.equal(metas[0].seq, 1);
    assert.equal(metas[1].seq, 2);
  });

  test("phaseSeq: false omits seq meta", () => {
    const metas = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      phaseSeq: false,
      onChunk: (_d, meta) => metas.push(meta),
    });
    eng.push(">\na:1\n.\n");
    assert.equal(eng.phaseSeq, 0);
    assert.equal(metas[0], undefined);
  });

  test("streamProcessing false: one seq for whole buffer", () => {
    const metas = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: false,
      onChunk: (_d, meta) => metas.push(meta || {}),
    });
    eng.push(">\na:1\n.\n>\nb:2\n.\n");
    eng.finish();
    assert.equal(eng.phaseSeq, 1);
    assert.equal(metas[0].seq, 1);
  });
});

describe("ControlPlaneHost + session helpers", () => {
  test("sendAck / sendResume / sendSnapshot require session", () => {
    const sent = [];
    const host = new ControlPlaneHost({
      send: (t) => {
        sent.push(t);
        return true;
      },
    });
    assert.throws(() => host.sendAck(1), TypeError);
    assert.throws(() => host.sendSnapshot({}), TypeError);
    assert.throws(() => host.sendResume({ fromSeq: 0 }), TypeError);
    assert.equal(host.getResumeState(), null);

    host.sendSession({ role: "producer" });
    assert.ok(sent[0].startsWith("#!xaiop/session/v1\n"));
    assert.equal(host.sendAck(0), true);
    assert.equal(host.sendResume({ fromSeq: 0 }), true);
    assert.equal(host.sendSnapshot({ hello: 1 }), true);
    assert.ok(host.getResumeState().sessionId);
  });

  test("notePhaseMeta advances session + autoAck", () => {
    const sent = [];
    const host = new ControlPlaneHost({
      send: (t) => {
        sent.push(t);
        return true;
      },
      session: true,
      autoAck: true,
    });
    host.notePhaseMeta({ seq: 2, seqs: [1, 2] });
    assert.equal(host.phaseSeq, 2);
    assert.ok(sent.some((t) => t.includes("#!xaiop/ack/v1")));
    const ackBody = JSON.parse(sent.find((t) => t.includes("/ack/")).split("\n")[1]);
    assert.equal(ackBody.seq, 2);
  });

  test("applyPeerSession + noteAck", () => {
    const s = new ControlSessionState({ sessionId: "local" });
    s.applyPeerSession({
      sessionId: "peer",
      epoch: 3,
      capabilities: [CONTROL_CAPABILITY.ACK_V1],
    });
    assert.equal(s.peerSessionId, "peer");
    assert.equal(s.epoch, 3);
    assert.equal(s.noteAck(5), true);
    assert.equal(s.noteAck(4), false);
    assert.equal(s.ackedSeq, 5);
  });
});

describe("XaiopStream control ingest", () => {
  test("interleaved control on RAW transport; session cursor", async () => {
    const sessions = [];
    const errors = [];
    const chunks = [];
    const wire =
      encodeSessionFrame({
        sessionId: "stream-s",
        role: "producer",
        capabilities: [],
        epoch: 0,
      }) +
      ">\na:1\n.\n" +
      "#!xaiop/ghost/v1\n{}\n" +
      ">\nb:2\n.\n";

    const stream = new XaiopStream("raw://control-stream", {
      modes: ["callback"],
      session: true,
      mergeChunkWindow: false,
      onSession: (b) => sessions.push(b),
      onControlError: (e) => errors.push(e),
    });
    stream.onChunk((d, meta) => chunks.push({ d, meta }));
    const p = stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(wire),
    });
    await waitStatus(stream, "completed");
    await p;
    assert.equal(sessions[0].sessionId, "stream-s");
    assert.ok(errors.some((e) => e.code === "CONTROL_UNKNOWN_CAPABILITY"));
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].meta.seq, 1);
    assert.equal(chunks[1].meta.seq, 2);
    assert.equal(stream.phaseSeq, 2);
    assert.equal(stream.getResumeState().seq, 2);
    assert.deepEqual(stream.getCommittedSnapshot(), { a: 1, b: 2 });
  });
});

describe("WS producer outbound + resume replay", () => {
  test("pushJson records outbound; replayOutboundAfter", async () => {
    const hub = await XaiopWs.listen({ port: 0, session: true });
    /** @type {import("../dist/index.js").XaiopWsConnection|null} */
    let server = null;
    hub.onConnection((c) => {
      server = c;
    });

    const client = await XaiopWs.connect(hub.url(), {
      onPhase: () => {},
    });
    await sleep(20);
    assert.ok(server);

    assert.equal(server.pushJson("a", 1), true);
    assert.equal(server.pushJson("b", 2), true);
    assert.equal(server.pushObject({ c: 3 }), true);
    assert.equal(server.outboundSeq, 3);
    assert.equal(server.outboundLog.size, 3);
    assert.equal(
      server.replayOutboundAfter(1),
      server.outboundLog.wiresAfter(1),
    );
    assert.ok(server.replayOutboundAfter(1).includes("b:2"));
    assert.ok(!server.replayOutboundAfter(1).includes("a:1"));

    const state = server.getResumeState();
    assert.equal(state.outboundSeq, 3);
    assert.equal(state.inboundSeq, 0);

    await client.end();
    await hub.close();
  });

  test("autoAck delivers ack frames to peer", async () => {
    const wss = new WebSocketServer({ port: 0 });
    const port = /** @type {import('net').AddressInfo} */ (wss.address()).port;
    /** @type {string[]} */
    const fromClient = [];
    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        fromClient.push(String(data));
      });
      setTimeout(() => {
        ws.send(">\na:1\n.\n>\nb:2\n.\n");
      }, 10);
    });

    const client = await XaiopWs.connect(`ws://127.0.0.1:${port}`, {
      session: true,
      autoAck: true,
      onPhase: () => {},
    });
    await sleep(80);
    assert.ok(fromClient.some((t) => t.includes("#!xaiop/ack/v1")));
    const ack = fromClient.find((t) => t.includes("/ack/"));
    const body = JSON.parse(ack.split("\n")[1]);
    assert.equal(body.seq, 2);

    await client.end();
    await new Promise((r) => wss.close(r));
  });

  test("autoSession hello on listen-accept", async () => {
    const hub = await XaiopWs.listen({
      port: 0,
      session: { sessionId: "hub-1", role: "producer" },
      autoSession: true,
    });
    const sessions = [];
    const client = await XaiopWs.connect(hub.url(), {
      session: true,
      onSession: (b) => sessions.push(b),
      onPhase: () => {},
    });
    await sleep(40);
    assert.ok(sessions.some((s) => s.sessionId === "hub-1"));
    await client.end();
    await hub.close();
  });

  test("cross-reconnect resume with app-owned ResumeWireLog", async () => {
    const log = new ResumeWireLog();
    const sessionId = "durable-1";
    const hub = await XaiopWs.listen({ port: 0, session: true });

    hub.onConnection((conn) => {
      conn.onResume((body) => {
        assert.equal(body.sessionId, sessionId);
        const snap = log.committedAt(body.fromSeq);
        if (snap !== undefined) {
          conn.sendSnapshot(snap);
        }
        const wire = log.wiresAfter(body.fromSeq);
        if (wire) conn.pushWire(wire);
      });
    });

    // First consumer: receive three phases; producer records into shared log.
    {
      const phases = [];
      const client = await XaiopWs.connect(hub.url(), {
        session: { sessionId },
        onPhase: (d, meta) => phases.push({ d, meta }),
      });
      await sleep(20);
      const prod = hub.connections[0];
      const w1 = XaiopWs.encodePhaseJson("a", 1);
      const w2 = XaiopWs.encodePhaseJson("b", 2);
      const w3 = XaiopWs.encodePhaseJson("c", 3);
      prod.pushWire(stampWireWithLogSeq(1, w1));
      log.record({ seq: 1, wire: w1, committed: { a: 1 } });
      prod.pushWire(stampWireWithLogSeq(2, w2));
      log.record({ seq: 2, wire: w2, committed: { a: 1, b: 2 } });
      prod.pushWire(stampWireWithLogSeq(3, w3));
      log.record({ seq: 3, wire: w3, committed: { a: 1, b: 2, c: 3 } });
      await sleep(60);
      assert.equal(phases.length, 3);
      assert.equal(phases[0].meta.logSeq, 1);
      assert.equal(phases[1].meta.logSeq, 2);
      assert.equal(phases[2].meta.logSeq, 3);
      assert.equal(client.phaseSeq, 3);
      assert.equal(client.logSeq, 3);
      assert.equal(client.getResumeState().seq, 3);
      await client.end();
      await sleep(20);
    }

    // Reconnect: resume from seq 1 â†?only b + c (and optional snapshot).
    // Local meta.seq resets; meta.logSeq continues session log (2, 3).
    {
      const phases = [];
      const snapshots = [];
      const client = await XaiopWs.connect(hub.url(), {
        session: { sessionId },
        mergeChunkWindow: false,
        onSnapshot: (b) => snapshots.push(b),
        onPhase: (d, meta) => phases.push({ d, meta }),
      });
      await sleep(20);
      assert.equal(client.sendResume({ sessionId, fromSeq: 1 }), true);
      await sleep(80);
      assert.ok(snapshots.length >= 1);
      assert.deepEqual(snapshots[0].tree, { a: 1 });
      assert.equal(phases.length, 2);
      assert.deepEqual(phases[0].d, { b: 2 });
      assert.deepEqual(phases[1].d, { c: 3 });
      assert.equal(phases[0].meta.seq, 1);
      assert.equal(phases[1].meta.seq, 2);
      assert.equal(phases[0].meta.logSeq, 2);
      assert.equal(phases[1].meta.logSeq, 3);
      assert.equal(client.phaseSeq, 2);
      assert.equal(client.logSeq, 3);
      assert.equal(client.getResumeState().seq, 3);
      assert.deepEqual(client.getCommittedSnapshot(), { b: 2, c: 3 });
      await client.end();
    }

    await hub.close();
  });

  test("pushJson stamps logSeq; window merge keeps logSeqs", async () => {
    const hub = await XaiopWs.listen({ port: 0, session: true });
    /** @type {import("../dist/index.js").XaiopWsConnection|null} */
    let server = null;
    hub.onConnection((c) => {
      server = c;
    });

    /** @type {{ diff: unknown, meta: any }[]} */
    const phases = [];
    const client = await XaiopWs.connect(hub.url(), {
      session: true,
      mergeChunkWindow: true,
      onPhase: (diff, meta) => phases.push({ diff, meta }),
    });
    await sleep(20);
    assert.ok(server);

    // One socket message with three stamped phases â†?one merged chunk.
    const batch =
      stampWireWithLogSeq(10, XaiopWs.encodePhaseJson("a", 1)) +
      stampWireWithLogSeq(11, XaiopWs.encodePhaseJson("b", 2)) +
      stampWireWithLogSeq(12, XaiopWs.encodePhaseJson("c", 3));
    assert.equal(server.pushWire(batch), true);
    await sleep(60);

    assert.equal(phases.length, 1);
    assert.deepEqual(phases[0].meta.seqs, [1, 2, 3]);
    assert.equal(phases[0].meta.seq, 3);
    assert.deepEqual(phases[0].meta.logSeqs, [10, 11, 12]);
    assert.equal(phases[0].meta.logSeq, 12);
    assert.equal(client.phaseSeq, 3);
    assert.equal(client.logSeq, 12);
    assert.equal(client.getResumeState().seq, 12);

    await client.end();
    await hub.close();
  });

  test("sendAck without session throws on connection", async () => {
    const hub = await XaiopWs.listen({ port: 0 });
    const client = await XaiopWs.connect(hub.url(), { onPhase: () => {} });
    await sleep(10);
    assert.throws(() => client.sendAck(1), TypeError);
    assert.equal(client.getResumeState(), null);
    await client.end();
    await hub.close();
  });
});

describe("control frame encode guards", () => {
  test("encodeControlFrame version / ns validation", () => {
    assert.throws(() => encodeControlFrame("", "x", 1), TypeError);
    assert.throws(() => encodeControlFrame("xaiop", "session", 0), TypeError);
    assert.throws(() => encodeControlFrame("xaiop", "session", 1.5), TypeError);
  });

  test("dispatch unknown name", () => {
    const errors = [];
    dispatchControlFrame(
      {
        ns: "xaiop",
        name: "zzz",
        version: 1,
        id: "xaiop/zzz/v1",
        header: "#!xaiop/zzz/v1",
        body: "{}",
        raw: "#!xaiop/zzz/v1\n{}",
      },
      { onControlError: (e) => errors.push(e) },
    );
    assert.equal(errors[0].code, "CONTROL_UNKNOWN_CAPABILITY");
  });
});
