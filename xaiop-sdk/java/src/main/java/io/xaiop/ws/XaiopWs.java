package io.xaiop.ws;

import io.xaiop.stream.PhaseEncode;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;

/**
 * XaiopWs — first-class WebSocket session for skeleton / phase streaming.
 *
 * <p>Faithful port of the Node.js SDK's {@code node/ws/index.ts}.
 *
 * <pre>
 *   XaiopWsHub hub = XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1")).join();
 *   hub.onConnection(conn -&gt; { conn.pushJson("a", 1, true); conn.end(); });
 *   XaiopWsConnection client = XaiopWs.connect(hub.url()).join();
 *   Object done = client.done().join();
 * </pre>
 */
public final class XaiopWs {
  private XaiopWs() {}

  /** Connect options (connection options + handshake). */
  public static final class ConnectOptions extends XaiopWsConnection.Options {
    public Long handshakeTimeoutMs;
    public Map<String, String> headers;
    public HttpClient httpClient;

    public ConnectOptions handshakeTimeoutMs(long ms) {
      handshakeTimeoutMs = ms;
      return this;
    }

    public ConnectOptions headers(Map<String, String> h) {
      headers = h;
      return this;
    }

    public ConnectOptions httpClient(HttpClient c) {
      httpClient = c;
      return this;
    }

    @Override
    public ConnectOptions onPhase(Consumer<Object> fn) {
      super.onPhase(fn);
      return this;
    }

    @Override
    public ConnectOptions onDone(Consumer<Object> fn) {
      super.onDone(fn);
      return this;
    }

    @Override
    public ConnectOptions onError(Consumer<Throwable> fn) {
      super.onError(fn);
      return this;
    }

    @Override
    public ConnectOptions streamProcessing(boolean v) {
      super.streamProcessing(v);
      return this;
    }

    @Override
    public ConnectOptions mergeChunkWindow(boolean v) {
      super.mergeChunkWindow(v);
      return this;
    }
  }

  /**
   * Connect as a consumer (or bidirectional peer). Handlers are locked after open — pass early
   * callbacks in options.
   */
  public static CompletableFuture<XaiopWsConnection> connect(String url) {
    return connect(url, null);
  }

  public static CompletableFuture<XaiopWsConnection> connect(String url, ConnectOptions options) {
    if (url == null || url.isEmpty()) {
      throw new IllegalArgumentException("XaiopWs.connect requires a non-empty url");
    }
    ConnectOptions opts = options == null ? new ConnectOptions() : options;
    long timeoutMs = opts.handshakeTimeoutMs == null ? 15_000L : opts.handshakeTimeoutMs;

    JdkClientWsSocket socket = new JdkClientWsSocket();
    // Attach parsers before open so sync server push is not lost.
    XaiopWsConnection conn = new XaiopWsConnection(socket, opts);

    HttpClient client =
        opts.httpClient != null
            ? opts.httpClient
            : HttpClient.newBuilder()
                .connectTimeout(timeoutMs > 0 ? Duration.ofMillis(timeoutMs) : Duration.ofSeconds(15))
                .build();

    var wb = client.newWebSocketBuilder();
    if (timeoutMs > 0) {
      wb.connectTimeout(Duration.ofMillis(timeoutMs));
    }
    if (opts.headers != null) {
      for (Map.Entry<String, String> e : opts.headers.entrySet()) {
        wb.header(e.getKey(), e.getValue());
      }
    }

    URI uri = URI.create(url);
    CompletableFuture<Void> open =
        wb.buildAsync(uri, socket.asListener()).thenCompose(ws -> socket.whenOpen());

    CompletableFuture<XaiopWsConnection> result = new CompletableFuture<>();
    long waitMs = timeoutMs > 0 ? timeoutMs : 15_000L;
    open.orTimeout(waitMs, TimeUnit.MILLISECONDS)
        .whenComplete(
            (v, err) -> {
              if (err != null) {
                try {
                  socket.terminate();
                } catch (RuntimeException ignored) {
                  /* ignore */
                }
                Throwable cause = err;
                if (err instanceof CompletionException && err.getCause() != null) {
                  cause = err.getCause();
                }
                if (cause instanceof TimeoutException) {
                  result.completeExceptionally(
                      new TimeoutException(
                          "WebSocket handshake timeout after " + waitMs + "ms"));
                } else {
                  result.completeExceptionally(cause);
                }
              } else {
                conn.lockHandlers();
                result.complete(conn);
              }
            });
    return result;
  }

  /** Listen for producers/consumers. {@code port: 0} picks an ephemeral port. */
  public static CompletableFuture<XaiopWsHub> listen() {
    return listen(null);
  }

  public static CompletableFuture<XaiopWsHub> listen(XaiopWsHub.ListenOptions options) {
    return XaiopWsHub.listen(options);
  }

  public static String encodePhaseJson(String key, Object value) {
    return PhaseEncode.encodePhaseJson(key, value);
  }

  public static String encodePhaseJson(String key, Object value, PhaseEncode.Options options) {
    return PhaseEncode.encodePhaseJson(key, value, options);
  }

  public static String encodePhaseObject(Object object) {
    return PhaseEncode.encodePhaseObject(object);
  }

  public static String encodePhaseObject(Object object, PhaseEncode.Options options) {
    return PhaseEncode.encodePhaseObject(object, options);
  }
}
