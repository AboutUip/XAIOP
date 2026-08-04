import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CONTROL_CAPABILITY,
  CONTROL_NAME,
  ControlDemux,
  ControlIngest,
  ControlPlaneHost,
  DotCheckpointEngine,
  ResumeWireLog,
  STREAM_MODES,
  TRANSPORT_KIND,
  TYPE,
  TypeRegistry,
  XaiopWs,
  applyAnnotationSpans,
  createSessionId,
  dispatchControlFrame,
  encodeAckFrame,
  encodeControlFrame,
  encodeResumeFrame,
  encodeSessionFrame,
  encodeSnapshotFrame,
  encodeTypeSchemaFrame,
  isSdkControlLine,
} from "../dist/index.js";
import { chunksOf, waitStatus } from "./helpers/stream.js";
import { XaiopStream } from "../dist/index.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("coverage â€?demux stress", () => {
  test("char-by-char control + wire demux", () => {
    const frames = [];
    const ingest = new ControlIngest({
      onAck: (b) => frames.push(b),
    });
    const text =
      ">\na:1\n.\n" +
      encodeAckFrame({ sessionId: "s", seq: 1 }) +
      ">\nb:2\n.\n";
    let wire = "";
    for (const ch of text) {
      wire += ingest.push(ch);
    }
    wire += ingest.flush();
    assert.equal(wire, ">\na:1\n.\n>\nb:2\n.\n");
    assert.equal(frames.length, 1);
    assert.equal(frames[0].seq, 1);
  });

  test("back-to-back control frames leave empty wire", () => {
    const names = [];
    const ingest = new ControlIngest({
      onSession: () => names.push("session"),
      onAck: () => names.push("ack"),
      onResume: () => names.push("resume"),
      onSnapshot: () => names.push("snapshot"),
    });
    const blob =
      encodeSessionFrame({ sessionId: "s", role: "duplex", capabilities: [], epoch: 0 }) +
      encodeAckFrame({ sessionId: "s", seq: 0 }) +
      encodeResumeFrame({ sessionId: "s", fromSeq: 0 }) +
      encodeSnapshotFrame({ sessionId: "s", seq: 0, tree: null });
    assert.equal(ingest.push(blob), "");
    assert.deepEqual(names, ["session", "ack", "resume", "snapshot"]);
  });

  test("control-only stream flush at EOF", () => {
    const demux = new ControlDemux();
    demux.push("#!xaiop/resume/v1\n");
    const mid = demux.push('{"sessionId":"x","fromSeq":4}');
    const out = mid.frames.length > 0 ? mid : demux.flush();
    assert.equal(out.frames.length, 1);
    assert.equal(out.frames[0].name, "resume");
    assert.equal(JSON.parse(out.frames[0].body).fromSeq, 4);
  });

  test("# with space is not control; #! prefix is", () => {
    assert.equal(isSdkControlLine("# !note"), false);
    assert.equal(isSdkControlLine("#!xaiop/types/v1"), true);
    assert.equal(isSdkControlLine("#!"), true); // prefix match; header parse may still fail
    assert.equal(isSdkControlLine("#"), false);
  });
});

describe("coverage â€?dispatch all official capabilities", () => {
  test("types / session / resume / ack / snapshot happy path", () => {
    const hit = [];
    const handlers = {
      onTypes: (b) => hit.push(["types", b.version]),
      onSession: (b) => hit.push(["session", b.sessionId]),
      onResume: (b) => hit.push(["resume", b.fromSeq]),
      onAck: (b) => hit.push(["ack", b.seq]),
      onSnapshot: (b) => hit.push(["snapshot", b.tree]),
      onControlError: () => hit.push(["err"]),
    };
    const reg = new TypeRegistry();
    reg.register("k", TYPE.INT);
    dispatchControlFrame(
      {
        ns: "xaiop",
        name: "types",
        version: 1,
        id: "xaiop/types/v1",
        header: "#!xaiop/types/v1",
        body: JSON.stringify(reg.snapshot()),
        raw: "",
      },
      handlers,
    );
    for (const [name, body] of [
      ["session", { sessionId: "s1" }],
      ["resume", { sessionId: "s1", fromSeq: 2 }],
      ["ack", { sessionId: "s1", seq: 2 }],
      ["snapshot", { sessionId: "s1", seq: 2, tree: { k: 1 } }],
    ]) {
      dispatchControlFrame(
        {
          ns: "xaiop",
          name,
          version: 1,
          id: `xaiop/${name}/v1`,
          header: `#!xaiop/${name}/v1`,
          body: JSON.stringify(body),
          raw: "",
        },
        handlers,
      );
    }
    assert.deepEqual(hit, [
      ["types", 1],
      ["session", "s1"],
      ["resume", 2],
      ["ack", 2],
      ["snapshot", { k: 1 }],
    ]);
  });

  test("unsupported version for each official name", () => {
    for (const name of Object.values(CONTROL_NAME)) {
      const errors = [];
      dispatchControlFrame(
        {
          ns: "xaiop",
          name,
          version: 99,
          id: `xaiop/${name}/v99`,
          header: `#!xaiop/${name}/v99`,
          body: "{}",
          raw: "",
        },
        { onControlError: (e) => errors.push(e) },
      );
      assert.equal(errors.length, 1, name);
      assert.equal(errors[0].code, "CONTROL_UNKNOWN_CAPABILITY", name);
    }
  });

  test("invalid JSON body on ack reports error", () => {
    const errors = [];
    dispatchControlFrame(
      {
        ns: "xaiop",
        name: "ack",
        version: 1,
        id: "xaiop/ack/v1",
        header: "#!xaiop/ack/v1",
        body: "{",
        raw: "",
      },
      { onControlError: (e) => errors.push(e) },
    );
    assert.equal(errors[0].code, "CONTROL_BODY_JSON");
  });
});

describe("coverage â€?engine #! defense + cover seq", () => {
  test("engine push with leaked #! does not Span remount", () => {
    let calls = 0;
    const diffs = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      annotationSpan: [
        () => {
          calls += 1;
          return { hijack: true };
        },
      ],
      onChunk: (d) => diffs.push(d),
    });
    // Leaked control header (no demux). Must not trigger Span; following Content still parses.
    eng.push(">\n#!xaiop/types/v1\na:1\n.\n");
    assert.equal(calls, 0);
    assert.deepEqual(diffs[0], { a: 1 });
  });

  test("applyAnnotationSpans keeps ordinary # after #! skip", () => {
    const { lines } = applyAnnotationSpans(
      [">", "#!xaiop/ack/v1", "{}", "# note", "a:1", "."],
      [() => ({ a: 7 })],
    );
    assert.ok(lines.includes("#!xaiop/ack/v1"));
    assert.ok(!lines.includes("# note"));
    assert.ok(lines.some((l) => l.startsWith("a:")));
  });
});

describe("coverage â€?outbound / host edge", () => {
  test("createSessionId is non-empty unique-ish", () => {
    const a = createSessionId();
    const b = createSessionId();
    assert.ok(a.length > 8);
    assert.notEqual(a, b);
  });

  test("retainOutbound without session still logs pushJson", async () => {
    const hub = await XaiopWs.listen({ port: 0, retainOutbound: true });
    let server = null;
    hub.onConnection((c) => {
      server = c;
    });
    const client = await XaiopWs.connect(hub.url(), { onPhase: () => {} });
    await sleep(20);
    assert.ok(server);
    assert.equal(server.sessionId, null);
    assert.equal(server.pushJson("a", 1), true);
    assert.equal(server.outboundSeq, 1);
    assert.equal(server.replayOutboundAfter(0).includes("a:1"), true);
    await client.end();
    await hub.close();
  });

  test("pushWire does not auto-record outbound", async () => {
    const hub = await XaiopWs.listen({ port: 0, session: true });
    let server = null;
    hub.onConnection((c) => {
      server = c;
    });
    const client = await XaiopWs.connect(hub.url(), { onPhase: () => {} });
    await sleep(20);
    server.pushWire(">\nz:9\n.\n");
    assert.equal(server.outboundSeq, 0);
    server.noteOutboundPhase(">\nz:9\n.\n");
    assert.equal(server.outboundSeq, 1);
    await client.end();
    await hub.close();
  });

  test("sendResume rejects bad fromSeq; sendSnapshot uses committed", async () => {
    const hub = await XaiopWs.listen({ port: 0, session: true });
    let server = null;
    hub.onConnection((c) => {
      server = c;
    });
    const client = await XaiopWs.connect(hub.url(), {
      session: true,
      mergeChunkWindow: false,
      onPhase: () => {},
    });
    await sleep(20);
    assert.throws(() => client.sendResume({ fromSeq: -1 }), TypeError);
    assert.throws(() => client.sendResume({ fromSeq: 1.5 }), TypeError);
    server.pushJson("a", 1);
    await sleep(40);
    // Consumer has committed {a:1}; snapshot without arg uses getCommittedSnapshot.
    assert.equal(client.sendSnapshot(), true);
    await client.end();
    await hub.close();
  });

  test("ControlPlaneHost sendResume requires sessionId somehow", () => {
    const host = new ControlPlaneHost({
      send: () => true,
    });
    assert.throws(() => host.sendResume({ fromSeq: 0 }), /sessionId/);
  });

  test("ResumeWireLog wiresAfter rejects bad fromSeq", () => {
    const log = new ResumeWireLog();
    assert.throws(() => log.wiresAfter(-1), TypeError);
    assert.throws(() => log.record({ seq: 0, wire: "x" }), TypeError);
  });
});

describe("coverage â€?WS handler lock + listen onResume", () => {
  test("connect locks onResume; listen-accept stays mutable", async () => {
    const hub = await XaiopWs.listen({ port: 0, session: true });
    let server = null;
    hub.onConnection((c) => {
      server = c;
    });
    const client = await XaiopWs.connect(hub.url(), {
      session: true,
      onPhase: () => {},
    });
    await sleep(20);
    assert.throws(() => client.onResume(() => {}), /locked/);
    assert.throws(() => client.onSession(() => {}), /locked/);
    assert.throws(() => client.onAck(() => {}), /locked/);
    assert.throws(() => client.onSnapshot(() => {}), /locked/);
    assert.throws(() => client.onControlError(() => {}), /locked/);
    // listen-accept unlocked
    let resumed = null;
    server.onResume((b) => {
      resumed = b;
    });
    assert.equal(client.sendResume({ fromSeq: 0 }), true);
    await sleep(40);
    assert.ok(resumed);
    assert.equal(resumed.fromSeq, 0);
    await client.end();
    await hub.close();
  });

  test("getResumeState exposes inboundSeq and outboundSeq", async () => {
    const hub = await XaiopWs.listen({ port: 0, session: true });
    let server = null;
    hub.onConnection((c) => {
      server = c;
    });
    const client = await XaiopWs.connect(hub.url(), {
      session: true,
      mergeChunkWindow: false,
      onPhase: () => {},
    });
    await sleep(20);
    server.pushJson("a", 1);
    server.pushJson("b", 2);
    await sleep(50);
    const prod = server.getResumeState();
    const cons = client.getResumeState();
    assert.equal(prod.outboundSeq, 2);
    assert.equal(prod.inboundSeq, 0);
    assert.equal(cons.inboundSeq, 2);
    assert.equal(cons.seq, 2);
    assert.equal(cons.outboundSeq, 0);
    await client.end();
    await hub.close();
  });
});

describe("coverage â€?Stream events meta + capability constants", () => {
  test("events mode chunk carries meta.seq", async () => {
    const metas = [];
    const stream = new XaiopStream("raw://ev-meta", {
      modes: [STREAM_MODES.EVENTS],
      mergeChunkWindow: false,
    });
    stream.on("chunk", (_d, meta) => metas.push(meta));
    const p = stream.send({
      transport: TRANSPORT_KIND.RAW,
      source: chunksOf(">\na:1\n.\n>\nb:2\n.\n"),
    });
    await waitStatus(stream, "completed");
    await p;
    assert.equal(metas.length, 2);
    assert.equal(metas[0].seq, 1);
    assert.equal(metas[1].seq, 2);
  });

  test("CONTROL_CAPABILITY ids match encode prefixes", () => {
    assert.ok(
      encodeControlFrame("xaiop", "types", 1, { version: 1, entries: [] }).startsWith(
        "#!" + CONTROL_CAPABILITY.TYPES_V1,
      ),
    );
    assert.equal(CONTROL_CAPABILITY.SESSION_V1, "xaiop/session/v1");
    assert.equal(CONTROL_CAPABILITY.RESUME_V1, "xaiop/resume/v1");
    assert.equal(CONTROL_CAPABILITY.ACK_V1, "xaiop/ack/v1");
    assert.equal(CONTROL_CAPABILITY.SNAPSHOT_V1, "xaiop/snapshot/v1");
  });
});

describe("coverage â€?types frame via WS demux mid-stream", () => {
  test("schema applied when interleaved with wire in one message", async () => {
    const hub = await XaiopWs.listen({ port: 0 });
    let server = null;
    hub.onConnection((c) => {
      server = c;
    });
    const client = await XaiopWs.connect(hub.url(), {
      typeCheck: true,
      mergeChunkWindow: false,
      onPhase: () => {},
    });
    await sleep(20);
    const reg = new TypeRegistry();
    reg.register("a", TYPE.INT);
    // Single WS message: control + wire interleaved.
    server.pushWire(
      encodeTypeSchemaFrame(reg.snapshot()) + ">\na:1\n.\n>\na:2\n.\n",
    );
    await sleep(60);
    assert.equal(client.phaseSeq, 2);
    assert.deepEqual(client.getCommittedSnapshot(), { a: 2 });
    await client.end();
    await hub.close();
  });
});
