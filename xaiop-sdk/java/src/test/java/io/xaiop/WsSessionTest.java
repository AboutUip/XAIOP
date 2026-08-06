package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.PhaseEncode;
import io.xaiop.stream.StreamStatus;
import io.xaiop.stream.TransportKind;
import io.xaiop.stream.XaiopStream;
import io.xaiop.ws.XaiopWs;
import io.xaiop.ws.XaiopWsConnection;
import io.xaiop.ws.XaiopWsHub;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

/** Loopback WebSocket session tests (Node {@code ws.session.test.js}). */
class WsSessionTest {

  @FunctionalInterface
  interface LoopbackBody {
    void run(XaiopWsConnection server, XaiopWsConnection client, List<Object> phases, List<Object> committed)
        throws Exception;
  }

  private static void withLoopback(LoopbackBody run) throws Exception {
    withLoopback(run, null);
  }

  private static void withLoopback(LoopbackBody run, Consumer<XaiopWsHub.ListenOptions> tune)
      throws Exception {
    XaiopWsHub.ListenOptions listenOpts =
        new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1");
    if (tune != null) tune.accept(listenOpts);
    XaiopWsHub hub = XaiopWs.listen(listenOpts).get(10, TimeUnit.SECONDS);

    List<Object> phases = new ArrayList<>();
    List<Object> committed = new ArrayList<>();
    CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
    hub.onConnection(serverReady::complete);

    try {
      XaiopWs.ConnectOptions connectOpts = new XaiopWs.ConnectOptions();
      if (tune != null) {
        // Mirror listen connection options onto connect
        connectOpts.streamProcessing = listenOpts.streamProcessing;
        connectOpts.mergeChunkWindow = listenOpts.mergeChunkWindow;
        connectOpts.compatibilityMode = listenOpts.compatibilityMode;
        connectOpts.cover = listenOpts.cover;
      }
      AtomicReference<XaiopWsConnection> clientRef = new AtomicReference<>();
      connectOpts.onPhase(
          d -> {
            phases.add(d);
            XaiopWsConnection c = clientRef.get();
            if (c != null) committed.add(c.getCommittedSnapshot());
          });
      XaiopWsConnection client =
          XaiopWs.connect(hub.url(), connectOpts).get(10, TimeUnit.SECONDS);
      clientRef.set(client);
      // Backfill committed for any phases that raced before clientRef was set
      while (committed.size() < phases.size()) {
        committed.add(client.getCommittedSnapshot());
      }
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      run.run(server, client, phases, committed);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  private static void delay(long ms) throws InterruptedException {
    Thread.sleep(ms);
  }

  @Test
  void skeletonMultiPhaseFullSnapshot() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          Map<String, Object> pieces = new LinkedHashMap<>();
          pieces.put("skeleton1", Map.of("title", "A"));
          pieces.put("skeleton2", Map.of("title", "B"));
          pieces.put("skeleton3", Map.of("title", "C"));
          pieces.put("mod1", Map.of("rows", List.of(1, 2)));
          pieces.put("mod2", Map.of("ok", true));
          pieces.put("mod3", Map.of("nested", Map.of("z", 3)));
          pieces.put("mod4", Map.of("tags", List.of("x", "y")));
          pieces.put("mod5", Map.of("done", true));
          List<String> keys = new ArrayList<>(pieces.keySet());
          for (int i = 0; i < keys.size(); i++) {
            String key = keys.get(i);
            boolean finalPhase = i == keys.size() - 1;
            assertTrue(server.pushJson(key, pieces.get(key), finalPhase));
          }
          server.end().get(5, TimeUnit.SECONDS);
          Object done = client.done().get(10, TimeUnit.SECONDS);
          assertEquals(8, phases.size());
          assertEquals(Map.of("skeleton1", Map.of("title", "A")), phases.get(0));
          assertEquals(Map.of("skeleton1", Map.of("title", "A")), committed.get(0));
          Map<String, Object> expected3 = new LinkedHashMap<>();
          expected3.put("skeleton1", Map.of("title", "A"));
          expected3.put("skeleton2", Map.of("title", "B"));
          expected3.put("skeleton3", Map.of("title", "C"));
          assertEquals(expected3, committed.get(2));
          Map<String, Object> expectedDone = new LinkedHashMap<>();
          expectedDone.put("skeleton1", Map.of("title", "A"));
          expectedDone.put("skeleton2", Map.of("title", "B"));
          expectedDone.put("skeleton3", Map.of("title", "C"));
          expectedDone.put("mod1", Map.of("rows", List.of(1, 2)));
          expectedDone.put("mod2", Map.of("ok", true));
          expectedDone.put("mod3", Map.of("nested", Map.of("z", 3)));
          expectedDone.put("mod4", Map.of("tags", List.of("x", "y")));
          expectedDone.put("mod5", Map.of("done", true));
          assertEquals(expectedDone, done);
          assertEquals(expectedDone, committed.get(committed.size() - 1));
        });
  }

  @Test
  void laterWinsSameKeyAcrossPhases() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          server.pushJson("meta", Map.of("v", 1));
          server.pushJson("meta", Map.of("v", 2), true);
          server.end().get(5, TimeUnit.SECONDS);
          assertEquals(Map.of("meta", Map.of("v", 2)), client.done().get(10, TimeUnit.SECONDS));
        });
  }

  @Test
  void namedArrayAppendAcrossPhases() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          server.pushJson("items", List.of(Map.of("id", 1)));
          server.pushJson("items", List.of(Map.of("id", 2), Map.of("id", 3)), true);
          server.end().get(5, TimeUnit.SECONDS);
          Object done = client.done().get(10, TimeUnit.SECONDS);
          assertEquals(Map.of("items", List.of(Map.of("id", 1))), phases.get(0));
          assertEquals(
              Map.of("items", List.of(Map.of("id", 2), Map.of("id", 3))), phases.get(1));
          assertEquals(
              Map.of(
                  "items",
                  List.of(Map.of("id", 1), Map.of("id", 2), Map.of("id", 3))),
              done);
        });
  }

  @Test
  void pushObjectMultiKeyPhase() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          Map<String, Object> obj = new LinkedHashMap<>();
          obj.put("a", 1);
          obj.put("b", 2);
          server.pushObject(obj);
          server.pushJson("c", 3, true);
          server.end().get(5, TimeUnit.SECONDS);
          Map<String, Object> expected = new LinkedHashMap<>();
          expected.put("a", 1);
          expected.put("b", 2);
          expected.put("c", 3);
          assertEquals(expected, client.done().get(10, TimeUnit.SECONDS));
        });
  }

  @Test
  void fragmentedFramesAcrossMessagesStillParse() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          String wire = PhaseEncode.encodePhaseJson("part", Map.of("n", 1), PhaseEncode.Options.defaults().finalPhase(true));
          int mid = Math.max(2, wire.length() / 2);
          assertTrue(server.pushWire(wire.substring(0, mid)));
          delay(10);
          assertTrue(server.pushWire(wire.substring(mid)));
          server.end().get(5, TimeUnit.SECONDS);
          assertEquals(Map.of("part", Map.of("n", 1)), client.done().get(10, TimeUnit.SECONDS));
        });
  }

  @Test
  void endClosesCleanlyAndPushAfterEndReturnsFalse() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          server.pushJson("ok", 1, true);
          server.end().get(5, TimeUnit.SECONDS);
          delay(50);
          assertFalse(server.pushJson("x", 1));
          assertFalse(server.pushWire(">\nx:1\n"));
          client.closed().get(5, TimeUnit.SECONDS);
          assertEquals(Map.of("ok", 1), client.done().get(5, TimeUnit.SECONDS));
        });
  }

  @Test
  void encodeErrorOnPushJsonDoesNotSend() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          assertThrows(XaiopEncodeError.class, () -> server.pushJson("bad-", 1));
          server.pushJson("ok", 1, true);
          server.end().get(5, TimeUnit.SECONDS);
          assertEquals(Map.of("ok", 1), client.done().get(10, TimeUnit.SECONDS));
        });
  }

  @Test
  void clientAbortClosesPeer() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<Void> serverClosed = new CompletableFuture<>();
      hub.onConnection(conn -> conn.closed().whenComplete((v, e) -> serverClosed.complete(null)));
      XaiopWsConnection client = XaiopWs.connect(hub.url()).get(10, TimeUnit.SECONDS);
      assertTrue(client.abort());
      serverClosed.get(3, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void connectBadPortRejects() {
    Exception err =
        assertThrows(
            Exception.class,
            () ->
                XaiopWs.connect(
                        "ws://127.0.0.1:1",
                        new XaiopWs.ConnectOptions().handshakeTimeoutMs(2000))
                    .get(5, TimeUnit.SECONDS));
    String msg = String.valueOf(err.getCause() != null ? err.getCause().getMessage() : err.getMessage());
    assertTrue(
        msg.toLowerCase().contains("connect")
            || msg.toLowerCase().contains("refused")
            || msg.toLowerCase().contains("websocket")
            || msg.toLowerCase().contains("timeout")
            || err.getCause() instanceof java.net.ConnectException,
        () -> "unexpected: " + err);
  }

  @Test
  void multiConnectionHubServesTwoClients() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      hub.onConnection(
          conn -> {
            CompletableFuture.runAsync(
                () -> {
                  try {
                    Thread.sleep(5);
                    conn.pushJson("hello", true, true);
                    conn.end().join();
                  } catch (Exception ignored) {
                    /* ignore */
                  }
                });
          });
      XaiopWsConnection a = XaiopWs.connect(hub.url()).get(10, TimeUnit.SECONDS);
      XaiopWsConnection b = XaiopWs.connect(hub.url()).get(10, TimeUnit.SECONDS);
      assertEquals(Map.of("hello", true), a.done().get(10, TimeUnit.SECONDS));
      assertEquals(Map.of("hello", true), b.done().get(10, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void syncServerPushInConnectionIsNotLost() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      hub.onConnection(
          conn -> {
            conn.pushJson("sync", 1, true);
            conn.end();
          });
      XaiopWsConnection client = XaiopWs.connect(hub.url()).get(10, TimeUnit.SECONDS);
      assertEquals(Map.of("sync", 1), client.done().get(10, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void connectLocksHandlersListenAcceptStaysMutable() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      hub.onConnection(serverReady::complete);
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.onPhase(d -> {});
      XaiopWsConnection client = XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      assertTrue(client.handlersLocked());
      assertFalse(server.handlersLocked());
      assertThrows(IllegalStateException.class, () -> client.onPhase(d -> {}));
      assertThrows(IllegalStateException.class, () -> client.onDone(d -> {}));
      assertThrows(IllegalStateException.class, () -> client.onError(e -> {}));
      server.onPhase(d -> {});
      server.pushJson("ok", 1, true);
      server.end().get(5, TimeUnit.SECONDS);
      assertEquals(Map.of("ok", 1), client.done().get(10, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void midStreamCommittedSetSnapshotUndefined() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      hub.onConnection(serverReady::complete);
      CompletableFuture<Void> firstPhase = new CompletableFuture<>();
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.onPhase(d -> firstPhase.complete(null));
      XaiopWsConnection client =
          XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      server.pushJson("early", 1);
      firstPhase.get(5, TimeUnit.SECONDS);
      assertNull(client.getSnapshot());
      assertEquals(Map.of("early", 1), client.getCommittedSnapshot());
      server.pushJson("late", 2, true);
      server.end().get(5, TimeUnit.SECONDS);
      Object done = client.done().get(10, TimeUnit.SECONDS);
      Map<String, Object> expected = new LinkedHashMap<>();
      expected.put("early", 1);
      expected.put("late", 2);
      assertEquals(expected, done);
      assertEquals(done, client.getSnapshot());
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void pushWireLnAppendsLf() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          assertThrows(IllegalArgumentException.class, () -> server.pushWireLn(null));
          assertTrue(server.pushWireLn(">\na:1\n."));
          assertTrue(server.pushWireLn(">b\nc:2\n"));
          server.end().get(5, TimeUnit.SECONDS);
          Map<String, Object> expected = new LinkedHashMap<>();
          expected.put("a", 1);
          expected.put("b", Map.of("c", 2));
          assertEquals(expected, client.done().get(10, TimeUnit.SECONDS));
        });
  }

  @Test
  void xaiopStreamWebsocketTransport() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      hub.onConnection(
          conn ->
              CompletableFuture.runAsync(
                  () -> {
                    try {
                      Thread.sleep(5);
                      conn.pushJson("via", "stream", true);
                      conn.end().join();
                    } catch (Exception ignored) {
                      /* ignore */
                    }
                  }));
      XaiopStream stream = new XaiopStream(hub.url());
      AtomicReference<Object> done = new AtomicReference<>();
      stream.onDone(done::set);
      stream.send(new XaiopStream.SendOptions().transport(TransportKind.WEBSOCKET));
      long deadline = System.currentTimeMillis() + 10_000;
      while (stream.status() != StreamStatus.COMPLETED
          && stream.status() != StreamStatus.ERROR
          && System.currentTimeMillis() < deadline) {
        Thread.sleep(20);
      }
      assertEquals(StreamStatus.COMPLETED, stream.status());
      assertEquals(Map.of("via", "stream"), done.get());
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void connectRejectsEmptyUrl() {
    assertThrows(IllegalArgumentException.class, () -> XaiopWs.connect(""));
  }

  @Test
  void hubUrlAndPort() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      assertTrue(hub.port() > 0);
      assertTrue(hub.url().startsWith("ws://127.0.0.1:"));
      assertNotNull(hub.connections());
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void emptyPhaseViaConsecutiveDot() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          server.pushWire(">\na:1\n.\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          client.done().get(10, TimeUnit.SECONDS);
          assertEquals(Map.of("a", 1), phases.get(0));
          assertNull(phases.get(1));
        },
        opts -> opts.mergeChunkWindow = false);
  }

  @Test
  void streamProcessingFalseOnePhaseAtClose() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          server.pushWire(">\na:1\n.\n>b\nc:2\n");
          server.end().get(5, TimeUnit.SECONDS);
          Object done = client.done().get(10, TimeUnit.SECONDS);
          assertEquals(1, phases.size());
          assertEquals(done, phases.get(0));
          Map<String, Object> expected = new LinkedHashMap<>();
          expected.put("a", 1);
          expected.put("b", Map.of("c", 2));
          assertEquals(expected, done);
        },
        opts -> opts.streamProcessing = false);
  }

  @Test
  void pushWireTypeErrorForNonString() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          assertThrows(IllegalArgumentException.class, () -> server.pushWire(null));
          server.end().get(5, TimeUnit.SECONDS);
          client.closed().get(5, TimeUnit.SECONDS);
        });
  }

  @Test
  void abortMidOpenPhaseClosesPeer() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      CompletableFuture<Void> serverClosed = new CompletableFuture<>();
      hub.onConnection(
          conn -> {
            serverReady.complete(conn);
            conn.closed().whenComplete((v, e) -> serverClosed.complete(null));
          });
      XaiopWsConnection client = XaiopWs.connect(hub.url()).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      assertTrue(server.pushWire(">\na:1\n"));
      delay(20);
      assertTrue(client.abort());
      serverClosed.get(3, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void multiPhaseLaterWinsArraysStillAppend() throws Exception {
    withLoopback(
        (server, client, phases, committed) -> {
          server.pushJson("meta", Map.of("v", 1));
          server.pushJson("items", List.of(Map.of("id", 1)));
          server.pushJson("meta", Map.of("v", 2));
          server.pushJson("items", List.of(Map.of("id", 2)), true);
          server.end().get(5, TimeUnit.SECONDS);
          Object done = client.done().get(10, TimeUnit.SECONDS);
          Map<String, Object> expected = new LinkedHashMap<>();
          expected.put("meta", Map.of("v", 2));
          expected.put("items", List.of(Map.of("id", 1), Map.of("id", 2)));
          assertEquals(expected, done);
        });
  }

  @Test
  void typeConsistencyHappyPathIfSupported() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      hub.onConnection(serverReady::complete);
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.typeCheck = true;
      cOpts.mergeChunkWindow = false;
      cOpts.onPhase(d -> {});
      XaiopWsConnection client = XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      delay(20);
      XaiopEngine eng = new XaiopEngine();
      eng.registerType("k", io.xaiop.types.Types.TYPE.INT);
      eng.setTypeCheck(true);
      assertTrue(server.pushTypeConsistency(eng));
      server.pushWire(">\nk:1\n.\n");
      server.pushWire(">\nk:2\n.\n");
      server.end().get(5, TimeUnit.SECONDS);
      assertEquals(Map.of("k", 2), client.done().get(10, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  /** Control-plane smoke: server {@code sendSession} → client {@code onSession}. */
  @Test
  void sendSessionReceivedViaOnSession() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      hub.onConnection(serverReady::complete);
      CompletableFuture<Object> sessionBody = new CompletableFuture<>();
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.onSession =
          (body, frame) -> {
            sessionBody.complete(body);
          };
      cOpts.onPhase(d -> {});
      XaiopWsConnection client = XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      delay(20);
      assertTrue(server.sendSession(Map.of("role", "producer")));
      Object body = sessionBody.get(5, TimeUnit.SECONDS);
      assertNotNull(body);
      assertTrue(body instanceof Map);
      @SuppressWarnings("unchecked")
      Map<String, Object> m = (Map<String, Object>) body;
      assertNotNull(m.get("sessionId"));
      assertEquals("producer", m.get("role"));
      client.end().get(5, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }
}
