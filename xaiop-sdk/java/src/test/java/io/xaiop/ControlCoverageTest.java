package io.xaiop;

import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.control.ControlDemux;
import io.xaiop.control.ControlDispatch;
import io.xaiop.control.ControlFrame;
import io.xaiop.control.ControlFrames;
import io.xaiop.control.ControlIngest;
import io.xaiop.control.ControlPlaneHost;
import io.xaiop.control.ControlSessionState;
import io.xaiop.control.ResumeWireLog;
import io.xaiop.control.XaiopControlError;
import io.xaiop.stream.AnnotationSpan;
import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.StreamMode;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.Transport;
import io.xaiop.stream.TransportKind;
import io.xaiop.stream.XaiopStream;
import io.xaiop.types.TypeRegistry;
import io.xaiop.types.Types;
import io.xaiop.ws.XaiopWs;
import io.xaiop.ws.XaiopWsConnection;
import io.xaiop.ws.XaiopWsHub;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/**
 * Coverage stress for control demux / dispatch / host / WS edges — ported from Node {@code
 * control.coverage.test.js}.
 */
class ControlCoverageTest {

  private static void waitStatus(XaiopStream stream, StreamStatus want) throws Exception {
    long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
    while (stream.status() != want) {
      if (stream.status() == StreamStatus.ERROR) {
        throw new AssertionError("stream error", stream.lastError());
      }
      if (System.nanoTime() > deadline) {
        throw new AssertionError("timeout waiting for " + want + ", got " + stream.status());
      }
      Thread.sleep(4);
    }
  }

  private static void delay(long ms) throws InterruptedException {
    Thread.sleep(ms);
  }

  // --- demux stress ----------------------------------------------------------

  @Test
  void charByCharControlPlusWireDemux() {
    List<Object> frames = new ArrayList<>();
    ControlIngest ingest =
        new ControlIngest(new ControlDispatch.Handlers().onAck((b, f) -> frames.add(b)));
    String text =
        ">\na:1\n.\n"
            + ControlFrames.encodeAckFrame(map("sessionId", "s", "seq", 1))
            + ">\nb:2\n.\n";
    StringBuilder wire = new StringBuilder();
    for (int i = 0; i < text.length(); i++) {
      wire.append(ingest.push(String.valueOf(text.charAt(i))));
    }
    wire.append(ingest.flush());
    assertEquals(">\na:1\n.\n>\nb:2\n.\n", wire.toString());
    assertEquals(1, frames.size());
    @SuppressWarnings("unchecked")
    Map<String, Object> ack = (Map<String, Object>) frames.get(0);
    assertEquals(1, ((Number) ack.get("seq")).intValue());
  }

  @Test
  void backToBackControlFramesLeaveEmptyWire() {
    List<String> names = new ArrayList<>();
    ControlIngest ingest =
        new ControlIngest(
            new ControlDispatch.Handlers()
                .onSession((b, f) -> names.add("session"))
                .onAck((b, f) -> names.add("ack"))
                .onResume((b, f) -> names.add("resume"))
                .onSnapshot((b, f) -> names.add("snapshot")));
    String blob =
        ControlFrames.encodeSessionFrame(
                map("sessionId", "s", "role", "duplex", "capabilities", List.of(), "epoch", 0))
            + ControlFrames.encodeAckFrame(map("sessionId", "s", "seq", 0))
            + ControlFrames.encodeResumeFrame(map("sessionId", "s", "fromSeq", 0))
            + ControlFrames.encodeSnapshotFrame(map("sessionId", "s", "seq", 0, "tree", null));
    assertEquals("", ingest.push(blob));
    assertEquals(List.of("session", "ack", "resume", "snapshot"), names);
  }

  @Test
  void controlOnlyStreamFlushAtEof() {
    ControlDemux demux = new ControlDemux();
    demux.push("#!xaiop/resume/v1\n");
    ControlDemux.PushResult mid = demux.push("{\"sessionId\":\"x\",\"fromSeq\":4}");
    ControlDemux.PushResult out = mid.frames().isEmpty() ? demux.flush() : mid;
    assertEquals(1, out.frames().size());
    assertEquals("resume", out.frames().get(0).name());
    @SuppressWarnings("unchecked")
    Map<String, Object> body =
        (Map<String, Object>) Json.parse(out.frames().get(0).body());
    assertEquals(4, ((Number) body.get("fromSeq")).intValue());
  }

  @Test
  void hashWithSpaceIsNotControlBangPrefixIs() {
    assertFalse(ControlFrames.isSdkControlLine("# !note"));
    assertTrue(ControlFrames.isSdkControlLine("#!xaiop/types/v1"));
    assertTrue(ControlFrames.isSdkControlLine("#!"));
    assertFalse(ControlFrames.isSdkControlLine("#"));
  }

  // --- dispatch all official capabilities ------------------------------------

  @Test
  void dispatchTypesSessionResumeAckSnapshotHappyPath() {
    List<List<Object>> hit = new ArrayList<>();
    ControlDispatch.Handlers handlers =
        new ControlDispatch.Handlers()
            .onTypes((b, f) -> hit.add(List.of("types", ((Map<?, ?>) b).get("version"))))
            .onSession((b, f) -> hit.add(List.of("session", ((Map<?, ?>) b).get("sessionId"))))
            .onResume((b, f) -> hit.add(List.of("resume", ((Map<?, ?>) b).get("fromSeq"))))
            .onAck((b, f) -> hit.add(List.of("ack", ((Map<?, ?>) b).get("seq"))))
            .onSnapshot((b, f) -> hit.add(List.of("snapshot", ((Map<?, ?>) b).get("tree"))))
            .onControlError(e -> hit.add(List.of("err")));

    TypeRegistry reg = new TypeRegistry();
    reg.register("k", Types.TYPE.INT);
    ControlDispatch.dispatchControlFrame(
        frame("types", 1, Json.stringify(reg.snapshot().toJsonTree())), handlers);

    for (Object[] pair :
        new Object[][] {
          {"session", map("sessionId", "s1")},
          {"resume", map("sessionId", "s1", "fromSeq", 2)},
          {"ack", map("sessionId", "s1", "seq", 2)},
          {"snapshot", map("sessionId", "s1", "seq", 2, "tree", map("k", 1))},
        }) {
      String name = (String) pair[0];
      @SuppressWarnings("unchecked")
      Map<String, Object> body = (Map<String, Object>) pair[1];
      ControlDispatch.dispatchControlFrame(frame(name, 1, Json.stringify(body)), handlers);
    }

    assertEquals(5, hit.size());
    assertEquals("types", hit.get(0).get(0));
    assertEquals(1, ((Number) hit.get(0).get(1)).intValue());
    assertEquals(List.of("session", "s1"), hit.get(1));
    assertEquals(2, ((Number) hit.get(2).get(1)).intValue());
    assertEquals(2, ((Number) hit.get(3).get(1)).intValue());
    assertEquals(map("k", 1), hit.get(4).get(1));
  }

  @Test
  void unsupportedVersionForEachOfficialName() {
    for (String name :
        List.of(
            ControlFrames.CONTROL_NAME.TYPES,
            ControlFrames.CONTROL_NAME.SESSION,
            ControlFrames.CONTROL_NAME.RESUME,
            ControlFrames.CONTROL_NAME.ACK,
            ControlFrames.CONTROL_NAME.SNAPSHOT,
            ControlFrames.CONTROL_NAME.SEQ)) {
      List<XaiopControlError> errors = new ArrayList<>();
      ControlDispatch.dispatchControlFrame(
          frame(name, 99, "{}"),
          new ControlDispatch.Handlers().onControlError(errors::add));
      assertEquals(1, errors.size(), name);
      assertEquals("CONTROL_UNKNOWN_CAPABILITY", errors.get(0).getCode(), name);
    }
  }

  @Test
  void invalidJsonBodyOnAckReportsError() {
    List<XaiopControlError> errors = new ArrayList<>();
    ControlDispatch.dispatchControlFrame(
        frame("ack", 1, "{"), new ControlDispatch.Handlers().onControlError(errors::add));
    assertEquals("CONTROL_BODY_JSON", errors.get(0).getCode());
  }

  private static ControlFrame frame(String name, int version, String body) {
    String header = "#!xaiop/" + name + "/v" + version;
    return new ControlFrame(
        "xaiop", name, version, "xaiop/" + name + "/v" + version, header, body, header + "\n");
  }

  // --- engine #! defense + cover seq -----------------------------------------

  @Test
  void enginePushWithLeakedBangDoesNotSpanRemount() {
    int[] calls = {0};
    List<Object> diffs = new ArrayList<>();
    try (DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .annotationSpan(
                (a, v) -> {
                  calls[0]++;
                  return map("hijack", true);
                })
            .onChunk(diffs::add)
            .build()) {
      eng.push(">\n#!xaiop/types/v1\na:1\n.\n");
      eng.finish();
    }
    assertEquals(0, calls[0]);
    assertEquals(map("a", 1), diffs.get(0));
  }

  @Test
  void applyAnnotationSpansKeepsOrdinaryHashAfterBangSkip() {
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "#!xaiop/ack/v1", "{}", "# note", "a:1", "."),
            List.of((a, v) -> map("a", 7)));
    assertTrue(out.lines().contains("#!xaiop/ack/v1"));
    assertFalse(out.lines().contains("# note"));
    assertTrue(out.lines().stream().anyMatch(l -> l.startsWith("a:")));
  }

  // --- outbound / host edge --------------------------------------------------

  @Test
  void createSessionIdIsNonEmptyUniqueIsh() {
    String a = ControlSessionState.createSessionId();
    String b = ControlSessionState.createSessionId();
    assertTrue(a.length() > 8);
    assertNotEquals(a, b);
  }

  @Test
  void retainOutboundWithoutSessionStillLogsPushJson() throws Exception {
    XaiopWsHub.ListenOptions listenOpts =
        new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1");
    listenOpts.retainOutbound = true;
    XaiopWsHub hub = XaiopWs.listen(listenOpts).get(10, TimeUnit.SECONDS);
    CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
    hub.onConnection(serverReady::complete);
    try {
      XaiopWsConnection client =
          XaiopWs.connect(hub.url(), new XaiopWs.ConnectOptions().onPhase(d -> {}))
              .get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      delay(20);
      assertNullSession(server);
      assertTrue(server.pushJson("a", 1));
      assertEquals(1, server.outboundSeq());
      assertTrue(server.replayOutboundAfter(0).contains("a:1"));
      client.end().get(5, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  private static void assertNullSession(XaiopWsConnection server) {
    assertEquals(null, server.sessionId());
  }

  @Test
  void pushWireDoesNotAutoRecordOutbound() throws Exception {
    XaiopWsHub.ListenOptions listenOpts =
        new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1");
    listenOpts.session = true;
    XaiopWsHub hub = XaiopWs.listen(listenOpts).get(10, TimeUnit.SECONDS);
    CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
    hub.onConnection(serverReady::complete);
    try {
      XaiopWsConnection client =
          XaiopWs.connect(hub.url(), new XaiopWs.ConnectOptions().onPhase(d -> {}))
              .get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      delay(20);
      server.pushWire(">\nz:9\n.\n");
      assertEquals(0, server.outboundSeq());
      server.noteOutboundPhase(">\nz:9\n.\n");
      assertEquals(1, server.outboundSeq());
      client.end().get(5, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void sendResumeRejectsBadFromSeqSendSnapshotUsesCommitted() throws Exception {
    XaiopWsHub.ListenOptions listenOpts =
        new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1");
    listenOpts.session = true;
    XaiopWsHub hub = XaiopWs.listen(listenOpts).get(10, TimeUnit.SECONDS);
    CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
    hub.onConnection(serverReady::complete);
    try {
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.session = true;
      cOpts.mergeChunkWindow = false;
      cOpts.onPhase(d -> {});
      XaiopWsConnection client = XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      delay(20);
      assertThrows(
          IllegalArgumentException.class, () -> client.sendResume(map("fromSeq", -1)));
      assertThrows(
          IllegalArgumentException.class, () -> client.sendResume(map("fromSeq", 1.5)));
      server.pushJson("a", 1);
      delay(40);
      assertTrue(client.sendSnapshot());
      client.end().get(5, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void controlPlaneHostSendResumeRequiresSessionId() {
    ControlPlaneHost host =
        ControlPlaneHost.Options.builder().send(t -> true).build();
    IllegalArgumentException ex =
        assertThrows(
            IllegalArgumentException.class, () -> host.sendResume(map("fromSeq", 0)));
    assertTrue(ex.getMessage().contains("sessionId"));
  }

  @Test
  void resumeWireLogWiresAfterRejectsBadFromSeq() {
    ResumeWireLog log = new ResumeWireLog();
    assertThrows(IllegalArgumentException.class, () -> log.wiresAfter(-1));
    assertThrows(
        IllegalArgumentException.class, () -> log.record(map("seq", 0, "wire", "x")));
  }

  // --- WS handler lock + listen onResume -------------------------------------

  @Test
  void connectLocksOnResumeListenAcceptStaysMutable() throws Exception {
    XaiopWsHub.ListenOptions listenOpts =
        new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1");
    listenOpts.session = true;
    XaiopWsHub hub = XaiopWs.listen(listenOpts).get(10, TimeUnit.SECONDS);
    CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
    hub.onConnection(serverReady::complete);
    try {
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.session = true;
      cOpts.onPhase(d -> {});
      XaiopWsConnection client = XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      delay(20);
      assertThrows(IllegalStateException.class, () -> client.onResume((b, f) -> {}));
      assertThrows(IllegalStateException.class, () -> client.onSession((b, f) -> {}));
      assertThrows(IllegalStateException.class, () -> client.onAck((b, f) -> {}));
      assertThrows(IllegalStateException.class, () -> client.onSnapshot((b, f) -> {}));
      assertThrows(IllegalStateException.class, () -> client.onControlError(e -> {}));

      CompletableFuture<Object> resumed = new CompletableFuture<>();
      server.onResume((b, f) -> resumed.complete(b));
      assertTrue(client.sendResume(map("fromSeq", 0)));
      Object body = resumed.get(3, TimeUnit.SECONDS);
      assertTrue(body != null);
      assertEquals(0, ((Number) ((Map<?, ?>) body).get("fromSeq")).intValue());
      client.end().get(5, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void getResumeStateExposesInboundAndOutboundSeq() throws Exception {
    XaiopWsHub.ListenOptions listenOpts =
        new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1");
    listenOpts.session = true;
    XaiopWsHub hub = XaiopWs.listen(listenOpts).get(10, TimeUnit.SECONDS);
    CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
    hub.onConnection(serverReady::complete);
    try {
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.session = true;
      cOpts.mergeChunkWindow = false;
      cOpts.onPhase(d -> {});
      XaiopWsConnection client = XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      delay(20);
      server.pushJson("a", 1);
      server.pushJson("b", 2);
      delay(80);
      Map<String, Object> prod = server.getResumeState();
      Map<String, Object> cons = client.getResumeState();
      assertEquals(2, ((Number) prod.get("outboundSeq")).intValue());
      assertEquals(0, ((Number) prod.get("inboundSeq")).intValue());
      assertEquals(2, ((Number) cons.get("inboundSeq")).intValue());
      assertEquals(2, ((Number) cons.get("seq")).intValue());
      assertEquals(0, ((Number) cons.get("outboundSeq")).intValue());
      client.end().get(5, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  // --- Stream events meta + capability constants -----------------------------

  @Test
  void eventsModeChunkCarriesMetaSeq() throws Exception {
    List<DotCheckpointEngine.ChunkMeta> metas = new ArrayList<>();
    XaiopStream stream =
        new XaiopStream(
            "raw://ev-meta",
            XaiopStream.Options.defaults()
                .modes(StreamMode.EVENTS, StreamMode.CALLBACK)
                .mergeChunkWindow(false));
    stream.onChunkWithMeta((d, meta) -> metas.add(meta));
    stream.send(
        new XaiopStream.SendOptions()
            .transport(TransportKind.RAW)
            .source(Transport.chunksOf(">\na:1\n.\n>\nb:2\n.\n")));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(2, metas.size());
    assertTrue(metas.get(0) != null);
    assertEquals(1, metas.get(0).seq);
    assertEquals(2, metas.get(1).seq);
  }

  @Test
  void controlCapabilityIdsMatchEncodePrefixes() {
    assertTrue(
        ControlFrames.encodeControlFrame(
                "xaiop", "types", 1, map("version", 1, "entries", List.of()))
            .startsWith("#!" + ControlFrames.CONTROL_CAPABILITY.TYPES_V1));
    assertEquals("xaiop/session/v1", ControlFrames.CONTROL_CAPABILITY.SESSION_V1);
    assertEquals("xaiop/resume/v1", ControlFrames.CONTROL_CAPABILITY.RESUME_V1);
    assertEquals("xaiop/ack/v1", ControlFrames.CONTROL_CAPABILITY.ACK_V1);
    assertEquals("xaiop/snapshot/v1", ControlFrames.CONTROL_CAPABILITY.SNAPSHOT_V1);
  }

  // --- types frame via WS demux mid-stream -----------------------------------

  @Test
  void schemaAppliedWhenInterleavedWithWireInOneMessage() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
    hub.onConnection(serverReady::complete);
    try {
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.typeCheck = true;
      cOpts.mergeChunkWindow = false;
      cOpts.onPhase(d -> {});
      XaiopWsConnection client = XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      delay(20);
      TypeRegistry reg = new TypeRegistry();
      reg.register("a", Types.TYPE.INT);
      server.pushWire(
          Types.encodeTypeSchemaFrame(reg.snapshot()) + ">\na:1\n.\n>\na:2\n.\n");
      delay(80);
      assertEquals(2, client.phaseSeq());
      assertEquals(map("a", 2), client.getCommittedSnapshot());
      client.end().get(5, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }
}
