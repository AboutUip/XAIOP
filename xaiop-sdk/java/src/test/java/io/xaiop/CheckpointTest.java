package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.DotCheckpointEngine;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class CheckpointTest {

  /** Feeds {@code text} in one push and returns every chunk the engine emitted. */
  private static List<Object> drain(String text, boolean mergeChunkWindow) {
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(chunks::add).mergeChunkWindow(mergeChunkWindow).build();
    engine.push(text);
    engine.finish();
    return chunks;
  }

  private static final String TWO_PHASES = ">\na:1\n.\n>\nb:2\n.\n";

  @Test
  void windowBatchingCollapsesTwoPhasesIntoOneChunk() {
    assertEquals(List.of(Map.of("a", 1, "b", 2)), drain(TWO_PHASES, true));
  }

  @Test
  void stepwiseEmitsOneChunkPerPhase() {
    assertEquals(List.of(Map.of("a", 1), Map.of("b", 2)), drain(TWO_PHASES, false));
  }

  @Test
  void emptyMidPhaseYieldsNullChunkWhenStepwise() {
    String withEmptyPhase = ">\na:1\n.\n.\n>\nb:2\n.\n";
    assertEquals(
        Arrays.asList(Map.of("a", 1), null, Map.of("b", 2)), drain(withEmptyPhase, false));
    // The same window collapses to a single cumulative Diff when batching.
    assertEquals(List.of(Map.of("a", 1, "b", 2)), drain(withEmptyPhase, true));
  }

  @Test
  void tailWithoutTrailingDotIsFlushedAtFinish() {
    assertEquals(List.of(Map.of("a", 1), Map.of("b", 2)), drain(">\na:1\n.\n>\nb:2\n", false));
    assertEquals(List.of(Map.of("a", 1)), drain(">\na:1\n", true));
  }

  @Test
  void emptyStreamEmitsOneNullChunk() {
    List<Object> chunks = drain("", true);
    assertEquals(1, chunks.size());
    assertNull(chunks.get(0));
  }

  @Test
  void snapshotAndCommitTrackThePhaseBoundary() {
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine engine = DotCheckpointEngine.Options.of(chunks::add).build();
    engine.push(">\na:1\n");
    assertEquals(0, engine.committedAt());
    assertNull(engine.committedSnapshot());

    engine.push(".\n>\nb:2\n.\n");
    assertEquals(List.of(Map.of("a", 1, "b", 2)), chunks);
    assertEquals(TWO_PHASES.length(), engine.committedAt());
    assertEquals(Map.of("a", 1, "b", 2), engine.committedSnapshot());

    engine.finish();
    assertEquals(Map.of("a", 1, "b", 2), engine.snapshot());
    assertThrows(IllegalStateException.class, () -> engine.push(">\nc:3\n"));
  }

  @Test
  void streamProcessingOffDefersEverythingToFinish() {
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(chunks::add).streamProcessing(false).build();
    engine.push(TWO_PHASES);
    assertEquals(List.of(), chunks);
    engine.finish();
    assertEquals(List.of(Map.of("a", 1, "b", 2)), chunks);
  }

  @Test
  void asyncIngestCoalescesAndFinishes() throws Exception {
    List<Object> chunks = new ArrayList<>();
    try (DotCheckpointEngine engine = DotCheckpointEngine.Options.of(chunks::add).build()) {
      // Rapid pushes share one drain, so the window normally collapses to a single Diff; the
      // drain thread may still wake between them, which is the only other legal outcome.
      engine.pushAsync(">\na:1\n.\n");
      engine.pushAsync(">\nb:2\n.\n").get(5, TimeUnit.SECONDS);
      engine.finishAsync().get(5, TimeUnit.SECONDS);

      assertEquals(Map.of("a", 1, "b", 2), engine.snapshot());
      assertTrue(chunks.size() == 1 || chunks.size() == 2, "chunks: " + chunks);
      assertEquals(Map.of("a", 1, "b", 2), merged(chunks));
    }
  }

  @Test
  void asyncPushAfterFinishFails() throws Exception {
    DotCheckpointEngine engine = DotCheckpointEngine.Options.of(chunk -> {}).build();
    engine.finishAsync().get(5, TimeUnit.SECONDS);
    assertThrows(
        ExecutionException.class, () -> engine.pushAsync(">\na:1\n").get(5, TimeUnit.SECONDS));
  }

  private static Object merged(List<Object> chunks) {
    Object out = Map.of();
    for (Object chunk : chunks) {
      out = Merge.mergeJson(out, chunk);
    }
    return out;
  }
}
