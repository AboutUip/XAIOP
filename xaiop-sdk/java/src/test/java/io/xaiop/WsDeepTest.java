package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.stream.PhaseEncode;
import io.xaiop.ws.XaiopWs;
import io.xaiop.ws.XaiopWsConnection;
import io.xaiop.ws.XaiopWsHub;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/**
 * Deep WebSocket features: protocols, maxPayload, binary, multiplex attach, resume stress.
 */
class WsDeepTest {

  private static void delay(long ms) throws InterruptedException {
    Thread.sleep(ms);
  }

  @Test
  void protocolsNegotiateFirstClientMatch() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(
                new XaiopWsHub.ListenOptions()
                    .port(0)
                    .host("127.0.0.1")
                    .protocols("xaiop-a", "xaiop-z"))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      AtomicReference<String> serverProto = new AtomicReference<>();
      hub.onConnection(
          (conn, req) -> {
            serverProto.set(req.protocol);
            serverReady.complete(conn);
          });
      XaiopWsConnection client =
          XaiopWs.connect(
                  hub.url(),
                  new XaiopWs.ConnectOptions().protocols("xaiop-b", "xaiop-a").onPhase(d -> {}))
              .get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      assertEquals("xaiop-a", client.protocol());
      assertEquals("xaiop-a", server.protocol());
      assertEquals("xaiop-a", serverProto.get());
      server.pushJson("ok", true, true);
      server.end().get(5, TimeUnit.SECONDS);
      assertEquals(Map.of("ok", true), client.done().get(10, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void protocolsRejectWhenNoMatch() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(
                new XaiopWsHub.ListenOptions()
                    .port(0)
                    .host("127.0.0.1")
                    .protocols("xaiop-a"))
            .get(10, TimeUnit.SECONDS);
    try {
      Exception err =
          assertThrows(
              Exception.class,
              () ->
                  XaiopWs.connect(
                          hub.url(),
                          new XaiopWs.ConnectOptions()
                              .protocols("xaiop-b")
                              .handshakeTimeoutMs(3000))
                      .get(5, TimeUnit.SECONDS));
      Throwable cause = err;
      while (cause.getCause() != null) cause = cause.getCause();
      String msg = cause.getMessage() == null ? cause.toString() : cause.getMessage();
      assertTrue(
          msg.toLowerCase().contains("websocket")
              || msg.toLowerCase().contains("protocol")
              || msg.toLowerCase().contains("handshake")
              || msg.toLowerCase().contains("failed")
              || msg.toLowerCase().contains("400")
              || cause instanceof java.net.http.WebSocketHandshakeException,
          "unexpected: " + cause);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void maxPayloadExceededClosesConnection() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(
                new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1").maxPayload(32))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<Void> serverClosed = new CompletableFuture<>();
      hub.onConnection(conn -> conn.closed().whenComplete((v, e) -> serverClosed.complete(null)));
      XaiopWsConnection client =
          XaiopWs.connect(hub.url(), new XaiopWs.ConnectOptions().onPhase(d -> {}))
              .get(10, TimeUnit.SECONDS);
      // Oversized single frame payload (> 32 bytes) from client → server closes with 1009 path.
      String huge = "x".repeat(64);
      client.pushWire(huge);
      serverClosed.get(5, TimeUnit.SECONDS);
      client.closed().get(5, TimeUnit.SECONDS);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void binaryUtf8FramesDecodeAcrossLoopback() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      hub.onConnection(serverReady::complete);
      XaiopWsConnection client =
          XaiopWs.connect(hub.url(), new XaiopWs.ConnectOptions().onPhase(d -> {}))
              .get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      String wire =
          PhaseEncode.encodePhaseJson(
              "bin", Map.of("ok", true), PhaseEncode.Options.defaults().finalPhase(true));
      assertTrue(server.sendBinary(wire.getBytes(StandardCharsets.UTF_8)));
      server.end().get(5, TimeUnit.SECONDS);
      assertEquals(Map.of("bin", Map.of("ok", true)), client.done().get(10, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void fragmentedTextFramesReassemble() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1"))
            .get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      hub.onConnection(serverReady::complete);
      XaiopWsConnection client =
          XaiopWs.connect(hub.url(), new XaiopWs.ConnectOptions().onPhase(d -> {}))
              .get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      String wire =
          PhaseEncode.encodePhaseJson(
              "frag", Map.of("n", 1), PhaseEncode.Options.defaults().finalPhase(true));
      int mid = Math.max(2, wire.length() / 2);
      assertTrue(server.sendTextFragments(wire.substring(0, mid), wire.substring(mid)));
      server.end().get(5, TimeUnit.SECONDS);
      assertEquals(Map.of("frag", Map.of("n", 1)), client.done().get(10, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void serverSocketPreBindListen() throws Exception {
    ServerSocket ss = new ServerSocket();
    ss.setReuseAddress(true);
    ss.bind(new InetSocketAddress("127.0.0.1", 0));
    int port = ss.getLocalPort();
    XaiopWsHub hub =
        XaiopWs.listen(new XaiopWsHub.ListenOptions().serverSocket(ss).path("/xaiop"))
            .get(10, TimeUnit.SECONDS);
    try {
      assertEquals(port, hub.port());
      assertEquals("/xaiop", hub.path());
      assertEquals("ws://127.0.0.1:" + port + "/xaiop", hub.url());
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      hub.onConnection(serverReady::complete);
      XaiopWsConnection client =
          XaiopWs.connect(hub.url(), new XaiopWs.ConnectOptions().onPhase(d -> {}))
              .get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      server.pushJson("via", "socket", true);
      server.end().get(5, TimeUnit.SECONDS);
      assertEquals(Map.of("via", "socket"), client.done().get(10, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void multiplexHttpHealthAndWsPath() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(
                new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1").path("/xaiop"))
            .get(10, TimeUnit.SECONDS);
    try {
      URL health = URI.create("http://127.0.0.1:" + hub.port() + "/health").toURL();
      HttpURLConnection conn = (HttpURLConnection) health.openConnection();
      conn.setConnectTimeout(3000);
      conn.setReadTimeout(3000);
      assertEquals(200, conn.getResponseCode());
      try (BufferedReader br =
          new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
        assertEquals("ok", br.readLine());
      }

      URL missing = URI.create("http://127.0.0.1:" + hub.port() + "/nope").toURL();
      HttpURLConnection miss = (HttpURLConnection) missing.openConnection();
      miss.setConnectTimeout(3000);
      miss.setReadTimeout(3000);
      assertEquals(404, miss.getResponseCode());

      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      hub.onConnection(serverReady::complete);
      XaiopWsConnection client =
          XaiopWs.connect(hub.url(), new XaiopWs.ConnectOptions().onPhase(d -> {}))
              .get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      server.pushJson("via", "multiplex", true);
      server.end().get(5, TimeUnit.SECONDS);
      assertEquals(Map.of("via", "multiplex"), client.done().get(10, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void resumeStressManyPhasesCompactAndSessionAck() throws Exception {
    XaiopWsHub.ListenOptions listenOpts =
        new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1");
    listenOpts.session = true;
    listenOpts.mergeChunkWindow = false;
    XaiopWsHub hub = XaiopWs.listen(listenOpts).get(10, TimeUnit.SECONDS);
    try {
      CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
      hub.onConnection(serverReady::complete);

      AtomicInteger acks = new AtomicInteger();
      AtomicInteger sessions = new AtomicInteger();
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.session = true;
      cOpts.mergeChunkWindow = false;
      cOpts.onAck = (body, meta) -> acks.incrementAndGet();
      cOpts.onSession = (body, meta) -> sessions.incrementAndGet();
      cOpts.onPhase(d -> {});

      XaiopWsConnection client = XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      delay(40);

      assertTrue(server.sendSession());
      delay(30);
      assertTrue(sessions.get() >= 1 || client.sessionId() != null || server.sessionId() != null);

      StringBuilder fullWire = new StringBuilder();
      Map<String, Object> expected = new LinkedHashMap<>();
      int n = 80;
      for (int i = 0; i < n; i++) {
        String key = "k" + i;
        expected.put(key, i);
        String wire =
            PhaseEncode.encodePhaseJson(
                key, i, PhaseEncode.Options.defaults().finalPhase(i == n - 1));
        fullWire.append(wire);
        assertTrue(server.pushJson(key, i, i == n - 1));
        if (i > 0 && i % 10 == 0) {
          delay(5);
          server.compactCommitted();
          assertTrue(server.sendAck());
        }
      }
      delay(80);
      server.compactCommitted();
      Object snap = client.getCommittedSnapshot();
      if (snap == null) {
        // wait for last phase ingest
        for (int w = 0; w < 50 && client.getCommittedSnapshot() == null; w++) delay(10);
        snap = client.getCommittedSnapshot();
      }
      // Final may still be in-flight until end; use done for final assert.
      server.end().get(10, TimeUnit.SECONDS);
      Object done = client.done().get(15, TimeUnit.SECONDS);
      assertEquals(expected, done);
      Object parsed = Parse.parse(fullWire.toString());
      assertEquals(parsed, done);
      assertTrue(acks.get() >= 1 || server.ackedSeq() >= 0);
      assertNotNull(server.sessionId() != null ? server.sessionId() : client.sessionId());
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  @Test
  void pathOnlyMismatchReturns404StyleReject() throws Exception {
    XaiopWsHub hub =
        XaiopWs.listen(
                new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1").path("/xaiop"))
            .get(10, TimeUnit.SECONDS);
    try {
      assertThrows(
          Exception.class,
          () ->
              XaiopWs.connect(
                      "ws://127.0.0.1:" + hub.port() + "/other",
                      new XaiopWs.ConnectOptions().handshakeTimeoutMs(2500))
                  .get(5, TimeUnit.SECONDS));
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }
}
