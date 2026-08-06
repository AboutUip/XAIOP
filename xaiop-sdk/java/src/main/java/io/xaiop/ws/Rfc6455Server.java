package io.xaiop.ws;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * Minimal RFC6455 WebSocket server using {@link ServerSocket} only (no Netty/Jetty).
 *
 * <p>Supports HTTP Upgrade, text/binary frames, close, ping/pong, path filter, subprotocol
 * negotiation, {@code maxPayload}, optional pre-bound {@link ServerSocket}, and a small HTTP
 * multiplex for {@code GET /health} on the same port.
 *
 * <p>Clients must mask; the server does not mask outbound frames.
 */
public final class Rfc6455Server implements AutoCloseable {
  private final ServerSocket serverSocket;
  private final String pathFilter;
  private final List<String> protocols;
  private final int maxPayload;
  private final AtomicBoolean closed = new AtomicBoolean(false);
  private final CopyOnWriteArrayList<BiConsumer<WsSocket, HttpUpgradeRequest>> connectionHandlers =
      new CopyOnWriteArrayList<>();
  private final CopyOnWriteArrayList<Consumer<Throwable>> errorHandlers =
      new CopyOnWriteArrayList<>();
  private final Thread acceptThread;

  /** Parsed HTTP Upgrade request (path + headers). */
  public static final class HttpUpgradeRequest {
    public final String method;
    public final String path;
    public final Map<String, String> headers;
    /** Negotiated subprotocol, or {@code null}. */
    public final String protocol;

    public HttpUpgradeRequest(String method, String path, Map<String, String> headers) {
      this(method, path, headers, null);
    }

    public HttpUpgradeRequest(
        String method, String path, Map<String, String> headers, String protocol) {
      this.method = method;
      this.path = path;
      this.headers = headers;
      this.protocol = protocol;
    }
  }

  public static final class Options {
    public int port;
    public String host = "0.0.0.0";
    public String path;
    public int backlog = 50;
    /** Pre-bound socket; when set, {@link #port}/{@link #host} are ignored. */
    public ServerSocket serverSocket;
    /** Offered {@code Sec-WebSocket-Protocol} values (server preference order unused — first client match wins). */
    public List<String> protocols;
    /** Max inbound frame payload bytes; {@code null} → Node {@code ws} default (100 MiB). */
    public Integer maxPayload;

    public Options port(int p) {
      port = p;
      return this;
    }

    public Options host(String h) {
      host = h;
      return this;
    }

    public Options path(String p) {
      path = p;
      return this;
    }

    public Options backlog(int b) {
      backlog = b;
      return this;
    }

    public Options serverSocket(ServerSocket ss) {
      serverSocket = ss;
      return this;
    }

    public Options protocols(String... p) {
      if (p == null) {
        protocols = null;
      } else {
        protocols = new ArrayList<>(Arrays.asList(p));
      }
      return this;
    }

    public Options protocols(List<String> p) {
      protocols = p == null ? null : new ArrayList<>(p);
      return this;
    }

    public Options maxPayload(int n) {
      maxPayload = n;
      return this;
    }
  }

  public Rfc6455Server(Options options) throws IOException {
    Objects.requireNonNull(options, "options");
    this.pathFilter = normalizePath(options.path);
    this.protocols =
        options.protocols == null || options.protocols.isEmpty()
            ? Collections.emptyList()
            : List.copyOf(options.protocols);
    this.maxPayload =
        options.maxPayload == null || options.maxPayload <= 0
            ? Rfc6455.DEFAULT_MAX_PAYLOAD
            : options.maxPayload;
    if (options.serverSocket != null) {
      this.serverSocket = options.serverSocket;
    } else {
      InetAddress bind =
          options.host == null || options.host.isBlank()
              ? null
              : InetAddress.getByName(options.host);
      this.serverSocket = new ServerSocket();
      this.serverSocket.setReuseAddress(true);
      this.serverSocket.bind(new InetSocketAddress(bind, options.port), options.backlog);
    }
    this.acceptThread = new Thread(this::acceptLoop, "xaiop-ws-accept");
    this.acceptThread.setDaemon(true);
    this.acceptThread.start();
  }

  public int port() {
    return serverSocket.getLocalPort();
  }

  /** Path filter used for WS upgrades, or {@code null} when any path is accepted. */
  public String path() {
    return pathFilter;
  }

  public Rfc6455Server onConnection(BiConsumer<WsSocket, HttpUpgradeRequest> handler) {
    if (handler != null) connectionHandlers.add(handler);
    return this;
  }

  public Rfc6455Server onError(Consumer<Throwable> handler) {
    if (handler != null) errorHandlers.add(handler);
    return this;
  }

  private void acceptLoop() {
    while (!closed.get()) {
      try {
        Socket socket = serverSocket.accept();
        Thread t =
            new Thread(
                () -> handleClient(socket),
                "xaiop-ws-handshake-" + socket.getPort());
        t.setDaemon(true);
        t.start();
      } catch (SocketException se) {
        if (closed.get()) return;
        reportError(se);
      } catch (IOException e) {
        if (closed.get()) return;
        reportError(e);
      }
    }
  }

  private void handleClient(Socket socket) {
    try {
      socket.setTcpNoDelay(true);
      InputStream rawIn = new BufferedInputStream(socket.getInputStream());
      OutputStream rawOut = new BufferedOutputStream(socket.getOutputStream());
      HttpUpgradeRequest req = readHttpRequest(rawIn);
      String reqPath = normalizePath(req.path);
      if (reqPath == null) reqPath = "/";

      boolean upgrade = isWebSocketUpgrade(req);
      if (!upgrade) {
        handlePlainHttp(rawOut, req, reqPath);
        socket.close();
        return;
      }

      if (pathFilter != null && !pathFilter.equals(reqPath)) {
        writeHttpResponse(rawOut, 404, "Not Found", "Not Found\n");
        socket.close();
        return;
      }

      String key = header(req, "sec-websocket-key");
      String version = header(req, "sec-websocket-version");
      if (key == null || key.isBlank() || !"13".equals(version)) {
        writeHttpResponse(rawOut, 400, "Bad Request", "Bad WebSocket upgrade\n");
        socket.close();
        return;
      }

      String selected = null;
      if (!protocols.isEmpty()) {
        selected = negotiateProtocol(header(req, "sec-websocket-protocol"), protocols);
        if (selected == null) {
          writeHttpResponse(
              rawOut, 400, "Bad Request", "No matching Sec-WebSocket-Protocol\n");
          socket.close();
          return;
        }
      }

      String accept = Rfc6455.acceptKey(key.trim());
      StringBuilder resp = new StringBuilder();
      resp.append("HTTP/1.1 101 Switching Protocols\r\n");
      resp.append("Upgrade: websocket\r\n");
      resp.append("Connection: Upgrade\r\n");
      resp.append("Sec-WebSocket-Accept: ").append(accept).append("\r\n");
      if (selected != null) {
        resp.append("Sec-WebSocket-Protocol: ").append(selected).append("\r\n");
      }
      resp.append("\r\n");
      rawOut.write(resp.toString().getBytes(StandardCharsets.US_ASCII));
      rawOut.flush();

      HttpUpgradeRequest accepted =
          new HttpUpgradeRequest(req.method, req.path, req.headers, selected);
      ServerWsSocket ws = new ServerWsSocket(socket, rawIn, rawOut, maxPayload, selected);
      for (BiConsumer<WsSocket, HttpUpgradeRequest> h : connectionHandlers) {
        try {
          h.accept(ws, accepted);
        } catch (RuntimeException ex) {
          reportError(ex);
        }
      }
    } catch (Exception e) {
      reportError(e);
      try {
        socket.close();
      } catch (IOException ignored) {
        /* ignore */
      }
    }
  }

  /**
   * Plain HTTP multiplex on the same {@link ServerSocket}: {@code GET /health} → 200; other
   * non-upgrade requests → 404/400. Enables Node-like "shared port" tests without JDK {@code
   * HttpServer} upgrade.
   */
  private void handlePlainHttp(OutputStream rawOut, HttpUpgradeRequest req, String reqPath)
      throws IOException {
    if ("GET".equalsIgnoreCase(req.method) && "/health".equals(reqPath)) {
      writeHttpResponse(rawOut, 200, "OK", "ok\n");
      return;
    }
    if (pathFilter != null && !pathFilter.equals(reqPath) && !"/health".equals(reqPath)) {
      writeHttpResponse(rawOut, 404, "Not Found", "Not Found\n");
      return;
    }
    writeHttpResponse(rawOut, 400, "Bad Request", "Bad WebSocket upgrade\n");
  }

  private static boolean isWebSocketUpgrade(HttpUpgradeRequest req) {
    String upgrade = header(req, "upgrade");
    String connection = header(req, "connection");
    return "websocket".equalsIgnoreCase(upgrade)
        && connection != null
        && connection.toLowerCase(Locale.ROOT).contains("upgrade");
  }

  /**
   * Pick the first client-offered protocol that appears in the server offer list. If the server
   * configured protocols and none match (or the client omitted the header), return {@code null}
   * so the handshake fails with 400.
   */
  static String negotiateProtocol(String clientHeader, List<String> offered) {
    if (offered == null || offered.isEmpty()) return null;
    if (clientHeader == null || clientHeader.isBlank()) return null;
    for (String raw : clientHeader.split(",")) {
      String name = raw.trim();
      if (name.isEmpty()) continue;
      for (String offer : offered) {
        if (offer != null && offer.equals(name)) return offer;
      }
    }
    return null;
  }

  private static HttpUpgradeRequest readHttpRequest(InputStream in) throws IOException {
    ByteArrayOutputStream headerBuf = new ByteArrayOutputStream();
    while (true) {
      int b = in.read();
      if (b < 0) throw new IOException("Unexpected EOF during HTTP upgrade");
      headerBuf.write(b);
      if (b == '\n') {
        byte[] all = headerBuf.toByteArray();
        int n = all.length;
        if (n >= 4
            && all[n - 4] == '\r'
            && all[n - 3] == '\n'
            && all[n - 2] == '\r'
            && all[n - 1] == '\n') {
          break;
        }
        if (headerBuf.size() > 65536) {
          throw new IOException("HTTP upgrade headers too large");
        }
      }
      if (headerBuf.size() > 65536) {
        throw new IOException("HTTP upgrade headers too large");
      }
    }
    String text = headerBuf.toString(StandardCharsets.US_ASCII);
    String[] lines = text.split("\r\n");
    if (lines.length == 0) throw new IOException("Empty HTTP request");
    String[] parts = lines[0].split(" ");
    if (parts.length < 2) throw new IOException("Malformed request line: " + lines[0]);
    String method = parts[0];
    String path = parts[1];
    int q = path.indexOf('?');
    if (q >= 0) path = path.substring(0, q);
    Map<String, String> headers = new LinkedHashMap<>();
    for (int i = 1; i < lines.length; i++) {
      String line = lines[i];
      if (line.isEmpty()) continue;
      int colon = line.indexOf(':');
      if (colon <= 0) continue;
      String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
      String value = line.substring(colon + 1).trim();
      headers.put(name, value);
    }
    return new HttpUpgradeRequest(method, path, headers);
  }

  private static void writeHttpResponse(OutputStream out, int code, String reason, String body)
      throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    String head =
        "HTTP/1.1 "
            + code
            + " "
            + reason
            + "\r\nContent-Type: text/plain\r\nContent-Length: "
            + bytes.length
            + "\r\nConnection: close\r\n\r\n";
    out.write(head.getBytes(StandardCharsets.US_ASCII));
    out.write(bytes);
    out.flush();
  }

  private static String header(HttpUpgradeRequest req, String name) {
    return req.headers.get(name.toLowerCase(Locale.ROOT));
  }

  private static String normalizePath(String path) {
    if (path == null || path.isBlank()) return null;
    return path.startsWith("/") ? path : "/" + path;
  }

  private void reportError(Throwable err) {
    for (Consumer<Throwable> h : errorHandlers) {
      try {
        h.accept(err);
      } catch (RuntimeException ignored) {
        /* ignore */
      }
    }
  }

  @Override
  public void close() throws IOException {
    if (!closed.compareAndSet(false, true)) return;
    // Always close the socket to unblock accept(); for injected sockets this ends the bind.
    serverSocket.close();
    try {
      acceptThread.join(2000);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
