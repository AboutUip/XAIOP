package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.ParseHistory;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Port of Node {@code history.test.js} — key snapshot / realtime cases. */
class HistoryTest {

  private static final String THREE_PHASES = ">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n";

  private static final class Eng {
    final DotCheckpointEngine engine;
    final List<Object> chunks;

    Eng(DotCheckpointEngine engine, List<Object> chunks) {
      this.engine = engine;
      this.chunks = chunks;
    }
  }

  private static Eng makeEngine(boolean merge, boolean snap, boolean realtime) {
    return makeEngine(merge, snap, realtime, true);
  }

  private static Eng makeEngine(boolean merge, boolean snap, boolean realtime, boolean retainWire) {
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(merge)
            .historySnapshot(snap)
            .historyRealtime(realtime)
            .retainWireHistory(retainWire)
            .onChunk(chunks::add)
            .build();
    return new Eng(engine, chunks);
  }

  @Test
  void historyOffUnlessSnapshotOrRealtime() {
    ParseHistory h = new ParseHistory();
    assertFalse(h.enabled());
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.builder().streamProcessing(true).onChunk(d -> {}).build();
    assertNull(engine.history());
  }

  @Test
  void enabledWhenOnlySnapshotOrRealtime() {
    assertTrue(new ParseHistory(true, false).enabled());
    assertTrue(new ParseHistory(false, true).enabled());
    assertTrue(new ParseHistory(true, true).enabled());
  }

  @Test
  void recordIsNoOpWhileDisabled() {
    ParseHistory h = new ParseHistory();
    assertNull(
        h.record(
            ParseHistory.HISTORY_NODE_KIND.DOT, 0, 4, ">\n.\n", null, Map.of("a", 1), Map.of("a", 1)));
    assertEquals(0, h.length());
  }

  @Test
  void historyInfoAllOffShape() {
    Eng e = makeEngine(true, false, false);
    assertEquals(new ParseHistory.Info(false, false, 0, -1, null, false, null), e.engine.historyInfo());
  }

  @Test
  void historyInfoLiveCounters() {
    Eng e = makeEngine(false, true, false);
    e.engine.push(THREE_PHASES);
    assertEquals(
        new ParseHistory.Info(true, false, 3, -1, null, false, null), e.engine.historyInfo());
  }

  @Test
  void modeGatesThrow() {
    ParseHistory snapOnly = new ParseHistory(true, false);
    assertThrows(IllegalStateException.class, () -> snapOnly.jumpTo(0));
    ParseHistory liveOnly = new ParseHistory(false, true);
    assertThrows(IllegalStateException.class, () -> liveOnly.exportTimeRoot());
    assertThrows(IllegalStateException.class, () -> liveOnly.compare(0, 0));
    assertThrows(IllegalStateException.class, () -> liveOnly.viewRange(0, 0));
  }

  @Test
  void engineJumpToRequiresRealtime() {
    Eng e = makeEngine(false, true, false);
    e.engine.push(">\na:1\n.\n");
    assertThrows(IllegalStateException.class, () -> e.engine.jumpTo(0));
  }

  @Test
  void recordsPerDotUnderWindowMerge() {
    Eng e = makeEngine(true, true, false);
    e.engine.push(THREE_PHASES);
    e.engine.finish();
    ParseHistory h = e.engine.history();
    assertNotNull(h);
    assertEquals(3, h.length());
    assertEquals(ParseHistory.HISTORY_NODE_KIND.DOT, h.getNode(0).kind);
    assertNull(h.getBefore(0));
    assertEquals(Map.of("a", 1), h.getAfter(0));
    assertEquals(Map.of("a", 1), h.getDiff(0));
    assertEquals(Map.of("a", 1, "b", 2), h.getAfter(1));
    assertEquals(Map.of("a", 1, "b", 2, "c", 3), h.getAfter(2));
    assertEquals(1, e.chunks.size());
    assertEquals(Map.of("a", 1, "b", 2, "c", 3), e.chunks.get(0));

    List<ParseHistory.HistoryNode> root = h.exportTimeRoot();
    assertEquals(3, root.size());
    assertEquals(Map.of("a", 1), h.compare(0, 2).a);
    assertEquals(Map.of("a", 1, "b", 2, "c", 3), h.compare(0, 2).b);
    assertEquals(Map.of("a", 1, "b", 2), h.viewRange(0, 1).json);
  }

  @Test
  void setSourceReleasesOnUrlChange() {
    Eng e = makeEngine(true, true, false);
    e.engine.push(">\na:1\n.\n");
    ParseHistory h = e.engine.history();
    h.setSource("http://a");
    assertEquals(1, h.length());
    ParseHistory.SetSourceResult r = h.setSource("http://b");
    assertTrue(r.released);
    assertEquals(0, h.length());
    assertEquals("http://b", h.sourceKey());
  }

  @Test
  void stepwiseEmitsOneChunkAndNodePerDot() {
    Eng e = makeEngine(false, true, false);
    e.engine.push(THREE_PHASES);
    e.engine.finish();
    assertEquals(3, e.chunks.size());
    assertEquals(List.of(Map.of("a", 1), Map.of("b", 2), Map.of("c", 3)), e.chunks);
    assertEquals(e.chunks.size(), e.engine.history().length());
  }

  @Test
  void stepwiseDiffsPhaseLocalAfterCumulative() {
    Eng e = makeEngine(false, true, false);
    e.engine.push(THREE_PHASES);
    e.engine.finish();
    List<ParseHistory.HistoryNode> root = e.engine.history().exportTimeRoot();
    assertEquals(Map.of("a", 1), root.get(0).diff);
    assertEquals(Map.of("b", 2), root.get(1).diff);
    assertEquals(Map.of("c", 3), root.get(2).diff);
    assertEquals(Map.of("a", 1, "b", 2, "c", 3), root.get(2).after);
    assertNull(root.get(0).before);
    assertEquals(Map.of("a", 1), root.get(1).before);
  }

  @Test
  void emptyPhaseRecordsNullDiff() {
    Eng e = makeEngine(false, true, false);
    e.engine.push(">\na:1\n.\n.\n");
    e.engine.finish();
    ParseHistory h = e.engine.history();
    assertEquals(2, h.length());
    assertNull(h.getDiff(1));
    assertEquals(Map.of("a", 1), h.getAfter(1));
    assertEquals(".\n", h.getNode(1).wire);
  }

  @Test
  void eofTailRecordsKindTail() {
    Eng e = makeEngine(false, true, false);
    e.engine.push(">\na:1\n.\n>\nb:2\n");
    e.engine.finish();
    List<ParseHistory.HistoryNode> root = e.engine.history().exportTimeRoot();
    assertEquals(ParseHistory.HISTORY_NODE_KIND.DOT, root.get(0).kind);
    assertEquals(ParseHistory.HISTORY_NODE_KIND.TAIL, root.get(1).kind);
    assertEquals(Map.of("a", 1, "b", 2), root.get(1).after);
  }

  @Test
  void getNodeReturnsIsolatedClone() {
    Eng e = makeEngine(false, true, false);
    e.engine.push(">\na:1\n.\n");
    ParseHistory h = e.engine.history();
    @SuppressWarnings("unchecked")
    Map<String, Object> nodeAfter = (Map<String, Object>) h.getNode(0).after;
    nodeAfter.put("a", 999);
    assertEquals(Map.of("a", 1), h.getAfter(0));
  }

  @Test
  void viewRangeWithoutWireFallsBackToAfter() {
    Eng e = makeEngine(false, true, false, false);
    e.engine.push(THREE_PHASES);
    ParseHistory h = e.engine.history();
    assertNull(h.getNode(0).wire);
    assertEquals(Map.of("a", 1, "b", 2), h.viewRange(0, 1).json);
  }

  @Test
  void jumpToKeepsPositioningNode() {
    Eng e = makeEngine(false, false, true);
    e.engine.push(">\na:1\n.\n");
    e.engine.push(">\nb:2\n.\n");
    e.engine.push(">\nc:3\n.\n");
    e.engine.finish();
    ParseHistory h = e.engine.history();
    assertEquals(3, h.length());
    assertEquals(-1, h.liveCursor());
    assertTrue(h.canJumpTo(1));

    ParseHistory.JumpResult result = e.engine.jumpTo(1);
    assertEquals(2, result.kept);
    assertEquals(1, result.discarded);
    assertEquals(Map.of("a", 1, "b", 2), result.after);
    assertEquals(2, h.length());
    assertEquals(1, h.liveCursor());
    assertEquals(Map.of("a", 1, "b", 2), e.engine.committedSnapshot());
    assertFalse(h.canJumpTo(1));
    assertThrows(IndexOutOfBoundsException.class, () -> e.engine.jumpTo(0));
  }

  @Test
  void afterJumpFurtherPushContinues() {
    Eng e = makeEngine(false, false, true);
    e.engine.push(THREE_PHASES);
    e.engine.jumpTo(0);
    assertEquals(Map.of("a", 1), e.engine.committedSnapshot());
    e.engine.push(">\nz:9\n.\n");
    assertEquals(2, e.engine.history().length());
    assertEquals(Map.of("a", 1, "z", 9), e.engine.history().getAfter(1));
  }

  @Test
  void jumpAfterFinishReopensEngine() {
    Eng e = makeEngine(false, false, true);
    e.engine.push(THREE_PHASES);
    e.engine.finish();
    assertThrows(IllegalStateException.class, () -> e.engine.push(">\nq:0\n.\n"));
    e.engine.jumpTo(1);
    e.engine.push(">\nz:9\n.\n");
    e.engine.finish();
    assertEquals(3, e.engine.history().length());
    assertEquals(Map.of("a", 1, "b", 2, "z", 9), e.engine.history().getAfter(2));
  }

  @Test
  void wirePrefixRebuildsBuffer() {
    Eng e = makeEngine(false, false, true);
    e.engine.push(THREE_PHASES);
    ParseHistory.JumpResult r = e.engine.jumpTo(1);
    assertEquals(">\na:1\n.\n>\nb:2\n.\n", r.wirePrefix);
    assertEquals(r.wirePrefix, e.engine.buffer());
    assertEquals(r.wirePrefix.length(), e.engine.committedAt());
    assertEquals(Map.of("a", 1, "b", 2), e.engine.committedSnapshot());
  }

  @Test
  void dualModesSnapshotThenTruncate() {
    Eng e = makeEngine(false, true, true);
    e.engine.push(THREE_PHASES);
    ParseHistory h = e.engine.history();
    assertEquals(Map.of("a", 1, "b", 2, "c", 3), h.compare(0, 2).b);
    e.engine.jumpTo(1);
    assertEquals(2, h.length());
    assertThrows(IndexOutOfBoundsException.class, () -> h.compare(0, 2));
  }

  @Test
  void windowMergeStillOneNodePerDotWithBothModes() {
    Eng e = makeEngine(true, true, true);
    e.engine.push(THREE_PHASES);
    e.engine.finish();
    assertEquals(3, e.engine.history().length());
    assertEquals(1, e.chunks.size());
    List<ParseHistory.HistoryNode> root = e.engine.history().exportTimeRoot();
    assertEquals(Map.of("a", 1), root.get(0).diff);
    assertEquals(Map.of("b", 2), root.get(1).diff);
    assertEquals(Map.of("c", 3), root.get(2).diff);
  }

  @Test
  void historyOffKeepsPriorSemantics() {
    Eng off = makeEngine(true, false, false);
    Eng on = makeEngine(true, true, false);
    off.engine.push(">\na:1\n.\n>\nb:2\n.\n");
    off.engine.finish();
    on.engine.push(">\na:1\n.\n>\nb:2\n.\n");
    on.engine.finish();
    assertNull(off.engine.history());
    assertEquals(1, off.chunks.size());
    assertEquals(Map.of("a", 1, "b", 2), off.chunks.get(0));
  }

  @Test
  void streamProcessingFalseLeavesHistoryEmpty() {
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(false)
            .historySnapshot(true)
            .onChunk(chunks::add)
            .build();
    engine.push(">\na:1\n.\n>\nb:2\n.\n");
    engine.finish();
    assertEquals(0, engine.history().length());
    assertEquals(1, chunks.size());
    assertEquals(Map.of("a", 1, "b", 2), chunks.get(0));
  }

  @Test
  void nodeKindConstants() {
    assertEquals("dot", ParseHistory.HISTORY_NODE_KIND.DOT);
    assertEquals("tail", ParseHistory.HISTORY_NODE_KIND.TAIL);
  }

  @Test
  void jumpClearsLatestSnapshot() {
    Eng e = makeEngine(false, false, true);
    e.engine.push(THREE_PHASES);
    e.engine.finish();
    assertNotNull(e.engine.snapshot());
    e.engine.jumpTo(1);
    assertNull(e.engine.snapshot());
    assertFalse(e.engine.hasSnapshot());
  }

  @Test
  void getNodeAndExportAreDetached() {
    Eng e = makeEngine(false, true, false);
    e.engine.push(">\na:1\n.\n");
    ParseHistory h = e.engine.history();
    List<ParseHistory.HistoryNode> root = h.exportTimeRoot();
    @SuppressWarnings("unchecked")
    Map<String, Object> after = (Map<String, Object>) root.get(0).after;
    after.put("a", 999);
    assertEquals(Map.of("a", 1), h.getAfter(0));
    assertNotSame(h.exportTimeRoot().get(0), root.get(0));
  }

  @Test
  void historyVsCompactConflictThrowsWithoutDrop() {
    Eng e = makeEngine(false, true, false);
    e.engine.push(">\na:1\n.\n>\nb:2\n.\n");
    IllegalStateException ex =
        assertThrows(IllegalStateException.class, e.engine::compactCommitted);
    assertTrue(
        ex.getMessage().contains("history") || ex.getMessage().contains("indices"),
        () -> ex.getMessage());
    DotCheckpointEngine.CompactResult dropped = e.engine.compactCommitted(true);
    assertTrue(dropped.discardedBytes > 0);
    assertEquals(0, e.engine.history().length());
  }
}
