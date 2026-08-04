package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.StreamMode;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.Transport;
import io.xaiop.stream.TransportKind;
import io.xaiop.stream.XaiopStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;

class StreamTest {

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
  void perPhaseParseWithStepwiseWindow() throws Exception {
    XaiopStream stream =
        new XaiopStream("raw://local", XaiopStream.Options.defaults().mergeChunkWindow(false));
    List<Object> chunks = new ArrayList<>();
    Object[] done = new Object[1];
    stream.onChunk(chunks::add);
    stream.onDone(j -> done[0] = j);
    stream.send(
        new XaiopStream.SendOptions()
            .transport(TransportKind.RAW)
            .source(Transport.chunksOf(">\n>a\nx:", "1\n.\n>b\ny:2\n.\n>c\n", "z:3\n")));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(3, chunks.size());
    assertEquals(Map.of("a", Map.of("x", 1)), chunks.get(0));
    assertEquals(Map.of("b", Map.of("y", 2)), chunks.get(1));
    assertEquals(Map.of("c", Map.of("z", 3)), chunks.get(2));
    assertEquals(Map.of("a", Map.of("x", 1), "b", Map.of("y", 2), "c", Map.of("z", 3)), done[0]);
  }

  @Test
  void emptyPhaseYieldsNullChunk() throws Exception {
    XaiopStream stream =
        new XaiopStream("raw://local", XaiopStream.Options.defaults().mergeChunkWindow(false));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\na:1\n.\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(Map.of("a", 1), chunks.get(0));
    assertNull(chunks.get(1));
  }

  @Test
  void mergeChunkWindowBatchesDotsInOnePush() throws Exception {
    XaiopStream stream =
        new XaiopStream("raw://local", XaiopStream.Options.defaults().mergeChunkWindow(true));
    List<Object> chunks = new ArrayList<>();
    stream.onChunk(chunks::add);
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\n>a\nx:1\n.\n>b\ny:2\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(1, chunks.size());
    assertEquals(Map.of("a", Map.of("x", 1), "b", Map.of("y", 2)), chunks.get(0));
  }

  @Test
  void asyncParseMatchesOneShotDone() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://async",
            XaiopStream.Options.defaults().mergeChunkWindow(true).asyncParse(true));
    List<Object> chunks = new ArrayList<>();
    Object[] done = new Object[1];
    stream.onChunk(chunks::add);
    stream.onDone(j -> done[0] = j);
    stream.sendRaw(Transport.chunksOf(">\n>a\nx:1\n.\n", ">b\ny:2\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(Map.of("a", Map.of("x", 1), "b", Map.of("y", 2)), done[0]);
    assertFalse(chunks.isEmpty());
  }

  @Test
  void streamProcessingOffOneChunkThenDone() throws Exception {
    XaiopStream stream =
        new XaiopStream("raw://local", XaiopStream.Options.defaults().streamProcessing(false));
    List<String> order = new ArrayList<>();
    Object[] chunk = new Object[1];
    Object[] done = new Object[1];
    stream.onChunk(
        d -> {
          order.add("chunk");
          chunk[0] = d;
        });
    stream.onDone(
        j -> {
          order.add("done");
          done[0] = j;
        });
    stream.sendRaw(Transport.chunksOf(">\na:1\n.\n>b\nc:2\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(List.of("chunk", "done"), order);
    assertEquals(chunk[0], done[0]);
  }

  @Test
  void busyRejectsSecondSend() throws Exception {
    XaiopStream stream = new XaiopStream("raw://local");
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    AtomicBoolean gate = new AtomicBoolean(false);
    Iterable<String> slow =
        () ->
            new java.util.Iterator<>() {
              int i;

              @Override
              public boolean hasNext() {
                return i < 2;
              }

              @Override
              public String next() {
                if (i == 0) {
                  i++;
                  return ">\na:1\n";
                }
                while (!gate.get()) {
                  try {
                    Thread.sleep(2);
                  } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                  }
                }
                i++;
                return ".\n";
              }
            };
    stream.send(new XaiopStream.SendOptions().transport(TransportKind.RAW).source(slow));
    waitStatus(stream, StreamStatus.STREAMING);
    assertFalse(stream.setUrl("http://example.com"));
    assertThrows(
        IllegalStateException.class,
        () ->
            stream.send(
                new XaiopStream.SendOptions()
                    .transport(TransportKind.RAW)
                    .source(Transport.chunksOf(""))));
    gate.set(true);
    waitStatus(stream, StreamStatus.COMPLETED);
    assertTrue(stream.setUrl("http://example.com/ok"));
  }

  @Test
  void promiseModeReturnsFinalJson() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://local", XaiopStream.Options.defaults().modes(StreamMode.PROMISE));
    CompletableFuture<Object> fut =
        stream.send(
            new XaiopStream.SendOptions()
                .transport(TransportKind.RAW)
                .source(Transport.chunksOf(">\nz:9\n.\n")));
    assertEquals(Map.of("z", 9), fut.get(5, TimeUnit.SECONDS));
    assertEquals(StreamStatus.COMPLETED, stream.status());
  }

  @Test
  void eventsModeEmitsChunkAndDone() throws Exception {
    XaiopStream stream =
        new XaiopStream(
            "raw://local", XaiopStream.Options.defaults().modes(StreamMode.EVENTS));
    List<Object> chunks = new ArrayList<>();
    Object[] done = new Object[1];
    stream.on(XaiopStream.StreamEvent.CHUNK, chunks::add);
    stream.on(XaiopStream.StreamEvent.DONE, j -> done[0] = j);
    stream.sendRaw(Transport.chunksOf(">\na:1\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(List.of(Map.of("a", 1)), chunks);
    assertEquals(Map.of("a", 1), done[0]);
  }

  @Test
  void abortSetsAbortedStatus() throws Exception {
    XaiopStream stream = new XaiopStream("raw://local");
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    AtomicBoolean gate = new AtomicBoolean(false);
    Iterable<String> slow =
        () ->
            new java.util.Iterator<>() {
              int i;

              @Override
              public boolean hasNext() {
                return i < 2;
              }

              @Override
              public String next() {
                if (i++ == 0) return ">\na:1\n";
                while (!gate.get()) {
                  try {
                    Thread.sleep(2);
                  } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                  }
                }
                return ".\n";
              }
            };
    stream.send(new XaiopStream.SendOptions().transport(TransportKind.RAW).source(slow));
    waitStatus(stream, StreamStatus.STREAMING);
    assertTrue(stream.abort());
    assertEquals(StreamStatus.ABORTED, stream.status());
    gate.set(true);
  }

  @Test
  void committedSnapshotAdvancesAtPhaseBoundary() throws Exception {
    XaiopStream stream =
        new XaiopStream("raw://local", XaiopStream.Options.defaults().mergeChunkWindow(false));
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\na:1\n.\n", ">b\nc:2\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(Map.of("a", 1, "b", Map.of("c", 2)), stream.getSnapshot());
    assertEquals(Map.of("a", 1, "b", Map.of("c", 2)), stream.getCommittedSnapshot());
  }

  @Test
  void listenerExceptionsDoNotFailTheStream() throws Exception {
    XaiopStream stream = new XaiopStream("raw://local");
    List<Object> ok = new ArrayList<>();
    stream.onChunk(
        d -> {
          throw new RuntimeException("boom-chunk");
        });
    stream.onChunk(ok::add);
    stream.onDone(
        j -> {
          throw new RuntimeException("boom-done");
        });
    Object[] done = new Object[1];
    stream.onDone(j -> done[0] = j);
    stream.sendRaw(Transport.chunksOf(">\na:1\n.\n"));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(List.of(Map.of("a", 1)), ok);
    assertEquals(Map.of("a", 1), done[0]);
  }

  @Test
  void emptyDocumentDoneIsEmptyObject() throws Exception {
    XaiopStream stream = new XaiopStream("raw://empty");
    Object[] done = new Object[1];
    stream.onChunk(d -> {});
    stream.onDone(j -> done[0] = j);
    stream.sendRaw(Transport.chunksOf(""));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(Map.of(), done[0]);
    assertEquals("", stream.getBufferedText());
  }

  @Test
  void bufferedTextAccumulatesWire() throws Exception {
    XaiopStream stream =
        new XaiopStream("raw://buf", XaiopStream.Options.defaults().mergeChunkWindow(false));
    stream.onChunk(d -> {});
    stream.onDone(j -> {});
    String wire = ">\na:1\n.\n";
    stream.sendRaw(Transport.chunksOf(wire));
    waitStatus(stream, StreamStatus.COMPLETED);
    assertEquals(wire, stream.getBufferedText());
  }
}
