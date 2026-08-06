package io.xaiop.ws;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * WebSocket hub — accept connections for skeleton / phase push.
 *
 * <p>Faithful port of the Node.js SDK's {@code node/ws/hub.ts}.
 */
public final class XaiopWsHub {
  private final Rfc6455Server server;
  private final XaiopWsConnection.Options connectionOptions;
  private volatile BiConsumer<XaiopWsConnection, Rfc6455Server.HttpUpgradeRequest> onConnection;
  private volatile Consumer<Throwable> onError;
  private final Set<XaiopWsConnection> connections = ConcurrentHashMap.newKeySet();
  private final CopyOnWriteArrayList<Consumer<Throwable>> errorListeners =
      new CopyOnWriteArrayList<>();

  XaiopWsHub(Rfc6455Server server, XaiopWsConnection.Options connectionOptions) {
    if (server == null) throw new IllegalArgumentException("XaiopWsHub requires a server");
    this.server = server;
    this.connectionOptions =
        connectionOptions == null ? new XaiopWsConnection.Options() : connectionOptions;
    this.server.onConnection(
        (socket, req) -> {
          XaiopWsConnection conn = new XaiopWsConnection(socket, this.connectionOptions);
          connections.add(conn);
          conn.closed().whenComplete((v, e) -> connections.remove(conn));
          BiConsumer<XaiopWsConnection, Rfc6455Server.HttpUpgradeRequest> h = onConnection;
          if (h != null) h.accept(conn, req);
        });
    this.server.onError(
        err -> {
          Consumer<Throwable> h = onError;
          if (h != null) h.accept(err);
          for (Consumer<Throwable> l : errorListeners) {
            try {
              l.accept(err);
            } catch (RuntimeException ignored) {
              /* ignore */
            }
          }
        });
  }

  public int port() {
    return server.port();
  }

  /** {@code ws://host:port} for loopback tests. */
  public String url() {
    return url("127.0.0.1");
  }

  public String url(String host) {
    return "ws://" + host + ":" + port();
  }

  public List<XaiopWsConnection> connections() {
    return new ArrayList<>(connections);
  }

  public XaiopWsHub onConnection(Consumer<XaiopWsConnection> fn) {
    if (fn == null) {
      onConnection = null;
    } else {
      onConnection = (conn, req) -> fn.accept(conn);
    }
    return this;
  }

  public XaiopWsHub onConnection(
      BiConsumer<XaiopWsConnection, Rfc6455Server.HttpUpgradeRequest> fn) {
    onConnection = fn;
    return this;
  }

  public XaiopWsHub onError(Consumer<Throwable> fn) {
    onError = fn;
    return this;
  }

  /** Close the hub and end all connections. */
  public CompletableFuture<Void> close() {
    List<CompletableFuture<Void>> ends = new ArrayList<>();
    for (XaiopWsConnection conn : new ArrayList<>(connections)) {
      try {
        ends.add(conn.end());
      } catch (RuntimeException ignored) {
        /* ignore */
      }
    }
    CompletableFuture<Void> all =
        ends.isEmpty()
            ? CompletableFuture.completedFuture(null)
            : CompletableFuture.allOf(ends.toArray(CompletableFuture[]::new));
    return all.handle(
            (v, e) -> {
              try {
                server.close();
              } catch (IOException ioe) {
                throw new RuntimeException(ioe);
              }
              return null;
            })
        .thenApply(x -> null);
  }

  /** Listen options (port / host / path + connection options). */
  public static final class ListenOptions extends XaiopWsConnection.Options {
    public int port;
    public String host = "0.0.0.0";
    public String path;
    public int backlog = 50;

    public ListenOptions port(int p) {
      this.port = p;
      return this;
    }

    public ListenOptions host(String h) {
      this.host = h;
      return this;
    }

    public ListenOptions path(String p) {
      this.path = p;
      return this;
    }

    public ListenOptions backlog(int b) {
      this.backlog = b;
      return this;
    }

    @Override
    public ListenOptions streamProcessing(boolean v) {
      super.streamProcessing(v);
      return this;
    }

    @Override
    public ListenOptions mergeChunkWindow(boolean v) {
      super.mergeChunkWindow(v);
      return this;
    }

    @Override
    public ListenOptions onPhase(java.util.function.Consumer<Object> fn) {
      super.onPhase(fn);
      return this;
    }
  }

  static CompletableFuture<XaiopWsHub> listen(ListenOptions options) {
    ListenOptions opts = options == null ? new ListenOptions() : options;
    return CompletableFuture.supplyAsync(
        () -> {
          try {
            Rfc6455Server.Options so = new Rfc6455Server.Options();
            so.port = opts.port;
            so.host = opts.host;
            so.path = opts.path;
            so.backlog = opts.backlog;
            Rfc6455Server server = new Rfc6455Server(so);
            return new XaiopWsHub(server, opts);
          } catch (IOException e) {
            throw new RuntimeException(e);
          }
        });
  }
}
