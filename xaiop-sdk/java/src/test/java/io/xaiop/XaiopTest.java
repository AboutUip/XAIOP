package io.xaiop;

import static io.xaiop.Fixtures.map;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import io.xaiop.stream.DotCheckpointEngine;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.Transport;
import io.xaiop.stream.XaiopStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/** The {@link Xaiop} facade is a thin delegate over the underlying entry points. */
class XaiopTest {

  @Test
  void protocolAndSdkVersions() {
    assertEquals("0.6.0", Xaiop.PROTOCOL_VERSION);
    assertEquals("0.15.1", Xaiop.SDK_VERSION);
  }

  @Test
  void parseDelegatesIncludingCompatibilityOverloads() {
    assertEquals(Parse.parse(">\na:1\n"), Xaiop.parse(">\na:1\n"));
    assertEquals(Parse.parse("a:1\n", true), Xaiop.parse("a:1\n", true));
    assertInstanceOf(XaiopFragment.class, Xaiop.parse("a:1\n", false));
  }

  @Test
  void encodeDelegatesWithAndWithoutOptions() {
    assertEquals(Encode.encode(map("a", 1)), Xaiop.encode(map("a", 1)));
    assertEquals(
        Encode.encode(map("a", 1), EncodeOptions.singlePhase()),
        Xaiop.encode(map("a", 1), EncodeOptions.singlePhase()));
  }

  @Test
  void checkpointDelegatesToTheEngineDefaults() {
    List<Object> chunks = new ArrayList<>();
    try (DotCheckpointEngine engine = Xaiop.checkpoint(chunks::add)) {
      engine.push(">\na:1\n.\n>\nb:2\n.\n");
      engine.finish();
    }
    assertEquals(List.of(map("a", 1, "b", 2)), chunks, "window batching is on by default");
  }

  @Test
  void checkpointAcceptsAFullyConfiguredOptionsObject() {
    List<Object> chunks = new ArrayList<>();
    try (DotCheckpointEngine engine =
        Xaiop.checkpoint(DotCheckpointEngine.Options.of(chunks::add).mergeChunkWindow(false))) {
      engine.push(">\na:1\n.\n>\nb:2\n.\n");
      engine.finish();
    }
    assertEquals(List.of(map("a", 1), map("b", 2)), chunks);
  }

  @Test
  void streamFacadeCompletesRawSend() throws Exception {
    XaiopStream stream = Xaiop.stream("raw://facade");
    Object[] done = new Object[1];
    stream.onChunk(d -> {});
    stream.onDone(j -> done[0] = j);
    stream.sendRaw(Transport.chunksOf(">\nz:1\n.\n"));
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
    while (stream.status() != StreamStatus.COMPLETED) {
      if (stream.status() == StreamStatus.ERROR) {
        throw new AssertionError(stream.lastError());
      }
      if (System.nanoTime() > deadline) throw new AssertionError("timeout");
      Thread.sleep(4);
    }
    assertEquals(map("z", 1), done[0]);
  }
}
