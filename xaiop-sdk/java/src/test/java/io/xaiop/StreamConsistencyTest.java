package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.Materialize;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.Transport;
import io.xaiop.stream.TransportKind;
import io.xaiop.stream.Utf8StreamDecoder;
import io.xaiop.stream.XaiopStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Stream consistency: awkward framing ≡ one-shot parse; engine ≡ stream shell. */
class StreamConsistencyTest {

  private static Object expectedJson(String source) {
    return Materialize.materializeSnapshot(Parse.parse(source));
  }

  private static void waitCompleted(XaiopStream stream) throws Exception {
    long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
    while (stream.status() != StreamStatus.COMPLETED) {
      if (stream.status() == StreamStatus.ERROR) {
        throw new AssertionError("stream error", stream.lastError());
      }
      if (System.nanoTime() > deadline) {
        throw new AssertionError("timeout, status=" + stream.status());
      }
      Thread.sleep(4);
    }
  }

  private static Object runRaw(String source, int slice) throws Exception {
    List<String> parts = new ArrayList<>();
    if (slice <= 0) {
      parts.add(source);
    } else {
      for (int i = 0; i < source.length(); i += slice) {
        parts.add(source.substring(i, Math.min(source.length(), i + slice)));
      }
    }
    XaiopStream stream = new XaiopStream("raw://c");
    Object[] done = new Object[1];
    stream.onChunk(d -> {});
    stream.onDone(j -> done[0] = j);
    stream.send(
        new XaiopStream.SendOptions().transport(TransportKind.RAW).source(parts));
    waitCompleted(stream);
    return done[0];
  }

  @Test
  void fixtureMatchesOneShotAcrossChunkSizes() throws Exception {
    String source = ">\n>a\nx:1\n.\n>b\ny:2\n.\n";
    Object want = expectedJson(source);
    assertEquals(want, runRaw(source, 0));
    assertEquals(want, runRaw(source, 1));
    assertEquals(want, runRaw(source, 3));
    assertEquals(want, runRaw(source, 17));
  }

  @Test
  void engineAndStreamAgreeOnFinalSnapshot() throws Exception {
    String source = ">\na:1\n.\n>b\nc:2\n.\n";
    List<Object> engineChunks = new ArrayList<>();
    DotCheckpointEngine engine =
        DotCheckpointEngine.Options.of(engineChunks::add).mergeChunkWindow(true).build();
    engine.push(source);
    engine.finish();
    Object engineSnap = engine.snapshot();

    Object streamSnap = runRaw(source, 5);
    assertEquals(engineSnap, streamSnap);
    assertEquals(expectedJson(source), streamSnap);
  }

  @Test
  void utf8SplitAcrossBinaryChunks() throws Exception {
    // "你好" (\u4f60\u597d) in UTF-8 split mid-codepoint then completed
    String hello = "\u4f60\u597d";
    byte[] all = (">\nmsg:" + hello + "\n.\n").getBytes(StandardCharsets.UTF_8);
    List<byte[]> parts = new ArrayList<>();
    parts.add(java.util.Arrays.copyOfRange(all, 0, 8));
    parts.add(java.util.Arrays.copyOfRange(all, 8, all.length));

    XaiopStream stream = new XaiopStream("raw://utf8");
    Object[] done = new Object[1];
    stream.onChunk(d -> {});
    stream.onDone(j -> done[0] = j);
    stream.send(new XaiopStream.SendOptions().transport(TransportKind.RAW).source(parts));
    waitCompleted(stream);
    assertEquals(Map.of("msg", hello), done[0]);
  }

  @Test
  void utf8DecoderStandalone() {
    Utf8StreamDecoder d = new Utf8StreamDecoder();
    byte[] hi = "\u4f60\u597d".getBytes(StandardCharsets.UTF_8);
    String a = d.push(java.util.Arrays.copyOfRange(hi, 0, 2));
    String b = d.push(java.util.Arrays.copyOfRange(hi, 2, hi.length));
    String c = d.flush();
    assertEquals("\u4f60\u597d", a + b + c);
  }

  @Test
  void utf8DecoderHoldsIncompleteLeadingBytes() {
    Utf8StreamDecoder d = new Utf8StreamDecoder();
    byte[] hi = "\u4f60\u597d".getBytes(StandardCharsets.UTF_8);
    assertEquals("", d.push(java.util.Arrays.copyOf(hi, 2)));
    assertEquals("\u4f60\u597d", d.push(java.util.Arrays.copyOfRange(hi, 2, hi.length)));
    assertEquals("", d.flush());
  }

  @Test
  void sseBlockJoinsMultiDataLines() {
    String block = "event: tick\ndata: >\ndata: a:1\ndata: .\n";
    assertEquals(">\na:1\n.", Transport.parseSseBlock(block, null));
    assertEquals("", Transport.parseSseBlock(block, java.util.Set.of("other")));
  }

  @Test
  void midStreamSnapshotUndefinedUntilFinish() throws Exception {
    XaiopStream stream =
        new XaiopStream("raw://local", XaiopStream.Options.defaults().mergeChunkWindow(false));
    Object[] midSnap = new Object[1];
    stream.onChunk(
        d -> {
          if (midSnap[0] == null) midSnap[0] = stream.getSnapshot();
        });
    stream.onDone(j -> {});
    stream.sendRaw(Transport.chunksOf(">\na:1\n.\n>b\nc:2\n.\n"));
    waitCompleted(stream);
    assertNull(midSnap[0]);
    assertEquals(Map.of("a", 1, "b", Map.of("c", 2)), stream.getSnapshot());
  }
}
