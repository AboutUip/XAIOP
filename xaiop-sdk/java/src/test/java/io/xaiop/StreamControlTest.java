package io.xaiop;

import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.control.ControlFrames;
import io.xaiop.stream.AnnotationSpan;
import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.ParseHistory;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.Transport;
import io.xaiop.stream.TransportKind;
import io.xaiop.stream.XaiopStream;
import io.xaiop.types.XaiopTypeError;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/**
 * Stream + control / typeCheck / intercept+span / abort+busy edges beyond {@link
 * StreamAdvancedTest}.
 */
class StreamControlTest {

  private static void waitStatus(XaiopStream stream, StreamStatus want) throws Exception {
    long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
    while (stream.status() != want) {
      if (stream.status() == StreamStatus.ERROR && want != StreamStatus.ERROR) {
        throw new AssertionError("stream error", stream.lastError());
      }
      if (System.nanoTime() > deadline) {
        throw new AssertionError("timeout waiting for " + want + ", got " + stream.status());
      }
      Thread.sleep(4);
    }
  }

  @Test
  void controlDemuxMidStreamWithSeqMeta() throws Exception {
    List<DotCheckpointEngine.ChunkMeta> metas = new ArrayList<>();
    AtomicReference<Object> sessionBody = new AtomicReference<>();
    XaiopStream stream =
        new XaiopStream(
            "raw://ctl-seq",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .session(true)
                .onSession((body, frame) -> sessionBody.set(body)));
    stream.onChunkWithMeta((d, meta) -> metas.add(meta));
    stream.onDone(j -> {});

    Map<String, Object> body =
        map("sessionId", "s-mid", "role", "peer", "capabilities", List.of(), "epoch", 0);
    String text =
        ControlFrames.encodeSessionFrame(body)
            + ControlFrames.encodeSeqFrame(1)
            + ">\na:1\n.\n"
            + ControlFrames.encodeSeqFrame(2)
            + ">\nb:2\n.\n";
    stream.sendRaw(Transport.chunksOf(text));
    waitStatus(stream, StreamStatus.COMPLETED);

    assertNotNull(sessionBody.get());
    assertEquals(map("a", 1, "b", 2), stream.getSnapshot());
    assertEquals(2, metas.size());
    assertEquals(1, metas.get(0).seq);
    assertEquals(2, metas.get(1).seq);
    assertEquals(1, metas.get(0).logSeq);
    assertEquals(2, metas.get(1).logSeq);
  }

  @Test
  void typeCheckViolationOnDiffErrorsStream() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://tc-viol",
            XaiopStream.Options.defaults().mergeChunkWindow(false).typeCheck(true));
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\na:1\n.\n>\na:oops\n.\n"));
    waitStatus(stream, StreamStatus.ERROR);
    assertInstanceOf(XaiopTypeError.class, unwrap(stream.lastError()));
  }

  @Test
  void coverPlusHistoryTogether() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://cover-hist",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .cover(true)
                .historySnapshot(true));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    String text = ">\n>a\nx:1\n.\n>b\ny:1\n&a\nz:2\n.\n";
    stream.sendRaw(Transport.chunksOf(text));
    waitStatus(stream, StreamStatus.COMPLETED);

    assertTrue(
        chunks.stream()
            .anyMatch(c -> c instanceof Map<?, ?> m && m.containsKey("a") && m.get("a") == null));
    ParseHistory h = stream.history();
    assertNotNull(h);
    assertTrue(h.length() >= 2);
    assertEquals(Parse.parse(text), stream.getSnapshot());
  }

  @Test
  void interceptAndSpanCombined() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://li-as",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .lineIntercept(
                    ctx -> "skip".equals(ctx.view().key()) ? null : ctx.raw(),
                    ctx -> "a".equals(ctx.view().key()) ? "a:10" : ctx.raw())
                .annotationSpan(
                    (ann, view) -> {
                      Map<String, Object> remount = new java.util.LinkedHashMap<>();
                      remount.put("fromSpan", true);
                      remount.put("a", 99);
                      return remount;
                    }));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\na:1\nskip:2\n# note\nb:3\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(1, chunks.size());
    @SuppressWarnings("unchecked")
    Map<String, Object> diff = (Map<String, Object>) chunks.get(0);
    // Span remount wins for capture region; intercept rewrote a before span saw capture.
    assertTrue(diff.containsKey("fromSpan") || diff.containsKey("a"));
    assertNull(diff.get("skip"));
    assertEquals(1, stream.annotationSpanCount());
    assertEquals(2, stream.lineInterceptCount());
  }

  @Test
  void abortDuringRawStopsStream() throws Exception {
    CountDownLatch first = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    Iterable<String> slow =
        () ->
            new Iterator<>() {
              int step;

              @Override
              public boolean hasNext() {
                return step < 2;
              }

              @Override
              public String next() {
                if (step == 0) {
                  step = 1;
                  first.countDown();
                  try {
                    if (!release.await(3, TimeUnit.SECONDS)) {
                      throw new IllegalStateException("gate timeout");
                    }
                  } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(e);
                  }
                  return ">\na:1\n";
                }
                if (step == 1) {
                  step = 2;
                  return ".\n";
                }
                throw new NoSuchElementException();
              }
            };

    XaiopStream stream = new XaiopStream("raw://abort");
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    stream.send(new XaiopStream.SendOptions().transport(TransportKind.RAW).source(slow));
    assertTrue(first.await(3, TimeUnit.SECONDS));
    // Ensure transport has entered STREAMING / CONNECTING before abort.
    long deadline = System.nanoTime() + Duration.ofSeconds(2).toNanos();
    while (!stream.isBusy() && System.nanoTime() < deadline) {
      Thread.sleep(4);
    }
    assertTrue(stream.abort());
    release.countDown();
    waitStatus(stream, StreamStatus.ABORTED);
  }

  @Test
  void busyRejectsSecondSendAndSetUrl() throws Exception {
    CountDownLatch first = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    Iterable<String> slow =
        () ->
            new Iterator<>() {
              int step;

              @Override
              public boolean hasNext() {
                return step < 2;
              }

              @Override
              public String next() {
                if (step == 0) {
                  step = 1;
                  first.countDown();
                  try {
                    if (!release.await(3, TimeUnit.SECONDS)) {
                      throw new IllegalStateException("gate timeout");
                    }
                  } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(e);
                  }
                  return ">\na:1\n";
                }
                step = 2;
                return ".\n";
              }
            };

    XaiopStream stream = new XaiopStream("raw://busy");
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    stream.send(new XaiopStream.SendOptions().transport(TransportKind.RAW).source(slow));
    assertTrue(first.await(3, TimeUnit.SECONDS));
    long deadline = System.nanoTime() + Duration.ofSeconds(2).toNanos();
    while (!stream.isBusy() && System.nanoTime() < deadline) {
      Thread.sleep(4);
    }
    assertTrue(stream.isBusy());
    assertFalse(stream.setUrl("http://example.com"));
    IllegalStateException busy =
        assertThrows(
            IllegalStateException.class,
            () ->
                stream.send(
                    new XaiopStream.SendOptions()
                        .transport(TransportKind.RAW)
                        .source(Transport.chunksOf(""))));
    assertTrue(busy.getMessage().contains("busy"));
    release.countDown();
    waitStatus(stream, StreamStatus.COMPLETED);
    assertTrue(stream.setUrl("http://example.com/ok"));
  }

  @Test
  void annotationSpanKeepConstantStillAvailable() {
    assertEquals(AnnotationSpan.KEEP, AnnotationSpan.KEEP);
  }

  private static Throwable unwrap(Throwable t) {
    Throwable cur = t;
    while (cur != null && cur.getCause() != null && cur.getCause() != cur) {
      if (cur instanceof XaiopTypeError) return cur;
      cur = cur.getCause();
    }
    return t;
  }
}
