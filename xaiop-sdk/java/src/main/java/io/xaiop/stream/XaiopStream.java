package io.xaiop.stream;

import io.xaiop.Json;
import io.xaiop.compat.CompatPolicy;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

/**
 * Streaming XAIOP consumer over HTTP / SSE / RAW (Node {@code XaiopStream}).
 *
 * <p>Chunk = phase Diff at each {@code .} (window-batched by default). Done = full-buffer
 * Snapshot. WebSocket listen/hub, cover Diff, typeCheck, line intercept, and Annotation Span are
 * <b>not</b> in this Java surface yet.
 */
public final class XaiopStream implements AutoCloseable {
  private String url;
  private boolean streamProcessing = true;
  private boolean compatibilityMode;
  private boolean mergeChunkWindow = true;
  private boolean asyncParse;
  private boolean symbolKeys;
  private CompatPolicy compat = new CompatPolicy();
  private Set<StreamMode> modes = StreamMode.callbackOnly();

  private volatile StreamStatus status = StreamStatus.IDLE;
  private volatile Throwable lastError;
  private volatile Object snapshot;
  private volatile Object committedSnapshot;
  private volatile boolean committedAvailable;
  private volatile String buffer = "";

  private final List<Consumer<Object>> onChunk = new CopyOnWriteArrayList<>();
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
      if (options.compat != null) this.compat = options.compat;
      if (options.modes != null) this.modes = StreamMode.normalize(options.modes);
    }
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

  public boolean compatibilityMode() {
    return compatibilityMode;
  }

  public Throwable lastError() {
    return lastError;
  }

  public Set<StreamMode> modes() {
    return modes;
  }

  /** Final Snapshot after successful completion; otherwise {@code null}. */
  public Object getSnapshot() {
    return snapshot == null ? null : Json.deepClone(snapshot);
  }

  /** Committed prefix Snapshot (phase boundaries); {@code null} until first commit. */
  public Object getCommittedSnapshot() {
    if (!committedAvailable) return null;
    return committedSnapshot == null ? null : Json.deepClone(committedSnapshot);
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
    this.url = next;
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
          DotCheckpointEngine.Options.of(this::deliverChunk)
              .streamProcessing(streamProcessing)
              .mergeChunkWindow(mergeChunkWindow)
              .symbolKeys(symbolKeys)
              .emitDiff(wantsPhaseDiff());
      if (compatibilityMode) {
        engineOpts.compat(compat);
      } else {
        engineOpts.compat(false);
      }
      engine = engineOpts.build();

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

  private void ingestText(String text) {
    synchronized (lock) {
      if (status == StreamStatus.CONNECTING) {
        setStatus(StreamStatus.STREAMING);
      }
      if (status != StreamStatus.STREAMING && status != StreamStatus.CONNECTING) return;
      try {
        if (asyncParse) {
          CompletableFuture<Void> next =
              asyncIngest
                  .get()
                  .thenCompose(v -> engine.pushAsync(text))
                  .thenRun(this::syncFromEngine)
                  .exceptionally(
                      err -> {
                        fail(unwrap(err));
                        return null;
                      });
          asyncIngest.set(next);
        } else {
          engine.push(text);
          syncFromEngine();
        }
      } catch (Throwable err) {
        fail(err);
      }
    }
  }

  private void syncFromEngine() {
    if (engine == null) return;
    buffer = engine.buffer();
    Object committed = engine.committedSnapshot();
    if (engine.committedAt() > 0 || committed != null) {
      committedSnapshot = committed;
      committedAvailable = true;
    }
    Object snap = engine.snapshot();
    if (snap != null) snapshot = snap;
  }

  private void completeSuccessfully() {
    synchronized (lock) {
      if (status == StreamStatus.ABORTED || status == StreamStatus.ERROR) return;
      setStatus(StreamStatus.COMPLETING);
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
      if (status == StreamStatus.COMPLETED || status == StreamStatus.ABORTED) return;
      lastError = err;
      rejectPromise(err);
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
    asyncIngest.set(CompletableFuture.completedFuture(null));
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
    return modes.contains(StreamMode.CALLBACK) && !onChunk.isEmpty();
  }

  private void deliverChunk(Object diff) {
    syncFromEngine();
    if (!wantsPhaseDiff()) return;
    Object payload = diff == null ? null : Json.deepClone(diff);
    for (Consumer<Object> c : onChunk) safeRun(() -> c.accept(payload));
    if (modes.contains(StreamMode.EVENTS)) {
      for (Consumer<Object> c : listeners.get(StreamEvent.CHUNK)) {
        safeRun(() -> c.accept(payload));
      }
    }
  }

  private void deliverDone(Object json) {
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

  /** Constructor options. */
  public static final class Options {
    public boolean streamProcessing = true;
    public boolean compatibilityMode;
    public boolean mergeChunkWindow = true;
    public boolean asyncParse;
    public boolean symbolKeys;
    public CompatPolicy compat;
    public Iterable<StreamMode> modes;

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
