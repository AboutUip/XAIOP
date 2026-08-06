package io.xaiop.ws;

import java.util.function.Consumer;

/**
 * Minimal WebSocket surface used by {@link XaiopWsConnection} (server accept or JDK client).
 *
 * <p>Ready-state constants match the WHATWG / Node {@code ws} numbering.
 */
public interface WsSocket {
  int CONNECTING = 0;
  int OPEN = 1;
  int CLOSING = 2;
  int CLOSED = 3;

  int readyState();

  /** Approximate outbound buffer size in bytes (0 when unknown). */
  long bufferedAmount();

  void send(String text);

  void close(int code, String reason);

  /** Abrupt teardown (may skip graceful close handshake). */
  void terminate();

  void onMessage(Consumer<String> handler);

  void onClose(Runnable handler);

  void onError(Consumer<Throwable> handler);

  /** Optional; fired when the socket becomes {@link #OPEN}. */
  default void onOpen(Runnable handler) {}

  void removeListeners();
}
