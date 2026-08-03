package io.xaiop.stream;

import io.xaiop.Json;
import io.xaiop.Parse;
import io.xaiop.compat.Compat;
import io.xaiop.compat.CompatFixId;
import io.xaiop.compat.CompatPolicy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Dot-checkpoint stream parser (XAIOP PROT-HIER / PROT-BOUND), faithful port of the Node.js
 * SDK's {@code stream/checkpoint.js}.
 *
 * <p>{@code .} bounds <b>phases</b>. Diff is the phase document (later-wins unit); Commit is the
 * live cumulative tree.
 *
 * <p>Performance (space/speed):
 *
 * <ul>
 *   <li>One {@link Parse.LiveXaiopParser} for Commit (phase lines fed once, no prefix re-parse).
 *   <li>First phase / {@code =} / {@code !}: Diff shares one materialize with Commit.
 *   <li>{@code emitDiff = false} skips the Diff parse when callers only need Commit / final.
 *   <li>{@code mergeChunkWindow} (default {@code true}): batch every complete {@code .} in the
 *       current buffer window into one feed + one Commit + one {@code onChunk}.
 * </ul>
 *
 * <p><b>Async ingest.</b> {@link #pushAsync(String)} / {@link #finishAsync()} are not thin
 * wrappers around the sync path: they append immediately and coalesce the scan onto a single
 * daemon-threaded {@link ScheduledExecutorService} (zero-delay schedule), so a burst of rapid
 * pushes shares one drain -- the counterpart of the JS {@code setImmediate} coalescing. All
 * state (including {@code onChunk} delivery) is serialized on this engine's monitor, so the
 * callback sees the same single-threaded ordering as the Node implementation. The executor is
 * created lazily on first async use and shut down on {@link #finish()} / {@link #finishAsync()}
 * / {@link #close()}; its thread is a daemon, so a forgotten engine never blocks JVM exit.
 */
public final class DotCheckpointEngine implements AutoCloseable {
  private final Map<CompatFixId, Boolean> compat;
  private final boolean streamProcessing;
  private final Consumer<Object> onChunk;
  private final boolean emitDiff;
  private final boolean mergeChunkWindow;

  private final StringBuilder buffer = new StringBuilder();
  private final List<String> phaseLines = new ArrayList<>();
  private int segmentStart;
  private int scanAt;
  private boolean sawDot;
  private Object latestSnapshot;
  /** Bytes of buffer covered by completed phases (through the last {@code .} or flushed tail). */
  private int committedAt;
  private Object committedSnapshot;
  /** Live tree matches the last commit boundary (may need materialize on read). */
  private boolean commitFromLive;
  private boolean closed;
  private Parse.LiveXaiopParser live;

  private ScheduledExecutorService executor;
  private CompletableFuture<Void> asyncDrainPromise;
  private boolean asyncDrainCancelled;

  public DotCheckpointEngine(Options options) {
    if (options == null) throw new NullPointerException("checkpoint options are required");
    if (options.onChunk == null) throw new NullPointerException("onChunk hook is required");
    this.compat = Compat.resolveCompatOptions(options.compat);
    this.streamProcessing = options.streamProcessing;
    this.onChunk = options.onChunk;
    this.emitDiff = options.emitDiff;
    this.mergeChunkWindow = options.mergeChunkWindow;
  }

  /** Everything ingested so far. */
  public synchronized String buffer() {
    return buffer.toString();
  }

  /** Latest full-document snapshot; only set at {@code finish}. */
  public synchronized Object snapshot() {
    return latestSnapshot;
  }

  public synchronized int committedAt() {
    return committedAt;
  }

  /** Whether buffer-window {@code .} batching is on (default {@code true}). */
  public boolean mergeChunkWindow() {
    return mergeChunkWindow;
  }

  /**
   * Materialized parse of {@code buffer[0..committedAt)}. Only advances when a {@code .} phase
   * completes or the tail is flushed at finish -- never from mid-phase partial wire.
   */
  public synchronized Object committedSnapshot() {
    if (commitFromLive && live != null) {
      committedSnapshot = Materialize.materializeSnapshot(live.value());
      commitFromLive = false;
    }
    return committedSnapshot;
  }

  /** Synchronous ingest. Scans immediately (respecting {@code mergeChunkWindow}). */
  public synchronized void push(String chunk) {
    if (closed) throw new IllegalStateException("checkpoint engine is closed");
    if (chunk == null) throw new NullPointerException("stream chunk must be a string");
    if (chunk.isEmpty()) return;
    buffer.append(chunk);
    cancelPendingAsyncDrain();
    if (streamProcessing) scanDots(false);
  }

  /**
   * Async ingest: append now, coalesce the scan onto the drain thread. Multiple rapid calls
   * share one drain (a true window merge across bursts).
   */
  public CompletableFuture<Void> pushAsync(String chunk) {
    synchronized (this) {
      if (closed) {
        return failed(new IllegalStateException("checkpoint engine is closed"));
      }
      if (chunk == null) {
        return failed(new NullPointerException("stream chunk must be a string"));
      }
      if (chunk.isEmpty()) return CompletableFuture.completedFuture(null);
      buffer.append(chunk);
      if (!streamProcessing) return CompletableFuture.completedFuture(null);
      return scheduleAsyncDrain();
    }
  }

  /** Synchronous finish: scan, flush the tail, emit the final snapshot. */
  public void finish() {
    synchronized (this) {
      if (closed) return;
      cancelPendingAsyncDrain();
      finishBody();
    }
    shutdownExecutor();
  }

  /** Async finish: await any pending drain, then finish on the drain thread. */
  public CompletableFuture<Void> finishAsync() {
    CompletableFuture<Void> pending;
    synchronized (this) {
      if (closed) return CompletableFuture.completedFuture(null);
      pending = asyncDrainPromise;
    }
    CompletableFuture<Void> base =
        pending != null ? pending : CompletableFuture.completedFuture(null);
    return base.thenCompose(ignored -> {
      CompletableFuture<Void> done = new CompletableFuture<>();
      executor().schedule(
          () -> {
            RuntimeException failure = null;
            synchronized (this) {
              try {
                if (!closed) finishBody();
              } catch (RuntimeException e) {
                failure = e;
              }
            }
            shutdownExecutor();
            if (failure != null) done.completeExceptionally(failure);
            else done.complete(null);
          },
          0,
          TimeUnit.MILLISECONDS);
      return done;
    });
  }

  /** Releases the drain thread. Safe to call repeatedly; does not finish the document. */
  @Override
  public void close() {
    shutdownExecutor();
  }

  // --- core ------------------------------------------------------------------

  private void finishBody() {
    closed = true;

    if (!streamProcessing) {
      Object value = parseOwned(buffer.toString());
      storeCommit(buffer.length(), value, false);
      onChunk.accept(value);
      latestSnapshot = value;
      segmentStart = buffer.length();
      scanAt = buffer.length();
      phaseLines.clear();
      return;
    }

    scanDots(true);
    flushTail();
    if (committedAt == buffer.length()) {
      latestSnapshot = committedSnapshot();
    } else {
      latestSnapshot = parseOwned(buffer.toString());
      storeCommit(buffer.length(), latestSnapshot, false);
    }
  }

  private void scanDots(boolean atEof) {
    if (mergeChunkWindow) {
      scanDotsMerged(atEof);
      return;
    }
    while (scanAt < buffer.length()) {
      Line info = readLine(buffer, scanAt, atEof);
      if (info == null) break;
      scanAt = info.end();
      phaseLines.add(info.text());
      if (info.text().equals(".")) emitPhase(info.end());
      if (!info.consumedNewline() && atEof) break;
    }
  }

  /** Collects every complete {@code .} currently available, feeds once, emits once. */
  private void scanDotsMerged(boolean atEof) {
    List<ClosedPhase> closedPhases = new ArrayList<>();
    List<String> pending = new ArrayList<>(phaseLines);
    int start = segmentStart;

    while (scanAt < buffer.length()) {
      Line info = readLine(buffer, scanAt, atEof);
      if (info == null) break;
      scanAt = info.end();
      pending.add(info.text());
      if (info.text().equals(".")) {
        closedPhases.add(new ClosedPhase(start, info.end(), pending));
        pending = new ArrayList<>();
        start = info.end();
      }
      if (!info.consumedNewline() && atEof) break;
    }

    phaseLines.clear();
    phaseLines.addAll(pending);
    segmentStart = start;

    if (closedPhases.isEmpty()) return;
    emitClosedWindow(closedPhases);
  }

  private void emitClosedWindow(List<ClosedPhase> closedPhases) {
    List<String> allLines = new ArrayList<>();
    for (ClosedPhase phase : closedPhases) allLines.addAll(phase.lines());
    int lastEnd = closedPhases.get(closedPhases.size() - 1).end();
    boolean sawDotBefore = sawDot;

    feedLiveLines(allLines);
    sawDot = true;
    segmentStart = lastEnd;

    if (!emitDiff) {
      storeCommit(lastEnd, null, true);
      onChunk.accept(null);
      return;
    }

    if (closedPhases.size() == 1) {
      ClosedPhase only = closedPhases.get(0);
      String raw = buffer.substring(only.start(), only.end());
      // buildDiff reads sawDot as "a prior dot existed"; restore the pre-batch value.
      sawDot = sawDotBefore;
      Diff result = buildDiff(raw);
      sawDot = true;
      storeCommit(lastEnd, result.committed(), result.fromLive());
      onChunk.accept(result.diff());
      return;
    }

    // Multi-phase window: one Commit + one Diff = the cumulative tree after the batch.
    Object committed = Materialize.materializeSnapshot(live.value());
    storeCommit(lastEnd, committed, false);
    onChunk.accept(isolateDiff(committed, committed));
  }

  /** @param end exclusive end of the {@code .} line */
  private void emitPhase(int end) {
    String raw = buffer.substring(segmentStart, end);
    feedLiveLines(phaseLines);
    phaseLines.clear();
    Diff result = buildDiff(raw);
    sawDot = true;
    segmentStart = end;
    storeCommit(end, result.committed(), result.fromLive());
    onChunk.accept(result.diff());
  }

  private void flushTail() {
    if (segmentStart < buffer.length()) {
      String raw = buffer.substring(segmentStart);
      feedLiveLines(phaseLines);
      phaseLines.clear();
      Diff result;
      if (!sawDot) {
        if (!emitDiff) {
          result = new Diff(null, null, true);
        } else {
          Object committed = Materialize.materializeSnapshot(live.value());
          result = new Diff(isolateDiff(committed, committed), committed, false);
        }
      } else {
        result = buildDiff(raw);
      }
      segmentStart = buffer.length();
      storeCommit(buffer.length(), result.committed(), result.fromLive());
      onChunk.accept(result.diff());
      return;
    }
    if (!sawDot && buffer.length() == 0) {
      phaseLines.clear();
      storeCommit(0, null, false);
      onChunk.accept(null);
    }
  }

  private void feedLiveLines(List<String> lines) {
    if (live == null) {
      live = new Parse.LiveXaiopParser(compat);
    }
    committedSnapshot = null;
    commitFromLive = false;
    for (String line : lines) {
      live.feedLine(line);
    }
  }

  private Diff buildDiff(String raw) {
    if (!emitDiff) {
      return new Diff(null, null, true);
    }

    // First phase: the live tree IS the phase document — share one materialize.
    // `=` / `!` see the cumulative tree (向前跨相).
    if (!sawDot || phaseNeedsPriorTree(raw)) {
      Object committed = Materialize.materializeSnapshot(live.value());
      return new Diff(isolateDiff(normalizeEmptyPhase(raw, committed), committed), committed, false);
    }

    // Later ordinary phase: phase-local Diff via an owned parse (no extra clone).
    Object diff = normalizeEmptyPhase(raw, parseOwned(withLeadingDot(raw)));
    return new Diff(diff, null, true);
  }

  private void storeCommit(int at, Object snapshot, boolean fromLive) {
    committedAt = at;
    commitFromLive = fromLive;
    committedSnapshot = fromLive ? null : snapshot;
  }

  /** Fresh parse; ownership transferred (plain roots are not cloned again). */
  private Object parseOwned(String text) {
    if (text.isEmpty()) return null;
    return Materialize.materializeOwned(Parse.parse(text, compat));
  }

  // --- async plumbing --------------------------------------------------------

  private CompletableFuture<Void> scheduleAsyncDrain() {
    if (asyncDrainPromise != null) return asyncDrainPromise;
    CompletableFuture<Void> promise = new CompletableFuture<>();
    asyncDrainPromise = promise;
    asyncDrainCancelled = false;
    executor().schedule(
        () -> {
          RuntimeException failure = null;
          synchronized (this) {
            boolean cancelled = asyncDrainCancelled;
            asyncDrainPromise = null;
            asyncDrainCancelled = false;
            if (!cancelled) {
              try {
                if (!closed && streamProcessing) scanDots(false);
              } catch (RuntimeException e) {
                failure = e;
              }
            }
          }
          if (failure != null) promise.completeExceptionally(failure);
          else promise.complete(null);
        },
        0,
        TimeUnit.MILLISECONDS);
    return promise;
  }

  /**
   * A sync {@code push} / {@code finish} already scanned (or is about to): cancel the pending
   * drain so the scheduled task does not scan twice. Waiters still resolve.
   */
  private void cancelPendingAsyncDrain() {
    if (asyncDrainPromise != null) asyncDrainCancelled = true;
  }

  private synchronized ScheduledExecutorService executor() {
    if (executor == null) {
      executor =
          Executors.newSingleThreadScheduledExecutor(
              r -> {
                Thread t = new Thread(r, "xaiop-checkpoint");
                t.setDaemon(true);
                return t;
              });
    }
    return executor;
  }

  private void shutdownExecutor() {
    ScheduledExecutorService pool;
    synchronized (this) {
      pool = executor;
      executor = null;
    }
    if (pool != null) pool.shutdown();
  }

  private static CompletableFuture<Void> failed(RuntimeException error) {
    CompletableFuture<Void> f = new CompletableFuture<>();
    f.completeExceptionally(error);
    return f;
  }

  // --- helpers ---------------------------------------------------------------

  private static Object isolateDiff(Object diff, Object committed) {
    if (diff == null) return null;
    if (diff == committed) return Json.deepClone(committed);
    return diff;
  }

  private static String withLeadingDot(String raw) {
    if (raw.equals(".") || raw.startsWith(".\n") || raw.startsWith(".\r\n")) {
      return raw;
    }
    return raw.startsWith("\n") ? "." + raw : ".\n" + raw;
  }

  /** Whether the phase contains a {@code =} locate or {@code !} delete (needs the prior tree). */
  private static boolean phaseNeedsPriorTree(String raw) {
    int i = 0;
    int n = raw.length();
    while (i < n) {
      char c = raw.charAt(i);
      if (c == '\r' || c == '\n') {
        i++;
        continue;
      }
      if (c == '=' || c == '!') return true;
      while (i < n) {
        char ch = raw.charAt(i);
        if (ch == '\n') {
          i++;
          break;
        }
        if (ch == '\r') {
          i++;
          if (i < n && raw.charAt(i) == '\n') i++;
          break;
        }
        i++;
      }
    }
    return false;
  }

  private static Object normalizeEmptyPhase(String raw, Object value) {
    String body =
        raw.replaceFirst("^\\.\\r?\\n?", "").replaceFirst("\\r?\\n?\\.\\r?\\n?$", "").strip();
    return body.isEmpty() ? null : value;
  }

  private static Line readLine(CharSequence text, int from, boolean atEof) {
    int length = text.length();
    if (from >= length) return null;
    for (int i = from; i < length; i++) {
      if (text.charAt(i) == '\n') {
        int end = i;
        if (end > from && text.charAt(end - 1) == '\r') end--;
        return new Line(text.subSequence(from, end).toString(), i + 1, true);
      }
    }
    if (!atEof) return null;
    return new Line(text.subSequence(from, length).toString(), length, false);
  }

  private record Line(String text, int end, boolean consumedNewline) {}

  private record Diff(Object diff, Object committed, boolean fromLive) {}

  private record ClosedPhase(int start, int end, List<String> lines) {}

  /** Hooks / tuning for {@link DotCheckpointEngine}. */
  public static final class Options {
    private Object compat;
    private boolean streamProcessing = true;
    private Consumer<Object> onChunk;
    private boolean emitDiff = true;
    private boolean mergeChunkWindow = true;

    public static Options builder() {
      return new Options();
    }

    /** Shorthand: default hooks with the given chunk sink. */
    public static Options of(Consumer<Object> onChunk) {
      return new Options().onChunk(onChunk);
    }

    private Options() {}

    /** @param enabled {@code false} = strict parse; {@code true} = all compatibility fixes. */
    public Options compat(boolean enabled) {
      this.compat = enabled;
      return this;
    }

    public Options compat(CompatPolicy policy) {
      this.compat = policy;
      return this;
    }

    public Options compat(Map<CompatFixId, Boolean> overrides) {
      this.compat = overrides;
      return this;
    }

    /** {@code false} defers everything to {@code finish} (one chunk, whole document). */
    public Options streamProcessing(boolean enabled) {
      this.streamProcessing = enabled;
      return this;
    }

    /** Receives the phase Diff (or {@code null} for an empty phase). Required. */
    public Options onChunk(Consumer<Object> sink) {
      this.onChunk = sink;
      return this;
    }

    /** {@code false} skips the Diff parse; {@code onChunk} then always receives {@code null}. */
    public Options emitDiff(boolean enabled) {
      this.emitDiff = enabled;
      return this;
    }

    /** {@code true} (default) batches every complete {@code .} in one buffer window. */
    public Options mergeChunkWindow(boolean enabled) {
      this.mergeChunkWindow = enabled;
      return this;
    }

    public DotCheckpointEngine build() {
      return new DotCheckpointEngine(this);
    }
  }
}
