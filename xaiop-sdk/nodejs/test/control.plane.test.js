import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CONTROL_CAPABILITY,
  CONTROL_NS,
  ControlDemux,
  ControlIngest,
  ControlSessionState,
  DotCheckpointEngine,
  SDK_VERSION,
  TYPE,
  TypeRegistry,
  XaiopControlError,
  XaiopWs,
  applyAnnotationSpans,
  encodeAckFrame,
  encodeControlFrame,
  encodeResumeFrame,
  encodeSessionFrame,
  encodeSnapshotFrame,
  encodeTypeSchemaFrame,
  isSdkControlLine,
  parseControlHeader,
} from "../dist/index.js";
import { WebSocketServer } from "ws";

describe("control plane — foundation", () => {
  test("SDK_VERSION is 0.14.1", () => {
    assert.equal(SDK_VERSION, "0.14.1");
  });

  test("isSdkControlLine / parseControlHeader", () => {
    assert.equal(isSdkControlLine("#!xaiop/types/v1"), true);
    assert.equal(isSdkControlLine("# note"), false);
    assert.equal(isSdkControlLine("#xaiop"), false);
    const h = parseControlHeader("#!xaiop/session/v1");
    assert.deepEqual(h, {
      ns: "xaiop",
      name: "session",
      version: 1,
      id: "xaiop/session/v1",
      header: "#!xaiop/session/v1",
    });
    assert.equal(parseControlHeader("#!bad"), null);
  });

  test("encodeControlFrame rejects multiline body", () => {
    assert.throws(
      () => encodeControlFrame("xaiop", "session", 1, "a\nb"),
      XaiopControlError,
    );
  });

  test("types frame round-trip via encodeTypeSchemaFrame", () => {
    const reg = new TypeRegistry();
    reg.register("a", TYPE.INT);
    const frame = encodeTypeSchemaFrame(reg.snapshot());
    assert.ok(frame.startsWith("#!xaiop/types/v1\n"));
    assert.ok(frame.endsWith("\n"));
    const demux = new ControlDemux();
    const out = demux.push(frame);
    assert.equal(out.wireText, "");
    assert.equal(out.frames.length, 1);
    assert.equal(out.frames[0].id, CONTROL_CAPABILITY.TYPES_V1);
  });
});

describe("control demux — line interleave", () => {
  test("peels interleaved control frames from wire", () => {
    const demux = new ControlDemux();
    const text =
      ">\na:1\n.\n" +
      encodeSessionFrame({ sessionId: "s1", role: "producer", capabilities: [], epoch: 0 }) +
      ">\nb:2\n.\n" +
      encodeAckFrame({ sessionId: "s1", seq: 1 });
    const out = demux.push(text);
    assert.equal(out.frames.length, 2);
    assert.equal(out.frames[0].name, "session");
    assert.equal(out.frames[1].name, "ack");
    assert.equal(out.wireText, ">\na:1\n.\n>\nb:2\n.\n");
    assert.equal(out.errors.length, 0);
  });

  test("unknown capability: discard + error, wire continues", () => {
    const errors = [];
    const ingest = new ControlIngest({
      onControlError: (e) => errors.push(e),
    });
    const wire = ingest.push(
      ">\na:1\n.\n#!xaiop/nope/v1\n{}\n>\nb:2\n.\n",
    );
    assert.equal(wire, ">\na:1\n.\n>\nb:2\n.\n");
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, "CONTROL_UNKNOWN_CAPABILITY");
  });

  test("foreign ns: discard + error", () => {
    const errors = [];
    const ingest = new ControlIngest({
      onControlError: (e) => errors.push(e),
    });
    const wire = ingest.push("#!other/foo/v1\n{}\n>\na:1\n.\n");
    assert.equal(wire, ">\na:1\n.\n");
    assert.equal(errors[0].code, "CONTROL_UNKNOWN_NS");
  });

  test("malformed #! header: discard + error, not wire", () => {
    const errors = [];
    const ingest = new ControlIngest({
      onControlError: (e) => errors.push(e),
    });
    const wire = ingest.push("#!not-a-header\n{}\n>\na:1\n.\n");
    assert.equal(wire, ">\na:1\n.\n");
    assert.equal(errors[0].code, "CONTROL_HEADER_MALFORMED");
  });

  test("compat: types frame without trailing LF after JSON", () => {
    const snaps = [];
    const ingest = new ControlIngest({
      onTypes: (s) => snaps.push(s),
    });
    // Historical whole-message shape (no final LF after JSON body).
    const legacy =
      "#!xaiop/types/v1\n" +
      JSON.stringify({ version: 1, entries: [{ path: "x", type: { kind: "int" }, polarity: "allow" }] });
    const wire = ingest.push(legacy);
    assert.equal(wire, "");
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0].entries[0].path, "x");
  });

  test("split across pushes (header / body / wire)", () => {
    const frames = [];
    const ingest = new ControlIngest({
      onSession: (b) => frames.push(b),
    });
    assert.equal(ingest.push("#!xaiop/ses"), "");
    assert.equal(ingest.push("sion/v1\n"), "");
    assert.equal(
      ingest.push('{"sessionId":"ab","role":"duplex","capabilities":[],"epoch":0}\n>\na:1\n.\n'),
      ">\na:1\n.\n",
    );
    assert.equal(frames[0].sessionId, "ab");
  });
});

describe("annotation span — hard-skip #!", () => {
  test("#! line does not trigger span remount", () => {
    let calls = 0;
    const { lines } = applyAnnotationSpans(
      [">", "#!xaiop/types/v1", '{"version":1,"entries":[]}', "a:1", "."],
      [
        () => {
          calls += 1;
          return { hijacked: true };
        },
      ],
    );
    assert.equal(calls, 0);
    assert.ok(lines.includes("#!xaiop/types/v1"));
    assert.ok(lines.includes("a:1"));
  });

  test("ordinary # still spans", () => {
    const { lines } = applyAnnotationSpans([">", "# note", "a:1", "."], [
      () => ({ a: 9 }),
    ]);
    assert.ok(lines.some((l) => l.startsWith("a:")));
    assert.ok(!lines.includes("# note"));
  });
});

describe("phase seq", () => {
  test("physical . gets monotonic seq; window merge lists seqs", () => {
    /** @type {{ seq?: number, seqs?: number[] }[]} */
    const metas = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: true,
      onChunk: (_d, meta) => metas.push(meta || {}),
    });
    eng.push(">\na:1\n.\n>\nb:2\n.\n");
    assert.equal(eng.phaseSeq, 2);
    assert.equal(metas.length, 1);
    assert.deepEqual(metas[0].seqs, [1, 2]);
    assert.equal(metas[0].seq, 2);
  });

  test("mergeChunkWindow false: one seq per onChunk", () => {
    const metas = [];
    const eng = new DotCheckpointEngine({
      streamProcessing: true,
      mergeChunkWindow: false,
      onChunk: (_d, meta) => metas.push(meta || {}),
    });
    eng.push(">\na:1\n.\n>\nb:2\n.\n");
    assert.equal(metas.length, 2);
    assert.equal(metas[0].seq, 1);
    assert.equal(metas[1].seq, 2);
  });
});

describe("session / resume / ack / snapshot codecs", () => {
  test("session state + resume cursor", () => {
    const s = new ControlSessionState({ sessionId: "sid-1", role: "producer" });
    assert.equal(s.nextPhaseSeq(), 1);
    assert.equal(s.nextPhaseSeq(), 2);
    s.noteAck(1);
    assert.equal(s.ackedSeq, 1);
    const resume = s.toResumeState({ a: 1 });
    assert.equal(resume.sessionId, "sid-1");
    assert.equal(resume.seq, 2);
    assert.deepEqual(resume.committedSnapshot, { a: 1 });
  });

  test("frame codecs produce demuxable frames", () => {
    const demux = new ControlDemux();
    const blob =
      encodeResumeFrame({ sessionId: "s", fromSeq: 3 }) +
      encodeSnapshotFrame({ sessionId: "s", seq: 3, tree: { ok: true } });
    const out = demux.push(blob);
    assert.equal(out.frames.length, 2);
    assert.equal(out.frames[0].name, "resume");
    assert.equal(out.frames[1].name, "snapshot");
  });
});

describe("WS control + resume path", () => {
  test("interleaved types + wire; unknown control soft-errors; seq + ack", async () => {
    const wss = new WebSocketServer({ port: 0 });
    const port = /** @type {import('net').AddressInfo} */ (wss.address()).port;
    /** @type {import('ws').WebSocket[]} */
    const peers = [];
    wss.on("connection", (ws) => peers.push(ws));

    const controlErrors = [];
    const sessions = [];
    const acks = [];
    const phases = [];

    const client = await XaiopWs.connect(`ws://127.0.0.1:${port}`, {
      session: true,
      autoAck: true,
      onControlError: (e) => controlErrors.push(e),
      onSession: (b) => sessions.push(b),
      onAck: (b) => acks.push(b),
      onPhase: (diff, meta) => phases.push({ diff, meta }),
    });

    await new Promise((r) => setTimeout(r, 30));
    const peer = peers[0];
    assert.ok(peer);

    const reg = new TypeRegistry();
    reg.register("a", TYPE.INT);
    peer.send(encodeTypeSchemaFrame(reg.snapshot()));
    peer.send(">\na:1\n.\n");
    peer.send("#!xaiop/unknown/v9\n{}\n");
    peer.send(">\nb:2\n.\n");
    peer.send(
      encodeSessionFrame({
        sessionId: "peer-sess",
        role: "producer",
        capabilities: [CONTROL_CAPABILITY.RESUME_V1],
        epoch: 0,
      }),
    );

    await new Promise((r) => setTimeout(r, 80));

    assert.ok(phases.length >= 2);
    assert.equal(phases[0].meta.seq, 1);
    assert.equal(client.phaseSeq, 2);
    assert.ok(controlErrors.some((e) => e.code === "CONTROL_UNKNOWN_CAPABILITY"));
    assert.ok(sessions.some((s) => s.sessionId === "peer-sess"));

    const state = client.getResumeState();
    assert.equal(state.seq, 2);
    assert.ok(state.sessionId);

    // Producer-side resume request shape.
    assert.equal(client.sendResume({ fromSeq: 2 }), true);

    await client.end();
    await new Promise((resolve) => wss.close(resolve));
  });

  test("resume + snapshot do not feed document parse as annotation", async () => {
    const wss = new WebSocketServer({ port: 0 });
    const port = /** @type {import('net').AddressInfo} */ (wss.address()).port;
    /** @type {import('ws').WebSocket[]} */
    const peers = [];
    wss.on("connection", (ws) => peers.push(ws));

    const snapshots = [];
    const resumes = [];
    const phases = [];

    const client = await XaiopWs.connect(`ws://127.0.0.1:${port}`, {
      session: { sessionId: "c1" },
      onSnapshot: (b) => snapshots.push(b),
      onResume: (b) => resumes.push(b),
      onPhase: (d) => phases.push(d),
    });
    await new Promise((r) => setTimeout(r, 20));
    const peer = peers[0];

    peer.send(
      encodeSnapshotFrame({ sessionId: "c1", seq: 0, tree: { seeded: true } }),
    );
    peer.send(encodeResumeFrame({ sessionId: "c1", fromSeq: 0 }));
    peer.send(">\nafter:1\n.\n");

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(snapshots.length, 1);
    assert.deepEqual(snapshots[0].tree, { seeded: true });
    assert.equal(resumes[0].fromSeq, 0);
    assert.deepEqual(phases[0], { after: 1 });

    await client.end();
    await new Promise((resolve) => wss.close(resolve));
  });
});

describe("control ns constant", () => {
  test("official ns is xaiop", () => {
    assert.equal(CONTROL_NS, "xaiop");
  });
});
