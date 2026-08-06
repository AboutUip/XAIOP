package io.xaiop.control;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Session / phase-seq cursor for resume.
 *
 * <p>Faithful port of {@code ControlSessionState} from the Node.js SDK's {@code control.js}.
 *
 * <p>Two numbering spaces (do not conflate):
 *
 * <ul>
 *   <li><b>Connection-local</b> {@code meta.seq} — resets every new DotCheckpointEngine / socket.
 *   <li><b>Session-log</b> {@code meta.logSeq} — durable cursor for {@code fromSeq} / ack /
 *       ResumeWireLog (stamped via {@code #!xaiop/seq/v1} before each phase).
 * </ul>
 */
public final class ControlSessionState {
  private String sessionId;
  private String role;
  private List<String> capabilities;
  private int epoch;
  /** Highest completed phase seq (0 = none yet). */
  private int phaseSeq;
  /** Highest contiguous ack received/applied. */
  private int ackedSeq;
  /** Peer session id if different. */
  private String peerSessionId;
  private List<String> peerCapabilities;

  public ControlSessionState() {
    this(null);
  }

  public ControlSessionState(Map<String, Object> init) {
    Map<String, Object> i = init == null ? Map.of() : init;
    Object sid = i.get("sessionId");
    this.sessionId = sid instanceof String s && !s.isEmpty() ? s : null;
    Object roleObj = i.get("role");
    this.role = roleObj instanceof String s ? s : "duplex";
    Object caps = i.get("capabilities");
    if (caps instanceof List<?> list) {
      this.capabilities = new ArrayList<>();
      for (Object c : list) {
        if (c != null) this.capabilities.add(String.valueOf(c));
      }
    } else {
      this.capabilities = defaultCapabilities();
    }
    Object ep = i.get("epoch");
    if (ep instanceof Number n && n.intValue() >= 0 && n.doubleValue() == n.intValue()) {
      this.epoch = n.intValue();
    } else {
      this.epoch = 0;
    }
    this.phaseSeq = 0;
    this.ackedSeq = 0;
    this.peerSessionId = null;
  }

  public static ControlSessionState of(String sessionId, String role) {
    Map<String, Object> init = new LinkedHashMap<>();
    if (sessionId != null) init.put("sessionId", sessionId);
    if (role != null) init.put("role", role);
    return new ControlSessionState(init);
  }

  public String ensureSessionId() {
    if (sessionId == null || sessionId.isEmpty()) {
      sessionId = createSessionId();
    }
    return sessionId;
  }

  /** Allocate the next phase seq (call once per physical {@code .} / tail unit). */
  public int nextPhaseSeq() {
    phaseSeq += 1;
    return phaseSeq;
  }

  /** @return true if advanced */
  public boolean noteAck(int seq) {
    if (seq < 0) return false;
    if (seq > ackedSeq) {
      ackedSeq = seq;
      return true;
    }
    return false;
  }

  /** Apply peer session hello. */
  public void applyPeerSession(Object body) {
    if (!(body instanceof Map<?, ?> map)) return;
    Object sid = map.get("sessionId");
    if (sid instanceof String s && !s.isEmpty()) {
      peerSessionId = s;
      if (sessionId == null || sessionId.isEmpty()) sessionId = s;
    }
    Object ep = map.get("epoch");
    if (ep instanceof Number n && n.intValue() >= 0 && n.doubleValue() == n.intValue()) {
      epoch = n.intValue();
    }
    Object caps = map.get("capabilities");
    if (caps instanceof List<?> list) {
      peerCapabilities = new ArrayList<>();
      for (Object c : list) {
        if (c != null) peerCapabilities.add(String.valueOf(c));
      }
    }
  }

  public Map<String, Object> toSessionBody() {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("sessionId", ensureSessionId());
    out.put("role", role);
    out.put("capabilities", new ArrayList<>(capabilities));
    out.put("epoch", epoch);
    return out;
  }

  public Map<String, Object> toResumeState() {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("sessionId", ensureSessionId());
    out.put("seq", phaseSeq);
    out.put("epoch", epoch);
    return out;
  }

  /** Resume state including committed snapshot (may be {@code null}). */
  public Map<String, Object> toResumeState(Object committedSnapshot) {
    Map<String, Object> out = toResumeState();
    out.put("committedSnapshot", committedSnapshot);
    return out;
  }

  public String getSessionId() {
    return sessionId;
  }

  public void setSessionId(String sessionId) {
    this.sessionId = sessionId;
  }

  public String getRole() {
    return role;
  }

  public void setRole(String role) {
    this.role = role;
  }

  public List<String> getCapabilities() {
    return capabilities;
  }

  public int getEpoch() {
    return epoch;
  }

  public void setEpoch(int epoch) {
    this.epoch = epoch;
  }

  public int getPhaseSeq() {
    return phaseSeq;
  }

  public void setPhaseSeq(int phaseSeq) {
    this.phaseSeq = phaseSeq;
  }

  public int getAckedSeq() {
    return ackedSeq;
  }

  public String getPeerSessionId() {
    return peerSessionId;
  }

  public List<String> getPeerCapabilities() {
    return peerCapabilities;
  }

  private static List<String> defaultCapabilities() {
    List<String> caps = new ArrayList<>();
    caps.add(ControlFrames.CONTROL_CAPABILITY.TYPES_V1);
    caps.add(ControlFrames.CONTROL_CAPABILITY.SESSION_V1);
    caps.add(ControlFrames.CONTROL_CAPABILITY.RESUME_V1);
    caps.add(ControlFrames.CONTROL_CAPABILITY.ACK_V1);
    caps.add(ControlFrames.CONTROL_CAPABILITY.SNAPSHOT_V1);
    caps.add(ControlFrames.CONTROL_CAPABILITY.SEQ_V1);
    return caps;
  }

  public static String createSessionId() {
    return UUID.randomUUID().toString();
  }
}
