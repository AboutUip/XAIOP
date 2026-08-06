package io.xaiop.ws;

import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

/**
 * Client {@link WsSocket} backed by JDK {@link java.net.http.HttpClient} WebSocket.
 *
 * <p>Listeners may be registered before the handshake completes so sync server pushes are not lost.
 */
final class JdkClientWsSocket implements WsSocket {
  private final AtomicReference<WebSocket> ws = new AtomicReference<>();
  private final AtomicInteger readyState = new AtomicInteger(CONNECTING);
  private final CompletableFuture<Void> openFuture = new CompletableFuture<>();
  private final List<Consumer<String>> messageHandlers = new CopyOnWriteArrayList<>();
  private final List<Runnable> closeHandlers = new CopyOnWriteArrayList<>();
  private final List<Consumer<Throwable>> errorHandlers = new CopyOnWriteArrayList<>();
  private final List<Runnable> openHandlers = new CopyOnWriteArrayList<>();
  private final StringBuilder textCarry = new StringBuilder();
  private volatile String protocol;
  private final CharsetDecoder binaryDecoder =
      StandardCharsets.UTF_8
          .newDecoder()
          .onMalformedInput(CodingErrorAction.REPLACE)
          .onUnmappableCharacter(CodingErrorAction.REPLACE);

  WebSocket.Listener asListener() {
    return new WebSocket.Listener() {
      @Override
      public void onOpen(WebSocket webSocket) {
        ws.set(webSocket);
        readyState.set(OPEN);
        String sub = webSocket.getSubprotocol();
        protocol = (sub == null || sub.isEmpty()) ? null : sub;
        webSocket.request(1);
        for (Runnable h : openHandlers) {
          try {
            h.run();
          } catch (RuntimeException ignored) {
            /* ignore */
          }
        }
        openFuture.complete(null);
      }

      @Override
      public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
        textCarry.append(data);
        if (last) {
          String msg = textCarry.toString();
          textCarry.setLength(0);
          emitText(msg);
        }
        webSocket.request(1);
        return null;
      }

      @Override
      public CompletionStage<?> onBinary(WebSocket webSocket, ByteBuffer data, boolean last) {
        try {
          textCarry.append(binaryDecoder.decode(data));
        } catch (CharacterCodingException e) {
          fail(e);
        }
        if (last) {
          try {
            java.nio.CharBuffer out = java.nio.CharBuffer.allocate(8);
            java.nio.charset.CoderResult cr = binaryDecoder.flush(out);
            out.flip();
            textCarry.append(out);
            if (cr.isError()) cr.throwException();
          } catch (CharacterCodingException e) {
            fail(e);
          }
          binaryDecoder.reset();
          String msg = textCarry.toString();
          textCarry.setLength(0);
          emitText(msg);
        }
        webSocket.request(1);
        return null;
      }

      @Override
      public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
        readyState.set(CLOSED);
        fireClose();
        return null;
      }

      @Override
      public void onError(WebSocket webSocket, Throwable error) {
        readyState.set(CLOSED);
        fail(error);
        openFuture.completeExceptionally(error);
        fireClose();
      }
    };
  }

  CompletableFuture<Void> whenOpen() {
    return openFuture;
  }

  @Override
  public int readyState() {
    return readyState.get();
  }

  @Override
  public long bufferedAmount() {
    return 0;
  }

  @Override
  public String protocol() {
    return protocol;
  }

  @Override
  public void send(String text) {
    if (text == null) throw new NullPointerException("text");
    WebSocket socket = ws.get();
    if (socket == null || readyState.get() != OPEN) {
      throw new IllegalStateException("WebSocket is not OPEN");
    }
    socket.sendText(text, true).join();
  }

  @Override
  public void sendBinary(byte[] data) {
    if (data == null) throw new NullPointerException("data");
    WebSocket socket = ws.get();
    if (socket == null || readyState.get() != OPEN) {
      throw new IllegalStateException("WebSocket is not OPEN");
    }
    socket.sendBinary(ByteBuffer.wrap(data), true).join();
  }

  @Override
  public void close(int code, String reason) {
    WebSocket socket = ws.get();
    if (socket == null) {
      readyState.set(CLOSED);
      fireClose();
      return;
    }
    if (readyState.compareAndSet(OPEN, CLOSING) || readyState.get() == CLOSING) {
      try {
        String r = reason == null ? "" : reason;
        if (r.length() > 123) r = r.substring(0, 123);
        socket.sendClose(code, r);
      } catch (Exception ignored) {
        /* ignore */
      }
    }
  }

  @Override
  public void terminate() {
    WebSocket socket = ws.get();
    readyState.set(CLOSED);
    if (socket != null) {
      try {
        socket.abort();
      } catch (Exception ignored) {
        /* ignore */
      }
    }
    fireClose();
  }

  @Override
  public void onMessage(Consumer<String> handler) {
    if (handler != null) messageHandlers.add(handler);
  }

  @Override
  public void onClose(Runnable handler) {
    if (handler != null) closeHandlers.add(handler);
  }

  @Override
  public void onError(Consumer<Throwable> handler) {
    if (handler != null) errorHandlers.add(handler);
  }

  @Override
  public void onOpen(Runnable handler) {
    if (handler != null) openHandlers.add(handler);
  }

  @Override
  public void removeListeners() {
    messageHandlers.clear();
    closeHandlers.clear();
    errorHandlers.clear();
    openHandlers.clear();
  }

  private void emitText(String text) {
    for (Consumer<String> h : messageHandlers) {
      try {
        h.accept(text);
      } catch (RuntimeException ex) {
        fail(ex);
      }
    }
  }

  private void fail(Throwable err) {
    for (Consumer<Throwable> h : errorHandlers) {
      try {
        h.accept(err);
      } catch (RuntimeException ignored) {
        /* ignore */
      }
    }
  }

  private final AtomicInteger closeFired = new AtomicInteger(0);

  private void fireClose() {
    if (!closeFired.compareAndSet(0, 1)) return;
    List<Runnable> handlers = new ArrayList<>(closeHandlers);
    for (Runnable h : handlers) {
      try {
        h.run();
      } catch (RuntimeException ignored) {
        /* ignore */
      }
    }
  }
}
