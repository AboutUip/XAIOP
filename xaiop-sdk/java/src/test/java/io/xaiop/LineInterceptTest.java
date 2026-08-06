package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import io.xaiop.stream.LineIntercept;
import io.xaiop.stream.LineKind;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.Transport;
import io.xaiop.stream.XaiopStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Port of Node {@code line.intercept.test.js} scenarios that do not need DotCheckpoint / WS. */
class LineInterceptTest {

  @Test
  void lineKindStableIds() {
    assertEquals("phase", LineKind.PHASE);
    assertEquals("content", LineKind.CONTENT);
    assertEquals("annotation", LineKind.ANNOTATION);
    assertEquals("unknown", LineKind.UNKNOWN);
  }

  @Test
  void emptyLineViewHasAllFixedSlots() {
    LineIntercept.LineView v = LineIntercept.emptyLineView("raw", LineKind.UNKNOWN);
    assertEquals(LineKind.UNKNOWN, v.kind());
    assertEquals("raw", v.raw());
    assertNull(v.name());
    assertNull(v.path());
    assertNull(v.key());
    assertNull(v.valueText());
    assertNull(v.annotationText());
  }

  @Test
  void classifyLineKindMatrix() {
    assertEquals(LineKind.PHASE, LineIntercept.classifyLine(".").kind());
    assertEquals("note", LineIntercept.classifyLine("#note").annotationText());
    assertEquals(LineKind.ANNOTATION, LineIntercept.classifyLine("#note").kind());
    assertEquals("null", LineIntercept.classifyLine("k:null").valueText());
    assertEquals("k", LineIntercept.classifyLine("k:null").key());
    assertEquals(LineKind.CONTENT, LineIntercept.classifyLine("k:null").kind());
    assertEquals("a>b", LineIntercept.classifyLine("&a>b").path());
    assertEquals(LineKind.DELETE, LineIntercept.classifyLine("&a>b").kind());

    assertEquals(LineKind.POP, LineIntercept.classifyLine("<").kind());
    assertEquals("name", LineIntercept.classifyLine("<name").name());
    assertEquals(LineKind.POP_ENTER, LineIntercept.classifyLine("<name").kind());
    assertEquals("p", LineIntercept.classifyLine("=p").path());
    assertEquals(LineKind.LOCATE, LineIntercept.classifyLine("=p").kind());
    assertEquals("p", LineIntercept.classifyLine("@p").path());
    assertEquals(LineKind.EXACT, LineIntercept.classifyLine("@p").kind());
    assertEquals("p", LineIntercept.classifyLine("!p").path());
    assertEquals(LineKind.BROADCAST, LineIntercept.classifyLine("!p").kind());
    assertEquals(LineKind.OBJECT_ANON, LineIntercept.classifyLine(">").kind());
    assertEquals(LineKind.ARRAY_ANON, LineIntercept.classifyLine("-").kind());
    assertEquals("items", LineIntercept.classifyLine(">items-").name());
    assertEquals(LineKind.ARRAY_NAMED, LineIntercept.classifyLine(">items-").kind());
    assertEquals("obj", LineIntercept.classifyLine(">obj").name());
    assertEquals(LineKind.OBJECT_NAMED, LineIntercept.classifyLine(">obj").kind());
    assertEquals(LineKind.UNKNOWN, LineIntercept.classifyLine("nope").kind());
  }

  @Test
  void classifyLineNeverThrowsOnNull() {
    LineIntercept.LineView v = LineIntercept.classifyLine(null);
    assertEquals(LineKind.UNKNOWN, v.kind());
    assertEquals("", v.raw());
  }

  @Test
  void chainOrderRewriteAndNullShortCircuit() {
    String out =
        LineIntercept.runLineInterceptChain(
            "a:1",
            List.of(
                ctx -> "a:2",
                ctx -> ctx.raw()));
    assertEquals("a:2", out);

    assertNull(
        LineIntercept.runLineInterceptChain(
            "x",
            List.of(
                ctx -> "y",
                ctx -> null,
                ctx -> {
                  fail("handler after null must not run");
                  return ctx.raw();
                })));
  }

  @Test
  void chainEmptyHandlersReturnsLine() {
    assertEquals("a:1", LineIntercept.runLineInterceptChain("a:1", List.of()));
    assertEquals("a:1", LineIntercept.runLineInterceptChain("a:1", null));
  }

  @Test
  void chainKeepViaRawReturn() {
    String out =
        LineIntercept.runLineInterceptChain(
            "keep:1",
            List.of(
                ctx ->
                    "skip".equals(ctx.view().key()) ? null : ctx.raw(),
                ctx -> {
                  assertEquals("keep:1", ctx.raw());
                  return ctx.raw();
                }));
    assertEquals("keep:1", out);
  }

  @Test
  void chainSkipsNullHandlerEntries() {
    assertEquals(
        "z",
        LineIntercept.runLineInterceptChain(
            "x",
            java.util.Arrays.asList(null, ctx -> "z")));
  }

  @Test
  void contentRewriteSeesUpdatedView() {
    String out =
        LineIntercept.runLineInterceptChain(
            "a:1",
            List.of(
                ctx -> "b:2",
                ctx -> {
                  assertEquals(LineKind.CONTENT, ctx.view().kind());
                  assertEquals("b", ctx.view().key());
                  assertEquals("2", ctx.view().valueText());
                  return ctx.raw();
                }));
    assertEquals("b:2", out);
  }

  @Test
  void protocolAndSdkVersionsStillPresent() {
    // Mirror Node version smoke without requiring intercept wiring on Xaiop facade yet.
    assertTrue(Xaiop.PROTOCOL_VERSION != null && !Xaiop.PROTOCOL_VERSION.isEmpty());
    assertTrue(Xaiop.SDK_VERSION != null && !Xaiop.SDK_VERSION.isEmpty());
  }

  @Test
  void engineLineInterceptSkipAndRewrite() {
    List<Object> diffs = new ArrayList<>();
    try (io.xaiop.stream.DotCheckpointEngine eng =
        io.xaiop.stream.DotCheckpointEngine.Options.builder()
            .streamProcessing(true)
            .mergeChunkWindow(false)
            .lineIntercept(
                ctx -> "skip".equals(ctx.view().key()) ? null : ctx.raw(),
                ctx -> "a".equals(ctx.view().key()) ? "a:99" : ctx.raw())
            .onChunk(diffs::add)
            .build()) {
      eng.push(">\na:1\nskip:2\nb:3\n.\n");
      eng.finish();
    }
    assertEquals(1, diffs.size());
    @SuppressWarnings("unchecked")
    Map<String, Object> diff = (Map<String, Object>) diffs.get(0);
    assertEquals(99, diff.get("a"));
    assertNull(diff.get("skip"));
    assertEquals(3, diff.get("b"));
  }

  @Test
  void streamLineInterceptPlusAnnotationSpan() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://li-span",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .lineIntercept(ctx -> "noise".equals(ctx.view().key()) ? null : ctx.raw())
                .annotationSpan((a, v) -> Map.of("tagged", true)));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\nkeep:1\nnoise:9\n# m\nflex:2\n.\n"));
    long deadline = System.nanoTime() + java.time.Duration.ofSeconds(5).toNanos();
    while (stream.status() != StreamStatus.COMPLETED) {
      if (stream.status() == StreamStatus.ERROR) {
        throw new AssertionError("stream error", stream.lastError());
      }
      if (System.nanoTime() > deadline) {
        throw new AssertionError("timeout status=" + stream.status());
      }
      Thread.sleep(4);
    }
    assertEquals(1, chunks.size());
    @SuppressWarnings("unchecked")
    Map<String, Object> diff = (Map<String, Object>) chunks.get(0);
    assertEquals(1, diff.get("keep"));
    assertEquals(true, diff.get("tagged"));
    assertNull(diff.get("noise"));
    assertNull(diff.get("flex"));
  }
}
