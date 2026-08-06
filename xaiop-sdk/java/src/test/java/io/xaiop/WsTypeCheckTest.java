package io.xaiop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.xaiop.types.TypeRegistry;
import io.xaiop.types.TypeSchemaSnapshot;
import io.xaiop.types.Types;
import io.xaiop.types.XaiopTypeError;
import io.xaiop.ws.XaiopWs;
import io.xaiop.ws.XaiopWsConnection;
import io.xaiop.ws.XaiopWsHub;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;

/**
 * WS typeCheck + {@code pushTypeConsistency} — port of Node {@code typecheck.test.js} WS cases.
 */
class WsTypeCheckTest {

  @FunctionalInterface
  interface PairBody {
    void run(XaiopWsConnection server, XaiopWsConnection client) throws Exception;
  }

  private static void withPair(Consumer<XaiopWs.ConnectOptions> tuneClient, PairBody run)
      throws Exception {
    withPair(tuneClient, null, run);
  }

  private static void withPair(
      Consumer<XaiopWs.ConnectOptions> tuneClient,
      Consumer<XaiopWsHub.ListenOptions> tuneHub,
      PairBody run)
      throws Exception {
    XaiopWsHub.ListenOptions listenOpts =
        new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1");
    if (tuneHub != null) tuneHub.accept(listenOpts);
    XaiopWsHub hub = XaiopWs.listen(listenOpts).get(10, TimeUnit.SECONDS);
    CompletableFuture<XaiopWsConnection> serverReady = new CompletableFuture<>();
    hub.onConnection(serverReady::complete);
    try {
      XaiopWs.ConnectOptions cOpts = new XaiopWs.ConnectOptions();
      cOpts.mergeChunkWindow = false;
      cOpts.onPhase(d -> {});
      if (tuneClient != null) tuneClient.accept(cOpts);
      XaiopWsConnection client = XaiopWs.connect(hub.url(), cOpts).get(10, TimeUnit.SECONDS);
      XaiopWsConnection server = serverReady.get(10, TimeUnit.SECONDS);
      Thread.sleep(30);
      run.run(server, client);
    } finally {
      hub.close().get(10, TimeUnit.SECONDS);
    }
  }

  private static Throwable unwrap(Throwable err) {
    Throwable cur = err;
    while (cur instanceof ExecutionException && cur.getCause() != null) {
      cur = cur.getCause();
    }
    return cur;
  }

  private static void assertDoneTypeError(XaiopWsConnection client) {
    ExecutionException ex =
        assertThrows(
            ExecutionException.class, () -> client.done().get(10, TimeUnit.SECONDS));
    assertInstanceOf(XaiopTypeError.class, unwrap(ex));
  }

  @Test
  void happyPathSchemaThenIntPhases() throws Exception {
    XaiopEngine eng = new XaiopEngine();
    eng.registerType("k", Types.TYPE.INT);
    eng.setTypeCheck(true);
    withPair(
        opts -> opts.typeCheck = true,
        (server, client) -> {
          assertTrue(client.typeCheck());
          assertTrue(server.pushTypeConsistency(eng));
          server.pushWire(">\nk:1\n.\n");
          server.pushWire(">\nk:2\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          assertEquals(Map.of("k", 2), client.done().get(10, TimeUnit.SECONDS));
        });
  }

  @Test
  void schemaMismatchRejectsClientDone() throws Exception {
    XaiopEngine eng = new XaiopEngine();
    eng.registerType("k", Types.TYPE.INT);
    eng.setTypeCheck(true);
    withPair(
        opts -> opts.typeCheck = true,
        (server, client) -> {
          assertTrue(server.pushTypeConsistency(eng));
          server.pushWire(">\nk:1\n.\n");
          server.pushWire(">\nk:oops\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          assertDoneTypeError(client);
        });
  }

  @Test
  void clientFreezeWithoutSchemaStillEnforces() throws Exception {
    withPair(
        opts -> opts.typeCheck = true,
        (server, client) -> {
          server.pushWire(">\nk:1\n.\n");
          server.pushWire(">\nk:oops\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          assertDoneTypeError(client);
        });
  }

  @Test
  void withoutTypeCheckAcceptsMixedTypes() throws Exception {
    withPair(
        null,
        (server, client) -> {
          assertFalse(client.typeCheck());
          server.pushWire(">\nk:1\n.\n");
          server.pushWire(">\nk:oops\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          assertEquals(Map.of("k", "oops"), client.done().get(10, TimeUnit.SECONDS));
        });
  }

  @Test
  void pushTypeConsistencyAcceptsRegistryAndSnapshot() throws Exception {
    withPair(
        opts -> opts.typeCheck = true,
        (server, client) -> {
          TypeRegistry reg = new TypeRegistry();
          reg.register("k", Types.TYPE.STRING);
          assertTrue(server.pushTypeConsistency(reg));
          assertTrue(server.pushTypeConsistency(reg.snapshot()));
          server.pushWire(">\nk:hi\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          assertEquals(Map.of("k", "hi"), client.done().get(10, TimeUnit.SECONDS));
        });
  }

  @Test
  void pushTypeConsistencyPrerequisites() throws Exception {
    withPair(
        null,
        (server, client) -> {
          XaiopEngine empty = new XaiopEngine();
          empty.setTypeCheck(true);
          assertThrows(IllegalArgumentException.class, () -> server.pushTypeConsistency(empty));

          empty.registerType("x", Types.TYPE.STRING);
          empty.setTypeCheck(false);
          assertThrows(IllegalArgumentException.class, () -> server.pushTypeConsistency(empty));
          assertThrows(IllegalArgumentException.class, () -> server.pushTypeConsistency(null));
          assertThrows(
              IllegalArgumentException.class,
              () -> server.pushTypeConsistency(new TypeSchemaSnapshot(1, List.of())));

          empty.setTypeCheck(true);
          assertTrue(server.pushTypeConsistency(empty));
          client.end().get(5, TimeUnit.SECONDS);
        });

    withPair(
        null,
        opts -> opts.compatibilityMode = true,
        (server, client) -> {
          XaiopEngine eng = new XaiopEngine();
          eng.registerType("x", Types.TYPE.STRING);
          eng.setTypeCheck(true);
          assertThrows(IllegalArgumentException.class, () -> server.pushTypeConsistency(eng));
          client.end().get(5, TimeUnit.SECONDS);
        });
  }

  @Test
  void typeCheckIgnoredWhenCompatibilityModeOnConnect() throws Exception {
    withPair(
        opts -> {
          opts.typeCheck = true;
          opts.compatibilityMode = true;
        },
        (server, client) -> {
          assertFalse(client.typeCheck());
          client.end().get(5, TimeUnit.SECONDS);
        });
  }

  @Test
  void arrayHomogeneityViolationOverWs() throws Exception {
    withPair(
        opts -> opts.typeCheck = true,
        (server, client) -> {
          server.pushWire(">\n>items-\n:1\n:2\n.\n");
          server.pushWire(">\n>items-\n:x\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          assertDoneTypeError(client);
        });
  }

  @Test
  void nullContentDoesNotBreakFreeze() throws Exception {
    withPair(
        opts -> opts.typeCheck = true,
        (server, client) -> {
          server.pushWire(">\nk:1\n.\n");
          server.pushWire(">\nk:null\n.\n");
          server.pushWire(">\nk:2\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          assertEquals(Map.of("k", 2), client.done().get(10, TimeUnit.SECONDS));
        });
  }

  @Test
  void preloadedTypeSchemaOnConnect() throws Exception {
    TypeRegistry reg = new TypeRegistry();
    reg.register("k", Types.TYPE.INT);
    withPair(
        opts -> {
          opts.typeCheck = true;
          opts.typeSchema = reg.snapshot();
        },
        (server, client) -> {
          server.pushWire(">\nk:oops\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          assertDoneTypeError(client);
        });
  }

  @Test
  void objectShapeSchemaOverWs() throws Exception {
    XaiopEngine eng = new XaiopEngine();
    eng.registerType("user", Types.objectType(Map.of("name", Types.TYPE.STRING, "age", Types.TYPE.INT)));
    eng.setTypeCheck(true);
    withPair(
        opts -> opts.typeCheck = true,
        (server, client) -> {
          assertTrue(server.pushTypeConsistency(eng));
          server.pushWire(">\n>user\nname:a\nage:1\n.\n");
          server.end().get(5, TimeUnit.SECONDS);
          @SuppressWarnings("unchecked")
          Map<String, Object> done = (Map<String, Object>) client.done().get(10, TimeUnit.SECONDS);
          @SuppressWarnings("unchecked")
          Map<String, Object> user = (Map<String, Object>) done.get("user");
          assertEquals("a", user.get("name"));
        });
  }

  @Test
  void pushTypeConsistencyWhenSocketClosedReturnsFalse() throws Exception {
    withPair(
        null,
        (server, client) -> {
          server.end().get(5, TimeUnit.SECONDS);
          client.closed().get(5, TimeUnit.SECONDS);
          XaiopEngine eng = new XaiopEngine();
          eng.registerType("x", Types.TYPE.STRING);
          eng.setTypeCheck(true);
          assertFalse(server.pushTypeConsistency(eng));
        });
  }
}
