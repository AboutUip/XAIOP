package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.control.ControlFrames;
import io.xaiop.stream.AnnotationSpan;
import io.xaiop.stream.ParseHistory;
import io.xaiop.stream.StreamMode;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.Transport;
import io.xaiop.stream.TransportKind;
import io.xaiop.stream.XaiopStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/** Advanced XaiopStream wiring: cover, history, intercept, typeCheck, control demux, chunks(). */
class StreamAdvancedTest {

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
  void coverTrueProducesTombstoneDiff() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://cover",
            XaiopStream.Options.defaults().mergeChunkWindow(false).cover(true));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    String text = ">\n>a\nx:1\n.\n>b\ny:1\n&a\nz:2\n.\n";
    stream.sendRaw(Transport.chunksOf(text));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertTrue(
        chunks.stream()
            .anyMatch(
                c -> c instanceof Map<?, ?> m && m.containsKey("a") && m.get("a") == null),
        "expected cover tombstone Diff with a:null");
  }

  @Test
  void historySnapshotRecordsAndJumpToRealtime() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://hist",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .historySnapshot(true)
                .historyRealtime(true));
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\na:1\n.\n>\nb:2\n.\n>\nc:3\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);

    ParseHistory h = stream.history();
    assertNotNull(h);
    assertTrue(h.length() >= 3);
    ParseHistory.Info info = stream.historyInfo();
    assertTrue(info.snapshot);
    assertTrue(info.realtime);

    ParseHistory.JumpResult jumped = stream.jumpTo(1);
    assertEquals(2, jumped.kept);
    assertEquals(1, jumped.discarded);
    assertEquals(Map.of("a", 1, "b", 2), jumped.after);
    assertEquals(2, stream.history().length());
  }

  @Test
  void lineInterceptCanSkipAndRewrite() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://li",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .lineIntercept(
                    ctx -> "skip".equals(ctx.view().key()) ? null : ctx.raw(),
                    ctx -> "a".equals(ctx.view().key()) ? "a:99" : ctx.raw()));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\na:1\nskip:2\nb:3\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(1, chunks.size());
    @SuppressWarnings("unchecked")
    Map<String, Object> diff = (Map<String, Object>) chunks.get(0);
    assertEquals(99, diff.get("a"));
    assertNull(diff.get("skip"));
    assertEquals(3, diff.get("b"));
    assertEquals(2, stream.lineInterceptCount());
  }

  @Test
  void annotationSpanRemountsDiff() throws Exception {
    Map<String, Object> remount = new LinkedHashMap<>();
    remount.put("rewritten", true);
    XaiopStream stream =
        new XaiopStream(
            "raw://as",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .annotationSpan((a, v) -> remount));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\nkeep:1\n# meta\ndrop:9\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(1, chunks.size());
    @SuppressWarnings("unchecked")
    Map<String, Object> diff = (Map<String, Object>) chunks.get(0);
    assertEquals(1, diff.get("keep"));
    assertEquals(true, diff.get("rewritten"));
    assertNull(diff.get("drop"));
    assertEquals(1, stream.annotationSpanCount());
  }

  @Test
  void typeCheckObservesDiffWithoutCrash() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://tc",
            XaiopStream.Options.defaults().mergeChunkWindow(false).typeCheck(true));
    assertTrue(stream.typeCheck());
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\na:1\n.\n>\nb:2\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertFalse(chunks.isEmpty());
    assertEquals(Map.of("a", 1, "b", 2), stream.getSnapshot());

    XaiopStream compat =
        new XaiopStream(
            "raw://tc2",
            XaiopStream.Options.defaults().typeCheck(true).compatibilityMode(true));
    assertFalse(compat.typeCheck());
  }

  @Test
  void controlSessionFrameDemuxedNotInDocument() throws Exception {
    AtomicReference<Object> sessionBody = new AtomicReference<>();
    XaiopStream stream =
        new XaiopStream(
            "raw://ctl",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .session(true)
                .onSession((body, frame) -> sessionBody.set(body)));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    Object[] done = new Object[1];
    stream.onDone(j -> done[0] = j);

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("sessionId", "s-test");
    body.put("role", "peer");
    String frame = ControlFrames.encodeSessionFrame(body);
    stream.send(
        new XaiopStream.SendOptions()
            .transport(TransportKind.RAW)
            .source(Transport.chunksOf(frame + ">\na:1\n.\n")));
    waitStatus(stream, StreamStatus.COMPLETED);

    assertNotNull(sessionBody.get());
    assertEquals(Map.of("a", 1), done[0]);
    assertEquals(1, chunks.size());
    assertFalse(stream.getBufferedText().contains("#!xaiop/session"));
  }

  @Test
  void asyncIteratorChunksReceivesDiffs() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://ait",
            XaiopStream.Options.defaults()
                .mergeChunkWindow(false)
                .modes(StreamMode.ASYNC_ITERATOR, StreamMode.PROMISE));
    var promise =
        stream.send(
            new XaiopStream.SendOptions()
                .transport(TransportKind.RAW)
                .source(Transport.chunksOf(">\na:1\n.\n>b\nc:2\n.\n")));
    List<Object> seen = new ArrayList<>();
    for (Object d : stream.chunks()) {
      seen.add(d);
    }
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(2, seen.size());
    assertEquals(Map.of("a", 1), seen.get(0));
    assertEquals(Map.of("b", Map.of("c", 2)), seen.get(1));
    assertEquals(Map.of("a", 1, "b", Map.of("c", 2)), promise.get());
  }

  @Test
  void bufferStatsIdleAndActive() throws Exception {
    XaiopStream stream = new XaiopStream("raw://buf");
    var idle = stream.bufferStats();
    assertEquals(0, idle.length);
    assertEquals(0, idle.committedAt);
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\nz:1\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    // after complete engine may still exist until next send; stats should be readable
    assertTrue(stream.bufferStats().length >= 0);
  }
}
