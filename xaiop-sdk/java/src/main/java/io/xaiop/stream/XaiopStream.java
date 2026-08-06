package io.xaiop.stream;

import io.xaiop.Json;
import io.xaiop.compat.CompatPolicy;
import io.xaiop.control.ControlPlaneHost;
import io.xaiop.control.XaiopControlError;
import io.xaiop.types.TypeFreezeSession;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * Streaming XAIOP consumer over HTTP / SSE / WebSocket / RAW (Node {@code XaiopStream}).
 *
 * <p>Chunk = phase Diff at each {@code .} (window-batched by default). Done = full-buffer Snapshot.
 * Inbound text is demuxed by {@link ControlPlaneHost} before {@link DotCheckpointEngine#push} so
 * {@code #!} control frames are stripped from the document wire.
 *
 * <p>Options wire through to the per-{@link #send} checkpoint engine: {@code cover}, history,
 * {@code typeCheck}, line intercept, annotation span, and control-plane session callbacks. For
 * bidirectional skeleton sessions prefer {@link io.xaiop.ws.XaiopWs}.
 *
 * <p>{@link StreamMode#ASYNC_ITERATOR} exposes a blocking pull API via {@link #chunks()} (no extra
 * dependencies; Java 17 {@link java.util.concurrent} only).
 */
public final class XaiopStream implements AutoCloseable {
  private String url;
  private boolean streamProcessing = true;
  private boolean compatibilityMode;
  private boolean mergeChunkWindow = true;
  private boolean asyncParse;
  private boolean symbolKeys;
  private boolean cover;
  private boolean historySnapshot;
  private boolean historyRealtime;
  private boolean retainWireHistory = true;
  private boolean typeCheckWanted;
  private Object typeSchema;
  private boolean autoAck;
  private Object sessionOpt;
  private CompatPolicy compat = new CompatPolicy();
  private Set<StreamMode> modes = StreamMode.callbackOnly();

  private TypeFreezeSession typeSession;
  private final List<String> typeCheckEscapePaths = new ArrayList<>();
  private ControlPlaneHost control;

  private Consumer<XaiopControlError> onControlErrorCb;
  private ControlPlaneHost.BiHandler onSessionCb;
  private ControlPlaneHost.BiHandler onResumeCb;
  private ControlPlaneHost.BiHandler onAckCb;
  private ControlPlaneHost.BiHandler onSnapshotCb;

  private final List<LineIntercept.Handler> lineInterceptors = new ArrayList<>();
  private final List<AnnotationSpan.Handler> annotationSpanHandlers = new ArrayList<>();

  private volatile StreamStatus status = StreamStatus.IDLE;
  private volatile Throwable lastError;
  private volatile Object snapshot;
  private volatile Object committedSnapshot;
  private volatile boolean committedAvailable;
  private volatile String buffer = "";

  private final List<Consumer<Object>> onChunk = new CopyOnWriteArrayList<>();
  private final List<BiConsumer<Object, DotCheckpointEngine.ChunkMeta>> onChunkMeta =
      new CopyOnWriteArrayList<>();
  private final List<Consumer<Object>> onDone = new CopyOnWriteArrayList<>();
  private final List<Consumer<Throwable>> onError = new CopyOnWriteArrayList<>();
  private final EnumMap<StreamEvent, List<Consumer<Object>>> listeners =
      new EnumMap<>(StreamEvent.class);

  private DotCheckpointEngine engine;
  private Transport.Handle transportHandle;
  private final AtomicReference<CompletableFuture<Void>> asyncIngest =
      new AtomicReference<>(CompletableFuture.completedFuture(null));
  private CompletableFuture<Object> promiseResolve;
  private final Object lock = new Object();

  /** Async-iterator queue (shared by {@link #chunks()}). */
  private final ArrayDeque<Object> iterQueue = new ArrayDeque<>();
  private final List<CompletableFuture<Void>> iterWaiters = new ArrayList<>();
  private boolean iterDone;
  private Throwable iterError;
  private static final Object ITER_END = new Object();

  public enum StreamEvent {
    CHUNK,
    DONE,
    ERROR,
    STATUS
  }

  public XaiopStream(String url) {
    this(url, Options.defaults());
  }

  public XaiopStream(String url, Options options) {
    if (url == null || url.isEmpty()) {
      throw new IllegalArgumentException("XaiopStream requires a non-empty url");
    }
    this.url = url;
    if (options != null) {
      this.streamProcessing = options.streamProcessing;
      this.compatibilityMode = options.compatibilityMode;
      this.mergeChunkWindow = options.mergeChunkWindow;
      this.asyncParse = options.asyncParse;
      this.symbolKeys = options.symbolKeys;
      this.cover = options.cover;
      this.historySnapshot = options.historySnapshot;
      this.historyRealtime = options.historyRealtime;
      this.retainWireHistory = options.retainWireHistory;
      this.typeCheckWanted = options.typeCheck;
      this.typeSchema = options.typeSchema;
      this.autoAck = options.autoAck;
      this.sessionOpt = options.session;
      this.onControlErrorCb = options.onControlError;
      this.onSessionCb = options.onSession;
      this.onResumeCb = options.onResume;
      this.onAckCb = options.onAck;
      this.onSnapshotCb = options.onSnapshot;
      if (options.compat != null) this.compat = options.compat;
      if (options.modes != null) this.modes = StreamMode.normalize(options.modes);
      if (options.lineIntercept != null) {
        for (LineIntercept.Handler h : options.lineIntercept) {
          if (h != null) lineInterceptors.add(h);
        }
      }
      if (options.annotationSpan != null) {
        for (AnnotationSpan.Handler h : options.annotationSpan) {
          if (h != null) annotationSpanHandlers.add(h);
        }
      }
    }
    rebuildTypeSession();
    rebuildControl();
    for (StreamEvent e : StreamEvent.values()) {
      listeners.put(e, new CopyOnWriteArrayList<>());
    }
  }

  public String url() {
    return url;
  }

  public StreamStatus status() {
    return status;
  }

  public boolean streamProcessing() {
    return streamProcessing;
  }

  public boolean mergeChunkWindow() {
    return mergeChunkWindow;
  }

  public boolean asyncParse() {
    return asyncParse;
  }

  public boolean cover() {
    return cover;
  }

  public boolean historySnapshot() {
    return historySnapshot;
  }

  public boolean historyRealtime() {
    return historyRealtime;
  }

  public boolean retainWireHistory() {
    return retainWireHistory;
  }

  /** Effective typeCheck (forced off while {@link #compatibilityMode()} is on). */
  public boolean typeCheck() {
    return typeCheckWanted && !compatibilityMode;
  }

  public boolean compatibilityMode() {
    return compatibilityMode;
  }

  public Throwable lastError() {
    return lastError;
  }

  public Set<StreamMode> modes() {
    return modes;
  }

  /** Active parse history for the current {@code send} engine, or {@code null}. */
  public ParseHistory history() {
    return engine == null ? null : engine.history();
  }

  /** History summary; empty shape when history / engine is off. */
  public ParseHistory.Info historyInfo() {
    if (engine == null) {
      return new ParseHistory.Info(false, false, 0, -1, null, false, null);
    }
    return engine.historyInfo();
  }

  /** Final Snapshot after successful completion; otherwise {@code null}. */
  public Object getSnapshot() {
    return snapshot == null ? null : Json.deepClone(snapshot);
  }

  /** Committed prefix Snapshot (phase boundaries); {@code null} until first commit. */
  public Object getCommittedSnapshot() {
    if (!committedAvailable) return null;
    if (committedSnapshot == null && engine != null) {
      committedSnapshot = engine.committedSnapshot();
    }
    return committedSnapshot == null ? null : Json.deepClone(committedSnapshot);
  }

  public DotCheckpointEngine.BufferStats bufferStats() {
    if (engine == null) {
      return new DotCheckpointEngine.BufferStats(0, 0, 0, false);
    }
    return engine.bufferStats();
  }

  /**
   * Discard committed receive-wire while keeping the live Commit tree.
   *
   * @throws IllegalStateException when no active engine (Node parity)
   */
  public DotCheckpointEngine.CompactResult compactCommitted() {
    return compactCommitted(false);
  }

  public DotCheckpointEngine.CompactResult compactCommitted(boolean dropHistory) {
    if (engine == null) {
      throw new IllegalStateException("XaiopStream.compactCommitted requires an active send/engine");
    }
    return engine.compactCommitted(dropHistory);
  }

  public String sessionId() {
    return control == null ? null : control.sessionId();
  }

  /** Inbound applied phase seq (0 until engine commits). */
  public int phaseSeq() {
    return engine == null ? 0 : engine.phaseSeq();
  }

  /** Session resume cursor (logSeq when stamps seen). */
  public int logSeq() {
    return control == null ? 0 : control.phaseSeq();
  }

  public int ackedSeq() {
    return control == null ? 0 : control.ackedSeq();
  }

  /**
   * Session resume cursor snapshot, or {@code null} when session is off. Adds {@code inboundSeq}
   * from the checkpoint engine (Node {@code getResumeState}).
   */
  public Map<String, Object> getResumeState() {
    if (control == null) return null;
    Map<String, Object> base = control.getResumeState(getCommittedSnapshot());
    if (base == null) return null;
    Map<String, Object> out = new LinkedHashMap<>(base);
    Object seq = base.get("seq");
    out.put("seq", seq);
    out.put("logSeq", seq);
    out.put("inboundSeq", phaseSeq());
    return out;
  }

  /** Outbound control helpers (consumer stream send is a no-op; state still updates). */
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

  public String getBufferedText() {
    return buffer;
  }

  public boolean isBusy() {
    return status.busy();
  }

  public StreamStatus getStatus() {
    return status;
  }

  public boolean setUrl(String next) {
    if (!status.idleLike()) return false;
    if (next == null || next.isEmpty()) {
      throw new IllegalArgumentException("url must be non-empty");
    }
    String prev = this.url;
    this.url = next;
    if (!Objects.equals(prev, next) && historySnapshot) {
      ParseHistory h = engine == null ? null : engine.history();
      if (h != null && h.snapshotEnabled()) {
        h.setSource(next);
      }
    }
    return true;
  }

  public boolean setStreamProcessing(boolean enabled) {
    if (!status.idleLike()) return false;
    this.streamProcessing = enabled;
    return true;
  }

  public boolean setCompatibilityMode(boolean enabled) {
    if (!status.idleLike()) return false;
    this.compatibilityMode = enabled;
    rebuildTypeSession();
    return true;
  }

  public boolean setMergeChunkWindow(boolean enabled) {
    if (!status.idleLike()) return false;
    this.mergeChunkWindow = enabled;
    return true;
  }

  public boolean setAsyncParse(boolean enabled) {
    if (!status.idleLike()) return false;
    this.asyncParse = enabled;
    return true;
  }

  public boolean setCover(boolean enabled) {
    if (!status.idleLike()) return false;
    this.cover = enabled;
    return true;
  }

  public boolean setHistorySnapshot(boolean enabled) {
    if (!status.idleLike()) return false;
    this.historySnapshot = enabled;
    return true;
  }

  public boolean setHistoryRealtime(boolean enabled) {
    if (!status.idleLike()) return false;
    this.historyRealtime = enabled;
    return true;
  }

  public boolean setRetainWireHistory(boolean enabled) {
    if (!status.idleLike()) return false;
    this.retainWireHistory = enabled;
    return true;
  }

  public boolean setTypeCheck(boolean enabled) {
    if (!status.idleLike()) return false;
    this.typeCheckWanted = enabled;
    rebuildTypeSession();
    return true;
  }

  public boolean setTypeSchema(Object schema) {
    if (!status.idleLike()) return false;
    this.typeSchema = schema;
    if (typeSession != null) typeSession.applySchema(schema);
    return true;
  }

  public boolean setAutoAck(boolean enabled) {
    if (!status.idleLike()) return false;
    this.autoAck = enabled;
    rebuildControl();
    return true;
  }

  /**
   * Enable / reconfigure control session. Pass {@code true}, {@code false}, or a session-init {@link
   * Map}.
   */
  public boolean setSession(Object session) {
    if (!status.idleLike()) return false;
    this.sessionOpt = session;
    rebuildControl();
    return true;
  }

  public boolean setModes(Iterable<StreamMode> next) {
    if (!status.idleLike()) return false;
    this.modes = StreamMode.normalize(next);
    return true;
  }

  public XaiopStream onChunk(Consumer<Object> fn) {
    Objects.requireNonNull(fn, "onChunk");
    onChunk.add(fn);
    return this;
  }

  /** Phase Diff plus optional seq / typeCheck-escape metadata. */
  public XaiopStream onChunkWithMeta(BiConsumer<Object, DotCheckpointEngine.ChunkMeta> fn) {
    Objects.requireNonNull(fn, "onChunkWithMeta");
    onChunkMeta.add(fn);
    return this;
  }

  public XaiopStream onDone(Consumer<Object> fn) {
    Objects.requireNonNull(fn, "onDone");
    onDone.add(fn);
    return this;
  }

  public XaiopStream onError(Consumer<Throwable> fn) {
    Objects.requireNonNull(fn, "onError");
    onError.add(fn);
    return this;
  }

  public XaiopStream offChunk(Consumer<Object> fn) {
    onChunk.remove(fn);
    return this;
  }

  public XaiopStream offChunkWithMeta(BiConsumer<Object, DotCheckpointEngine.ChunkMeta> fn) {
    onChunkMeta.remove(fn);
    return this;
  }

  public XaiopStream offDone(Consumer<Object> fn) {
    onDone.remove(fn);
    return this;
  }

  public XaiopStream offError(Consumer<Throwable> fn) {
    onError.remove(fn);
    return this;
  }

  public XaiopStream on(StreamEvent event, Consumer<Object> listener) {
    Objects.requireNonNull(event);
    Objects.requireNonNull(listener);
    listeners.get(event).add(listener);
    return this;
  }

  public XaiopStream off(StreamEvent event, Consumer<Object> listener) {
    listeners.get(event).remove(listener);
    return this;
  }

  public XaiopStream onLineIntercept(LineIntercept.Handler fn) {
    Objects.requireNonNull(fn, "onLineIntercept");
    synchronized (lock) {
      lineInterceptors.add(fn);
      if (engine != null) engine.onLineIntercept(fn);
    }
    return this;
  }

  public XaiopStream clearLineIntercepts() {
    synchronized (lock) {
      lineInterceptors.clear();
      if (engine != null) engine.clearLineIntercepts();
    }
    return this;
  }

  public int lineInterceptCount() {
    synchronized (lock) {
      return lineInterceptors.size();
    }
  }

  public XaiopStream onAnnotationSpan(AnnotationSpan.Handler fn) {
    Objects.requireNonNull(fn, "onAnnotationSpan");
    synchronized (lock) {
      annotationSpanHandlers.add(fn);
      if (engine != null) engine.onAnnotationSpan(fn);
    }
    return this;
  }

  public XaiopStream clearAnnotationSpans() {
    synchronized (lock) {
      annotationSpanHandlers.clear();
      if (engine != null) engine.clearAnnotationSpans();
    }
    return this;
  }

  public int annotationSpanCount() {
    synchronized (lock) {
      return annotationSpanHandlers.size();
    }
  }

  /**
   * Realtime jump on the active engine (requires {@code historyRealtime}).
   *
   * @throws IllegalStateException when no engine / realtime off
   */
  public ParseHistory.JumpResult jumpTo(int index) {
    if (engine == null) {
      throw new IllegalStateException("XaiopStream.jumpTo requires an active send/engine");
    }
    ParseHistory.JumpResult result = engine.jumpTo(index);
    buffer = engine.buffer();
    committedSnapshot = engine.committedSnapshot();
    committedAvailable = committedSnapshot != null || engine.committedAt() > 0;
    snapshot = null;
    return result;
  }

  /**
   * Blocking pull of phase Diffs for the current / next {@code send} when {@link
   * StreamMode#ASYNC_ITERATOR} is enabled. Diffs are also delivered to callback / events floors.
   *
   * <p>Prefer {@link ChunkPull#take()} or {@code for (Object d : stream.chunks())} from a thread
   * other than the transport worker.
   */
  public ChunkPull chunks() {
    if (!modes.contains(StreamMode.ASYNC_ITERATOR)) {
      throw new IllegalStateException("asyncIterator mode is not enabled");
    }
    return new ChunkPull();
  }

  /**
   * Starts one transport cycle. Returns a future of the final JSON when {@link StreamMode#PROMISE}
   * is enabled; otherwise {@code null}.
   */
  public CompletableFuture<Object> send(SendOptions options) {
    SendOptions opts = options == null ? new SendOptions() : options;
    synchronized (lock) {
      if (isBusy()) {
        IllegalStateException err =
            new IllegalStateException("XaiopStream is busy; abort or wait before send");
        if (modes.contains(StreamMode.PROMISE)) {
          return CompletableFuture.failedFuture(err);
        }
        throw err;
      }
      String useUrl = opts.url != null ? opts.url : this.url;
      if (useUrl == null || useUrl.isEmpty()) {
        throw new IllegalArgumentException("send requires a url");
      }
      this.url = useUrl;
      resetCycle();
      setStatus(StreamStatus.CONNECTING);

      CompletableFuture<Object> promise = null;
      if (modes.contains(StreamMode.PROMISE)) {
        promise = new CompletableFuture<>();
        promiseResolve = promise;
      }

      DotCheckpointEngine.Options engineOpts =
          DotCheckpointEngine.Options.builder()
              .streamProcessing(streamProcessing)
              .mergeChunkWindow(mergeChunkWindow)
              .symbolKeys(symbolKeys)
              .cover(cover)
              .historySnapshot(historySnapshot)
              .historyRealtime(historyRealtime)
              .retainWireHistory(retainWireHistory)
              .emitDiff(wantsPhaseDiff())
              .lineIntercept(List.copyOf(lineInterceptors))
              .annotationSpan(List.copyOf(annotationSpanHandlers))
              .onChunkWithMeta(this::deliverChunk);
      if (compatibilityMode) {
        engineOpts.compat(compat);
      } else {
        engineOpts.compat(false);
      }
      engine = engineOpts.build();
      control.bindCheckpoint(engine::noteLogSeq);
      if (historySnapshot && engine.history() != null) {
        engine.history().setSource(useUrl);
      }

      Transport.Options tro = new Transport.Options();
      tro.kind = opts.transport == null ? TransportKind.HTTP : opts.transport;
      tro.url = useUrl;
      tro.method = opts.method;
      tro.headers = opts.headers;
      tro.body = opts.body;
      tro.timeoutMs = opts.timeoutMs;
      tro.source = opts.source;
      tro.inputStream = opts.inputStream;
      tro.httpClient = opts.httpClient;
      tro.sseEvents = opts.sseEvents;

      transportHandle =
          Transport.open(
              tro,
              new Transport.Handlers() {
                @Override
                public void onText(String text) {
                  ingestText(text);
                }

                @Override
                public void onDone() {
                  completeSuccessfully();
                }

                @Override
                public void onError(Throwable err) {
                  fail(err);
                }
              });
      return promise;
    }
  }

  /** Convenience: RAW string chunks. */
  public CompletableFuture<Object> sendRaw(Iterable<String> chunks) {
    SendOptions o = new SendOptions();
    o.transport = TransportKind.RAW;
    o.source = chunks;
    return send(o);
  }

  public boolean abort() {
    synchronized (lock) {
      if (!isBusy() && transportHandle == null) return false;
      try {
        if (transportHandle != null) transportHandle.abort();
      } catch (Exception ignored) {
        /* ignore */
      }
      if (isBusy() || status == StreamStatus.CONNECTING) {
        lastError = new IOExceptionLike("aborted");
        setStatus(StreamStatus.ABORTED);
        rejectPromise(lastError);
        rejectIterators(lastError);
        deliverError(lastError);
        clearTransport();
        return true;
      }
      return false;
    }
  }

  @Override
  public void close() {
    abort();
    if (engine != null) {
      try {
        engine.close();
      } catch (Exception ignored) {
        /* ignore */
      }
    }
  }

  private void rebuildTypeSession() {
    if (typeCheck()) {
      typeSession = new TypeFreezeSession();
      if (typeSchema != null) typeSession.applySchema(typeSchema);
    } else {
      typeSession = null;
    }
  }

  private void rebuildControl() {
    ControlPlaneHost.Options controlOpts =
        ControlPlaneHost.Options.builder()
            .send(text -> false)
            .getCommittedSnapshot(this::getCommittedSnapshot)
            .autoAck(autoAck)
            .onControlError(
                err -> {
                  if (onControlErrorCb != null) {
                    onControlErrorCb.accept(err);
                  } else {
                    for (Consumer<Throwable> c : onError) safeRun(() -> c.accept(err));
                  }
                })
            .onSession(onSessionCb)
            .onResume(onResumeCb)
            .onAck(onAckCb)
            .onSnapshot(onSnapshotCb)
            .onTypes(
                (body, frame) -> {
                  if (typeSession != null) typeSession.applySchema(body);
                });
    if (sessionOpt instanceof Map<?, ?> map) {
      @SuppressWarnings("unchecked")
      Map<String, Object> init = (Map<String, Object>) map;
      controlOpts.session(init);
    } else if (Boolean.TRUE.equals(sessionOpt)) {
      controlOpts.session(true);
    } else {
      controlOpts.session(false);
    }
    this.control = controlOpts.build();
  }

  private void ingestText(String text) {
    synchronized (lock) {
      if (status == StreamStatus.CONNECTING) {
        setStatus(StreamStatus.STREAMING);
      }
      if (status != StreamStatus.STREAMING && status != StreamStatus.CONNECTING) return;
      try {
        String wire = control.push(text);
        if (wire == null || wire.isEmpty()) return;
        pushWire(wire);
      } catch (Throwable err) {
        fail(err);
      }
    }
  }

  private void pushWire(String wire) {
    if (asyncParse) {
      CompletableFuture<Void> next =
          asyncIngest
              .get()
              .thenCompose(v -> engine.pushAsync(wire))
              .thenRun(this::syncFromEngine)
              .exceptionally(
                  err -> {
                    fail(unwrap(err));
                    return null;
                  });
      asyncIngest.set(next);
    } else {
      engine.push(wire);
      syncFromEngine();
    }
  }

  private void syncFromEngine() {
    if (engine == null) return;
    buffer = engine.buffer();
    if (engine.committedAt() > 0) {
      committedSnapshot = null;
      committedAvailable = true;
    }
    Object snap = engine.snapshot();
    if (snap != null) snapshot = snap;
  }

  private void completeSuccessfully() {
    synchronized (lock) {
      if (status == StreamStatus.ABORTED || status == StreamStatus.ERROR) return;
      setStatus(StreamStatus.COMPLETING);
      try {
        String wire = control.flush();
        if (wire != null && !wire.isEmpty()) {
          if (asyncParse) {
            CompletableFuture<Void> next =
                asyncIngest
                    .get()
                    .thenCompose(v -> engine.pushAsync(wire))
                    .thenRun(this::syncFromEngine)
                    .exceptionally(
                        err -> {
                          fail(unwrap(err));
                          return null;
                        });
            asyncIngest.set(next);
          } else {
            engine.push(wire);
            syncFromEngine();
          }
        }
      } catch (Throwable err) {
        fail(err);
        return;
      }
      CompletableFuture<Void> chain = asyncIngest.get().exceptionally(e -> null);
      chain
          .thenCompose(
              v -> {
                if (asyncParse) return engine.finishAsync();
                engine.finish();
                return CompletableFuture.completedFuture(null);
              })
          .whenComplete(
              (v, err) -> {
                synchronized (lock) {
                  if (err != null) {
                    fail(unwrap(err));
                    return;
                  }
                  if (status == StreamStatus.ABORTED || status == StreamStatus.ERROR) return;
                  syncFromEngine();
                  Object finalSnap = snapshot;
                  if (finalSnap == null) finalSnap = new LinkedHashMap<>();
                  Object delivered = Json.deepClone(finalSnap);
                  snapshot = finalSnap;
                  if (typeSession != null) {
                    try {
                      typeSession.observeTree(delivered, true, typeCheckEscapePaths);
                      typeSession.reconcileCommit(delivered);
                    } catch (Throwable typeErr) {
                      fail(typeErr);
                      return;
                    }
                  }
                  deliverDone(delivered);
                  resolvePromise(delivered);
                  setStatus(StreamStatus.COMPLETED);
                  clearTransport();
                }
              });
    }
  }

  private void fail(Throwable err) {
    synchronized (lock) {
      if (status == StreamStatus.COMPLETED
          || status == StreamStatus.ABORTED
          || status == StreamStatus.ERROR) {
        return;
      }
      lastError = err;
      rejectPromise(err);
      rejectIterators(err);
      deliverError(err);
      setStatus(StreamStatus.ERROR);
      try {
        if (transportHandle != null) transportHandle.abort();
      } catch (Exception ignored) {
        /* ignore */
      }
      clearTransport();
    }
  }

  private void resetCycle() {
    lastError = null;
    snapshot = null;
    committedSnapshot = null;
    committedAvailable = false;
    buffer = "";
    promiseResolve = null;
    typeCheckEscapePaths.clear();
    asyncIngest.set(CompletableFuture.completedFuture(null));
    iterQueue.clear();
    iterDone = false;
    iterError = null;
    for (CompletableFuture<Void> w : iterWaiters) {
      w.complete(null);
    }
    iterWaiters.clear();
    if (engine != null) {
      try {
        engine.close();
      } catch (Exception ignored) {
        /* ignore */
      }
    }
    engine = null;
    clearTransport();
  }

  private void clearTransport() {
    transportHandle = null;
  }

  private boolean wantsPhaseDiff() {
    if (modes.contains(StreamMode.EVENTS) || modes.contains(StreamMode.ASYNC_ITERATOR)) {
      return true;
    }
    return modes.contains(StreamMode.CALLBACK)
        && (!onChunk.isEmpty() || !onChunkMeta.isEmpty());
  }

  private void deliverChunk(Object diff, DotCheckpointEngine.ChunkMeta meta) {
    control.notePhaseMeta(chunkMetaToMap(meta));
    syncFromEngine();
    if (meta != null && meta.typeCheckEscapePaths != null) {
      typeCheckEscapePaths.addAll(meta.typeCheckEscapePaths);
    }
    if (typeSession != null) {
      if (diff != null) {
        typeSession.observeTree(diff, true, typeCheckEscapePaths);
      }
      Object committed = engine == null ? null : engine.committedSnapshot();
      if (committed != null) {
        typeSession.reconcileCommit(committed);
      } else if (engine != null && engine.committedAt() > 0) {
        typeSession.reconcileCommit(Map.of());
      }
    }
    if (!wantsPhaseDiff()) return;
    Object payload = diff == null ? null : Json.deepClone(diff);
    if (modes.contains(StreamMode.CALLBACK)) {
      for (Consumer<Object> c : onChunk) safeRun(() -> c.accept(payload));
      for (BiConsumer<Object, DotCheckpointEngine.ChunkMeta> c : onChunkMeta) {
        safeRun(() -> c.accept(payload, meta));
      }
    }
    if (modes.contains(StreamMode.EVENTS)) {
      for (Consumer<Object> c : listeners.get(StreamEvent.CHUNK)) {
        safeRun(() -> c.accept(payload));
      }
    }
    if (modes.contains(StreamMode.ASYNC_ITERATOR)) {
      pushIter(payload);
    }
  }

  private void pushIter(Object diff) {
    iterQueue.addLast(diff);
    wakeIterWaiters();
  }

  private void wakeIterWaiters() {
    for (CompletableFuture<Void> w : iterWaiters) {
      w.complete(null);
    }
    iterWaiters.clear();
  }

  private void finishIterators() {
    iterDone = true;
    iterQueue.addLast(ITER_END);
    wakeIterWaiters();
  }

  private void rejectIterators(Throwable err) {
    iterError = err;
    iterDone = true;
    iterQueue.addLast(ITER_END);
    wakeIterWaiters();
  }

  private Object takeIter(long timeout, TimeUnit unit) throws InterruptedException {
    long deadline =
        timeout < 0 ? Long.MAX_VALUE : System.nanoTime() + unit.toNanos(Math.max(0, timeout));
    while (true) {
      CompletableFuture<Void> wait;
      synchronized (lock) {
        if (!iterQueue.isEmpty()) {
          Object next = iterQueue.pollFirst();
          if (next == ITER_END) {
            if (iterError != null) {
              throw new RuntimeException(iterError);
            }
            return ITER_END;
          }
          return next;
        }
        if (iterError != null) {
          throw new RuntimeException(iterError);
        }
        if (iterDone) {
          return ITER_END;
        }
        wait = new CompletableFuture<>();
        iterWaiters.add(wait);
      }
      long remaining = deadline - System.nanoTime();
      if (timeout >= 0 && remaining <= 0) {
        synchronized (lock) {
          iterWaiters.remove(wait);
        }
        return null; // timeout sentinel for Optional.empty path — use distinct
      }
      try {
        if (timeout < 0) {
          wait.join();
        } else {
          wait.get(remaining, TimeUnit.NANOSECONDS);
        }
      } catch (java.util.concurrent.TimeoutException te) {
        synchronized (lock) {
          iterWaiters.remove(wait);
        }
        return null;
      } catch (java.util.concurrent.ExecutionException ee) {
        throw new RuntimeException(unwrap(ee));
      }
    }
  }

  private void deliverDone(Object json) {
    finishIterators();
    for (Consumer<Object> c : onDone) safeRun(() -> c.accept(json));
    if (modes.contains(StreamMode.EVENTS)) {
      for (Consumer<Object> c : listeners.get(StreamEvent.DONE)) {
        safeRun(() -> c.accept(json));
      }
    }
  }

  private void deliverError(Throwable err) {
    for (Consumer<Throwable> c : onError) safeRun(() -> c.accept(err));
    if (modes.contains(StreamMode.EVENTS)) {
      for (Consumer<Object> c : listeners.get(StreamEvent.ERROR)) {
        safeRun(() -> c.accept(err));
      }
    }
  }

  private void setStatus(StreamStatus next) {
    this.status = next;
    if (modes.contains(StreamMode.EVENTS)) {
      for (Consumer<Object> c : listeners.get(StreamEvent.STATUS)) {
        safeRun(() -> c.accept(next));
      }
    }
  }

  private void resolvePromise(Object json) {
    if (promiseResolve != null) {
      promiseResolve.complete(json);
      promiseResolve = null;
    }
  }

  private void rejectPromise(Throwable err) {
    if (promiseResolve != null) {
      promiseResolve.completeExceptionally(err);
      promiseResolve = null;
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

  private static void safeRun(Runnable r) {
    try {
      r.run();
    } catch (Throwable ignored) {
      /* isolate listener failures */
    }
  }

  private static Throwable unwrap(Throwable err) {
    Throwable c = err;
    while (c.getCause() != null && c != c.getCause()) c = c.getCause();
    return c;
  }

  private static final class IOExceptionLike extends RuntimeException {
    IOExceptionLike(String message) {
      super(message);
    }
  }

  /**
   * Blocking pull API for {@link StreamMode#ASYNC_ITERATOR}. Safe to iterate from a caller thread
   * while the transport worker feeds Diffs.
   */
  public final class ChunkPull implements Iterable<Object> {
    /**
     * Wait for the next Diff. Empty when the stream completes successfully; throws if the stream
     * failed.
     */
    public Optional<Object> take() throws InterruptedException {
      Object v = takeIter(-1, TimeUnit.NANOSECONDS);
      if (v == ITER_END) return Optional.empty();
      if (v == null) return Optional.empty();
      return Optional.ofNullable(v);
    }

    /** Timed wait; empty on timeout <em>or</em> completion. */
    public Optional<Object> take(long timeout, TimeUnit unit) throws InterruptedException {
      Object v = takeIter(timeout, unit);
      if (v == null || v == ITER_END) return Optional.empty();
      return Optional.ofNullable(v);
    }

    @Override
    public Iterator<Object> iterator() {
      return new Iterator<>() {
        private Object pending;
        private boolean hasPending;
        private boolean finished;

        @Override
        public boolean hasNext() {
          if (finished) return false;
          if (hasPending) return true;
          try {
            Optional<Object> next = take();
            if (next.isEmpty()) {
              finished = true;
              return false;
            }
            pending = next.orElse(null);
            hasPending = true;
            return true;
          } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            finished = true;
            return false;
          }
        }

        @Override
        public Object next() {
          if (!hasNext()) throw new NoSuchElementException();
          hasPending = false;
          return pending;
        }
      };
    }
  }

  /** Constructor options. */
  public static final class Options {
    public boolean streamProcessing = true;
    public boolean compatibilityMode;
    public boolean mergeChunkWindow = true;
    public boolean asyncParse;
    public boolean symbolKeys;
    public boolean cover;
    public boolean historySnapshot;
    public boolean historyRealtime;
    public boolean retainWireHistory = true;
    public boolean typeCheck;
    public Object typeSchema;
    /** {@code Boolean} or session-init {@code Map}, or {@code null}. */
    public Object session;
    public boolean autoAck;
    public CompatPolicy compat;
    public Iterable<StreamMode> modes;
    public List<LineIntercept.Handler> lineIntercept;
    public List<AnnotationSpan.Handler> annotationSpan;
    public Consumer<XaiopControlError> onControlError;
    public ControlPlaneHost.BiHandler onSession;
    public ControlPlaneHost.BiHandler onResume;
    public ControlPlaneHost.BiHandler onAck;
    public ControlPlaneHost.BiHandler onSnapshot;

    public static Options defaults() {
      return new Options();
    }

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

    /** U+001F label escape dialect (pair with encode {@code symbolKeys}). */
    public Options symbolKeys(boolean v) {
      symbolKeys = v;
      return this;
    }

    public Options cover(boolean v) {
      cover = v;
      return this;
    }

    public Options historySnapshot(boolean v) {
      historySnapshot = v;
      return this;
    }

    public Options historyRealtime(boolean v) {
      historyRealtime = v;
      return this;
    }

    public Options retainWireHistory(boolean v) {
      retainWireHistory = v;
      return this;
    }

    public Options typeCheck(boolean v) {
      typeCheck = v;
      return this;
    }

    public Options typeSchema(Object schema) {
      typeSchema = schema;
      return this;
    }

    public Options session(boolean enabled) {
      session = enabled;
      return this;
    }

    public Options session(Map<String, Object> init) {
      session = init;
      return this;
    }

    public Options autoAck(boolean v) {
      autoAck = v;
      return this;
    }

    public Options lineIntercept(LineIntercept.Handler... handlers) {
      if (handlers == null || handlers.length == 0) {
        lineIntercept = null;
      } else {
        lineIntercept = List.of(handlers);
      }
      return this;
    }

    public Options annotationSpan(AnnotationSpan.Handler... handlers) {
      if (handlers == null || handlers.length == 0) {
        annotationSpan = null;
      } else {
        annotationSpan = List.of(handlers);
      }
      return this;
    }

    public Options onControlError(Consumer<XaiopControlError> fn) {
      onControlError = fn;
      return this;
    }

    public Options onSession(ControlPlaneHost.BiHandler fn) {
      onSession = fn;
      return this;
    }

    public Options onResume(ControlPlaneHost.BiHandler fn) {
      onResume = fn;
      return this;
    }

    public Options onAck(ControlPlaneHost.BiHandler fn) {
      onAck = fn;
      return this;
    }

    public Options onSnapshot(ControlPlaneHost.BiHandler fn) {
      onSnapshot = fn;
      return this;
    }

    public Options modes(StreamMode... m) {
      modes = EnumSet.copyOf(List.of(m));
      return this;
    }

    public Options modes(Iterable<StreamMode> m) {
      modes = m;
      return this;
    }
  }

  /** Per-send transport options. */
  public static final class SendOptions {
    public String url;
    public TransportKind transport = TransportKind.HTTP;
    public String method = "GET";
    public Map<String, String> headers;
    public String body;
    public Long timeoutMs;
    public Iterable<?> source;
    public java.io.InputStream inputStream;
    public java.net.http.HttpClient httpClient;
    public Set<String> sseEvents;

    public SendOptions transport(TransportKind k) {
      transport = k;
      return this;
    }

    public SendOptions source(Iterable<?> s) {
      source = s;
      return this;
    }

    public SendOptions url(String u) {
      url = u;
      return this;
    }
  }
}
