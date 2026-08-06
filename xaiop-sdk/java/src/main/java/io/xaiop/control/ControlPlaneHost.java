package io.xaiop.control;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Shared control-plane host for Stream / (future) WS surfaces.
 *
 * <p>Owns demux ingest, session cursor, and outgoing control frames. Faithful port of {@code
 * ControlPlaneHost} from the Node.js SDK's {@code control-host.js}.
 */
public final class ControlPlaneHost {
  @FunctionalInterface
  public interface Sender {
    boolean send(String text);
  }

  /** Checkpoint binding for {@code #!xaiop/seq/v1} → {@code noteLogSeq}. */
  @FunctionalInterface
  public interface LogSeqSink {
    void noteLogSeq(int seq);
  }

  private final Sender send;
  private final Supplier<Object> getCommittedSnapshot;
  private Consumer<XaiopControlError> onControlError;
  private BiHandler onSession;
  private BiHandler onResume;
  private BiHandler onAck;
  private BiHandler onSnapshot;
  private BiHandler onTypes;
  private BiHandler onSeq;
  private final boolean autoAck;

  private LogSeqSink checkpoint;
  private final List<Integer> pendingLogSeqs = new ArrayList<>();
  private ControlSessionState session;
  private final ControlIngest ingest;
  private Object lastSnapshot;

  @FunctionalInterface
  public interface BiHandler {
    void accept(Object body, ControlFrame frame);
  }

  public ControlPlaneHost(Options options) {
    if (options == null || options.send == null) {
      throw new IllegalArgumentException("ControlPlaneHost requires send(text)");
    }
    this.send = options.send;
    this.getCommittedSnapshot = options.getCommittedSnapshot;
    this.onControlError = options.onControlError;
    this.onSession = options.onSession;
    this.onResume = options.onResume;
    this.onAck = options.onAck;
    this.onSnapshot = options.onSnapshot;
    this.onTypes = options.onTypes;
    this.onSeq = options.onSeq;
    this.autoAck = options.autoAck;

    if (options.sessionEnabled) {
      this.session =
          options.sessionInit != null
              ? new ControlSessionState(options.sessionInit)
              : new ControlSessionState();
      this.session.ensureSessionId();
    }

    this.ingest =
        new ControlIngest(
            new ControlDispatch.Handlers()
                .onTypes(
                    (snapshot, frame) -> {
                      if (onTypes != null) onTypes.accept(snapshot, frame);
                    })
                .onSession(
                    (body, frame) -> {
                      if (session != null) session.applyPeerSession(body);
                      if (onSession != null) onSession.accept(body, frame);
                    })
                .onResume(
                    (body, frame) -> {
                      if (onResume != null) onResume.accept(body, frame);
                    })
                .onAck(
                    (body, frame) -> {
                      if (session != null && body instanceof Map<?, ?> map) {
                        Object seq = map.get("seq");
                        if (seq instanceof Number n) session.noteAck(n.intValue());
                      }
                      if (onAck != null) onAck.accept(body, frame);
                    })
                .onSnapshot(
                    (body, frame) -> {
                      if (onSnapshot != null) onSnapshot.accept(body, frame);
                    })
                .onSeq(
                    (body, frame) -> {
                      if (body instanceof Map<?, ?> map) {
                        Object seq = map.get("seq");
                        if (seq instanceof Number n && n.intValue() >= 1) {
                          queueLogSeq(n.intValue());
                        }
                      }
                      if (onSeq != null) onSeq.accept(body, frame);
                    })
                .onControlError(this::reportControlError));
  }

  /** Bind DotCheckpointEngine (or any sink) so seq stamps land before phases. */
  public ControlPlaneHost bindCheckpoint(LogSeqSink engine) {
    this.checkpoint = engine;
    if (checkpoint != null && !pendingLogSeqs.isEmpty()) {
      for (int seq : pendingLogSeqs) checkpoint.noteLogSeq(seq);
      pendingLogSeqs.clear();
    }
    return this;
  }

  private void queueLogSeq(int seq) {
    if (checkpoint != null) {
      checkpoint.noteLogSeq(seq);
      return;
    }
    pendingLogSeqs.add(seq);
  }

  public ControlSessionState session() {
    return session;
  }

  public String sessionId() {
    return session == null ? null : session.getSessionId();
  }

  public int phaseSeq() {
    return session == null ? 0 : session.getPhaseSeq();
  }

  public int ackedSeq() {
    return session == null ? 0 : session.getAckedSeq();
  }

  public Object lastSnapshot() {
    return lastSnapshot;
  }

  public ControlPlaneHost onResume(BiHandler fn) {
    this.onResume = fn;
    return this;
  }

  public ControlPlaneHost onSession(BiHandler fn) {
    this.onSession = fn;
    return this;
  }

  public ControlPlaneHost onAck(BiHandler fn) {
    this.onAck = fn;
    return this;
  }

  public ControlPlaneHost onSnapshot(BiHandler fn) {
    this.onSnapshot = fn;
    return this;
  }

  public ControlPlaneHost onControlError(Consumer<XaiopControlError> fn) {
    this.onControlError = fn;
    return this;
  }

  /** @return wire remainder */
  public String push(String text) {
    return ingest.push(text);
  }

  public String flush() {
    return ingest.flush();
  }

  /**
   * Sync session resume cursor from onChunk meta; optional auto-ack. Prefers session-log {@code
   * logSeq} when present; else connection-local {@code seq}.
   */
  @SuppressWarnings("unchecked")
  public void notePhaseMeta(Map<String, Object> meta) {
    if (meta == null || session == null) return;
    Integer cursor = null;
    Object logSeq = meta.get("logSeq");
    Object seq = meta.get("seq");
    if (logSeq instanceof Number n && n.doubleValue() == n.intValue()) {
      cursor = n.intValue();
    } else if (seq instanceof Number n && n.doubleValue() == n.intValue()) {
      cursor = n.intValue();
    }
    if (cursor != null && cursor > session.getPhaseSeq()) {
      session.setPhaseSeq(cursor);
    }
    if (autoAck && cursor != null && cursor > 0) {
      sendAck(cursor);
    }
  }

  public boolean sendSession() {
    return sendSession(Map.of());
  }

  public boolean sendSession(Map<String, Object> extra) {
    if (session == null) {
      session = new ControlSessionState();
    }
    Map<String, Object> body = new LinkedHashMap<>(session.toSessionBody());
    if (extra != null) body.putAll(extra);
    return send.send(ControlFrames.encodeSessionFrame(body));
  }

  public boolean sendAck() {
    if (session == null) {
      throw new IllegalArgumentException("sendAck requires session: true (or prior sendSession)");
    }
    return sendAck(session.getPhaseSeq());
  }

  public boolean sendAck(int seq) {
    if (session == null) {
      throw new IllegalArgumentException("sendAck requires session: true (or prior sendSession)");
    }
    if (seq < 0) {
      throw new IllegalArgumentException("sendAck requires a non-negative integer seq");
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("sessionId", session.ensureSessionId());
    body.put("seq", seq);
    return send.send(ControlFrames.encodeAckFrame(body));
  }

  public boolean sendResume(Map<String, Object> body) {
    if (body == null) {
      throw new IllegalArgumentException("sendResume requires { sessionId?, fromSeq }");
    }
    Object fromObj = body.get("fromSeq");
    if (!(fromObj instanceof Number n)
        || n.intValue() < 0
        || n.doubleValue() != n.intValue()) {
      throw new IllegalArgumentException("sendResume.fromSeq must be a non-negative integer");
    }
    String sessionId;
    Object sid = body.get("sessionId");
    if (sid instanceof String s && !s.isEmpty()) {
      sessionId = s;
    } else if (session != null) {
      sessionId = session.ensureSessionId();
    } else {
      throw new IllegalArgumentException("sendResume requires sessionId");
    }
    Map<String, Object> payload = new LinkedHashMap<>();
    payload.put("sessionId", sessionId);
    payload.put("fromSeq", n.intValue());
    Object ep = body.get("epoch");
    if (ep instanceof Number en && en.intValue() >= 0 && en.doubleValue() == en.intValue()) {
      payload.put("epoch", en.intValue());
    }
    return send.send(ControlFrames.encodeResumeFrame(payload));
  }

  public boolean sendSnapshot() {
    return sendSnapshot(ABSENT);
  }

  public boolean sendSnapshot(Object json) {
    if (session == null) {
      throw new IllegalArgumentException("sendSnapshot requires session: true");
    }
    Object tree;
    if (json != ABSENT) {
      tree = json;
    } else if (getCommittedSnapshot != null) {
      tree = getCommittedSnapshot.get();
    } else {
      tree = null;
    }
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("sessionId", session.ensureSessionId());
    body.put("seq", session.getPhaseSeq());
    body.put("tree", tree);
    lastSnapshot = tree;
    return send.send(ControlFrames.encodeSnapshotFrame(body));
  }

  public Map<String, Object> getResumeState() {
    return getResumeState(ABSENT);
  }

  public Map<String, Object> getResumeState(Object committedSnapshot) {
    if (session == null) return null;
    Object snap;
    if (committedSnapshot != ABSENT) {
      snap = committedSnapshot;
    } else if (getCommittedSnapshot != null) {
      snap = getCommittedSnapshot.get();
    } else {
      return session.toResumeState();
    }
    return session.toResumeState(snap);
  }

  private void reportControlError(XaiopControlError err) {
    if (onControlError != null) {
      onControlError.accept(err);
      return;
    }
    System.err.println("[xaiop control] " + err.getMessage());
  }

  private static final Object ABSENT = new Object();

  public static final class Options {
    private Sender send;
    private Supplier<Object> getCommittedSnapshot;
    private Consumer<XaiopControlError> onControlError;
    private BiHandler onSession;
    private BiHandler onResume;
    private BiHandler onAck;
    private BiHandler onSnapshot;
    private BiHandler onTypes;
    private BiHandler onSeq;
    private boolean sessionEnabled;
    private Map<String, Object> sessionInit;
    private boolean autoAck;

    public static Options builder() {
      return new Options();
    }

    public Options send(Sender send) {
      this.send = send;
      return this;
    }

    public Options getCommittedSnapshot(Supplier<Object> fn) {
      this.getCommittedSnapshot = fn;
      return this;
    }

    public Options onControlError(Consumer<XaiopControlError> fn) {
      this.onControlError = fn;
      return this;
    }

    public Options onSession(BiHandler fn) {
      this.onSession = fn;
      return this;
    }

    public Options onResume(BiHandler fn) {
      this.onResume = fn;
      return this;
    }

    public Options onAck(BiHandler fn) {
      this.onAck = fn;
      return this;
    }

    public Options onSnapshot(BiHandler fn) {
      this.onSnapshot = fn;
      return this;
    }

    public Options onTypes(BiHandler fn) {
      this.onTypes = fn;
      return this;
    }

    public Options onSeq(BiHandler fn) {
      this.onSeq = fn;
      return this;
    }

    /** Enable session cursor with defaults. */
    public Options session(boolean enabled) {
      this.sessionEnabled = enabled;
      this.sessionInit = null;
      return this;
    }

    /** Enable session cursor with init map ({@code sessionId}, {@code role}, …). */
    public Options session(Map<String, Object> init) {
      this.sessionEnabled = true;
      this.sessionInit = init;
      return this;
    }

    public Options autoAck(boolean enabled) {
      this.autoAck = enabled;
      return this;
    }

    public ControlPlaneHost build() {
      return new ControlPlaneHost(this);
    }
  }
}
