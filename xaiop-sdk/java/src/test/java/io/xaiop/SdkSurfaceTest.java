package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.compat.Compat;
import io.xaiop.control.ControlDemux;
import io.xaiop.control.ControlDispatch;
import io.xaiop.control.ControlFrames;
import io.xaiop.control.ControlIngest;
import io.xaiop.control.ControlPlaneHost;
import io.xaiop.control.ControlSessionState;
import io.xaiop.control.ResumeWireLog;
import io.xaiop.stream.AnnotationSpan;
import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.LineIntercept;
import io.xaiop.stream.ParseHistory;
import io.xaiop.stream.PhaseEncode;
import io.xaiop.stream.Transport;
import io.xaiop.stream.TransportKind;
import io.xaiop.stream.XaiopStream;
import io.xaiop.types.TypeChecker;
import io.xaiop.types.TypeFreezeSession;
import io.xaiop.types.TypeRegistry;
import io.xaiop.types.Types;
import io.xaiop.ws.XaiopWs;
import io.xaiop.ws.XaiopWsConnection;
import io.xaiop.ws.XaiopWsHub;
import org.junit.jupiter.api.Test;

/**
 * Parity / surface smoke: protocol + SDK versions and that major public packages load and expose
 * key types.
 */
class SdkSurfaceTest {

  @Test
  void protocolAndSdkVersions() {
    assertEquals("0.6.0", Xaiop.PROTOCOL_VERSION);
    assertEquals("0.15.1", Xaiop.SDK_VERSION);
  }

  @Test
  void coreFacadeClassesExist() {
    assertNotNull(Xaiop.class);
    assertNotNull(Parse.class);
    assertNotNull(Encode.class);
    assertNotNull(Merge.class);
    assertNotNull(Json.class);
    assertNotNull(XaiopEngine.class);
    assertNotNull(Compat.class);
  }

  @Test
  void typesPackageSmoke() {
    TypeRegistry reg = new TypeRegistry();
    assertTrue(reg.register("k", Types.TYPE.INT));
    TypeChecker checker = new TypeChecker(reg);
    checker.checkTree(Fixtures.map("k", 1));
    TypeFreezeSession freeze = new TypeFreezeSession();
    freeze.observeTree(Fixtures.map("a", 1));
    assertTrue(Types.encodeTypeSchemaFrame(reg.snapshot()).startsWith(Types.TYPE_SCHEMA_FRAME_PREFIX));
  }

  @Test
  void controlPackageSmoke() {
    assertTrue(ControlFrames.isSdkControlLine("#!xaiop/ack/v1"));
    assertEquals("xaiop/session/v1", ControlFrames.CONTROL_CAPABILITY.SESSION_V1);
    ControlDemux demux = new ControlDemux();
    assertNotNull(demux.push(">\na:1\n.\n"));
    ControlIngest ingest = new ControlIngest(new ControlDispatch.Handlers());
    assertEquals(">\na:1\n.\n", ingest.push(">\na:1\n.\n"));
    assertTrue(ControlSessionState.createSessionId().length() > 8);
    ResumeWireLog log = new ResumeWireLog();
    log.record(1, ">\na:1\n.\n");
    assertEquals(1, log.size());
    ControlPlaneHost host = ControlPlaneHost.Options.builder().send(t -> true).build();
    assertNotNull(host);
  }

  @Test
  void streamPackageSmoke() {
    assertNotNull(TransportKind.RAW);
    assertNotNull(Transport.chunksOf(">\na:1\n.\n"));
    assertNotNull(LineIntercept.classifyLine("a:1"));
    assertNotNull(AnnotationSpan.KEEP);
    assertNotNull(PhaseEncode.encodePhaseJson("k", 1));
    try (DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().onChunk(d -> {}).build()) {
      eng.push(">\na:1\n.\n");
      eng.finish();
      assertEquals(Fixtures.map("a", 1), eng.snapshot());
    }
    ParseHistory h = new ParseHistory(true, false);
    assertTrue(h.enabled());
    XaiopStream stream = new XaiopStream("raw://surface");
    assertFalseBusyWhenIdle(stream);
  }

  @Test
  void wsPackageClassesExist() {
    assertNotNull(XaiopWs.class);
    assertNotNull(XaiopWsHub.class);
    assertNotNull(XaiopWsConnection.class);
    assertNotNull(new XaiopWs.ConnectOptions());
    assertNotNull(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"));
  }

  private static void assertFalseBusyWhenIdle(XaiopStream stream) {
    assertEquals(false, stream.isBusy());
  }
}
