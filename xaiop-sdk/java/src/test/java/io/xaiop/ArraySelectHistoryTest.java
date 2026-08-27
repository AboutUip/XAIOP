package io.xaiop;

import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.LineKind;
import io.xaiop.stream.ParseHistory;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.Transport;
import io.xaiop.stream.XaiopStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Protocol 0.7 Draft — {@code ?} select + bare {@code &} × history / jumpTo / cover / stream. */
class ArraySelectHistoryTest {

  private static final String SEED =
      ">\n>orders-\n>\nid:A1\nstatus:pending\n<\n>\nid:A2\nstatus:pending\n<\n>\nid:A3\nstatus:done\n.\n";
  private static final String SELECT_A2 = "@orders\n?id:A2\nstatus:shipped\n.\n";
  private static final String SPLICE_A1 = "@orders\n?id:A1\n&\n.\n";
  private static final String STAR_SHIPPED = "@orders\n?*status:shipped\nchecked:true\n.\n";
  private static final String LOCATE_SELECT = "=orders\n?1\nnote:ok\n.\n";
  private static final String FULL = SEED + SELECT_A2 + SPLICE_A1;

  private static Map<String, Object> afterSeed() {
    return map(
        "orders",
        list(
            map("id", "A1", "status", "pending"),
            map("id", "A2", "status", "pending"),
            map("id", "A3", "status", "done")));
  }

  private static Map<String, Object> afterSelect() {
    return map(
        "orders",
        list(
            map("id", "A1", "status", "pending"),
            map("id", "A2", "status", "shipped"),
            map("id", "A3", "status", "done")));
  }

  private static Map<String, Object> afterSplice() {
    return map(
        "orders",
        list(map("id", "A2", "status", "shipped"), map("id", "A3", "status", "done")));
  }

  private static Map<String, Object> afterIntercept() {
    return map(
        "orders",
        list(
            map("id", "A1", "status", "shipped"),
            map("id", "A2", "status", "pending"),
            map("id", "A3", "status", "done")));
  }

  private static Map<String, Object> afterStar() {
    return map(
        "orders",
        list(
            map("id", "A1", "status", "pending"),
            map("id", "A2", "status", "shipped", "checked", true),
            map("id", "A3", "status", "done")));
  }

  private static final class Eng {
    final DotCheckpointEngine engine;
    final List<Object> chunks;

    Eng(DotCheckpointEngine engine, List<Object> chunks) {
      this.engine = engine;
      this.chunks = chunks;
    }
  }

  private static Eng makeEngine(DotCheckpointEngine.Options extra) {
    return makeEngine(extra, false);
  }

  private static Eng makeEngine(DotCheckpointEngine.Options extra, boolean mergeChunkWindow) {
    List<Object> chunks = new ArrayList<>();
    extra.streamProcessing(true).mergeChunkWindow(mergeChunkWindow).onChunk(chunks::add);
    return new Eng(extra.build(), chunks);
  }

  private static Eng snap() {
    return makeEngine(DotCheckpointEngine.Options.builder().historySnapshot(true));
  }

  private static void waitStatus(XaiopStream stream, StreamStatus want) throws Exception {
    long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
    while (stream.status() != want) {
      if (stream.status() == StreamStatus.ERROR) {
        throw new AssertionError("stream error", stream.lastError());
      }
      if (System.nanoTime() > deadline) {
        throw new AssertionError("timeout waiting for " + want + ", got " + stream.status());
      }
      Thread.sleep(4);
    }
  }

  @Test
  void snapshotAfterTrees() {
    Eng e = snap();
    e.engine.push(FULL);
    ParseHistory h = e.engine.history();
    assertEquals(3, h.length());
    assertEquals(afterSeed(), h.getAfter(0));
    assertEquals(afterSelect(), h.getAfter(1));
    assertEquals(afterSplice(), h.getAfter(2));
    assertEquals(afterSeed(), h.getBefore(1));
    ParseHistory.CompareResult cmp = h.compare(0, 2);
    assertEquals(afterSeed(), cmp.a);
    assertEquals(afterSplice(), cmp.b);
    assertEquals(afterSelect(), h.viewRange(0, 1).json);
  }

  @Test
  void viewRangeWithoutWire() {
    Eng e =
        makeEngine(
            DotCheckpointEngine.Options.builder()
                .historySnapshot(true)
                .retainWireHistory(false));
    e.engine.push(FULL);
    assertNull(e.engine.history().getNode(1).wire);
    assertEquals(afterSelect(), e.engine.history().viewRange(0, 1).json);
  }

  @Test
  void emitDiffFalseStillRecordsAfter() {
    Eng e =
        makeEngine(
            DotCheckpointEngine.Options.builder().historySnapshot(true).emitDiff(false));
    e.engine.push(FULL);
    assertEquals(afterSplice(), e.engine.history().getAfter(2));
    assertTrue(e.chunks.stream().allMatch(d -> d == null));
    assertNull(e.engine.history().getDiff(1));
  }

  @Test
  void compatTrueStrictSelectTrees() {
    Eng e =
        makeEngine(DotCheckpointEngine.Options.builder().historySnapshot(true).compat(true));
    e.engine.push(FULL);
    assertEquals(afterSplice(), e.engine.history().getAfter(2));
  }

  @Test
  void eofTailOpenSelect() {
    Eng e = snap();
    e.engine.push(SEED + "@orders\n?id:A2\nstatus:shipped\n");
    e.engine.finish();
    List<ParseHistory.HistoryNode> root = e.engine.history().exportTimeRoot();
    assertEquals(ParseHistory.HISTORY_NODE_KIND.DOT, root.get(0).kind);
    assertEquals(ParseHistory.HISTORY_NODE_KIND.TAIL, root.get(1).kind);
    assertEquals(afterSelect(), root.get(1).after);
  }

  @Test
  void jumpToBeforeSpliceThenContinue() {
    Eng e =
        makeEngine(
            DotCheckpointEngine.Options.builder()
                .historySnapshot(true)
                .historyRealtime(true));
    e.engine.push(FULL);
    ParseHistory h = e.engine.history();
    assertEquals(-1, h.liveCursor());
    assertTrue(h.canJumpTo(1));
    ParseHistory.JumpResult jumped = e.engine.jumpTo(1);
    assertEquals(2, jumped.kept);
    assertEquals(1, jumped.discarded);
    assertEquals(afterSelect(), jumped.after);
    assertEquals(2, h.length());
    assertEquals(1, h.liveCursor());
    assertEquals(afterSelect(), e.engine.committedSnapshot());
    assertFalse(h.canJumpTo(1));
    assertThrows(IndexOutOfBoundsException.class, () -> e.engine.jumpTo(0));
    e.engine.push(STAR_SHIPPED);
    assertEquals(3, h.length());
    assertEquals(afterStar(), h.getAfter(2));
  }

  @Test
  void jumpToSeedThenMatchingSelect() {
    Eng e = makeEngine(DotCheckpointEngine.Options.builder().historyRealtime(true));
    e.engine.push(FULL);
    e.engine.jumpTo(0);
    assertEquals(afterSeed(), e.engine.committedSnapshot());
    e.engine.push(SELECT_A2);
    assertEquals(afterSelect(), e.engine.history().getAfter(1));
  }

  @Test
  void jumpToSeedThenUnmatchedStar() {
    Eng e = makeEngine(DotCheckpointEngine.Options.builder().historyRealtime(true));
    e.engine.push(FULL);
    e.engine.jumpTo(0);
    XaiopSyntaxError ex =
        assertThrows(XaiopSyntaxError.class, () -> e.engine.push(STAR_SHIPPED));
    assertTrue(ex.getMessage().contains("matched no array elements"));
    assertEquals(afterSeed(), e.engine.history().getAfter(0));
  }

  @Test
  void retainWireFalseJumpRebuild() {
    Eng e =
        makeEngine(
            DotCheckpointEngine.Options.builder()
                .historySnapshot(true)
                .historyRealtime(true)
                .retainWireHistory(false));
    e.engine.push(FULL);
    ParseHistory.JumpResult jumped = e.engine.jumpTo(1);
    assertNull(jumped.wirePrefix);
    assertEquals(afterSelect(), e.engine.committedSnapshot());
    e.engine.push(STAR_SHIPPED);
    assertEquals(afterStar(), e.engine.history().getAfter(2));
  }

  @Test
  void jumpAfterFinishReopens() {
    Eng e = makeEngine(DotCheckpointEngine.Options.builder().historyRealtime(true));
    e.engine.push(FULL);
    e.engine.finish();
    e.engine.jumpTo(1);
    e.engine.push(STAR_SHIPPED);
    assertEquals(afterStar(), e.engine.history().getAfter(2));
  }

  @Test
  void interceptRewriteReappliedOnJump() {
    Eng e =
        makeEngine(
            DotCheckpointEngine.Options.builder()
                .historySnapshot(true)
                .historyRealtime(true)
                .lineIntercept(
                    ctx ->
                        LineKind.SELECT.equals(ctx.view().kind())
                                && "id:A2".equals(ctx.view().path())
                            ? "?id:A1"
                            : ctx.raw()));
    e.engine.push(SEED + SELECT_A2 + SPLICE_A1);
    assertEquals(afterIntercept(), e.engine.history().getAfter(1));
    e.engine.jumpTo(1);
    assertEquals(afterIntercept(), e.engine.committedSnapshot());
    e.engine.push("@orders\n?id:A3\nnote:x\n.\n");
    assertEquals(
        map(
            "orders",
            list(
                map("id", "A1", "status", "shipped"),
                map("id", "A2", "status", "pending"),
                map("id", "A3", "status", "done", "note", "x"))),
        e.engine.history().getAfter(2));
  }

  @Test
  void skipSelectWritesAtArrayLevel() {
    Eng e =
        makeEngine(
            DotCheckpointEngine.Options.builder()
                .historySnapshot(true)
                .lineIntercept(
                    ctx -> LineKind.SELECT.equals(ctx.view().kind()) ? null : ctx.raw()));
    e.engine.push(SEED + SELECT_A2);
    assertEquals(
        map(
            "orders",
            list(
                map("id", "A1", "status", "pending"),
                map("id", "A2", "status", "pending"),
                map("id", "A3", "status", "done"),
                map("status", "shipped"))),
        e.engine.history().getAfter(1));
  }

  @Test
  void mergeChunkWindowOneChunkThreeNodes() {
    Eng e = makeEngine(DotCheckpointEngine.Options.builder().historySnapshot(true), true);
    e.engine.push(FULL);
    assertEquals(3, e.engine.history().length());
    assertEquals(1, e.chunks.size());
    assertEquals(afterSplice(), e.engine.history().getAfter(2));
  }

  @Test
  void charChunkedPredicate() {
    Eng e = snap();
    e.engine.push(SEED);
    for (int i = 0; i < SELECT_A2.length(); i++) {
      e.engine.push(SELECT_A2.substring(i, i + 1));
    }
    assertEquals(afterSelect(), e.engine.history().getAfter(1));
  }

  @Test
  void coverPathDeleteAfterSelect() {
    String wire = SEED + SELECT_A2 + "&orders\n.\n";
    Eng e = makeEngine(DotCheckpointEngine.Options.builder().cover(true).historySnapshot(true));
    e.engine.push(wire);
    e.engine.finish();
    assertEquals(Parse.parse(wire), e.engine.snapshot());
    assertEquals(map(), e.engine.snapshot());
  }

  @Test
  void coverCannotRestoreSelectCursorBeforeBareAmp() {
    Eng e = makeEngine(DotCheckpointEngine.Options.builder().cover(true).historySnapshot(true));
    XaiopSyntaxError ex =
        assertThrows(XaiopSyntaxError.class, () -> e.engine.push(SEED + SPLICE_A1));
    assertTrue(ex.getMessage().contains("cannot restore Cursor after ."));
  }

  @Test
  void failedLaterSelectKeepsPriorNode() {
    Eng e = snap();
    e.engine.push(SEED);
    assertThrows(XaiopSyntaxError.class, () -> e.engine.push("@orders\n?99\n.\n"));
    assertEquals(1, e.engine.history().length());
    assertEquals(afterSeed(), e.engine.history().getAfter(0));
  }

  @Test
  void compactCommittedRefusesUntilDrop() {
    Eng e = snap();
    e.engine.push(FULL);
    IllegalStateException ex =
        assertThrows(IllegalStateException.class, e.engine::compactCommitted);
    assertTrue(ex.getMessage().contains("history") || ex.getMessage().contains("indices"));
    e.engine.compactCommitted(true);
    assertEquals(0, e.engine.history().length());
    assertEquals(afterSplice(), e.engine.committedSnapshot());
  }

  @Test
  void locateThenSelectLaterPhase() {
    Eng e = snap();
    e.engine.push(SEED + LOCATE_SELECT);
    assertEquals(
        map(
            "orders",
            list(
                map("id", "A1", "status", "pending"),
                map("id", "A2", "status", "pending", "note", "ok"),
                map("id", "A3", "status", "done"))),
        e.engine.history().getAfter(1));
  }

  @Test
  void streamJumpToSelectWrite() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://select-hist",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .historySnapshot(true)
                .historyRealtime(true));
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(FULL));
    waitStatus(stream, StreamStatus.COMPLETED);
    ParseHistory h = stream.history();
    assertEquals(3, h.length());
    assertEquals(afterSplice(), h.getAfter(2));
    ParseHistory.JumpResult jumped = stream.jumpTo(1);
    assertEquals(2, jumped.kept);
    assertEquals(afterSelect(), stream.getCommittedSnapshot());
    assertEquals(2, stream.history().length());
  }
}
