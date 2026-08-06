package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.DotCheckpointEngine;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Port of Node {@code checkpoint.diff-isolation.test.js} — D1 / D2 / emitDiff. */
class CheckpointDiffIsolationTest {

  private static final class Run {
    final Object committed;
    final List<Object> chunks;

    Run(Object committed, List<Object> chunks) {
      this.committed = committed;
      this.chunks = chunks;
    }
  }

  private static Run runEngine(List<String> chunks, boolean mergeChunkWindow) {
    List<Object> out = new ArrayList<>();
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder()
            .mergeChunkWindow(mergeChunkWindow)
            .onChunk(out::add)
            .build();
    for (String c : chunks) eng.push(c);
    eng.finish();
    return new Run(eng.committedSnapshot(), out);
  }

  @Test
  void onChunkDiffMutationDoesNotTouchCommitted() {
    String wire = ">\na:1\n.\n>\nb:2\n.\n";
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(chunks::add).build();
    eng.push(wire);
    eng.finish();
    assertEquals(2, chunks.size());
    @SuppressWarnings("unchecked")
    Map<String, Object> first = (Map<String, Object>) chunks.get(0);
    first.put("a", 999);
    assertEquals(Map.of("a", 1, "b", 2), eng.committedSnapshot());
  }

  @Test
  void d1NamedEnterAfterPriorDot() {
    String p1 = ">\n>meta\nname:x\n.\n";
    String p2 = ">rules-\n>\nid:R1\n<\n.\n";
    String full = p1 + p2;
    Map<String, Object> expected =
        Map.of("meta", Map.of("name", "x"), "rules", List.of(Map.of("id", "R1")));
    assertEquals(expected, Parse.parse(full));

    Run one = runEngine(List.of(full), true);
    Run split = runEngine(List.of(p1, p2), true);
    assertEquals(expected, one.committed);
    assertEquals(expected, split.committed);

    Run stepwise = runEngine(List.of(p1, p2), false);
    assertEquals(expected, stepwise.committed);
    assertEquals(2, stepwise.chunks.size());
    assertEquals(Map.of("meta", Map.of("name", "x")), stepwise.chunks.get(0));
    assertEquals(Map.of("rules", List.of(Map.of("id", "R1"))), stepwise.chunks.get(1));

    DotCheckpointEngine charStream =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(d -> {}).build();
    for (int i = 0; i < full.length(); i++) {
      charStream.push(String.valueOf(full.charAt(i)));
    }
    charStream.finish();
    assertEquals(expected, charStream.committedSnapshot());
  }

  @Test
  void locatePhaseUsesCumulativeDiff() {
    String phase1 = ">\n>a\nx:1\n.\n";
    String phase2 = "=a\ny:2\n.\n";
    assertEquals(Map.of("a", Map.of("x", 1, "y", 2)), Parse.parse(phase1 + phase2));
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(chunks::add).build();
    eng.push(phase1);
    eng.push(phase2);
    eng.finish();
    assertEquals(Map.of("a", Map.of("x", 1, "y", 2)), eng.committedSnapshot());
    assertEquals(2, chunks.size());
    assertEquals(Map.of("a", Map.of("x", 1, "y", 2)), chunks.get(1));
  }

  @Test
  void d2AtIntoPriorPhaseNamedArray() {
    String p0 = ">\n>orders-\n.\n";
    String p1 = "@orders\n>\na:1\n<\n.\n";
    String p2 = "@orders\n>\na:1\n<\n>\nb:2\n<\n.\n";
    Map<String, Object> after1 = Map.of("orders", List.of(Map.of("a", 1)));
    Map<String, Object> after2 =
        Map.of("orders", List.of(Map.of("a", 1), Map.of("a", 1), Map.of("b", 2)));
    String full = p0 + p1 + p2;
    assertEquals(after1, Parse.parse(p0 + p1));
    assertEquals(after2, Parse.parse(full));

    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(chunks::add).build();
    eng.push(p0);
    eng.push(p1);
    eng.push(p2);
    eng.finish();
    assertEquals(after2, eng.committedSnapshot());
    assertEquals(3, chunks.size());
    assertEquals(Map.of("orders", List.of()), chunks.get(0));
    assertEquals(after1, chunks.get(1));
    assertInstanceOf(List.class, ((Map<?, ?>) chunks.get(1)).get("orders"));
    assertEquals(after2, chunks.get(2));

    for (boolean merge : new boolean[] {true, false}) {
      Run one = runEngine(List.of(full), merge);
      Run split = runEngine(List.of(p0, p1, p2), merge);
      assertEquals(after2, one.committed);
      assertEquals(after2, split.committed);
    }
  }

  @Test
  void atCreateOnlyLaterPhaseStillCommits() {
    String a = ">\n>meta\nname:x\n.\n";
    String b = "@fresh\nv:1\n.\n";
    Map<String, Object> expected = Map.of("meta", Map.of("name", "x"), "fresh", Map.of("v", 1));
    assertEquals(expected, Parse.parse(a + b));
    List<Object> chunks = new ArrayList<>();
    DotCheckpointEngine eng =
        DotCheckpointEngine.Options.builder().mergeChunkWindow(false).onChunk(chunks::add).build();
    eng.push(a);
    eng.push(b);
    eng.finish();
    assertEquals(expected, eng.committedSnapshot());
    assertEquals(expected, chunks.get(1));
  }

  @Test
  void emitDiffFalseWithoutOnChunkDoesNotThrow() {
    DotCheckpointEngine eng = DotCheckpointEngine.Options.builder().emitDiff(false).build();
    eng.push(">\na:1\n.\n");
    eng.finish();
    assertEquals(Map.of("a", 1), eng.committedSnapshot());
    assertEquals(Map.of("a", 1), eng.snapshot());
  }

  @Test
  void missingOnChunkStillCommits() {
    DotCheckpointEngine eng = DotCheckpointEngine.Options.builder().build();
    eng.push(">\na:1\n.\n");
    eng.finish();
    assertEquals(Map.of("a", 1), eng.committedSnapshot());
  }

  @Test
  void emitDiffFalseAtArrayMultiPhase() {
    DotCheckpointEngine eng = DotCheckpointEngine.Options.builder().emitDiff(false).build();
    eng.push(">\n>orders-\n.\n");
    eng.push("@orders\n>\na:1\n<\n.\n");
    eng.push("@orders\n>\nb:2\n<\n.\n");
    eng.finish();
    assertEquals(
        Map.of("orders", List.of(Map.of("a", 1), Map.of("b", 2))), eng.committedSnapshot());
  }

  @Test
  void workaroundsRemainCorrect() {
    String base = ">\n>orders-\n.\n";
    Map<String, Object> expect = Map.of("orders", List.of(Map.of("a", 1)));
    Run viaEq = runEngine(List.of(base, "=orders\n>\na:1\n<\n.\n"), false);
    Run viaRe = runEngine(List.of(base, ">orders-\n>\na:1\n<\n.\n"), false);
    assertEquals(expect, viaEq.committed);
    assertEquals(expect, viaRe.committed);
    assertTrue(((Map<?, ?>) viaEq.chunks.get(1)).get("orders") instanceof List);
  }
}
