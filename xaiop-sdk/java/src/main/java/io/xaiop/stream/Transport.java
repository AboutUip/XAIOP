package io.xaiop.stream;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/**
 * Network transports for {@link XaiopStream}: HTTP body stream, SSE, WebSocket, and caller-supplied
 * RAW chunks (Node {@code transport.ts}).
 */
public final class Transport {
  private Transport() {}

  @FunctionalInterface
  public interface Handle {
    void abort();
  }

  public interface Handlers {
    void onText(String text);

    void onDone();

    void onError(Throwable err);
  }

  /** Options for {@link #open(Options, Handlers)}. */
  public static final class Options {
    public TransportKind kind = TransportKind.HTTP;
    public String url;
    public String method = "GET";
    public Map<String, String> headers;
    public String body;
    public Long timeoutMs;
    /** RAW: string/byte chunks (Iterable). */
    public Iterable<?> source;
    /** RAW: binary InputStream (UTF-8 decoded across reads). */
    public InputStream inputStream;
    public HttpClient httpClient;
    /** SSE: only these event names (null = all). */
    public Set<String> sseEvents;
  }

  /**
   * Starts I/O on a daemon thread; returns an abort handle immediately.
   */
  public static Handle open(Options req, Handlers handlers) {
    Objects.requireNonNull(req, "transport options");
    Objects.requireNonNull(handlers, "handlers");
    AtomicBoolean aborted = new AtomicBoolean(false);
    ExecutorService exec =
        Executors.newSingleThreadExecutor(
            r -> {
              Thread t = new Thread(r, "xaiop-transport");
              t.setDaemon(true);
              return t;
            });
    Future<?> future =
        exec.submit(
            () -> {
              try {
                if (aborted.get()) {
                  handlers.onError(new IOException("aborted"));
                  return;
                }
                TransportKind kind = req.kind == null ? TransportKind.HTTP : req.kind;
                switch (kind) {
                  case RAW -> runRaw(req, handlers, aborted);
                  case SSE -> runSse(req, handlers, aborted);
                  case WEBSOCKET -> runWebSocket(req, handlers, aborted);
                  case HTTP -> runHttp(req, handlers, aborted);
                }
                if (!aborted.get()) handlers.onDone();
              } catch (Throwable err) {
                if (aborted.get()) {
                  handlers.onError(new IOException("aborted", err));
                } else {
                  handlers.onError(err instanceof Exception e ? e : new RuntimeException(err));
                }
              } finally {
                exec.shutdown();
              }
            });
    return () -> {
      aborted.set(true);
      future.cancel(true);
      exec.shutdownNow();
    };
  }

  private static void emitText(Handlers handlers, String text) {
    if (text != null && !text.isEmpty()) handlers.onText(text);
  }

  private static void runRaw(Options req, Handlers handlers, AtomicBoolean aborted)
      throws IOException {
    if (req.inputStream != null) {
      Utf8StreamDecoder dec = new Utf8StreamDecoder();
      byte[] buf = new byte[8192];
      try (InputStream in = req.inputStream) {
        int n;
        while (!aborted.get() && (n = in.read(buf)) >= 0) {
          if (n == 0) continue;
          byte[] slice = n == buf.length ? buf.clone() : java.util.Arrays.copyOf(buf, n);
          emitText(handlers, dec.push(slice));
        }
      }
      if (!aborted.get()) emitText(handlers, dec.flush());
      return;
    }
    if (req.source == null) throw new IllegalArgumentException("RAW transport requires source or inputStream");
    Utf8StreamDecoder dec = new Utf8StreamDecoder();
    boolean sawBinary = false;
    for (Object chunk : req.source) {
      if (aborted.get()) return;
      if (chunk == null) continue;
      if (chunk instanceof CharSequence cs) {
        emitText(handlers, cs.toString());
      } else if (chunk instanceof byte[] bytes) {
        sawBinary = true;
        emitText(handlers, dec.push(bytes));
      } else {
        throw new IllegalArgumentException(
            "RAW chunk must be CharSequence or byte[], got " + chunk.getClass().getName());
      }
    }
    if (sawBinary && !aborted.get()) emitText(handlers, dec.flush());
  }

  private static HttpClient client(Options req) {
    if (req.httpClient != null) return req.httpClient;
    HttpClient.Builder b = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL);
    if (req.timeoutMs != null && req.timeoutMs > 0) {
      b.connectTimeout(Duration.ofMillis(req.timeoutMs));
    }
    return b.build();
  }

  /**
   * Consume a WebSocket as a text stream until the peer closes (Node {@code runWebSocket}).
   *
   * <p>For bidirectional XAIOP sessions prefer {@link io.xaiop.ws.XaiopWs}.
   */
  private static void runWebSocket(Options req, Handlers handlers, AtomicBoolean aborted)
      throws IOException, InterruptedException {
    if (req.url == null || req.url.isBlank()) {
      throw new IllegalArgumentException("transport url is required");
    }
    HttpClient http = client(req);
    java.util.concurrent.CompletableFuture<Void> done =
        new java.util.concurrent.CompletableFuture<>();
    StringBuilder textCarry = new StringBuilder();
    Utf8StreamDecoder binaryDec = new Utf8StreamDecoder();

    var builder = http.newWebSocketBuilder();
    if (req.timeoutMs != null && req.timeoutMs > 0) {
      builder.connectTimeout(Duration.ofMillis(req.timeoutMs));
    }
    if (req.headers != null) {
      for (Map.Entry<String, String> e : req.headers.entrySet()) {
        builder.header(e.getKey(), e.getValue());
      }
    }

    java.net.http.WebSocket.Listener listener =
        new java.net.http.WebSocket.Listener() {
          @Override
          public void onOpen(java.net.http.WebSocket webSocket) {
            webSocket.request(1);
          }

          @Override
          public java.util.concurrent.CompletionStage<?> onText(
              java.net.http.WebSocket webSocket, CharSequence data, boolean last) {
            if (aborted.get()) {
              done.complete(null);
              return null;
            }
            textCarry.append(data);
            if (last) {
              emitText(handlers, textCarry.toString());
              textCarry.setLength(0);
            }
            webSocket.request(1);
            return null;
          }

          @Override
          public java.util.concurrent.CompletionStage<?> onBinary(
              java.net.http.WebSocket webSocket, java.nio.ByteBuffer data, boolean last) {
            if (aborted.get()) {
              done.complete(null);
              return null;
            }
            byte[] bytes = new byte[data.remaining()];
            data.get(bytes);
            emitText(handlers, binaryDec.push(bytes));
            if (last) {
              emitText(handlers, binaryDec.flush());
            }
            webSocket.request(1);
            return null;
          }

          @Override
          public java.util.concurrent.CompletionStage<?> onClose(
              java.net.http.WebSocket webSocket, int statusCode, String reason) {
            emitText(handlers, binaryDec.flush());
            if (textCarry.length() > 0) {
              emitText(handlers, textCarry.toString());
              textCarry.setLength(0);
            }
            done.complete(null);
            return null;
          }

          @Override
          public void onError(java.net.http.WebSocket webSocket, Throwable error) {
            done.completeExceptionally(error);
          }
        };

    java.net.http.WebSocket ws =
        builder.buildAsync(URI.create(req.url), listener).join();

    while (!done.isDone()) {
      if (aborted.get()) {
        try {
          ws.abort();
        } catch (Exception ignored) {
          /* ignore */
        }
        throw new IOException("aborted");
      }
      try {
        done.get(50, java.util.concurrent.TimeUnit.MILLISECONDS);
      } catch (java.util.concurrent.TimeoutException ignored) {
        /* poll abort */
      } catch (java.util.concurrent.ExecutionException e) {
        Throwable c = e.getCause() == null ? e : e.getCause();
        if (c instanceof IOException ioe) throw ioe;
        if (c instanceof RuntimeException re) throw re;
        throw new IOException(c);
      }
    }
  }

  private static HttpRequest buildRequest(Options req, Map<String, String> extraHeaders) {
    if (req.url == null || req.url.isBlank()) {
      throw new IllegalArgumentException("transport url is required");
    }
    HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(req.url));
    String method = req.method == null ? "GET" : req.method;
    if (req.body != null) {
      b.method(method, HttpRequest.BodyPublishers.ofString(req.body, StandardCharsets.UTF_8));
    } else {
      b.method(method, HttpRequest.BodyPublishers.noBody());
    }
    if (req.timeoutMs != null && req.timeoutMs > 0) {
      b.timeout(Duration.ofMillis(req.timeoutMs));
    }
    if (req.headers != null) {
      for (Map.Entry<String, String> e : req.headers.entrySet()) {
        b.header(e.getKey(), e.getValue());
      }
    }
    if (extraHeaders != null) {
      for (Map.Entry<String, String> e : extraHeaders.entrySet()) {
        b.header(e.getKey(), e.getValue());
      }
    }
    return b.build();
  }

  private static void runHttp(Options req, Handlers handlers, AtomicBoolean aborted)
      throws IOException, InterruptedException {
    HttpClient http = client(req);
    HttpRequest request = buildRequest(req, null);
    HttpResponse<InputStream> res =
        http.send(request, HttpResponse.BodyHandlers.ofInputStream());
    if (res.statusCode() < 200 || res.statusCode() >= 300) {
      throw new IOException("HTTP " + res.statusCode());
    }
    Utf8StreamDecoder dec = new Utf8StreamDecoder();
    try (InputStream in = res.body()) {
      byte[] buf = new byte[8192];
      int n;
      while (!aborted.get() && (n = in.read(buf)) >= 0) {
        if (n == 0) continue;
        emitText(handlers, dec.push(java.util.Arrays.copyOf(buf, n)));
      }
    }
    if (!aborted.get()) emitText(handlers, dec.flush());
  }

  private static void runSse(Options req, Handlers handlers, AtomicBoolean aborted)
      throws IOException, InterruptedException {
    HttpClient http = client(req);
    HttpRequest request =
        buildRequest(req, Map.of("Accept", "text/event-stream"));
    HttpResponse<InputStream> res =
        http.send(request, HttpResponse.BodyHandlers.ofInputStream());
    if (res.statusCode() < 200 || res.statusCode() >= 300) {
      throw new IOException("HTTP " + res.statusCode());
    }
    Utf8StreamDecoder dec = new Utf8StreamDecoder();
    StringBuilder carry = new StringBuilder();
    try (InputStream in = res.body()) {
      byte[] buf = new byte[8192];
      int n;
      while (!aborted.get() && (n = in.read(buf)) >= 0) {
        if (n == 0) continue;
        carry.append(dec.push(java.util.Arrays.copyOf(buf, n)));
        flushSseBlocks(carry, handlers, req.sseEvents);
      }
    }
    if (!aborted.get()) {
      carry.append(dec.flush());
      flushSseBlocks(carry, handlers, req.sseEvents);
      if (carry.length() > 0) {
        emitSseData(handlers, parseSseBlock(carry.toString(), req.sseEvents));
      }
    }
  }

  private static void flushSseBlocks(
      StringBuilder carry, Handlers handlers, Set<String> allow) {
    String s = carry.toString();
    String[] parts = s.split("\\r?\\n\\r?\\n", -1);
    if (parts.length <= 1) return;
    carry.setLength(0);
    carry.append(parts[parts.length - 1]);
    for (int i = 0; i < parts.length - 1; i++) {
      emitSseData(handlers, parseSseBlock(parts[i], allow));
    }
  }

  private static void emitSseData(Handlers handlers, String data) {
    if (data == null || data.isEmpty()) return;
    // Wire is line-oriented; a data block that ends on "." must not glue to the next ">".
    if (!data.endsWith("\n")) data = data + "\n";
    handlers.onText(data);
  }

  /** Join multi-line {@code data:} fields with {@code \n} (Node SSE parser). */
  public static String parseSseBlock(String block, Set<String> allow) {
    if (block == null || block.isBlank()) return "";
    String event = "message";
    StringBuilder data = new StringBuilder();
    for (String line : block.split("\\r?\\n")) {
      if (line.isEmpty() || line.startsWith(":")) continue;
      int colon = line.indexOf(':');
      String field = colon < 0 ? line : line.substring(0, colon);
      String value = colon < 0 ? "" : line.substring(colon + 1);
      if (value.startsWith(" ")) value = value.substring(1);
      if ("event".equals(field)) {
        event = value;
      } else if ("data".equals(field)) {
        if (data.length() > 0) data.append('\n');
        data.append(value);
      }
    }
    if (allow != null && !allow.contains(event)) return "";
    return data.toString();
  }

  /** Convenience: wrap string parts as a RAW iterable (test helper style). */
  public static Iterable<String> chunksOf(String... parts) {
    return List.of(parts);
  }

  public static Iterator<String> iteratorOf(String... parts) {
    return List.of(parts).iterator();
  }
}
