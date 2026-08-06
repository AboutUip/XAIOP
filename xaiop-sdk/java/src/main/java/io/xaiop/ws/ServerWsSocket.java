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
    this.socket = socket;
    this.in = in instanceof BufferedInputStream ? in : new BufferedInputStream(in);
    this.out = out instanceof BufferedOutputStream ? out : new BufferedOutputStream(out);
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
  public void send(String text) {
    if (text == null) throw new NullPointerException("text");
    if (readyState.get() != OPEN) {
      throw new IllegalStateException("WebSocket is not OPEN");
    }
    byte[] payload = text.getBytes(StandardCharsets.UTF_8);
    synchronized (writeLock) {
      try {
        bufferedAmount.addAndGet(payload.length);
        Rfc6455.writeFrame(out, Rfc6455.OPCODE_TEXT, payload, false);
      } catch (IOException e) {
        fail(e);
        throw new IllegalStateException("WebSocket send failed", e);
      } finally {
        bufferedAmount.addAndGet(-payload.length);
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
        Rfc6455.Frame frame = Rfc6455.readFrame(in);
        switch (frame.opcode) {
          case Rfc6455.OPCODE_TEXT -> handleText(frame);
          case Rfc6455.OPCODE_BINARY -> handleBinary(frame);
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
    } catch (EOFException eof) {
      hardClose();
    } catch (IOException e) {
      if (readyState.get() == OPEN || readyState.get() == CLOSING) {
        fail(e);
      }
      hardClose();
    }
  }

  private void handleText(Rfc6455.Frame frame) {
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

  private void handleBinary(Rfc6455.Frame frame) {
    // Treat binary as UTF-8 text for XAIOP wire (Node connection does the same).
    handleText(frame);
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
