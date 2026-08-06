package io.xaiop.ws;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/**
 * Server-side WebSocket over a raw {@link Socket} (unmasked outbound, unmask inbound).
 */
final class ServerWsSocket implements WsSocket {
  private final Socket socket;
  private final InputStream in;
  private final OutputStream out;
  private final int maxPayload;
  private final String protocol;
  private final Object writeLock = new Object();
  private final AtomicInteger readyState = new AtomicInteger(OPEN);
  private final AtomicLong bufferedAmount = new AtomicLong(0);
  private final List<Consumer<String>> messageHandlers = new CopyOnWriteArrayList<>();
  private final List<Runnable> closeHandlers = new CopyOnWriteArrayList<>();
  private final List<Consumer<Throwable>> errorHandlers = new CopyOnWriteArrayList<>();
  private final Thread reader;

  private final StringBuilder textCarry = new StringBuilder();
  private boolean inTextFragment;

  ServerWsSocket(Socket socket, InputStream in, OutputStream out) {
    this(socket, in, out, Rfc6455.DEFAULT_MAX_PAYLOAD, null);
  }

  ServerWsSocket(
      Socket socket, InputStream in, OutputStream out, int maxPayload, String protocol) {
    this.socket = socket;
    this.in = in instanceof BufferedInputStream ? in : new BufferedInputStream(in);
    this.out = out instanceof BufferedOutputStream ? out : new BufferedOutputStream(out);
    this.maxPayload = maxPayload > 0 ? maxPayload : Rfc6455.DEFAULT_MAX_PAYLOAD;
    this.protocol = protocol;
    this.reader = new Thread(this::readLoop, "xaiop-ws-server-reader");
    this.reader.setDaemon(true);
    this.reader.start();
  }

  @Override
  public int readyState() {
    return readyState.get();
  }

  @Override
  public long bufferedAmount() {
    return bufferedAmount.get();
  }

  @Override
  public String protocol() {
    return protocol;
  }

  @Override
  public void send(String text) {
    if (text == null) throw new NullPointerException("text");
    sendFrame(Rfc6455.OPCODE_TEXT, text.getBytes(StandardCharsets.UTF_8), true);
  }

  @Override
  public void sendBinary(byte[] data) {
    if (data == null) throw new NullPointerException("data");
    sendFrame(Rfc6455.OPCODE_BINARY, data, true);
  }

  /** Send a (possibly fragmented) data frame. Package-visible for deep tests. */
  void sendFrame(int opcode, byte[] payload, boolean fin) {
    if (readyState.get() != OPEN) {
      throw new IllegalStateException("WebSocket is not OPEN");
    }
    byte[] body = payload == null ? new byte[0] : payload;
    synchronized (writeLock) {
      try {
        bufferedAmount.addAndGet(body.length);
        Rfc6455.writeFrame(out, opcode, body, false, fin);
      } catch (IOException e) {
        fail(e);
        throw new IllegalStateException("WebSocket send failed", e);
      } finally {
        bufferedAmount.addAndGet(-body.length);
      }
    }
  }

  @Override
  public void close(int code, String reason) {
    if (!readyState.compareAndSet(OPEN, CLOSING)
        && readyState.get() != CLOSING) {
      return;
    }
    synchronized (writeLock) {
      try {
        Rfc6455.writeFrame(
            out, Rfc6455.OPCODE_CLOSE, Rfc6455.closePayload(code, reason), false);
      } catch (IOException ignored) {
        /* ignore */
      }
    }
    hardClose();
  }

  @Override
  public void terminate() {
    hardClose();
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
  public void removeListeners() {
    messageHandlers.clear();
    closeHandlers.clear();
    errorHandlers.clear();
  }

  private void readLoop() {
    try {
      while (readyState.get() == OPEN || readyState.get() == CLOSING) {
        Rfc6455.Frame frame = Rfc6455.readFrame(in, maxPayload);
        switch (frame.opcode) {
          case Rfc6455.OPCODE_TEXT -> handleData(frame, Rfc6455.OPCODE_TEXT);
          case Rfc6455.OPCODE_BINARY -> handleData(frame, Rfc6455.OPCODE_BINARY);
          case Rfc6455.OPCODE_CONTINUATION -> handleContinuation(frame);
          case Rfc6455.OPCODE_PING -> {
            synchronized (writeLock) {
              Rfc6455.writeFrame(out, Rfc6455.OPCODE_PONG, frame.payload, false);
            }
          }
          case Rfc6455.OPCODE_PONG -> {
            /* ignore */
          }
          case Rfc6455.OPCODE_CLOSE -> {
            if (readyState.get() == OPEN) {
              synchronized (writeLock) {
                try {
                  Rfc6455.writeFrame(out, Rfc6455.OPCODE_CLOSE, frame.payload, false);
                } catch (IOException ignored) {
                  /* ignore */
                }
              }
            }
            hardClose();
            return;
          }
          default -> {
            /* ignore reserved */
          }
        }
      }
    } catch (Rfc6455.PayloadTooLargeException tooBig) {
      fail(tooBig);
      close(Rfc6455.CLOSE_MESSAGE_TOO_BIG, "message too big");
    } catch (EOFException eof) {
      hardClose();
    } catch (IOException e) {
      if (readyState.get() == OPEN || readyState.get() == CLOSING) {
        fail(e);
      }
      hardClose();
    }
  }

  private void handleData(Rfc6455.Frame frame, int opcode) {
    String piece = new String(frame.payload, StandardCharsets.UTF_8);
    if (frame.fin) {
      if (inTextFragment) {
        textCarry.append(piece);
        emitText(textCarry.toString());
        textCarry.setLength(0);
        inTextFragment = false;
      } else {
        emitText(piece);
      }
    } else {
      textCarry.setLength(0);
      textCarry.append(piece);
      inTextFragment = true;
    }
  }

  private void handleContinuation(Rfc6455.Frame frame) {
    if (!inTextFragment) return;
    textCarry.append(new String(frame.payload, StandardCharsets.UTF_8));
    if (frame.fin) {
      emitText(textCarry.toString());
      textCarry.setLength(0);
      inTextFragment = false;
    }
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

  private void hardClose() {
    int prev = readyState.getAndSet(CLOSED);
    if (prev == CLOSED) return;
    try {
      socket.close();
    } catch (IOException ignored) {
      /* ignore */
    }
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
