package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.AnnotationSpan;
import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.XaiopStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Core Annotation Span cases (Node {@code annotation.span.test.js}) — no WS.
 *
 * <p>Handler return: {@link AnnotationSpan#KEEP} = keep wire; {@code null} = drop; Map/List/String =
 * remount.
 */
class AnnotationSpanTest {

  @Test
  void pathEscapesTypeCheckExactDescendantBracketEscapeAll() {
    assertTrue(AnnotationSpan.pathEscapesTypeCheck("flex", List.of("flex")));
    assertTrue(AnnotationSpan.pathEscapesTypeCheck("flex.x", List.of("flex")));
    assertTrue(AnnotationSpan.pathEscapesTypeCheck("flex[0]", List.of("flex")));
    assertFalse(AnnotationSpan.pathEscapesTypeCheck("other", List.of("flex")));
    assertFalse(AnnotationSpan.pathEscapesTypeCheck("fle", List.of("flex")));
    assertTrue(AnnotationSpan.pathEscapesTypeCheck("anything", List.of("")));
  }

  @Test
  void encodeAsSiblingLinesObjectStripsOuterGt() {
    Map<String, Object> obj = new LinkedHashMap<>();
    obj.put("a", 1);
    Map<String, Object> nested = new LinkedHashMap<>();
    nested.put("c", 2);
    obj.put("b", nested);
    List<String> lines = AnnotationSpan.encodeAsSiblingLines(obj);
    assertFalse(lines.contains(">"));
    assertTrue(lines.stream().anyMatch(l -> l.startsWith("a:")));
  }

  @Test
  void encodeAsSiblingLinesArrayRoot() {
    List<String> lines = AnnotationSpan.encodeAsSiblingLines(List.of(1, 2));
    assertTrue(lines.get(0).equals("-") || lines.stream().anyMatch(l -> l.equals("-") || l.startsWith("-")));
  }

  @Test
  void encodeAsSiblingLinesRejectsScalar() {
    assertThrows(IllegalArgumentException.class, () -> AnnotationSpan.encodeAsSiblingLines(1));
  }

  @Test
  void noHandlersIdentityEmptyEscapes() {
    List<String> lines = List.of(">", "a:1", "#x", "b:2", ".");
    AnnotationSpan.Result out = AnnotationSpan.applyAnnotationSpans(lines, List.of());
    assertEquals(lines, out.lines());
    assertTrue(out.escapePaths().isEmpty());
  }

  @Test
  void emptyCaptureStillInvokesHandler() {
    List<Object> seen = new ArrayList<>();
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "a:1", "# lone", "."),
            List.of(
                (ann, view) -> {
                  seen.add(ann);
                  seen.add(view.json());
                  return AnnotationSpan.KEEP;
                }));
    assertEquals(" lone", seen.get(0));
    assertInstanceOf(Map.class, seen.get(1));
    assertTrue(((Map<?, ?>) seen.get(1)).isEmpty());
    assertTrue(out.lines().contains("# lone"));
    assertTrue(out.escapePaths().isEmpty());
  }

  @Test
  void remountViaJsonTextString() {
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "# t", "a:1", "."), List.of((a, v) -> "{\"z\":9}"));
    assertTrue(out.lines().stream().noneMatch(l -> l.startsWith("#")));
    assertTrue(out.lines().stream().anyMatch(l -> l.startsWith("z:")));
  }

  @Test
  void invalidRemountTypeThrows() {
    assertThrows(
        IllegalArgumentException.class,
        () ->
            AnnotationSpan.applyAnnotationSpans(
                List.of(">", "# t", "a:1", "."), List.of((a, v) -> 42)));
  }

  @Test
  void handlerChainFirstKeepSecondWins() {
    List<Integer> order = new ArrayList<>();
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "#x", "a:1", "."),
            List.of(
                (a, v) -> {
                  order.add(1);
                  return AnnotationSpan.KEEP;
                },
                (a, v) -> {
                  order.add(2);
                  Map<String, Object> m = new LinkedHashMap<>();
                  m.put("a", 2);
                  return m;
                },
                (a, v) -> {
                  order.add(3);
                  Map<String, Object> m = new LinkedHashMap<>();
                  m.put("a", 3);
                  return m;
                }));
    assertEquals(List.of(1, 2), order);
    assertTrue(out.lines().stream().anyMatch(l -> l.equals("a:2") || l.startsWith("a:2")));
  }

  @Test
  void handlerChainNullShortCircuits() {
    List<Integer> order = new ArrayList<>();
    AnnotationSpan.applyAnnotationSpans(
        List.of(">", "#x", "a:1", "."),
        List.of(
            (a, v) -> {
              order.add(1);
              return null;
            },
            (a, v) -> {
              order.add(2);
              Map<String, Object> m = new LinkedHashMap<>();
              m.put("a", 9);
              return m;
            }));
    assertEquals(List.of(1), order);
  }

  @Test
  void keysBeforeHashPreservedCaptureDroppedOnNull() {
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "keep:1", "#d", "gone:2", ">n", "x:1", "<", "."),
            List.of((a, v) -> null));
    assertTrue(out.lines().contains("keep:1"));
    assertEquals(0, out.lines().stream().filter(l -> l.equals("gone:2")).count());
    assertTrue(out.escapePaths().isEmpty());
  }

  @Test
  void keepWireStillEscapesCaptureKeys() {
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "a:1", "# x", "b:2", ">c", "z:1", "<", "."),
            List.of((a, v) -> AnnotationSpan.KEEP));
    assertTrue(out.lines().contains("# x"));
    assertTrue(out.lines().contains("b:2"));
    assertTrue(out.escapePaths().contains("b"));
    assertTrue(out.escapePaths().contains("c"));
    assertFalse(out.escapePaths().contains("a"));
  }

  @Test
  void hardSkipControlRootBang() {
    int[] calls = {0};
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "#!xaiop/types/v1", "{\"version\":1,\"entries\":[]}", "a:1", "."),
            List.of(
                (a, v) -> {
                  calls[0]++;
                  Map<String, Object> m = new LinkedHashMap<>();
                  m.put("hijacked", true);
                  return m;
                }));
    assertEquals(0, calls[0]);
    assertTrue(out.lines().contains("#!xaiop/types/v1"));
    assertTrue(out.lines().contains("a:1"));
  }

  @Test
  void ordinaryHashStillSpans() {
    Map<String, Object> remount = new LinkedHashMap<>();
    remount.put("a", 9);
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "# note", "a:1", "."), List.of((a, v) -> remount));
    assertTrue(out.lines().stream().anyMatch(l -> l.startsWith("a:")));
    assertFalse(out.lines().contains("# note"));
  }

  @Test
  void dropThenFollowingRelocateStillApplies() {
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", "#drop", "x:1", "=z", "z:9", "."), List.of((a, v) -> null));
    assertTrue(out.lines().stream().noneMatch(l -> l.startsWith("x:")));
    assertTrue(out.lines().stream().anyMatch(l -> l.startsWith("z:") || l.equals("z:9")));
  }

  @Test
  void nestedRemountEscapePathsPrefixed() {
    Map<String, Object> remount = new LinkedHashMap<>();
    remount.put("k", "str");
    AnnotationSpan.Result out =
        AnnotationSpan.applyAnnotationSpans(
            List.of(">", ">p", "#t", "k:1", "<", "."), List.of((a, v) -> remount));
    assertTrue(
        out.escapePaths().contains("p.k")
            || out.escapePaths().stream().anyMatch(p -> p.endsWith(".k")));
  }

  @Test
  void engineRemountBeforeDiffKeysBeforeHashIntact() {
    List<Object> diffs = new ArrayList<>();
    try (DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add)
            .streamProcessing(true)
            .compat(false)
            .mergeChunkWindow(false)
            .build()) {
      Map<String, Object> remount = new LinkedHashMap<>();
      remount.put("rewritten", true);
      engine.onAnnotationSpan((a, v) -> remount);
      engine.push(
          """
          >
          keep:1
          # meta
          drop:9
          .
          """);
      engine.finish();
    }
    assertEquals(1, diffs.size());
    @SuppressWarnings("unchecked")
    Map<String, Object> diff = (Map<String, Object>) diffs.get(0);
    assertEquals(1, diff.get("keep"));
    assertEquals(true, diff.get("rewritten"));
    assertNull(diff.get("drop"));
  }

  @Test
  void engineNullDropRemovesCapture() {
    List<Object> diffs = new ArrayList<>();
    try (DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(diffs::add)
            .streamProcessing(true)
            .compat(false)
            .mergeChunkWindow(false)
            .build()) {
      engine.onAnnotationSpan((a, v) -> null);
      engine.push(
          """
          >
          keep:1
          # dropme
          flex:9
          .
          """);
      engine.finish();
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> diff = (Map<String, Object>) diffs.get(0);
    assertEquals(1, diff.get("keep"));
    assertNull(diff.get("flex"));
  }

  @Test
  void engineKeepReportsEscapeMeta() {
    List<Object> diffs = new ArrayList<>();
    List<DotCheckpointEngine.ChunkMeta> metas = new ArrayList<>();
    try (DotCheckpointEngine engine =
        DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .compat(false)
            .mergeChunkWindow(false)
            .onChunkWithMeta(
                (diff, meta) -> {
                  diffs.add(diff);
                  metas.add(meta);
                })
            .build()) {
      engine.onAnnotationSpan((a, v) -> AnnotationSpan.KEEP);
      engine.push(
          """
          >
          # s
          flex:1
          .
          """);
      engine.finish();
    }
    assertTrue(metas.get(0) != null && metas.get(0).typeCheckEscapePaths.contains("flex"));
  }

  @Test
  void engineCtorAnnotationSpanCountClear() {
    try (DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(d -> {})
            .annotationSpan((a, v) -> AnnotationSpan.KEEP, (a, v) -> AnnotationSpan.KEEP)
            .mergeChunkWindow(false)
            .build()) {
      assertEquals(2, engine.annotationSpanCount());
      engine.onAnnotationSpan((a, v) -> null);
      assertEquals(3, engine.annotationSpanCount());
      engine.clearAnnotationSpans();
      assertEquals(0, engine.annotationSpanCount());
      assertThrows(NullPointerException.class, () -> engine.onAnnotationSpan(null));
    }
  }

  @Test
  void streamAnnotationSpanWithLineIntercept() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://as-li",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .lineIntercept(ctx -> "drop".equals(ctx.view().key()) ? null : ctx.raw())
                .annotationSpan(
                    (a, v) -> {
                      Map<String, Object> m = new LinkedHashMap<>();
                      m.put("span", true);
                      return m;
                    }));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    stream.sendRaw(
        io.xaiop.stream.Transport.chunksOf(">\nkeep:1\ndrop:9\n# x\nflex:2\n.\n"));
    long deadline = System.nanoTime() + java.time.Duration.ofSeconds(5).toNanos();
    while (stream.status() != io.xaiop.stream.StreamStatus.COMPLETED) {
      if (stream.status() == io.xaiop.stream.StreamStatus.ERROR) {
        throw new AssertionError("stream error", stream.lastError());
      }
      if (System.nanoTime() > deadline) {
        throw new AssertionError("timeout");
      }
      Thread.sleep(4);
    }
    @SuppressWarnings("unchecked")
    Map<String, Object> diff = (Map<String, Object>) chunks.get(0);
    assertEquals(1, diff.get("keep"));
    assertEquals(true, diff.get("span"));
    assertNull(diff.get("drop"));
    assertNull(diff.get("flex"));
  }
}
