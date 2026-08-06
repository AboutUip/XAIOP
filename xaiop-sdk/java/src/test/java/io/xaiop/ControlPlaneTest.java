package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.control.ControlDemux;
import io.xaiop.control.ControlDispatch;
import io.xaiop.control.ControlFrame;
import io.xaiop.control.ControlFrames;
import io.xaiop.control.ControlIngest;
import io.xaiop.control.ControlSessionState;
import io.xaiop.control.XaiopControlError;
import io.xaiop.stream.AnnotationSpan;
import io.xaiop.types.TypeRegistry;
import io.xaiop.types.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Unit-level Control Root demux / dispatch (Node {@code control.plane.test.js}) — no WS. */
class ControlPlaneTest {

  @Test
  void isSdkControlLineAndParseHeader() {
    assertTrue(ControlFrames.isSdkControlLine("#!xaiop/types/v1"));
    assertFalse(ControlFrames.isSdkControlLine("# note"));
    assertFalse(ControlFrames.isSdkControlLine("#xaiop"));
    ControlFrame h = ControlFrames.parseControlHeader("#!xaiop/session/v1");
    assertNotNull(h);
    assertEquals("xaiop", h.ns());
    assertEquals("session", h.name());
    assertEquals(1, h.version());
    assertEquals("xaiop/session/v1", h.id());
    assertNull(ControlFrames.parseControlHeader("#!bad"));
  }

  @Test
  void encodeControlFrameRejectsMultilineBody() {
    assertThrows(
        XaiopControlError.class,
        () -> ControlFrames.encodeControlFrame("xaiop", "session", 1, "a\nb"));
  }

  @Test
  void typesFrameRoundTripViaEncodeTypeSchemaFrame() {
    TypeRegistry reg = new TypeRegistry();
    reg.register("a", Types.TYPE.INT);
    String frame = Types.encodeTypeSchemaFrame(reg.snapshot());
    assertTrue(frame.startsWith("#!xaiop/types/v1\n"));
    assertTrue(frame.endsWith("\n"));
    ControlDemux demux = new ControlDemux();
    ControlDemux.PushResult out = demux.push(frame);
    assertEquals("", out.wireText());
    assertEquals(1, out.frames().size());
    assertEquals(ControlFrames.CONTROL_CAPABILITY.TYPES_V1, out.frames().get(0).id());
  }

  @Test
  void peelsInterleavedControlFramesFromWire() {
    ControlDemux demux = new ControlDemux();
    Map<String, Object> session = new LinkedHashMap<>();
    session.put("sessionId", "s1");
    session.put("role", "producer");
    session.put("capabilities", List.of());
    session.put("epoch", 0);
    Map<String, Object> ack = new LinkedHashMap<>();
    ack.put("sessionId", "s1");
    ack.put("seq", 1);
    String text =
        ">\na:1\n.\n"
            + ControlFrames.encodeSessionFrame(session)
            + ">\nb:2\n.\n"
            + ControlFrames.encodeAckFrame(ack);
    ControlDemux.PushResult out = demux.push(text);
    assertEquals(2, out.frames().size());
    assertEquals("session", out.frames().get(0).name());
    assertEquals("ack", out.frames().get(1).name());
    assertEquals(">\na:1\n.\n>\nb:2\n.\n", out.wireText());
    assertTrue(out.errors().isEmpty());
  }

  @Test
  void unknownCapabilityDiscardAndError() {
    List<XaiopControlError> errors = new ArrayList<>();
    ControlIngest ingest =
        new ControlIngest(new ControlDispatch.Handlers().onControlError(errors::add));
    String wire = ingest.push(">\na:1\n.\n#!xaiop/nope/v1\n{}\n>\nb:2\n.\n");
    assertEquals(">\na:1\n.\n>\nb:2\n.\n", wire);
    assertEquals(1, errors.size());
    assertEquals("CONTROL_UNKNOWN_CAPABILITY", errors.get(0).getCode());
  }

  @Test
  void foreignNsDiscardAndError() {
    List<XaiopControlError> errors = new ArrayList<>();
    ControlIngest ingest =
        new ControlIngest(new ControlDispatch.Handlers().onControlError(errors::add));
    String wire = ingest.push("#!other/foo/v1\n{}\n>\na:1\n.\n");
    assertEquals(">\na:1\n.\n", wire);
    assertEquals("CONTROL_UNKNOWN_NS", errors.get(0).getCode());
  }

  @Test
  void malformedHeaderDiscardAndError() {
    List<XaiopControlError> errors = new ArrayList<>();
    ControlIngest ingest =
        new ControlIngest(new ControlDispatch.Handlers().onControlError(errors::add));
    String wire = ingest.push("#!not-a-header\n{}\n>\na:1\n.\n");
    assertEquals(">\na:1\n.\n", wire);
    assertEquals("CONTROL_HEADER_MALFORMED", errors.get(0).getCode());
  }

  @Test
  void compatTypesFrameWithoutTrailingLf() {
    List<Object> snaps = new ArrayList<>();
    ControlIngest ingest =
        new ControlIngest(new ControlDispatch.Handlers().onTypes((s, f) -> snaps.add(s)));
    String legacy =
        "#!xaiop/types/v1\n"
            + "{\"version\":1,\"entries\":[{\"path\":\"x\",\"type\":{\"kind\":\"int\"},\"polarity\":\"allow\"}]}";
    String wire = ingest.push(legacy);
    assertEquals("", wire);
    assertEquals(1, snaps.size());
    @SuppressWarnings("unchecked")
    Map<String, Object> snap = (Map<String, Object>) snaps.get(0);
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> entries = (List<Map<String, Object>>) snap.get("entries");
    assertEquals("x", entries.get(0).get("path"));
  }

  @Test
  void splitAcrossPushes() {
    List<Object> frames = new ArrayList<>();
    ControlIngest ingest =
        new ControlIngest(new ControlDispatch.Handlers().onSession((b, f) -> frames.add(b)));
    assertEquals("", ingest.push("#!xaiop/ses"));
    assertEquals("", ingest.push("sion/v1\n"));
    assertEquals(
        ">\na:1\n.\n",
        ingest.push("{\"sessionId\":\"ab\",\"role\":\"duplex\",\"capabilities\":[],\"epoch\":0}\n>\na:1\n.\n"));
    @SuppressWarnings("unchecked")
    Map<String, Object> body = (Map<String, Object>) frames.get(0);
    assertEquals("ab", body.get("sessionId"));
  }

  @Test
  void annotationSpanHardSkipBang() {
    int[] calls = {0};
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "#!xaiop/types/v1", "{\"version\":1,\"entries\":[]}", "a:1", "."),
            List.of(
                (a, v) -> {
                  calls[0]++;
                  return Map.of("hijacked", true);
                }));
    assertEquals(0, calls[0]);
    assertTrue(out.lines().contains("#!xaiop/types/v1"));
  }

  @Test
  void sessionStateAndResumeCursor() {
    ControlSessionState s = ControlSessionState.of("sid-1", "producer");
    assertEquals(1, s.nextPhaseSeq());
    assertEquals(2, s.nextPhaseSeq());
    s.noteAck(1);
    assertEquals(1, s.getAckedSeq());
    Map<String, Object> resume = s.toResumeState(Map.of("a", 1));
    assertEquals("sid-1", resume.get("sessionId"));
    assertEquals(2, resume.get("seq"));
    assertEquals(Map.of("a", 1), resume.get("committedSnapshot"));
  }

  @Test
  void frameCodecsProduceDemuxableFrames() {
    ControlDemux demux = new ControlDemux();
    String blob =
        ControlFrames.encodeResumeFrame(Map.of("sessionId", "s", "fromSeq", 3))
            + ControlFrames.encodeSnapshotFrame(
                Map.of("sessionId", "s", "seq", 3, "tree", Map.of("ok", true)));
    ControlDemux.PushResult out = demux.push(blob);
    assertEquals(2, out.frames().size());
    assertEquals("resume", out.frames().get(0).name());
    assertEquals("snapshot", out.frames().get(1).name());
  }

  @Test
  void parseControlBodyJsonEmptyIsNull() {
    ControlFrame h = ControlFrames.parseControlHeader("#!xaiop/ack/v1");
    ControlFrame frame =
        new ControlFrame(h.ns(), h.name(), h.version(), h.id(), h.header(), "   ", "#!xaiop/ack/v1\n");
    assertNull(ControlFrames.parseControlBodyJson(frame));
  }
}
