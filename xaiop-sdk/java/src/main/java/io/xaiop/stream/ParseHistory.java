package io.xaiop.stream;

import io.xaiop.Json;
import io.xaiop.Parse;
import io.xaiop.ParseOptions;
import io.xaiop.compat.Compat;
import io.xaiop.compat.CompatFixId;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Optional parse-chain history (flight recorder) for {@code .} phase boundaries.
 *
 * <p>Two independent modes (both default <b>off</b>):
 *
 * <ul>
 *   <li><b>Snapshot</b> — read-only cursor: export time-root, range view, compare, URL lifecycle.
 *   <li><b>Realtime</b> — live jump: keep positioning node, permanently discard everything after.
 * </ul>
 *
 * <p>Both may be enabled together. Faithful port of the Node.js SDK's {@code history.js}.
 */
public final class ParseHistory {
  /** Node kind constants ({@code "dot"} / {@code "tail"}). */
  public static final class HISTORY_NODE_KIND {
    public static final String DOT = "dot";
    public static final String TAIL = "tail";

    private HISTORY_NODE_KIND() {}
  }

  /** One recorded phase-boundary node. */
  public static final class HistoryNode {
    public final int index;
    public final String kind;
    public final int bufferStart;
    public final int bufferEnd;
    public final String wire;
    public final Object before;
    public final Object after;
    public final Object diff;

    HistoryNode(
        int index,
        String kind,
        int bufferStart,
        int bufferEnd,
        String wire,
        Object before,
        Object after,
        Object diff) {
      this.index = index;
      this.kind = kind;
      this.bufferStart = bufferStart;
      this.bufferEnd = bufferEnd;
      this.wire = wire;
      this.before = before;
      this.after = after;
      this.diff = diff;
    }
  }

  /** Snapshot of history counters (safe to log / UI). */
  public static final class Info {
    public final boolean snapshot;
    public final boolean realtime;
    public final int length;
    public final int liveCursor;
    public final String sourceKey;
    public final boolean hasRangeView;
    public final RangeBounds rangeView;

    public Info(
        boolean snapshot,
        boolean realtime,
        int length,
        int liveCursor,
        String sourceKey,
        boolean hasRangeView,
        RangeBounds rangeView) {
      this.snapshot = snapshot;
      this.realtime = realtime;
      this.length = length;
      this.liveCursor = liveCursor;
      this.sourceKey = sourceKey;
      this.hasRangeView = hasRangeView;
      this.rangeView = rangeView;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) return true;
      if (!(o instanceof Info other)) return false;
      return snapshot == other.snapshot
          && realtime == other.realtime
          && length == other.length
          && liveCursor == other.liveCursor
          && hasRangeView == other.hasRangeView
          && Objects.equals(sourceKey, other.sourceKey)
          && Objects.equals(rangeView, other.rangeView);
    }

    @Override
    public int hashCode() {
      return Objects.hash(snapshot, realtime, length, liveCursor, sourceKey, hasRangeView, rangeView);
    }
  }

  /** Inclusive range bounds ({@code from}/{@code to}). */
  public static final class RangeBounds {
    public final int from;
    public final int to;

    public RangeBounds(int from, int to) {
      this.from = from;
      this.to = to;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) return true;
      if (!(o instanceof RangeBounds other)) return false;
      return from == other.from && to == other.to;
    }

    @Override
    public int hashCode() {
      return Objects.hash(from, to);
    }
  }

  /** Result of {@link #viewRange(int, int)}. */
  public static final class RangeView {
    public final int from;
    public final int to;
    public final List<HistoryNode> nodes;
    public final Object json;

    public RangeView(int from, int to, List<HistoryNode> nodes, Object json) {
      this.from = from;
      this.to = to;
      this.nodes = nodes;
      this.json = json;
    }
  }

  /** Result of {@link #compare(int, int)}. */
  public static final class CompareResult {
    public final int indexA;
    public final int indexB;
    public final Object a;
    public final Object b;

    public CompareResult(int indexA, int indexB, Object a, Object b) {
      this.indexA = indexA;
      this.indexB = indexB;
      this.a = a;
      this.b = b;
    }
  }

  /** Result of {@link #setSource(String)}. */
  public static final class SetSourceResult {
    public final boolean released;
    public final String previous;

    public SetSourceResult(boolean released, String previous) {
      this.released = released;
      this.previous = previous;
    }

    @Override
    public boolean equals(Object o) {
      if (this == o) return true;
      if (!(o instanceof SetSourceResult other)) return false;
      return released == other.released && Objects.equals(previous, other.previous);
    }

    @Override
    public int hashCode() {
      return Objects.hash(released, previous);
    }
  }

  /** Result of {@link #jumpTo(int)}. */
  public static final class JumpResult {
    public final int index;
    public final int kept;
    public final int discarded;
    public final Object after;
    public final int bufferEnd;
    public final String wirePrefix;

    public JumpResult(
        int index, int kept, int discarded, Object after, int bufferEnd, String wirePrefix) {
      this.index = index;
      this.kept = kept;
      this.discarded = discarded;
      this.after = after;
      this.bufferEnd = bufferEnd;
      this.wirePrefix = wirePrefix;
    }
  }

  private final boolean snapshot;
  private final boolean realtime;
  private final boolean retainWire;
  private final Map<CompatFixId, Boolean> compat;

  private final List<HistoryNode> nodes = new ArrayList<>();
  private int liveCursor = -1;
  private String sourceKey;
  private RangeViewCache rangeView;

  public ParseHistory() {
    this(false, false, true, false);
  }

  public ParseHistory(boolean snapshot, boolean realtime) {
    this(snapshot, realtime, true, false);
  }

  public ParseHistory(boolean snapshot, boolean realtime, boolean retainWire, Object compat) {
    this.snapshot = snapshot;
    this.realtime = realtime;
    this.retainWire = retainWire;
    this.compat = Compat.resolveCompatOptions(compat);
  }

  /** True when either mode is on. */
  public boolean enabled() {
    return snapshot || realtime;
  }

  public boolean snapshotEnabled() {
    return snapshot;
  }

  public boolean realtimeEnabled() {
    return realtime;
  }

  /** Whether per-node wire text is retained (for {@code jumpTo} rebuild). */
  public boolean retainWireEnabled() {
    return retainWire;
  }

  public int length() {
    return nodes.size();
  }

  /**
   * Drop all history nodes and range view (e.g. before {@code compactCommitted}). Modes stay as
   * constructed.
   */
  public ParseHistory clear() {
    nodes.clear();
    liveCursor = -1;
    rangeView = null;
    return this;
  }

  /** Realtime head index ({@code -1} before any jump). */
  public int liveCursor() {
    return liveCursor;
  }

  public String sourceKey() {
    return sourceKey;
  }

  /** Anytime info snapshot (safe to log / UI). */
  public Info info() {
    return new Info(
        snapshot,
        realtime,
        nodes.size(),
        liveCursor,
        sourceKey,
        rangeView != null,
        rangeView != null ? new RangeBounds(rangeView.from, rangeView.to) : null);
  }

  /**
   * Append a phase-boundary record. No-op when both modes are off.
   *
   * @return the recorded node, or {@code null} when disabled
   */
  public HistoryNode record(
      String kind,
      int bufferStart,
      int bufferEnd,
      String wire,
      Object before,
      Object after,
      Object diff) {
    if (!enabled()) return null;
    int index = nodes.size();
    String nodeKind = HISTORY_NODE_KIND.TAIL.equals(kind) ? HISTORY_NODE_KIND.TAIL : HISTORY_NODE_KIND.DOT;
    HistoryNode node =
        new HistoryNode(
            index,
            nodeKind,
            bufferStart,
            bufferEnd,
            retainWire ? (wire != null ? wire : null) : null,
            Json.deepClone(before),
            Json.deepClone(after),
            Json.deepClone(diff));
    nodes.add(node);
    invalidateRangeIfNeeded();
    return node;
  }

  /** Snapshot: export the full node array as a <b>time root</b> (deep clone). */
  public List<HistoryNode> exportTimeRoot() {
    requireSnapshot("exportTimeRoot");
    List<HistoryNode> out = new ArrayList<>(nodes.size());
    for (HistoryNode n : nodes) out.add(cloneNode(n));
    return out;
  }

  public HistoryNode getNode(int index) {
    return cloneNode(nodeAt(index));
  }

  public Object getDiff(int index) {
    return Json.deepClone(nodeAt(index).diff);
  }

  public Object getBefore(int index) {
    return Json.deepClone(nodeAt(index).before);
  }

  public Object getAfter(int index) {
    return Json.deepClone(nodeAt(index).after);
  }

  /** Snapshot: read-only compare of {@code after} trees at two indices. */
  public CompareResult compare(int indexA, int indexB) {
    requireSnapshot("compare");
    return new CompareResult(indexA, indexB, getAfter(indexA), getAfter(indexB));
  }

  /**
   * Snapshot: maintain a read-only view over {@code [from, to]} (inclusive). Re-parses concatenated
   * retained wire when available; otherwise uses {@code after} of {@code to}.
   */
  public RangeView viewRange(int from, int to) {
    requireSnapshot("viewRange");
    int a = normalizeIndex(from);
    int b = normalizeIndex(to);
    if (a > b) {
      throw new IndexOutOfBoundsException("viewRange: from (" + from + ") > to (" + to + ")");
    }
    if (rangeView != null && rangeView.from == a && rangeView.to == b) {
      return new RangeView(
          a,
          b,
          cloneNodes(rangeView.nodes),
          Json.deepClone(rangeView.json));
    }

    List<HistoryNode> slice = nodes.subList(a, b + 1);
    List<HistoryNode> cloned = cloneNodes(slice);
    Object json;
    boolean allWire = true;
    StringBuilder text = new StringBuilder();
    for (HistoryNode n : slice) {
      if (n.wire == null) {
        allWire = false;
        break;
      }
      text.append(n.wire);
    }
    if (allWire && !slice.isEmpty()) {
      json =
          Materialize.materializeSnapshot(
              Parse.parse(text.toString(), ParseOptions.of(compat, false)));
    } else {
      json = Json.deepClone(slice.get(slice.size() - 1).after);
    }
    rangeView = new RangeViewCache(a, b, cloned, json);
    return new RangeView(a, b, cloneNodes(cloned), Json.deepClone(json));
  }

  /**
   * Snapshot lifecycle: bind a source key (e.g. stream URL). A <b>different</b> key releases retained
   * nodes + range view.
   */
  public SetSourceResult setSource(String key) {
    requireSnapshot("setSource");
    String next = (key == null || key.isEmpty()) ? null : key;
    String previous = sourceKey;
    if (previous != null && next != null && !previous.equals(next)) {
      releaseSnapshotData();
      sourceKey = next;
      return new SetSourceResult(true, previous);
    }
    if (previous != null && next == null) {
      releaseSnapshotData();
      sourceKey = null;
      return new SetSourceResult(true, previous);
    }
    sourceKey = next;
    return new SetSourceResult(false, previous);
  }

  /** Clear range view and all recorded nodes (snapshot release). */
  public void release() {
    requireSnapshot("release");
    releaseSnapshotData();
    sourceKey = null;
  }

  /**
   * Realtime: jump live head forward to {@code index}. Keeps nodes {@code [0..index]}; discards
   * everything after. Requires {@code index > liveCursor} (forward-only).
   */
  public JumpResult jumpTo(int index) {
    requireRealtime("jumpTo");
    int i = normalizeIndex(index);
    if (i <= liveCursor) {
      throw new IndexOutOfBoundsException(
          "realtime jumpTo only moves forward (index "
              + i
              + " <= liveCursor "
              + liveCursor
              + ")");
    }
    int discarded = nodes.size() - (i + 1);
    List<HistoryNode> keptNodes = new ArrayList<>(nodes.subList(0, i + 1));
    nodes.clear();
    nodes.addAll(keptNodes);
    liveCursor = i;
    rangeView = null;

    HistoryNode tip = keptNodes.get(i);
    String wirePrefix = null;
    if (retainWire) {
      boolean all = true;
      StringBuilder sb = new StringBuilder();
      for (HistoryNode n : keptNodes) {
        if (n.wire == null) {
          all = false;
          break;
        }
        sb.append(n.wire);
      }
      if (all) wirePrefix = sb.toString();
    }

    return new JumpResult(
        i,
        keptNodes.size(),
        Math.max(0, discarded),
        Json.deepClone(tip.after),
        tip.bufferEnd,
        wirePrefix);
  }

  public boolean canJumpTo(int index) {
    if (!realtime) return false;
    if (index < 0 || index >= nodes.size()) return false;
    return index > liveCursor;
  }

  private void requireSnapshot(String api) {
    if (!snapshot) {
      throw new IllegalStateException("ParseHistory." + api + " requires snapshot mode");
    }
  }

  private void requireRealtime(String api) {
    if (!realtime) {
      throw new IllegalStateException("ParseHistory." + api + " requires realtime mode");
    }
  }

  private int normalizeIndex(int index) {
    if (index < 0 || index >= nodes.size()) {
      throw new IndexOutOfBoundsException(
          "history index out of range: " + index + " (length " + nodes.size() + ")");
    }
    return index;
  }

  private HistoryNode nodeAt(int index) {
    return nodes.get(normalizeIndex(index));
  }

  private void releaseSnapshotData() {
    nodes.clear();
    liveCursor = -1;
    rangeView = null;
  }

  private void invalidateRangeIfNeeded() {
    if (rangeView == null) return;
    if (rangeView.to >= nodes.size()) {
      rangeView = null;
    }
  }

  private static HistoryNode cloneNode(HistoryNode n) {
    return new HistoryNode(
        n.index,
        n.kind,
        n.bufferStart,
        n.bufferEnd,
        n.wire,
        Json.deepClone(n.before),
        Json.deepClone(n.after),
        Json.deepClone(n.diff));
  }

  private static List<HistoryNode> cloneNodes(List<HistoryNode> list) {
    List<HistoryNode> out = new ArrayList<>(list.size());
    for (HistoryNode n : list) out.add(cloneNode(n));
    return out;
  }

  private static final class RangeViewCache {
    final int from;
    final int to;
    final List<HistoryNode> nodes;
    final Object json;

    RangeViewCache(int from, int to, List<HistoryNode> nodes, Object json) {
      this.from = from;
      this.to = to;
      this.nodes = nodes;
      this.json = json;
    }
  }
}
