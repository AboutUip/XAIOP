package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.TransportKind;
import io.xaiop.stream.XaiopStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

class StreamHttpTest {

  private static void waitCompleted(XaiopStream stream) throws Exception {
    long deadline = System.nanoTime() + Duration.ofSeconds(8).toNanos();
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

  @Test
  void httpBodyStream() throws Exception {
    String body = ">\na:1\n.\n>b\nc:2\n.\n";
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/xaiop",
        ex -> {
          byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
          ex.getResponseHeaders().add("Content-Type", "text/plain; charset=utf-8");
          ex.sendResponseHeaders(200, bytes.length);
          try (OutputStream os = ex.getResponseBody()) {
            // split write to exercise streaming decode path
            os.write(bytes, 0, Math.min(6, bytes.length));
            os.write(bytes, Math.min(6, bytes.length), Math.max(0, bytes.length - 6));
          }
        });
    server.setExecutor(Executors.newCachedThreadPool());
    server.start();
    try {
      int port = server.getAddress().getPort();
      XaiopStream stream = new XaiopStream("http://127.0.0.1:" + port + "/xaiop");
      List<Object> chunks = new ArrayList<>();
      Object[] done = new Object[1];
      stream.onChunk(chunks::add);
      stream.onDone(j -> done[0] = j);
      stream.send(new XaiopStream.SendOptions().transport(TransportKind.HTTP));
      waitCompleted(stream);
      assertEquals(Map.of("a", 1, "b", Map.of("c", 2)), done[0]);
      assertTrue(chunks.size() >= 1);
    } finally {
      server.stop(0);
    }
  }

  @Test
  void sseDataEvents() throws Exception {
    String sse =
        "event: message\n"
            + "data: >\n"
            + "data: a:1\n"
            + "data: .\n"
            + "\n"
            + "data: >\n"
            + "data: b:2\n"
            + "data: .\n"
            + "\n";
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/sse",
        ex -> {
          byte[] bytes = sse.getBytes(StandardCharsets.UTF_8);
          ex.getResponseHeaders().add("Content-Type", "text/event-stream");
          ex.sendResponseHeaders(200, bytes.length);
          try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
          }
        });
    server.setExecutor(Executors.newCachedThreadPool());
    server.start();
    try {
      int port = server.getAddress().getPort();
      XaiopStream stream =
          new XaiopStream(
              "http://127.0.0.1:" + port + "/sse",
              XaiopStream.Options.defaults().mergeChunkWindow(false));
      List<Object> chunks = new ArrayList<>();
      Object[] done = new Object[1];
      stream.onChunk(chunks::add);
      stream.onDone(j -> done[0] = j);
      stream.send(new XaiopStream.SendOptions().transport(TransportKind.SSE));
      waitCompleted(stream);
      assertEquals(Map.of("a", 1), chunks.get(0));
      assertEquals(Map.of("b", 2), chunks.get(1));
      assertEquals(Map.of("a", 1, "b", 2), done[0]);
    } finally {
      server.stop(0);
    }
  }
}
