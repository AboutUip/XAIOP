package io.xaiop.ws;

import io.xaiop.Json;
import io.xaiop.XaiopEngine;
import io.xaiop.compat.CompatPolicy;
import io.xaiop.control.ControlFrames;
import io.xaiop.control.ControlPlaneHost;
import io.xaiop.control.ResumeWireLog;
import io.xaiop.control.XaiopControlError;
import io.xaiop.stream.AnnotationSpan;
import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.LineIntercept;
import io.xaiop.stream.PhaseEncode;
import io.xaiop.types.TypeFreezeSession;
import io.xaiop.types.TypeRegistry;
import io.xaiop.types.TypeSchemaSnapshot;
import io.xaiop.types.Types;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * One WebSocket carrying XAIOP phases (push and/or consume).
 *
 * <p>Faithful port of the Node.js SDK's {@code node/ws/connection.ts}. Same connection type for
 * listen-accept and connect.
 */
public final class XaiopWsConnection {
  private final WsSocket ws;
  private final boolean streamProcessing;
  private final boolean compatibilityMode;
  private final boolean mergeChunkWindow;
  private final boolean asyncParse;
  private final boolean cover;
  private final boolean symbolKeys;
  private final boolean typeCheck;
  private final CompatPolicy compat = new CompatPolicy();

  private volatile String buffer = "";
  private volatile Object snapshot;
  private volatile Object committedSnapshot;
  private volatile boolean committedAvailable;
  private volatile Throwable lastError;
  private volatile boolean closed;
  private volatile boolean finished;

  private Consumer<Object> onPhase;
  private BiConsumer<Object, DotCheckpointEngine.ChunkMeta> onPhaseWithMeta;
  private Consumer<Object> onDone;
  private Consumer<Throwable> onError;

  private final TypeFreezeSession typeSession;
  private final List<String> typeCheckEscapePaths = new ArrayList<>();
  private volatile boolean handlersLocked;

  private final ControlPlaneHost control;
  private int outboundSeq;
  private final boolean autoRecordOutbound;
  private final ResumeWireLog outboundLog;

  private final DotCheckpointEngine engine;

  private final CompletableFuture<Void> closedFuture = new CompletableFuture<>();
  private final CompletableFuture<Object> doneFuture = new CompletableFuture<>();
  private CompletableFuture<Void> asyncIngestChain = CompletableFuture.completedFuture(null);

  private Consumer<String> onMessageBound;
  private Runnable onCloseBound;
  private Consumer<Throwable> onErrorSockBound;

  /** Connection options (listen + connect). */
  public static class Options {
    public Boolean streamProcessing;
    public Boolean compatibilityMode;
    public Boolean mergeChunkWindow;
    public Boolean asyncParse;
    public Boolean cover;
    public Boolean symbolKeys;
    public Boolean typeCheck;
    public Object typeSchema;
    public LineIntercept.Handler[] lineIntercept;
    public AnnotationSpan.Handler[] annotationSpan;
    /** {@code true}, or a session init map ({@code sessionId}, {@code role}, …). */
    public Object session;
    public Boolean autoAck;
    public Boolean autoSession;
    public Boolean retainOutbound;
    public Consumer<XaiopControlError> onControlError;
    public ControlPlaneHost.BiHandler onSession;
    public ControlPlaneHost.BiHandler onResume;
    public ControlPlaneHost.BiHandler onAck;
    public ControlPlaneHost.BiHandler onSnapshot;
    public Consumer<Object> onPhase;
    public BiConsumer<Object, DotCheckpointEngine.ChunkMeta> onPhaseWithMeta;
    public Consumer<Object> onChunk;
    public Consumer<Object> onDone;
    public Consumer<Throwable> onError;

    public Options streamProcessing(boolean v) {
      streamProcessing = v;
      return this;
    }

    public Options compatibilityMode(boolean v) {
      compatibilityMode = v;
      return this;
    }

    public Options mergeChunkWindow(boolean v) {
      mergeChunkWindow = v;
      return this;
    }

    public Options asyncParse(boolean v) {
      asyncParse = v;
      return this;
    }

    public Options cover(boolean v) {
      cover = v;
      return this;
    }

    public Options typeCheck(boolean v) {
      typeCheck = v;
      return this;
    }

    public Options session(boolean v) {
      session = v;
      return this;
    }

    public Options session(Map<String, Object> init) {
      session = init;
      return this;
    }

    public Options retainOutbound(boolean v) {
      retainOutbound = v;
      return this;
    }

    public Options autoSession(boolean v) {
      autoSession = v;
      return this;
    }

    public Options autoAck(boolean v) {
      autoAck = v;
      return this;
    }

    public Options onPhase(Consumer<Object> fn) {
      onPhase = fn;
      return this;
    }

    public Options onDone(Consumer<Object> fn) {
      onDone = fn;
      return this;
    }

    public Options onError(Consumer<Throwable> fn) {
      onError = fn;
      return this;
    }
  }

  public XaiopWsConnection(WsSocket socket) {
    this(socket, null);
  }

  public XaiopWsConnection(WsSocket socket, Options options) {
    if (socket == null) {
      throw new IllegalArgumentException("XaiopWsConnection requires a WebSocket-like socket");
    }
    Options opts = options == null ? new Options() : options;
    this.ws = socket;
    this.streamProcessing = opts.streamProcessing == null || opts.streamProcessing;
    this.compatibilityMode = Boolean.TRUE.equals(opts.compatibilityMode);
    this.mergeChunkWindow = opts.mergeChunkWindow == null || opts.mergeChunkWindow;
    this.asyncParse = Boolean.TRUE.equals(opts.asyncParse);
    this.cover = Boolean.TRUE.equals(opts.cover);
    this.symbolKeys = Boolean.TRUE.equals(opts.symbolKeys);
    this.typeCheck = Boolean.TRUE.equals(opts.typeCheck) && !this.compatibilityMode;

    if (opts.onPhaseWithMeta != null) {
      this.onPhaseWithMeta = opts.onPhaseWithMeta;
    } else if (opts.onPhase != null) {
      this.onPhase = opts.onPhase;
    } else if (opts.onChunk != null) {
      this.onPhase = opts.onChunk;
    }
    this.onDone = opts.onDone;
    this.onError = opts.onError;

    this.typeSession = this.typeCheck ? new TypeFreezeSession() : null;
    if (this.typeSession != null && opts.typeSchema != null) {
      this.typeSession.applySchema(opts.typeSchema);
    }

    boolean sessionOn =
        Boolean.TRUE.equals(opts.session)
            || (opts.session instanceof Map<?, ?>);
    this.autoRecordOutbound = sessionOn || Boolean.TRUE.equals(opts.retainOutbound);
    this.outboundLog = this.autoRecordOutbound ? new ResumeWireLog() : null;

    ControlPlaneHost.Options controlOpts =
        ControlPlaneHost.Options.builder()
            .send(this::pushWire)
            .getCommittedSnapshot(this::getCommittedSnapshot)
            .autoAck(Boolean.TRUE.equals(opts.autoAck))
            .onControlError(
                err -> {
                  if (opts.onControlError != null) {
                    opts.onControlError.accept(err);
                  } else if (this.onError != null) {
                    this.onError.accept(err);
                  }
                })
            .onSession(opts.onSession)
            .onResume(opts.onResume)
            .onAck(opts.onAck)
            .onSnapshot(
                (body, frame) -> {
                  if (body instanceof Map<?, ?> map && map.containsKey("tree")) {
                    // lastSnapshot via sendSnapshot path; mirror Node assignment
                  }
                  if (opts.onSnapshot != null) opts.onSnapshot.accept(body, frame);
                })
            .onTypes(
                (body, frame) -> {
                  if (typeSession != null) typeSession.applySchema(body);
                });
    if (opts.session instanceof Map<?, ?> map) {
      @SuppressWarnings("unchecked")
      Map<String, Object> init = (Map<String, Object>) map;
      controlOpts.session(init);
    } else if (sessionOn) {
      controlOpts.session(true);
    }
    this.control = controlOpts.build();

    DotCheckpointEngine.Options engineOpts =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(this.streamProcessing)
            .mergeChunkWindow(this.mergeChunkWindow)
            .cover(this.cover)
            .symbolKeys(this.symbolKeys)
            .onChunkWithMeta(this::onEngineChunk);
    if (this.compatibilityMode) {
      engineOpts.compat(this.compat);
    } else {
      engineOpts.compat(false);
    }
    if (opts.lineIntercept != null) {
      engineOpts.lineIntercept(opts.lineIntercept);
    }
    if (opts.annotationSpan != null) {
      engineOpts.annotationSpan(opts.annotationSpan);
    }
    this.engine = engineOpts.build();
    this.control.bindCheckpoint(engine::noteLogSeq);

    bindSocket();

    if (Boolean.TRUE.equals(opts.autoSession)) {
      if (ws.readyState() == WsSocket.OPEN) {
        try {
          control.sendSession();
        } catch (RuntimeException ignored) {
          /* ignore */
        }
      } else {
        ws.onOpen(
            () -> {
              try {
                control.sendSession();
              } catch (RuntimeException ignored) {
                /* ignore */
              }
            });
      }
    }
  }

  public int readyState() {
    return ws.readyState();
  }

  /** Completes when the underlying socket closes (after peer-close ingest). */
  public CompletableFuture<Void> closed() {
    return closedFuture;
  }

  /** Completes with the final Snapshot when the peer closes (or fails on error). */
  public CompletableFuture<Object> done() {
    return doneFuture;
  }

  public Throwable lastError() {
    return lastError;
  }

  public boolean typeCheck() {
    return typeCheck;
  }

  public String getBufferedText() {
    return buffer;
  }

  public Object getSnapshot() {
    return snapshot == null ? null : Json.deepClone(snapshot);
  }

  public Object getCommittedSnapshot() {
    if (committedSnapshot == null) {
      if (!committedAvailable) return null;
      Object c = engine.committedSnapshot();
      if (c == null) return null;
      committedSnapshot = c;
    }
    return Json.deepClone(committedSnapshot);
  }

  public DotCheckpointEngine.BufferStats bufferStats() {
    return engine.bufferStats();
  }

  public DotCheckpointEngine.CompactResult compactCommitted() {
    return engine.compactCommitted();
  }

  public DotCheckpointEngine.CompactResult compactCommitted(boolean dropHistory) {
    return engine.compactCommitted(dropHistory);
  }

  /**
   * Called by {@link XaiopWs#connect} after handshake so late {@code onPhase} / interceptors cannot
   * miss early frames. Listen-accept connections stay unlocked.
   */
  public XaiopWsConnection lockHandlers() {
    handlersLocked = true;
    return this;
  }

  public boolean handlersLocked() {
    return handlersLocked;
  }

  private void assertHandlersMutable(String api) {
    if (handlersLocked) {
      throw new IllegalStateException(
          api
              + " after connect is locked — pass onPhase/onDone/onError/lineIntercept/annotationSpan/onResume/… in connect options (no replay of early frames)");
    }
  }

  public XaiopWsConnection onPhase(Consumer<Object> fn) {
    assertHandlersMutable("onPhase");
    onPhase = fn;
    onPhaseWithMeta = null;
    return this;
  }

  public XaiopWsConnection onChunk(Consumer<Object> fn) {
    return onPhase(fn);
  }

  public XaiopWsConnection onLineIntercept(LineIntercept.Handler fn) {
    assertHandlersMutable("onLineIntercept");
    engine.onLineIntercept(fn);
    return this;
  }

  public XaiopWsConnection clearLineIntercepts() {
    assertHandlersMutable("clearLineIntercepts");
    engine.clearLineIntercepts();
    return this;
  }

  public XaiopWsConnection onAnnotationSpan(AnnotationSpan.Handler fn) {
    assertHandlersMutable("onAnnotationSpan");
    engine.onAnnotationSpan(fn);
    return this;
  }

  public XaiopWsConnection clearAnnotationSpans() {
    assertHandlersMutable("clearAnnotationSpans");
    engine.clearAnnotationSpans();
    return this;
  }

  public XaiopWsConnection onDone(Consumer<Object> fn) {
    assertHandlersMutable("onDone");
    onDone = fn;
    return this;
  }

  public XaiopWsConnection onError(Consumer<Throwable> fn) {
    assertHandlersMutable("onError");
    onError = fn;
    return this;
  }

  public XaiopWsConnection onResume(ControlPlaneHost.BiHandler fn) {
    assertHandlersMutable("onResume");
    control.onResume(fn);
    return this;
  }

  public XaiopWsConnection onSession(ControlPlaneHost.BiHandler fn) {
    assertHandlersMutable("onSession");
    control.onSession(fn);
    return this;
  }

  public XaiopWsConnection onAck(ControlPlaneHost.BiHandler fn) {
    assertHandlersMutable("onAck");
    control.onAck(fn);
    return this;
  }

  public XaiopWsConnection onSnapshot(ControlPlaneHost.BiHandler fn) {
    assertHandlersMutable("onSnapshot");
    control.onSnapshot(fn);
    return this;
  }

  public XaiopWsConnection onControlError(Consumer<XaiopControlError> fn) {
    assertHandlersMutable("onControlError");
    control.onControlError(fn);
    return this;
  }

  public boolean pushJson(String key, Object value) {
    return pushJson(key, value, PhaseEncode.Options.defaults());
  }

  public boolean pushJson(String key, Object value, PhaseEncode.Options options) {
    String wire = PhaseEncode.encodePhaseJson(key, value, options);
    return pushOutboundPhase(wire);
  }

  /** Convenience: {@code finalPhase} flag without building {@link PhaseEncode.Options}. */
  public boolean pushJson(String key, Object value, boolean finalPhase) {
    return pushJson(key, value, PhaseEncode.Options.defaults().finalPhase(finalPhase));
  }

  public boolean pushObject(Object object) {
    return pushObject(object, PhaseEncode.Options.defaults());
  }

  public boolean pushObject(Object object, PhaseEncode.Options options) {
    String wire = PhaseEncode.encodePhaseObject(object, options);
    return pushOutboundPhase(wire);
  }

  public boolean pushObject(Object object, boolean finalPhase) {
    return pushObject(object, PhaseEncode.Options.defaults().finalPhase(finalPhase));
  }

  private boolean pushOutboundPhase(String wire) {
    if (autoRecordOutbound) {
      int next = outboundSeq + 1;
      boolean ok = pushWire(ControlFrames.stampWireWithLogSeq(next, wire));
      if (ok) noteOutboundPhase(wire);
      return ok;
    }
    return pushWire(wire);
  }

  public boolean pushWire(String text) {
    if (text == null) {
      throw new IllegalArgumentException("pushWire requires a string");
    }
    if (closed || ws.readyState() != WsSocket.OPEN) {
      return false;
    }
    try {
      ws.send(text);
      return true;
    } catch (RuntimeException e) {
      return false;
    }
  }

  /**
   * Send a binary WebSocket frame (UTF-8 decoded by the peer). Mirrors Node {@code
   * conn._ws.send(Buffer.from(...))}.
   */
  public boolean sendBinary(byte[] data) {
    if (data == null) {
      throw new IllegalArgumentException("sendBinary requires a byte array");
    }
    if (closed || ws.readyState() != WsSocket.OPEN) {
      return false;
    }
    try {
      ws.sendBinary(data);
      return true;
    } catch (RuntimeException e) {
      return false;
    }
  }

  /**
   * Send text as multiple WebSocket frames (FIN only on the last). Supported on the RFC6455
   * server socket; useful for fragmentation tests.
   */
  public boolean sendTextFragments(String... parts) {
    if (parts == null || parts.length == 0) {
      throw new IllegalArgumentException("sendTextFragments requires at least one part");
    }
    if (!(ws instanceof ServerWsSocket serverSock)) {
      throw new UnsupportedOperationException(
          "sendTextFragments requires the RFC6455 server socket");
    }
    if (closed || ws.readyState() != WsSocket.OPEN) {
      return false;
    }
    try {
      for (int i = 0; i < parts.length; i++) {
        String part = parts[i] == null ? "" : parts[i];
        byte[] bytes = part.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        boolean fin = i == parts.length - 1;
        int opcode = i == 0 ? Rfc6455.OPCODE_TEXT : Rfc6455.OPCODE_CONTINUATION;
        serverSock.sendFrame(opcode, bytes, fin);
      }
      return true;
    } catch (RuntimeException e) {
      return false;
    }
  }

  /** Negotiated {@code Sec-WebSocket-Protocol}, or {@code null}. */
  public String protocol() {
    return ws.protocol();
  }

  public boolean pushWireLn(String text) {
    if (text == null) {
      throw new IllegalArgumentException("pushWireLn requires a string");
    }
    return pushWire(text.endsWith("\n") ? text : text + "\n");
  }

  public boolean pushTypeConsistency(Object source) {
    if (compatibilityMode) {
      throw new IllegalArgumentException(
          "pushTypeConsistency requires strict mode (compatibilityMode off)");
    }
    TypeSchemaSnapshot snapshot;
    if (source instanceof XaiopEngine eng) {
      if (!eng.typeCheck()) {
        throw new IllegalArgumentException(
            "pushTypeConsistency requires the engine typeCheck flag enabled");
      }
      snapshot = eng.exportTypeSchema();
    } else if (source instanceof TypeRegistry reg) {
      snapshot = reg.snapshot();
    } else if (source instanceof TypeSchemaSnapshot snap && snap.version() == 1) {
      snapshot = snap;
    } else {
      throw new IllegalArgumentException(
          "pushTypeConsistency requires XaiopEngine, TypeRegistry, or schema snapshot");
    }
    if (snapshot.entries() == null || snapshot.entries().isEmpty()) {
      throw new IllegalArgumentException(
          "pushTypeConsistency requires a non-empty type registry (register types first)");
    }
    return pushWire(Types.encodeTypeSchemaFrame(snapshot));
  }

  public String sessionId() {
    return control.sessionId();
  }

  public int phaseSeq() {
    return engine.phaseSeq();
  }

  public int logSeq() {
    return control.phaseSeq();
  }

  public int outboundSeq() {
    return outboundSeq;
  }

  public int ackedSeq() {
    return control.ackedSeq();
  }

  public ResumeWireLog outboundLog() {
    return outboundLog;
  }

  public int noteOutboundPhase(String wire) {
    return noteOutboundPhase(wire, ABSENT);
  }

  public int noteOutboundPhase(String wire, Object committed) {
    outboundSeq += 1;
    if (outboundLog != null && wire != null) {
      if (committed == ABSENT) {
        outboundLog.record(outboundSeq, wire);
      } else {
        outboundLog.record(outboundSeq, wire, committed);
      }
    }
    return outboundSeq;
  }

  public String replayOutboundAfter(int fromSeq) {
    if (outboundLog == null) {
      throw new IllegalArgumentException(
          "replayOutboundAfter requires session: true (or retainOutbound: true)");
    }
    return outboundLog.wiresAfter(fromSeq);
  }

  public boolean sendSession() {
    return control.sendSession();
  }

  public boolean sendSession(Map<String, Object> extra) {
    return control.sendSession(extra);
  }

  public boolean sendAck() {
    return control.sendAck();
  }

  public boolean sendAck(int seq) {
    return control.sendAck(seq);
  }

  public boolean sendResume(Map<String, Object> body) {
    return control.sendResume(body);
  }

  public boolean sendSnapshot() {
    return control.sendSnapshot();
  }

  public boolean sendSnapshot(Object json) {
    return control.sendSnapshot(json);
  }

  public Map<String, Object> getResumeState() {
    Map<String, Object> base = control.getResumeState(getCommittedSnapshot());
    if (base == null) return null;
    Map<String, Object> out = new LinkedHashMap<>(base);
    out.put("logSeq", base.get("seq"));
    out.put("inboundSeq", engine.phaseSeq());
    out.put("outboundSeq", outboundSeq);
    return out;
  }

  /** Close after outbound buffers drain (~2s max). */
  public CompletableFuture<Void> end() {
    return end(1000, "");
  }

  public CompletableFuture<Void> end(int code, String reason) {
    if (closed) return CompletableFuture.completedFuture(null);
    return waitBufferedAmount(ws)
        .thenRun(
            () -> {
              try {
                ws.close(code, reason == null ? "" : reason);
              } catch (RuntimeException ignored) {
                /* ignore */
              }
            });
  }

  /** Abort abruptly (close code 1001). */
  public boolean abort() {
    if (closed) return false;
    try {
      ws.terminate();
      try {
        ws.close(1001, "aborted");
      } catch (RuntimeException ignored) {
        /* ignore */
      }
    } catch (RuntimeException ignored) {
      /* ignore */
    }
    return true;
  }

  private void onEngineChunk(Object diff, DotCheckpointEngine.ChunkMeta meta) {
    buffer = engine.buffer();
    syncCommitted();
    control.notePhaseMeta(chunkMetaToMap(meta));
    if (meta != null && meta.typeCheckEscapePaths != null) {
      typeCheckEscapePaths.addAll(meta.typeCheckEscapePaths);
    }
    if (typeSession != null) {
      if (diff != null) {
        typeSession.observeTree(diff, true, typeCheckEscapePaths);
      }
      Object committed = engine.committedSnapshot();
      if (committed != null) {
        typeSession.reconcileCommit(committed);
      } else {
        // Node passes {} when committed === null
        Object live = engine.committedAt() > 0 ? Map.of() : null;
        if (live != null) typeSession.reconcileCommit(live);
      }
    }
    if (onPhaseWithMeta != null) {
      onPhaseWithMeta.accept(diff, meta);
    } else if (onPhase != null) {
      onPhase.accept(diff);
    }
  }

  private static Map<String, Object> chunkMetaToMap(DotCheckpointEngine.ChunkMeta meta) {
    if (meta == null || meta.isEmpty()) return null;
    Map<String, Object> m = new LinkedHashMap<>();
    if (meta.seq != null) m.put("seq", meta.seq);
    if (meta.seqs != null) m.put("seqs", meta.seqs);
    if (meta.logSeq != null) m.put("logSeq", meta.logSeq);
    if (meta.logSeqs != null) m.put("logSeqs", meta.logSeqs);
    if (meta.typeCheckEscapePaths != null && !meta.typeCheckEscapePaths.isEmpty()) {
      m.put("typeCheckEscapePaths", meta.typeCheckEscapePaths);
    }
    return m;
  }

  private void bindSocket() {
    onMessageBound =
        text -> {
          if (finished) return;
          try {
            if (text == null || text.isEmpty()) return;
            String wire = control.push(text);
            if (wire == null || wire.isEmpty()) return;
            if (asyncParse) {
              asyncIngestChain =
                  asyncIngestChain
                      .thenCompose(v -> engine.pushAsync(wire))
                      .thenRun(
                          () -> {
                            buffer = engine.buffer();
                            syncCommitted();
                          })
                      .exceptionally(
                          err -> {
                            fail(unwrap(err));
                            return null;
                          });
            } else {
              engine.push(wire);
              buffer = engine.buffer();
              syncCommitted();
            }
          } catch (Throwable err) {
            fail(err instanceof Exception e ? e : new RuntimeException(err));
          }
        };

    onCloseBound =
        () -> {
          tearDownListeners();
          Runnable finishClose =
              () -> {
                try {
                  String wire = "";
                  wire += Objects.toString(control.flush(), "");
                  if (!wire.isEmpty() && !finished) {
                    if (asyncParse) {
                      engine.pushAsync(wire)
                          .thenRun(
                              () -> {
                                buffer = engine.buffer();
                                syncCommitted();
                              })
                          .join();
                    } else {
                      engine.push(wire);
                      buffer = engine.buffer();
                      syncCommitted();
                    }
                  }
                } catch (RuntimeException ignored) {
                  /* ignore */
                }
              };
          if (asyncParse) {
            asyncIngestChain
                .exceptionally(ex -> null)
                .thenRun(finishClose)
                .thenRun(this::completeFromPeerClose);
          } else {
            finishClose.run();
            completeFromPeerClose();
          }
        };

    onErrorSockBound =
        err -> {
          lastError = err;
          if (onError != null) onError.accept(err);
        };

    ws.onMessage(onMessageBound);
    ws.onClose(onCloseBound);
    ws.onError(onErrorSockBound);
  }

  private void tearDownListeners() {
    ws.removeListeners();
  }

  private void syncCommitted() {
    if (engine.committedAt() <= 0) return;
    committedSnapshot = null;
    committedAvailable = true;
  }

  private void completeFromPeerClose() {
    if (finished) {
      closed = true;
      closedFuture.complete(null);
      return;
    }
    finished = true;
    closed = true;

    Runnable done =
        () -> {
          try {
            buffer = engine.buffer();
            syncCommitted();
            snapshot = engine.snapshot();
            Object finalJson = snapshot == null ? Map.of() : Json.deepClone(snapshot);
            if (typeSession != null && finalJson instanceof Map<?, ?>) {
              typeSession.observeTree(finalJson, true, typeCheckEscapePaths);
              typeSession.reconcileCommit(finalJson);
            }
            if (onDone != null) onDone.accept(finalJson);
            doneFuture.complete(finalJson);
          } catch (Throwable err) {
            fail(err instanceof Exception e ? e : new RuntimeException(err));
          } finally {
            closedFuture.complete(null);
          }
        };

    try {
      if (asyncParse) {
        engine.finishAsync().whenComplete((v, err) -> {
          if (err != null) {
            fail(unwrap(err));
            closedFuture.complete(null);
          } else {
            done.run();
          }
        });
      } else {
        engine.finish();
        done.run();
      }
    } catch (Throwable err) {
      fail(err instanceof Exception e ? e : new RuntimeException(err));
      closedFuture.complete(null);
    }
  }

  private void fail(Throwable err) {
    if (finished) return;
    finished = true;
    lastError = err;
    if (onError != null) onError.accept(err);
    doneFuture.completeExceptionally(err);
    if (!closed) {
      try {
        String reason = err.getMessage() == null ? "error" : err.getMessage();
        if (reason.length() > 120) reason = reason.substring(0, 120);
        ws.close(1011, reason);
      } catch (RuntimeException ignored) {
        /* ignore */
      }
    }
  }

  private static Throwable unwrap(Throwable err) {
    if (err instanceof CompletionException && err.getCause() != null) return err.getCause();
    return err;
  }

  private static CompletableFuture<Void> waitBufferedAmount(WsSocket ws) {
    if (ws == null || ws.bufferedAmount() == 0) {
      return CompletableFuture.completedFuture(null);
    }
    CompletableFuture<Void> f = new CompletableFuture<>();
    long started = System.currentTimeMillis();
    Runnable tick =
        new Runnable() {
          @Override
          public void run() {
            if (ws.bufferedAmount() == 0 || System.currentTimeMillis() - started > 2000) {
              f.complete(null);
              return;
            }
            CompletableFuture.delayedExecutor(1, TimeUnit.MILLISECONDS).execute(this);
          }
        };
    tick.run();
    return f;
  }

  private static final Object ABSENT = new Object();
}
