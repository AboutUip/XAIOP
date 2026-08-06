package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.DotCheckpointEngine;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/** Port of Node {@code checkpoint.buffer-compact.test.js} — engine surface. */
class CheckpointBufferCompactTest {

  @Test
  void bufferStatsEmptyZeros() {
    DotCheckpointEngine eng = DotCheckpointEngine.Options.builder().onChunk(d -> {}).build();
    assertEquals(new DotCheckpointEngine.BufferStats(0, 0, 0, false), eng.bufferStats());
  }

  @Test
  void afterFullPhasePendingZero() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    eng.push(">\na:1\n.\n");
    DotCheckpointEngine.BufferStats s = eng.bufferStats();
    assertTrue(s.length > 0);
    assertEquals(s.length, s.committedAt);
    assertEquals(0, s.pendingBytes);
    assertFalse(s.openPhase);
  }

  @Test
  void openPhasePendingPositive() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    eng.push(">\na:1\n.\n");
    eng.push(">\nb:2\n");
    DotCheckpointEngine.BufferStats s = eng.bufferStats();
    assertTrue(s.pendingBytes > 0);
    assertTrue(s.openPhase);
    assertTrue(s.committedAt < s.length);
  }

  @Test
  void compactDropsPrefixCommittedUnchanged() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    eng.push(">\n>meta\nname:x\n.\n");
    eng.push(">rules-\n>\nid:R1\n<\n.\n");
    Map<String, Object> expected =
        Map.of("meta", Map.of("name", "x"), "rules", java.util.List.of(Map.of("id", "R1")));
    assertEquals(expected, eng.committedSnapshot());
    DotCheckpointEngine.BufferStats before = eng.bufferStats();
    DotCheckpointEngine.CompactResult r = eng.compactCommitted();
    assertEquals(before.length, r.discardedBytes);
    assertEquals(0, r.length);
    assertEquals(new DotCheckpointEngine.BufferStats(0, 0, 0, false), eng.bufferStats());
    assertEquals(expected, eng.committedSnapshot());
    assertEquals("", eng.buffer());
  }

  @Test
  void secondCompactIsNoOp() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    eng.push(">\na:1\n.\n");
    DotCheckpointEngine.CompactResult first = eng.compactCommitted();
    assertTrue(first.discardedBytes > 0);
    assertEquals(new DotCheckpointEngine.CompactResult(0, 0), eng.compactCommitted());
    assertEquals(Map.of("a", 1), eng.committedSnapshot());
  }

  @Test
  void noOpWhenNothingCommitted() {
    DotCheckpointEngine eng = DotCheckpointEngine.Options.builder().onChunk(d -> {}).build();
    assertEquals(new DotCheckpointEngine.CompactResult(0, 0), eng.compactCommitted());
    eng.push(">\na:1\n");
    assertEquals(
        new DotCheckpointEngine.CompactResult(0, eng.buffer().length()), eng.compactCommitted());
  }

  @Test
  void preservesUncommittedTailAndContinues() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    eng.push(">\na:1\n.\n");
    eng.push(">\nb:2\n");
    String pending = eng.buffer().substring(eng.committedAt());
    DotCheckpointEngine.CompactResult r = eng.compactCommitted();
    assertTrue(r.discardedBytes > 0);
    assertEquals(pending, eng.buffer());
    assertTrue(eng.bufferStats().openPhase);
    eng.push(".\n");
    eng.finish();
    assertEquals(Map.of("a", 1, "b", 2), eng.committedSnapshot());
    assertEquals(Map.of("a", 1, "b", 2), eng.snapshot());
  }

  @Test
  void halfLineAcrossCompactStillCompletes() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    eng.push(">\na:1\n.\n");
    eng.push(">\nb:");
    eng.compactCommitted();
    assertTrue(eng.bufferStats().length > 0);
    eng.push("2\n.\n");
    eng.finish();
    assertEquals(Map.of("a", 1, "b", 2), eng.committedSnapshot());
  }

  @Test
  void throwsWhenClosed() {
    DotCheckpointEngine eng = DotCheckpointEngine.Options.builder().onChunk(d -> {}).build();
    eng.push(">\na:1\n.\n");
    eng.finish();
    assertThrows(IllegalStateException.class, eng::compactCommitted);
  }

  @Test
  void operatorsAfterCompact() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    eng.push(">\n>orders-\n.\n");
    eng.compactCommitted();
    eng.push("@orders\n>\na:1\n<\n.\n");
    eng.compactCommitted();
    eng.push("@orders\n>\nb:2\n<\n.\n");
    assertEquals(
        Map.of("orders", java.util.List.of(Map.of("a", 1), Map.of("b", 2))),
        eng.committedSnapshot());

    DotCheckpointEngine locate =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    locate.push(">\n>a\nx:1\n.\n");
    locate.compactCommitted();
    locate.push("=a\ny:2\n.\n");
    assertEquals(Map.of("a", Map.of("x", 1, "y", 2)), locate.committedSnapshot());

    DotCheckpointEngine del =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    del.push(">\n>a\nx:1\n<\n>b\ny:2\n.\n");
    del.compactCommitted();
    del.push("&b\n.\n");
    assertEquals(Map.of("a", Map.of("x", 1)), del.committedSnapshot());
  }

  @Test
  void mergeWindowAndEmitDiffFalse() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(true).onChunk(d -> {}).build();
    eng.push(">\na:1\n.\n>\nb:2\n.\n");
    assertEquals(Map.of("a", 1, "b", 2), eng.committedSnapshot());
    assertTrue(eng.compactCommitted().discardedBytes > 0);
    eng.push(">\nc:3\n.\n");
    assertEquals(Map.of("a", 1, "b", 2, "c", 3), eng.committedSnapshot());

    DotCheckpointEngine noDiff = DotCheckpointEngine.Options.builder().emitDiff(false).build();
    noDiff.push(">\na:1\n.\n");
    noDiff.compactCommitted();
    noDiff.push(">\nb:2\n.\n");
    noDiff.finish();
    assertEquals(Map.of("a", 1, "b", 2), noDiff.committedSnapshot());
  }

  @Test
  void pushAsyncPlusCompact() throws Exception {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    eng.pushAsync(">\na:1\n.\n").get(2, TimeUnit.SECONDS);
    eng.pushAsync(">\nb:2\n.\n").get(2, TimeUnit.SECONDS);
    eng.compactCommitted();
    eng.pushAsync(">\nc:3\n.\n").get(2, TimeUnit.SECONDS);
    eng.finishAsync().get(2, TimeUnit.SECONDS);
    assertEquals(Map.of("a", 1, "b", 2, "c", 3), eng.committedSnapshot());
  }

  @Test
  void historyRealtimeRetainWireRejectsWithoutDrop() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .mergeChunkWindow(false)
            .historyRealtime(true)
            .retainWireHistory(true)
            .onChunk(d -> {})
            .build();
    eng.push(">\na:1\n.\n");
    IllegalStateException ex =
        assertThrows(IllegalStateException.class, eng::compactCommitted);
    assertTrue(ex.getMessage().contains("historyRealtime + retainWireHistory"));
  }

  @Test
  void dropHistoryClearsNodesAndAllowsCompact() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .mergeChunkWindow(false)
            .historyRealtime(true)
            .retainWireHistory(true)
            .onChunk(d -> {})
            .build();
    eng.push(">\na:1\n.\n");
    eng.push(">\nb:2\n.\n");
    assertTrue(eng.history().length() >= 2);
    DotCheckpointEngine.CompactResult r = eng.compactCommitted(true);
    assertTrue(r.discardedBytes > 0);
    assertEquals(0, eng.history().length());
    assertTrue(eng.history().realtimeEnabled());
    assertEquals(Map.of("a", 1, "b", 2), eng.committedSnapshot());
  }

  @Test
  void snapshotHistoryWithNodesRejectsWithoutDrop() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .mergeChunkWindow(false)
            .historySnapshot(true)
            .onChunk(d -> {})
            .build();
    eng.push(">\na:1\n.\n");
    IllegalStateException ex =
        assertThrows(IllegalStateException.class, eng::compactCommitted);
    assertTrue(ex.getMessage().contains("history buffer indices"));
    eng.compactCommitted(true);
    assertEquals(0, eng.history().length());
    assertEquals(0, eng.bufferStats().length);
  }

  @Test
  void historyEnabledButEmptyCompactAllowed() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .mergeChunkWindow(false)
            .historySnapshot(true)
            .onChunk(d -> {})
            .build();
    assertEquals(new DotCheckpointEngine.CompactResult(0, 0), eng.compactCommitted());
    eng.push(">\na:1\n.\n");
    assertThrows(IllegalStateException.class, eng::compactCommitted);
  }

  @Test
  void clearThenCompactWithoutDrop() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .mergeChunkWindow(false)
            .historySnapshot(true)
            .onChunk(d -> {})
            .build();
    eng.push(">\na:1\n.\n");
    eng.history().clear();
    assertEquals(0, eng.history().length());
    assertTrue(eng.compactCommitted().discardedBytes > 0);
  }

  @Test
  void repeatedCompactBoundsLength() {
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).emitDiff(false).build();
    int maxLen = 0;
    for (int i = 0; i < 200; i++) {
      eng.push(">\nk" + i + ":" + i + "\n.\n");
      eng.compactCommitted();
      maxLen = Math.max(maxLen, eng.bufferStats().length);
    }
    assertTrue(maxLen < 64, "maxLen=" + maxLen);
    @SuppressWarnings("unchecked")
    Map<String, Object> snap = (Map<String, Object>) eng.committedSnapshot();
    assertEquals(0, snap.get("k0"));
    assertEquals(199, snap.get("k199"));
  }
}
