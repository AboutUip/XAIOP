package io.xaiop;

import static io.xaiop.Fixtures.list;
import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.Materialize;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/**
 * Checkpoint regression guards: Diff/Commit isolation, window batching, async coalescing and
 * line-ending parity. Ported from the Node suites {@code checkpoint.opt.test.js} and
 * {@code checkpoint.window.test.js}.
 */
class CheckpointRobustTest {

  private static final String TWO_PHASES = ">\n>a\nx:1\n.\n>b\ny:2\n.\n";

  /** Descends a chunk by keys, returning {@code null} when any hop is missing. */
  @SuppressWarnings("unchecked")
  private static Map<String, Object> at(Object chunk, String... keys) {
    Object cur = chunk;
    for (String key : keys) {
      if (!(cur instanceof Map<?, ?> m)) return null;
      cur = m.get(key);
    }
    return cur instanceof Map ? (Map<String, Object>) cur : null;
  }

  // --- Diff isolation ---------------------------------------------------------

  @Test
  void mutatingABroadcastPhaseDiffDoesNotCorruptTheCommit() {
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(
                diff -> {
                  diffs.add(diff);
                  Map<String, Object> test = at(diff, "left", "test");
                  if (test != null) test.put("mutated", true);
                })
            .build();

    engine.push(">\n>left\n>test\nx:1\n.\n>right\n>test\ny:2\n.\n!test\nz:9\n.\n");
    engine.finish();

    Object committed = engine.committedSnapshot();
    assertNull(at(committed, "left", "test").get("mutated"), "Diff and Commit must not alias");
    assertEquals(map("x", 1, "z", 9), at(committed, "left", "test"));
    assertEquals(map("y", 2, "z", 9), at(committed, "right", "test"));
    assertTrue(
        diffs.stream().anyMatch(d -> at(d, "left", "test") != null
            && Boolean.TRUE.equals(at(d, "left", "test").get("mutated"))),
        "the callback did mutate a Diff it was handed");
  }

  @Test
  void mutatingALocatePhaseDiffDoesNotCorruptTheCommit() {
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(
                diff -> {
                  Map<String, Object> b = at(diff, "wrap", "a", "b");
                  if (b != null) b.put("poison", true);
                })
            .build();

    engine.push(">\n>wrap\n>a\n>b\nx:1\n.\n=a>b\nz:3\n.\n");
    engine.finish();

    assertNull(at(engine.committedSnapshot(), "wrap", "a", "b").get("poison"));
    assertEquals(map("wrap", map("a", map("b", map("x", 1, "z", 3)))), engine.committedSnapshot());
  }

  // --- Diff vs Commit ---------------------------------------------------------

  @Test
  void ordinaryPhaseDiffIsPhaseLocalWhileCommitIsCumulative() {
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).mergeChunkWindow(false).build();
    engine.push(TWO_PHASES);
    engine.finish();

    assertEquals(List.of(map("a", map("x", 1)), map("b", map("y", 2))), diffs);
    assertEquals(map("a", map("x", 1), "b", map("y", 2)), engine.committedSnapshot());
    assertEquals(map("a", map("x", 1), "b", map("y", 2)), engine.snapshot());
  }

  @Test
  void committedSnapshotReadableAfterDotBeforeFinish() {
    List<Object> atChunk = new ArrayList<>();
    DotCheckpointEngine[] box = new DotCheckpointEngine[1];
    box[0] =
        DotCheckpointEngine.Options.of(d -> atChunk.add(box[0].committedSnapshot()))
            .mergeChunkWindow(false)
            .build();
    box[0].push(">\na:1\n.\n");
    assertTrue(box[0].committedAt() > 0);
    assertEquals(map("a", 1), box[0].committedSnapshot());
    assertEquals(map("a", 1), atChunk.get(0));
    box[0].push(">b\nc:2\n.\n");
    assertEquals(map("a", 1, "b", map("c", 2)), box[0].committedSnapshot());
    assertEquals(map("a", 1, "b", map("c", 2)), atChunk.get(1));
    box[0].finish();
    assertEquals(map("a", 1, "b", map("c", 2)), box[0].committedSnapshot());
  }

  @Test
  void finishSnapshotAliasesTheLastCommitWhenTheBufferIsFullyCommitted() {
    String wire = ">\n>a\nx:1\n.\n";
    DotCheckpointEngine engine = DotCheckpointEngine.Options.of(chunk -> {}).build();
    engine.push(wire);
    engine.finish();

    assertEquals(wire.length(), engine.committedAt(), "the trailing . commits the whole buffer");
    assertEquals(engine.committedSnapshot(), engine.snapshot());
  }

  // --- window batching --------------------------------------------------------

  @Test
  void windowBatchingEmitsOneCumulativeDiffPerPush() {
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).mergeChunkWindow(true).build();
    engine.push(TWO_PHASES);
    engine.finish();

    assertEquals(1, diffs.size(), "both dots land in one buffer window");
    assertEquals(map("a", map("x", 1), "b", map("y", 2)), diffs.get(0));
    assertEquals(map("a", map("x", 1), "b", map("y", 2)), engine.snapshot());
  }

  @Test
  void stepwiseModeEmitsOneDiffPerDot() {
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).mergeChunkWindow(false).build();
    engine.push(TWO_PHASES);
    engine.finish();

    assertEquals(2, diffs.size());
    assertEquals(map("a", map("x", 1)), diffs.get(0));
    assertEquals(map("b", map("y", 2)), diffs.get(1));
  }

  @Test
  void emitDiffFalseSuppressesEveryDiffButKeepsTheCommit() {
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).mergeChunkWindow(false).emitDiff(false).build();
    engine.push(TWO_PHASES);
    engine.finish();

    assertTrue(diffs.stream().allMatch(d -> d == null), "diffs: " + diffs);
    assertEquals(map("a", map("x", 1), "b", map("y", 2)), engine.committedSnapshot());
  }

  @Test
  void encodePhasesAlignWithStepwiseCheckpointChunks() {
    Map<String, Object> value = map("a", map("x", 1), "b", map("y", 2), "c", 3);
    String wire = Encode.encode(value);

    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(chunks::add).mergeChunkWindow(false).build();
    engine.push(wire);
    engine.finish();

    assertEquals(3, chunks.size(), "one chunk per top-level key");
    assertEquals(map("a", map("x", 1)), chunks.get(0));
    assertEquals(map("b", map("y", 2)), chunks.get(1));
    assertEquals(map("c", 3), chunks.get(2));
    assertEquals(value, Parse.parse(wire));
  }

  @Test
  void awkwardChunkingStillCommitsTheWholeDocument() {
    Map<String, Object> value = map("a", 1, "b", map("x", true), "c", list("y", 2));
    String wire = Encode.encode(value);

    DotCheckpointEngine engine = DotCheckpointEngine.Options.of(chunk -> {}).build();
    for (int i = 0; i < wire.length(); i += 5) {
      engine.push(wire.substring(i, Math.min(i + 5, wire.length())));
    }
    engine.finish();

    assertEquals(value, engine.snapshot());
    assertEquals(value, engine.committedSnapshot());
  }

  @Test
  void streamProcessingOffEmitsExactlyOneChunkEqualToOneShotParse() {
    String wire = ">\n>a\nx:1\n.\n>b\ny:2\n";
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(chunks::add).streamProcessing(false).build();
    engine.push(wire);
    engine.finish();

    assertEquals(1, chunks.size());
    assertEquals(Parse.parse(wire), chunks.get(0));
    assertEquals(Parse.parse(wire), engine.snapshot());
  }

  // --- async ingest -----------------------------------------------------------

  @Test
  void asyncPushesCoalesceIntoOneWindow() throws Exception {
    List<Object> diffs = new ArrayList<>();
    try (DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).mergeChunkWindow(true).build()) {
      engine.pushAsync(">\n>a\nx:1\n.\n");
      engine.pushAsync(">\n>b\ny:2\n.\n").get(5, TimeUnit.SECONDS);
      engine.finishAsync().get(5, TimeUnit.SECONDS);

      assertEquals(Parse.parse(TWO_PHASES), engine.snapshot());
      assertTrue(diffs.size() == 1 || diffs.size() == 2, "diffs: " + diffs);
      assertEquals(map("a", map("x", 1), "b", map("y", 2)), mergeAll(diffs));
    }
  }

  @Test
  void syncPushInterleavedWithAPendingAsyncPushDoesNotDoubleScan() throws Exception {
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).mergeChunkWindow(false).build();
    var pending = engine.pushAsync(">\na:1\n.\n");
    engine.push(">\nb:2\n.\n");
    pending.get(5, TimeUnit.SECONDS);
    engine.finish();

    assertEquals(map("a", 1, "b", 2), engine.snapshot());
    assertTrue(diffs.size() >= 2, "diffs: " + diffs);
    assertEquals(map("a", 1, "b", 2), mergeAll(diffs));
  }

  @Test
  void aBroadcastPhaseDiffCarriesTheCumulativeTree() {
    String wire = ">\n>left\n>test\nx:1\n.\n>right\n>test\ny:2\n.\n!test\nz:9\n.\n>only\nv:1\n";
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).mergeChunkWindow(false).build();
    for (int i = 0; i < wire.length(); i += 4) {
      engine.push(wire.substring(i, Math.min(i + 4, wire.length())));
    }
    engine.finish();

    assertTrue(
        diffs.stream()
            .anyMatch(
                d ->
                    at(d, "left", "test") != null
                        && at(d, "left", "test").containsKey("z")
                        && at(d, "right", "test") != null
                        && at(d, "right", "test").containsKey("z")),
        "a ! phase reaches across earlier phases, so its Diff is the whole tree: " + diffs);
    assertEquals(Parse.parse(wire), engine.snapshot());
  }

  @Test
  void aLocatePhaseDiffCarriesTheCumulativeTree() {
    String wire = ">\n>wrap\n>a\n>b\nx:1\n.\n=a>b\nz:3\n.\n";
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).mergeChunkWindow(false).build();
    engine.push(wire);
    engine.finish();

    assertEquals(2, diffs.size());
    assertEquals(map("wrap", map("a", map("b", map("x", 1)))), diffs.get(0));
    assertEquals(
        map("wrap", map("a", map("b", map("x", 1, "z", 3)))),
        diffs.get(1),
        "= resolves against the prior tree, so the Diff is cumulative");
  }

  // --- line endings / content -------------------------------------------------

  @Test
  void crlfAndCrDocumentsParseIdenticallyToLf() {
    String lf = ">\n>a\nx:1\n.\n>b\ny:2\n";
    assertEquals(Parse.parse(lf), Parse.parse(lf.replace("\n", "\r\n")), "CRLF parity");
    assertEquals(Parse.parse(lf), Parse.parse(lf.replace("\n", "\r")), "CR parity");
    assertEquals(
        map("a", map("x", 1), "b", map("y", 2)),
        Materialize.materializeSnapshot(Parse.parse(lf.replace("\n", "\r\n"))));
  }

  @Test
  void crlfWireStreamsThroughTheCheckpointEngine() {
    String wire = TWO_PHASES.replace("\n", "\r\n");
    List<Object> diffs = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add).mergeChunkWindow(false).build();
    engine.push(wire);
    engine.finish();

    assertEquals(List.of(map("a", map("x", 1)), map("b", map("y", 2))), diffs);
    assertEquals(map("a", map("x", 1), "b", map("y", 2)), engine.snapshot());
  }

  @Test
  void forcedStringContentStripsLeadingSpaces() {
    assertEquals(map("n", "42"), Parse.parse(">\nn: 42\n"));
    assertEquals(map("n", "42"), Parse.parse(">\nn:  42\n"), "extra spaces are still one marker");
  }

  private static Object mergeAll(List<Object> chunks) {
    Object out = map();
    for (Object chunk : chunks) {
      if (chunk != null) out = Merge.mergeJson(out, chunk);
    }
    return out;
  }
}
