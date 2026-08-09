package io.xaiop.stream;

import io.xaiop.Json;
import io.xaiop.Parse;
import io.xaiop.ParseOptions;
import io.xaiop.compat.Compat;
import io.xaiop.compat.CompatFixId;
import io.xaiop.compat.CompatPolicy;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * Dot-checkpoint stream parser (XAIOP PROT-HIER / PROT-BOUND), faithful port of the Node.js
 * SDK's {@code stream/checkpoint.js} (0.15.x).
 *
 * <p>{@code .} bounds <b>phases</b>. Diff is the phase document (later-wins unit); Commit is the
 * live cumulative tree.
 *
 * <p>{@code cover: true} — at consecutive {@code &} runs, inject {@code .}, emit deepest-key
 * {@code null} tombstone Diffs, then restore Cursor with a {@code >} chain before following lines.
 */
public final class DotCheckpointEngine implements AutoCloseable {
  /** Optional metadata delivered with {@code onChunk} (seq / logSeq / escape paths). */
  public static final class ChunkMeta {
    public final List<String> typeCheckEscapePaths;
    public final Integer seq;
    public final List<Integer> seqs;
    public final Integer logSeq;
    public final List<Integer> logSeqs;

    public ChunkMeta(
        List<String> typeCheckEscapePaths,
        Integer seq,
        List<Integer> seqs,
        Integer logSeq,
        List<Integer> logSeqs) {
      this.typeCheckEscapePaths = typeCheckEscapePaths;
      this.seq = seq;
      this.seqs = seqs;
      this.logSeq = logSeq;
      this.logSeqs = logSeqs;
    }

    public boolean isEmpty() {
      return (typeCheckEscapePaths == null || typeCheckEscapePaths.isEmpty())
          && (seqs == null || seqs.isEmpty())
          && (logSeqs == null || logSeqs.isEmpty());
    }
  }

  /** Receive-buffer sizes without reading the full wire string. */
  public static final class BufferStats {
    public final int length;
    public final int committedAt;
    public final int pendingBytes;
    public final boolean openPhase;

    public BufferStats(int length, int committedAt, int pendingBytes, boolean openPhase) {
      this.length = length;
      this.committedAt = committedAt;
      this.pendingBytes = pendingBytes;
      this.openPhase = openPhase;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) return true;
      if (!(o instanceof BufferStats other)) return false;
      return length == other.length
          && committedAt == other.committedAt
          && pendingBytes == other.pendingBytes
          && openPhase == other.openPhase;
    }

    @Override
    public int hashCode() {
      return java.util.Objects.hash(length, committedAt, pendingBytes, openPhase);
    }
  }

  /** Result of {@link #compactCommitted(boolean)}. */
  public static final class CompactResult {
    public final int discardedBytes;
    public final int length;

    public CompactResult(int discardedBytes, int length) {
      this.discardedBytes = discardedBytes;
      this.length = length;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) return true;
      if (!(o instanceof CompactResult other)) return false;
      return discardedBytes == other.discardedBytes && length == other.length;
    }

    @Override
    public int hashCode() {
      return java.util.Objects.hash(discardedBytes, length);
    }
  }

  private final Map<CompatFixId, Boolean> compat;
  private final boolean symbolKeys;
  private final boolean streamProcessing;
  private final BiConsumer<Object, ChunkMeta> onChunk;
  private final boolean emitDiff;
  private final boolean mergeChunkWindow;
  private final boolean cover;
  private final boolean phaseSeqEnabled;

  private final StringBuilder buffer = new StringBuilder();
  /** Swapped out (not copied) when a phase closes; always non-null. */
  private List<String> phaseLines = new ArrayList<>();
  private int segmentStart;
  private int scanAt;
  private boolean sawDot;
  private Object latestSnapshot;
  private boolean hasLatestSnapshot;
  /** Bytes of buffer covered by completed phases (through the last {@code .} or flushed tail). */
  private int committedAt;
  private Object committedSnapshot;
  /** Live tree matches the last commit boundary (may need materialize on read). */
  private boolean commitFromLive;
  private boolean closed;
  private Parse.LiveXaiopParser live;

  private final ParseHistory history;
  private final List<LineIntercept.Handler> lineInterceptors = new ArrayList<>();
  private final List<AnnotationSpan.Handler> annotationSpanHandlers = new ArrayList<>();
  private final List<String> pendingTypeCheckEscape = new ArrayList<>();
  private int phaseSeq;
  private final List<Integer> pendingSeqs = new ArrayList<>();
  private final List<Integer> logSeqQueue = new ArrayList<>();
  private final List<Integer> pendingLogSeqs = new ArrayList<>();

  private final CheckpointAsync async = new CheckpointAsync();

  public DotCheckpointEngine(Options options) {
    if (options == null) throw new NullPointerException("checkpoint options are required");
    this.compat = Compat.resolveCompatOptions(options.compat);
    this.symbolKeys = options.symbolKeys;
    this.streamProcessing = options.streamProcessing;
    this.onChunk = options.onChunk;
    this.emitDiff = options.emitDiff;
    this.mergeChunkWindow = options.mergeChunkWindow;
    this.cover = options.cover;
    this.phaseSeqEnabled = options.phaseSeq;
    boolean snap = options.historySnapshot;
    boolean liveHist = options.historyRealtime;
    this.history =
        (snap || liveHist)
            ? new ParseHistory(snap, liveHist, options.retainWireHistory, options.compat)
            : null;
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

  /** Everything ingested so far. */
  public synchronized String buffer() {
    return buffer.toString();
  }

  /**
   * Latest full-document snapshot; only set at {@code finish}. After {@link #jumpTo(int)} this
   * returns {@code null} until the next finish.
   */
  public synchronized Object snapshot() {
    return hasLatestSnapshot ? latestSnapshot : null;
  }

  /** Whether {@link #snapshot()} was set by the last {@code finish} (not cleared by jump). */
  public synchronized boolean hasSnapshot() {
    return hasLatestSnapshot;
  }

  public synchronized int committedAt() {
    return committedAt;
  }

  /** Whether buffer-window {@code .} batching is on (default {@code true}). */
  public boolean mergeChunkWindow() {
    return mergeChunkWindow;
  }

  public synchronized BufferStats bufferStats() {
    int length = buffer.length();
    return new BufferStats(
        length, committedAt, Math.max(0, length - committedAt), segmentStart < length);
  }

  /**
   * Discard committed wire {@code buffer[0 .. committedAt)} while keeping the live Commit tree and
   * any uncommitted tail. Does <b>not</b> re-parse.
   */
  public synchronized CompactResult compactCommitted() {
    return compactCommitted(false);
  }

  /**
   * @param dropHistory when {@code true}, clear history first (required when history nodes exist or
   *     realtime+retainWire)
   */
  public synchronized CompactResult compactCommitted(boolean dropHistory) {
    if (closed) {
      throw new IllegalStateException("compactCommitted: checkpoint engine is closed");
    }
    cancelPendingAsyncDrain();

    if (history != null) {
      if (history.realtimeEnabled() && history.retainWireEnabled() && !dropHistory) {
        throw new IllegalStateException(
            "compactCommitted conflicts with historyRealtime + retainWireHistory; pass dropHistory: true or disable retainWireHistory");
      }
      if (history.length() > 0 && !dropHistory) {
        throw new IllegalStateException(
            "compactCommitted invalidates history buffer indices; pass dropHistory: true");
      }
      if (dropHistory) {
        history.clear();
      }
    }

    int cut = committedAt;
    if (cut <= 0) {
      return new CompactResult(0, buffer.length());
    }
    if (cut > buffer.length()) {
      int discardedBytes = buffer.length();
      buffer.setLength(0);
      committedAt = 0;
      segmentStart = 0;
      scanAt = 0;
      phaseLines.clear();
      return new CompactResult(discardedBytes, 0);
    }

    buffer.delete(0, cut);
    committedAt = 0;
    segmentStart = Math.max(0, segmentStart - cut);
    scanAt = Math.max(0, scanAt - cut);
    return new CompactResult(cut, buffer.length());
  }

  /** Opt-in parse history ({@code null} when both history modes are off). */
  public ParseHistory history() {
    return history;
  }

  /** Anytime history summary (empty shape when history is off). */
  public ParseHistory.Info historyInfo() {
    if (history == null) {
      return new ParseHistory.Info(false, false, 0, -1, null, false, null);
    }
    return history.info();
  }

  /**
   * Realtime: jump live head forward to history index; discard nodes after. Rebuilds Commit /
   * buffer / live parser from the retained prefix.
   */
  public synchronized ParseHistory.JumpResult jumpTo(int index) {
    if (history == null || !history.realtimeEnabled()) {
      throw new IllegalStateException("jumpTo requires historyRealtime");
    }
    cancelPendingAsyncDrain();
    ParseHistory.JumpResult result = history.jumpTo(index);
    rebuildFromHistoryJump(result);
    return result;
  }

  public synchronized DotCheckpointEngine onLineIntercept(LineIntercept.Handler fn) {
    if (fn == null) throw new NullPointerException("onLineIntercept requires a function");
    lineInterceptors.add(fn);
    return this;
  }

  public synchronized DotCheckpointEngine clearLineIntercepts() {
    lineInterceptors.clear();
    return this;
  }

  public synchronized int lineInterceptCount() {
    return lineInterceptors.size();
  }

  /**
   * Register a phase {@code #} annotation-span handler (append; registration order). Fires when
   * phase JSON for the capture is ready, <b>before</b> Diff / typeCheck.
   */
  public synchronized DotCheckpointEngine onAnnotationSpan(AnnotationSpan.Handler fn) {
    if (fn == null) throw new NullPointerException("onAnnotationSpan requires a function");
    annotationSpanHandlers.add(fn);
    return this;
  }

  public synchronized DotCheckpointEngine clearAnnotationSpans() {
    annotationSpanHandlers.clear();
    return this;
  }

  public synchronized int annotationSpanCount() {
    return annotationSpanHandlers.size();
  }

  /** Highest completed phase seq (0 = none). */
  public synchronized int phaseSeq() {
    return phaseSeq;
  }

  /**
   * Queue a session-log seq for the next physical phase unit(s).
   *
   * @param seq must be {@code >= 1}
   */
  public synchronized DotCheckpointEngine noteLogSeq(int seq) {
    if (seq < 1) throw new IllegalArgumentException("noteLogSeq requires seq >= 1");
    logSeqQueue.add(seq);
    return this;
  }

  /**
   * Materialized parse of {@code buffer[0..committedAt)}. Advances when a {@code .} phase
   * completes or the unfinished tail is flushed at {@link #finish()} — never from mid-phase
   * partial wire.
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
        return CheckpointAsync.failed(new IllegalStateException("checkpoint engine is closed"));
      }
      if (chunk == null) {
        return CheckpointAsync.failed(new NullPointerException("stream chunk must be a string"));
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
    async.shutdown();
  }

  /** Async finish: await any pending drain, then finish on the drain thread. */
  public CompletableFuture<Void> finishAsync() {
    CompletableFuture<Void> pending;
    synchronized (this) {
      if (closed) return CompletableFuture.completedFuture(null);
      pending = async.drainPromise();
    }
    CompletableFuture<Void> base =
        pending != null ? pending : CompletableFuture.completedFuture(null);
    return base.thenCompose(
        ignored -> {
          CompletableFuture<Void> done = new CompletableFuture<>();
          async.schedule(
              () -> {
                RuntimeException failure = null;
                synchronized (this) {
                  try {
                    if (!closed) finishBody();
                  } catch (RuntimeException e) {
                    failure = e;
                  }
                }
                async.shutdown();
                if (failure != null) done.completeExceptionally(failure);
                else done.complete(null);
              });
          return done;
        });
  }

  /** Releases the drain thread. Safe to call repeatedly; does not finish the document. */
  @Override
  public void close() {
    async.shutdown();
  }

  // --- core ------------------------------------------------------------------

  private void finishBody() {
    closed = true;

    if (!streamProcessing) {
      Object value = parseOwned(buffer.toString());
      storeCommit(buffer.length(), value, false);
      allocPhaseSeq();
      emitChunk(value);
      latestSnapshot = value;
      hasLatestSnapshot = true;
      segmentStart = buffer.length();
      scanAt = buffer.length();
      phaseLines.clear();
      return;
    }

    scanDots(true);
    flushTail();
    if (committedAt == buffer.length()) {
      latestSnapshot = committedSnapshot();
      hasLatestSnapshot = true;
    } else {
      latestSnapshot = parseOwned(buffer.toString());
      storeCommit(buffer.length(), latestSnapshot, false);
      hasLatestSnapshot = true;
    }
  }

  private void scanDots(boolean atEof) {
    if (mergeChunkWindow) {
      scanDotsMerged(atEof);
      return;
    }
    while (scanAt < buffer.length()) {
      CheckpointScan.Line info = CheckpointScan.readLine(buffer, scanAt, atEof);
      if (info == null) break;
      scanAt = info.end();
      String accepted = acceptLine(info.text());
      if (accepted == null) {
        if (!info.consumedNewline() && atEof) break;
        continue;
      }
      phaseLines.add(accepted);
      if (accepted.equals(".")) emitPhase(info.end());
      if (!info.consumedNewline() && atEof) break;
    }
  }

  /** Collects every complete {@code .} currently available, feeds once, emits once. */
  private void scanDotsMerged(boolean atEof) {
    List<CheckpointScan.ClosedPhase> closedPhases = new ArrayList<>();
    // Take ownership; the unclosed remainder is swapped back below.
    List<String> pending = phaseLines;
    phaseLines = new ArrayList<>();
    int start = segmentStart;

    while (scanAt < buffer.length()) {
      CheckpointScan.Line info = CheckpointScan.readLine(buffer, scanAt, atEof);
      if (info == null) break;
      scanAt = info.end();
      String accepted = acceptLine(info.text());
      if (accepted == null) {
        if (!info.consumedNewline() && atEof) break;
        continue;
      }
      pending.add(accepted);
      if (accepted.equals(".")) {
        closedPhases.add(new CheckpointScan.ClosedPhase(start, info.end(), pending));
        pending = new ArrayList<>();
        start = info.end();
      }
      if (!info.consumedNewline() && atEof) break;
    }

    phaseLines = pending;
    segmentStart = start;

    if (closedPhases.isEmpty()) return;
    emitClosedWindow(closedPhases);
  }

  private void emitClosedWindow(List<CheckpointScan.ClosedPhase> closedPhases) {
    int lastEnd = closedPhases.get(closedPhases.size() - 1).end();

    if (cover) {
      for (CheckpointScan.ClosedPhase phase : closedPhases) {
        emitCoverPhase(phase.lines(), phase.start(), phase.end(), false);
      }
      segmentStart = lastEnd;
      return;
    }

    // One seq per physical `.` even when Diff delivery is window-merged.
    for (int i = 0; i < closedPhases.size(); i++) {
      allocPhaseSeq();
    }

    if (history != null) {
      for (CheckpointScan.ClosedPhase phase : closedPhases) {
        List<String> lines = applyAnnotationSpans(phase.lines());
        Object before =
            history.length() > 0
                ? history.peekAfter(history.length() - 1)
                : peekCommit();
        String raw = phaseWire(lines, phase.start(), phase.end());
        boolean hadPriorDot = sawDot;
        feedLiveLines(lines);
        sawDot = hadPriorDot;
        CheckpointDiffBuild.Diff result = buildDiff(raw);
        sawDot = true;
        storeCommit(phase.end(), result.committed(), result.fromLive());
        Object after = peekCommit();
        history.recordOwned(
            ParseHistory.HISTORY_NODE_KIND.DOT,
            phase.start(),
            phase.end(),
            raw,
            before,
            after,
            result.diff());
      }
      segmentStart = lastEnd;
      if (!emitDiff) {
        emitChunk(null);
        return;
      }
      if (closedPhases.size() == 1) {
        emitChunk(history.peekDiff(history.length() - 1));
        return;
      }
      // Clone only when someone will actually receive the chunk.
      emitChunk(onChunk == null ? null : Json.deepClone(peekCommit()));
      return;
    }

    List<String> allLines = new ArrayList<>();
    List<List<String>> appliedPhases = new ArrayList<>(closedPhases.size());
    for (CheckpointScan.ClosedPhase phase : closedPhases) {
      List<String> lines = applyAnnotationSpans(phase.lines());
      appliedPhases.add(lines);
      allLines.addAll(lines);
    }
    boolean sawDotBefore = sawDot;

    feedLiveLines(allLines);
    sawDot = true;
    segmentStart = lastEnd;

    if (!emitDiff) {
      storeCommit(lastEnd, null, true);
      emitChunk(null);
      return;
    }

    if (closedPhases.size() == 1) {
      CheckpointScan.ClosedPhase only = closedPhases.get(0);
      String raw = phaseWire(appliedPhases.get(0), only.start(), only.end());
      sawDot = sawDotBefore;
      CheckpointDiffBuild.Diff result = buildDiff(raw);
      sawDot = true;
      storeCommit(lastEnd, result.committed(), result.fromLive());
      emitChunk(result.diff());
      return;
    }

    storeCommit(lastEnd, null, true);
    emitChunk(onChunk == null ? null : Materialize.materializeSnapshot(live.value()));
  }

  /** @param end exclusive end of the {@code .} line */
  private void emitPhase(int end) {
    int start = segmentStart;
    // Take ownership of the closed phase's lines instead of copying them.
    List<String> taken = phaseLines;
    phaseLines = new ArrayList<>();
    List<String> lines = applyAnnotationSpans(taken);
    String raw = phaseWire(lines, start, end);
    if (cover) {
      emitCoverPhase(lines, start, end, false);
      segmentStart = end;
      return;
    }
    allocPhaseSeq();
    Object before =
        history != null
            ? (history.length() > 0 ? history.peekAfter(history.length() - 1) : peekCommit())
            : null;
    feedLiveLines(lines);
    CheckpointDiffBuild.Diff result = buildDiff(raw);
    sawDot = true;
    segmentStart = end;
    storeCommit(end, result.committed(), result.fromLive());
    if (history != null) {
      history.recordOwned(
          ParseHistory.HISTORY_NODE_KIND.DOT,
          start,
          end,
          raw,
          before,
          peekCommit(),
          result.diff());
    }
    emitChunk(result.diff());
  }

  private void flushTail() {
    if (segmentStart < buffer.length()) {
      int start = segmentStart;
      List<String> taken = phaseLines;
      phaseLines = new ArrayList<>();
      List<String> lines = applyAnnotationSpans(taken);
      String raw = phaseWire(lines, start, buffer.length());
      if (cover) {
        emitCoverPhase(lines, start, buffer.length(), true);
        segmentStart = buffer.length();
        return;
      }
      allocPhaseSeq();
      Object before =
          history != null
              ? (history.length() > 0 ? history.peekAfter(history.length() - 1) : peekCommit())
              : null;
      feedLiveLines(lines);
      CheckpointDiffBuild.Diff result;
      if (!sawDot) {
        if (!emitDiff || CheckpointDiffBuild.isEmptyPhaseWire(raw)) {
          result = new CheckpointDiffBuild.Diff(null, null, true);
        } else {
          result =
              new CheckpointDiffBuild.Diff(
                  Materialize.materializeSnapshot(live.value()), null, true);
        }
      } else {
        result = buildDiff(raw);
      }
      segmentStart = buffer.length();
      storeCommit(buffer.length(), result.committed(), result.fromLive());
      if (history != null) {
        history.recordOwned(
            ParseHistory.HISTORY_NODE_KIND.TAIL,
            start,
            buffer.length(),
            raw,
            before,
            peekCommit(),
            result.diff());
      }
      emitChunk(result.diff());
      return;
    }
    if (!sawDot && buffer.length() == 0) {
      phaseLines.clear();
      storeCommit(0, null, false);
      emitChunk(null);
    }
  }

  private void emitCoverPhase(List<String> lines, int bufferStart, int bufferEnd, boolean isTail) {
    lines = applyAnnotationSpans(lines);
    boolean trailingDot = !lines.isEmpty() && ".".equals(lines.get(lines.size() - 1));
    int bodyLen = trailingDot ? lines.size() - 1 : lines.size();
    List<String> pendingRestore = new ArrayList<>();
    int i = 0;
    boolean any = false;

    while (i < bodyLen) {
      int j = i;
      while (j < bodyLen && !CheckpointCover.isAmpLine(lines.get(j))) j++;

      if (j < bodyLen) {
        List<String> prefix = new ArrayList<>(pendingRestore);
        prefix.addAll(lines.subList(i, j));
        pendingRestore = new ArrayList<>();
        ensureLive();
        if (!prefix.isEmpty()) {
          feedLiveLines(prefix);
        }
        List<String> restore = live.cursorRestoreLines();
        if (!prefix.isEmpty()) {
          feedLiveLines(List.of("."));
          List<String> wireLines = new ArrayList<>(prefix);
          wireLines.add(".");
          emitCoverChunk(wireLines, null, bufferStart, bufferEnd, ParseHistory.HISTORY_NODE_KIND.DOT, false);
          any = true;
        }

        int k = j;
        while (k < bodyLen && CheckpointCover.isAmpLine(lines.get(k))) k++;
        List<String> amps = lines.subList(j, k);
        feedLiveLines(amps);
        Map<String, Object> tombstone = CheckpointCover.buildDeleteTombstone(amps);
        feedLiveLines(List.of("."));
        List<String> ampWire = new ArrayList<>(amps);
        ampWire.add(".");
        emitCoverChunk(ampWire, tombstone, bufferStart, bufferEnd, ParseHistory.HISTORY_NODE_KIND.DOT, false);
        any = true;
        pendingRestore = new ArrayList<>(restore);
        i = k;
        continue;
      }

      List<String> restBody = new ArrayList<>(pendingRestore);
      restBody.addAll(lines.subList(i, bodyLen));
      pendingRestore = new ArrayList<>();
      if (!restBody.isEmpty()) {
        feedLiveLines(restBody);
      }
      if (trailingDot) {
        feedLiveLines(List.of("."));
        List<String> wireLines = new ArrayList<>(restBody);
        wireLines.add(".");
        if (wireLines.isEmpty()) wireLines = List.of(".");
        emitCoverChunk(
            wireLines,
            null,
            bufferStart,
            bufferEnd,
            ParseHistory.HISTORY_NODE_KIND.DOT,
            false);
        any = true;
      } else if (!restBody.isEmpty()) {
        Object committed = Materialize.materializeSnapshot(live.value());
        storeCommit(bufferEnd, committed, false);
        emitCoverChunk(
            restBody,
            null,
            bufferStart,
            bufferEnd,
            isTail ? ParseHistory.HISTORY_NODE_KIND.TAIL : ParseHistory.HISTORY_NODE_KIND.DOT,
            true);
        any = true;
      }
      i = bodyLen;
    }

    if (!pendingRestore.isEmpty()) {
      feedLiveLines(pendingRestore);
      Object committed = Materialize.materializeSnapshot(live.value());
      storeCommit(bufferEnd, committed, false);
      sawDot = true;
    } else if (!any && trailingDot) {
      feedLiveLines(List.of("."));
      sawDot = true;
      storeCommit(bufferEnd, null, true);
      if (history != null) {
        Object tip = history.length() > 0 ? history.peekAfter(history.length() - 1) : peekCommit();
        history.recordOwned(
            ParseHistory.HISTORY_NODE_KIND.DOT,
            bufferStart,
            bufferEnd,
            ".\n",
            tip,
            tip,
            null);
      }
      allocPhaseSeq();
      emitChunk(null);
    } else if (!any && isTail && !lines.isEmpty()) {
      feedLiveLines(lines);
      storeCommit(bufferEnd, null, true);
      allocPhaseSeq();
      emitChunk(emitDiff ? Materialize.materializeSnapshot(live.value()) : null);
    }

    sawDot = sawDot || trailingDot || any;
  }

  private void emitCoverChunk(
      List<String> wireLines,
      Map<String, Object> tombstone,
      int bufferStart,
      int bufferEnd,
      String kind,
      boolean committedDiff) {
    allocPhaseSeq();
    Object before =
        history != null
            ? (history.length() > 0 ? history.peekAfter(history.length() - 1) : peekCommit())
            : null;
    sawDot = true;
    String wire = CheckpointCover.linesToWire(wireLines);
    Object diff = null;
    if (emitDiff) {
      if (tombstone != null) {
        diff = Json.deepClone(tombstone);
        storeCommit(bufferEnd, null, true);
      } else if (committedDiff) {
        diff = Materialize.materializeSnapshot(live.value());
        storeCommit(bufferEnd, null, true);
      } else {
        CheckpointDiffBuild.Diff built = buildDiff(wire);
        diff = built.diff();
        storeCommit(bufferEnd, built.committed(), built.fromLive());
      }
    } else {
      storeCommit(bufferEnd, null, true);
    }
    if (history != null) {
      history.recordOwned(kind, bufferStart, bufferEnd, wire, before, peekCommit(), diff);
    }
    emitChunk(diff);
  }

  private void ensureLive() {
    if (live == null) {
      live = new Parse.LiveXaiopParser(ParseOptions.of(compat, symbolKeys));
    }
  }

  private Object peekCommit() {
    if (commitFromLive && live != null) {
      return Materialize.materializeSnapshot(live.value());
    }
    return committedSnapshot;
  }

  private void feedLiveLines(List<String> lines) {
    ensureLive();
    committedSnapshot = null;
    commitFromLive = true;
    for (String line : lines) {
      live.feedLine(line);
    }
  }

  private CheckpointDiffBuild.Diff buildDiff(String raw) {
    ensureLive();
    return CheckpointDiffBuild.build(emitDiff, sawDot, raw, live, compat, symbolKeys);
  }

  private void storeCommit(int at, Object snapshot, boolean fromLive) {
    committedAt = at;
    commitFromLive = fromLive;
    committedSnapshot = fromLive ? null : snapshot;
  }

  /** Fresh parse; ownership transferred (plain roots are not cloned again). */
  private Object parseOwned(String text) {
    return CheckpointDiffBuild.parseOwned(text, compat, symbolKeys);
  }

  private void rebuildFromHistoryJump(ParseHistory.JumpResult result) {
    int end = result.bufferEnd;
    if (result.wirePrefix != null) {
      buffer.setLength(0);
      buffer.append(result.wirePrefix);
    } else if (end <= buffer.length()) {
      buffer.setLength(end);
    } else {
      buffer.setLength(Math.min(end, buffer.length()));
    }
    live = new Parse.LiveXaiopParser(ParseOptions.of(compat, symbolKeys));
    if (buffer.length() > 0) {
      if (!lineInterceptors.isEmpty()) {
        int at = 0;
        while (at < buffer.length()) {
          CheckpointScan.Line info = CheckpointScan.readLine(buffer, at, true);
          if (info == null) break;
          at = info.end();
          String accepted = acceptLine(info.text());
          if (accepted != null) live.feedLine(accepted);
        }
      } else {
        live.feedText(buffer.toString());
      }
    }
    sawDot = true;
    segmentStart = buffer.length();
    scanAt = buffer.length();
    phaseLines.clear();
    committedAt = buffer.length();
    committedSnapshot = result.after;
    commitFromLive = false;
    latestSnapshot = null;
    hasLatestSnapshot = false;
    closed = false;
  }

  private String acceptLine(String line) {
    if (lineInterceptors.isEmpty()) return line;
    return LineIntercept.runLineInterceptChain(line, lineInterceptors);
  }

  private List<String> applyAnnotationSpans(List<String> lines) {
    if (annotationSpanHandlers.isEmpty()) return lines;
    AnnotationSpan.Result result =
        AnnotationSpan.applyAnnotationSpans(lines, annotationSpanHandlers);
    if (!result.escapePaths().isEmpty()) {
      pendingTypeCheckEscape.addAll(result.escapePaths());
    }
    return result.lines();
  }

  private String phaseWire(List<String> lines, int bufferStart, int bufferEnd) {
    if (!lineInterceptors.isEmpty() || !annotationSpanHandlers.isEmpty()) {
      return CheckpointCover.linesToWire(lines);
    }
    return buffer.substring(bufferStart, bufferEnd);
  }

  private Integer allocPhaseSeq() {
    if (!phaseSeqEnabled) return null;
    phaseSeq += 1;
    pendingSeqs.add(phaseSeq);
    if (!logSeqQueue.isEmpty()) {
      pendingLogSeqs.add(logSeqQueue.remove(0));
    }
    return phaseSeq;
  }

  private void emitChunk(Object diff) {
    if (onChunk == null) {
      // No consumer: drain pending state without building the copies.
      pendingTypeCheckEscape.clear();
      pendingSeqs.clear();
      pendingLogSeqs.clear();
      return;
    }
    List<String> escapes = new ArrayList<>(pendingTypeCheckEscape);
    pendingTypeCheckEscape.clear();
    List<Integer> seqs = new ArrayList<>(pendingSeqs);
    pendingSeqs.clear();
    List<Integer> logSeqs = new ArrayList<>(pendingLogSeqs);
    pendingLogSeqs.clear();

    List<String> uniqueEscapes = escapes.isEmpty() ? null : uniqueEscape(escapes);
    Integer seq = seqs.isEmpty() ? null : seqs.get(seqs.size() - 1);
    Integer logSeq = logSeqs.isEmpty() ? null : logSeqs.get(logSeqs.size() - 1);
    ChunkMeta meta =
        new ChunkMeta(
            uniqueEscapes,
            seq,
            seqs.isEmpty() ? null : List.copyOf(seqs),
            logSeq,
            logSeqs.isEmpty() ? null : List.copyOf(logSeqs));
    if (meta.isEmpty()) {
      onChunk.accept(diff, null);
    } else {
      onChunk.accept(diff, meta);
    }
  }

  // --- async plumbing --------------------------------------------------------

  private CompletableFuture<Void> scheduleAsyncDrain() {
    return async.scheduleDrain(
        this,
        () -> {
          if (!closed && streamProcessing) scanDots(false);
        });
  }

  private void cancelPendingAsyncDrain() {
    async.cancelPending();
  }

  private static List<String> uniqueEscape(List<String> paths) {
    Set<String> seen = new LinkedHashSet<>(paths);
    return new ArrayList<>(seen);
  }

  /** Hooks / tuning for {@link DotCheckpointEngine}. */
  public static final class Options {
    private Object compat;
    private boolean symbolKeys;
    private boolean streamProcessing = true;
    private BiConsumer<Object, ChunkMeta> onChunk;
    private boolean emitDiff = true;
    private boolean mergeChunkWindow = true;
    private boolean cover;
    private boolean historySnapshot;
    private boolean historyRealtime;
    private boolean retainWireHistory = true;
    private boolean phaseSeq = true;
    private List<LineIntercept.Handler> lineIntercept;
    private List<AnnotationSpan.Handler> annotationSpan;

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

    /** Decode U+001F label escapes (default {@code false}; pair with encode {@code symbolKeys}). */
    public Options symbolKeys(boolean enabled) {
      this.symbolKeys = enabled;
      return this;
    }

    /** {@code false} defers everything to {@code finish} (one chunk, whole document). */
    public Options streamProcessing(boolean enabled) {
      this.streamProcessing = enabled;
      return this;
    }

    /**
     * Receives the phase Diff (or {@code null} for an empty phase). Optional — omitted / {@code
     * null} → Diff delivery no-ops (Commit still runs).
     */
    public Options onChunk(Consumer<Object> sink) {
      this.onChunk = sink == null ? null : (diff, meta) -> sink.accept(diff);
      return this;
    }

    /** Same as {@link #onChunk(Consumer)} but also receives seq / escape metadata when present. */
    public Options onChunkWithMeta(BiConsumer<Object, ChunkMeta> sink) {
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

    /** Cover-mode Diff for {@code &} (default {@code false}). */
    public Options cover(boolean enabled) {
      this.cover = enabled;
      return this;
    }

    /** Opt-in read-only history (default {@code false}). */
    public Options historySnapshot(boolean enabled) {
      this.historySnapshot = enabled;
      return this;
    }

    /** Opt-in realtime forward-jump history (default {@code false}). */
    public Options historyRealtime(boolean enabled) {
      this.historyRealtime = enabled;
      return this;
    }

    /** Retain per-node wire when history on (default {@code true}). */
    public Options retainWireHistory(boolean enabled) {
      this.retainWireHistory = enabled;
      return this;
    }

    /** Allocate monotonic phase seq in onChunk meta (default {@code true}). */
    public Options phaseSeq(boolean enabled) {
      this.phaseSeq = enabled;
      return this;
    }

    /** Initial line interceptors (registration order). */
    public Options lineIntercept(LineIntercept.Handler... handlers) {
      if (handlers == null || handlers.length == 0) {
        this.lineIntercept = null;
      } else {
        this.lineIntercept = List.of(handlers);
      }
      return this;
    }

    public Options lineIntercept(List<LineIntercept.Handler> handlers) {
      this.lineIntercept = handlers;
      return this;
    }

    /** Initial annotation-span handlers (registration order). */
    public Options annotationSpan(AnnotationSpan.Handler... handlers) {
      if (handlers == null || handlers.length == 0) {
        this.annotationSpan = null;
      } else {
        this.annotationSpan = List.of(handlers);
      }
      return this;
    }

    public Options annotationSpan(List<AnnotationSpan.Handler> handlers) {
      this.annotationSpan = handlers;
      return this;
    }

    public DotCheckpointEngine build() {
      return new DotCheckpointEngine(this);
    }
  }
}
