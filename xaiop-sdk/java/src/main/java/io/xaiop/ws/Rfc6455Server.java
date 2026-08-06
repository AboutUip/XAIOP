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
import java.util.LinkedHashMap;
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
 * <p>Supports HTTP Upgrade, text frames, close, and ping/pong. Clients must mask; the server does
 * not mask outbound frames.
 */
public final class Rfc6455Server implements AutoCloseable {
  private final ServerSocket serverSocket;
  private final String pathFilter;
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

    public HttpUpgradeRequest(String method, String path, Map<String, String> headers) {
      this.method = method;
      this.path = path;
      this.headers = headers;
    }
  }

  public static final class Options {
    public int port;
    public String host = "0.0.0.0";
    public String path;
    public int backlog = 50;

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
  }

  public Rfc6455Server(Options options) throws IOException {
    Objects.requireNonNull(options, "options");
    this.pathFilter = normalizePath(options.path);
    InetAddress bind =
        options.host == null || options.host.isBlank()
            ? null
            : InetAddress.getByName(options.host);
    this.serverSocket = new ServerSocket();
    this.serverSocket.setReuseAddress(true);
    this.serverSocket.bind(new InetSocketAddress(bind, options.port), options.backlog);
    this.acceptThread = new Thread(this::acceptLoop, "xaiop-ws-accept");
    this.acceptThread.setDaemon(true);
    this.acceptThread.start();
  }

  public int port() {
    return serverSocket.getLocalPort();
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
      if (pathFilter != null && !pathFilter.equals(normalizePath(req.path))) {
        writeHttpResponse(rawOut, 404, "Not Found", "Not Found\n");
        socket.close();
        return;
      }
      String upgrade = header(req, "upgrade");
      String connection = header(req, "connection");
      String key = header(req, "sec-websocket-key");
      String version = header(req, "sec-websocket-version");
      if (!"websocket".equalsIgnoreCase(upgrade)
          || connection == null
          || !connection.toLowerCase(Locale.ROOT).contains("upgrade")
          || key == null
          || key.isBlank()
          || !"13".equals(version)) {
        writeHttpResponse(rawOut, 400, "Bad Request", "Bad WebSocket upgrade\n");
        socket.close();
        return;
      }
      String accept = Rfc6455.acceptKey(key.trim());
      StringBuilder resp = new StringBuilder();
      resp.append("HTTP/1.1 101 Switching Protocols\r\n");
      resp.append("Upgrade: websocket\r\n");
      resp.append("Connection: Upgrade\r\n");
      resp.append("Sec-WebSocket-Accept: ").append(accept).append("\r\n");
      resp.append("\r\n");
      rawOut.write(resp.toString().getBytes(StandardCharsets.US_ASCII));
      rawOut.flush();

      ServerWsSocket ws = new ServerWsSocket(socket, rawIn, rawOut);
      for (BiConsumer<WsSocket, HttpUpgradeRequest> h : connectionHandlers) {
        try {
          h.accept(ws, req);
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

  private static HttpUpgradeRequest readHttpRequest(InputStream in) throws IOException {
    ByteArrayOutputStream headerBuf = new ByteArrayOutputStream();
    while (true) {
      int b = in.read();
      if (b < 0) throw new IOException("Unexpected EOF during HTTP upgrade");
      headerBuf.write(b);
      if (b == '\r') {
        /* wait for \n */
      } else if (b == '\n') {
        // check last 4 bytes for \r\n\r\n
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
    serverSocket.close();
    try {
      acceptThread.join(2000);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }
}
