package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.control.ControlDemux;
import io.xaiop.control.ControlDispatch;
import io.xaiop.control.ControlFrames;
import io.xaiop.control.ControlIngest;
import io.xaiop.control.ControlPlaneHost;
import io.xaiop.control.ControlSessionState;
import io.xaiop.control.ResumeWireLog;
import io.xaiop.control.XaiopControlError;
import io.xaiop.control.XaiopResumeLogError;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Resume log + ControlPlaneHost unit tests (Node {@code control.resume.test.js}) — no WS. */
class ControlResumeTest {

  @Test
  void resumeWireLogRecordWiresAfterMonotonic() {
    ResumeWireLog log = new ResumeWireLog();
    log.record(1, ">\na:1\n.\n", Map.of("a", 1));
    log.record(2, ">\nb:2\n.\n");
    log.record(3, ">\nc:3\n.\n", Map.of("a", 1, "b", 2, "c", 3));
    assertEquals(3, log.size());
    assertEquals(3, log.highestSeq());
    assertEquals(">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n", log.wiresAfterRaw(0));
    assertEquals(">\nb:2\n.\n>\nc:3\n.\n", log.wiresAfterRaw(1));
    assertEquals("", log.wiresAfterRaw(3));
    assertTrue(log.wiresAfter(1).startsWith("#!xaiop/seq/v1\n{\"seq\":2}\n"));
    assertTrue(log.wiresAfter(1).contains("#!xaiop/seq/v1\n{\"seq\":3}\n"));
    assertEquals(Map.of("a", 1), log.committedAt(1));
    assertNull(log.entryAt(9));
    assertThrows(XaiopResumeLogError.class, () -> log.record(2, "x"));
    log.clear();
    assertEquals(0, log.size());
  }

  @Test
  void demuxFlushCompletesHeaderOnlyFrame() {
    ControlDemux demux = new ControlDemux();
    assertEquals(0, demux.push("#!xaiop/session/v1").frames().size());
    ControlDemux.PushResult out = demux.flush();
    assertEquals(1, out.frames().size());
    assertEquals("", out.frames().get(0).body());
    assertEquals("", out.wireText());
  }

  @Test
  void demuxFlushCompletesPendingBodyWithoutTrailingLf() {
    ControlDemux demux = new ControlDemux();
    demux.push("#!xaiop/ack/v1\n");
    ControlDemux.PushResult mid = demux.push("{\"sessionId\":\"s\",\"seq\":2}");
    ControlDemux.PushResult out = mid.frames().isEmpty() ? demux.flush() : mid;
    assertEquals(1, out.frames().size());
    @SuppressWarnings("unchecked")
    Map<String, Object> body = (Map<String, Object>) Json.parse(out.frames().get(0).body());
    assertEquals(2, body.get("seq"));
  }

  @Test
  void crlfWirePreservedWhenPeelingControl() {
    ControlDemux demux = new ControlDemux();
    Map<String, Object> session = new LinkedHashMap<>();
    session.put("sessionId", "s");
    session.put("role", "duplex");
    session.put("capabilities", List.of());
    session.put("epoch", 0);
    String text =
        ">\r\na:1\r\n.\r\n"
            + ControlFrames.encodeSessionFrame(session)
            + ">\r\nb:2\r\n.\r\n";
    ControlDemux.PushResult out = demux.push(text);
    assertEquals(1, out.frames().size());
    assertEquals(">\r\na:1\r\n.\r\n>\r\nb:2\r\n.\r\n", out.wireText());
  }

  @Test
  void halfLineWireCarryAcrossPushes() {
    ControlDemux demux = new ControlDemux();
    assertEquals(">\n", demux.push(">\na:").wireText());
    assertEquals("a:1\n.\n", demux.push("1\n.\n").wireText());
  }

  @Test
  void unsupportedCapabilityVersionReports() {
    List<XaiopControlError> errors = new ArrayList<>();
    ControlIngest ingest =
        new ControlIngest(
            new ControlDispatch.Handlers()
                .onControlError(errors::add)
                .onSession(
                    (b, f) -> {
                      throw new IllegalStateException("should not run");
                    }));
    String wire = ingest.push("#!xaiop/session/v99\n{}\n>\na:1\n.\n");
    assertEquals(">\na:1\n.\n", wire);
    assertEquals("CONTROL_UNKNOWN_CAPABILITY", errors.get(0).getCode());
  }

  @Test
  void invalidTypesJsonBodyReports() {
    List<XaiopControlError> errors = new ArrayList<>();
    ControlIngest ingest =
        new ControlIngest(new ControlDispatch.Handlers().onControlError(errors::add));
    ingest.push("#!xaiop/types/v1\n{not-json}\n");
    assertTrue(
        errors.stream()
            .anyMatch(
                e ->
                    "CONTROL_BODY_JSON".equals(e.getCode())
                        || "CONTROL_TYPES_PAYLOAD".equals(e.getCode())));
    errors.clear();
    ingest.push("#!xaiop/types/v1\n{\"version\":1}\n");
    assertTrue(errors.stream().anyMatch(e -> "CONTROL_TYPES_PAYLOAD".equals(e.getCode())));
  }

  @Test
  void controlPlaneHostSendRequiresSession() {
    List<String> sent = new ArrayList<>();
    ControlPlaneHost host =
        ControlPlaneHost.Options.builder()
            .send(
                t -> {
                  sent.add(t);
                  return true;
                })
            .build();
    assertThrows(IllegalArgumentException.class, () -> host.sendAck(1));
    assertThrows(IllegalArgumentException.class, () -> host.sendSnapshot(Map.of()));
    assertThrows(
        IllegalArgumentException.class, () -> host.sendResume(Map.of("fromSeq", 0)));
    assertNull(host.getResumeState());

    host.sendSession(Map.of("role", "producer"));
    assertTrue(sent.get(0).startsWith("#!xaiop/session/v1\n"));
    assertTrue(host.sendAck(0));
    assertTrue(host.sendResume(Map.of("fromSeq", 0)));
    assertTrue(host.sendSnapshot(Map.of("hello", 1)));
    assertNotNull(host.getResumeState().get("sessionId"));
  }

  @Test
  void notePhaseMetaAdvancesSessionAndAutoAck() {
    List<String> sent = new ArrayList<>();
    ControlPlaneHost host =
        ControlPlaneHost.Options.builder()
            .send(
                t -> {
                  sent.add(t);
                  return true;
                })
            .session(true)
            .autoAck(true)
            .build();
    Map<String, Object> meta = new LinkedHashMap<>();
    meta.put("seq", 2);
    meta.put("seqs", List.of(1, 2));
    host.notePhaseMeta(meta);
    assertEquals(2, host.phaseSeq());
    assertTrue(sent.stream().anyMatch(t -> t.contains("#!xaiop/ack/v1")));
    String ackFrame = sent.stream().filter(t -> t.contains("/ack/")).findFirst().orElseThrow();
    Object ackBody = Json.parse(ackFrame.split("\n")[1]);
    assertEquals(2, ((Map<?, ?>) ackBody).get("seq"));
  }

  @Test
  void applyPeerSessionAndNoteAck() {
    ControlSessionState s = ControlSessionState.of("local", "duplex");
    s.applyPeerSession(
        Map.of(
            "sessionId",
            "peer",
            "epoch",
            3,
            "capabilities",
            List.of(ControlFrames.CONTROL_CAPABILITY.ACK_V1)));
    assertEquals("peer", s.getPeerSessionId());
    assertEquals(3, s.getEpoch());
    assertTrue(s.noteAck(5));
    assertFalse(s.noteAck(4));
    assertEquals(5, s.getAckedSeq());
  }

  @Test
  void stampWireWithLogSeq() {
    String stamped = ControlFrames.stampWireWithLogSeq(3, ">\na:1\n.\n");
    assertTrue(stamped.startsWith("#!xaiop/seq/v1\n{\"seq\":3}\n"));
    assertTrue(stamped.endsWith(">\na:1\n.\n"));
  }
}
