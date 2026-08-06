package io.xaiop.ws;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.concurrent.ThreadLocalRandom;

/** Shared RFC6455 helpers (handshake Accept, frame read/write). */
final class Rfc6455 {
  static final String GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

  static final int OPCODE_CONTINUATION = 0x0;
  static final int OPCODE_TEXT = 0x1;
  static final int OPCODE_BINARY = 0x2;
  static final int OPCODE_CLOSE = 0x8;
  static final int OPCODE_PING = 0x9;
  static final int OPCODE_PONG = 0xA;

  /** Close status: message too big (maxPayload exceeded). */
  static final int CLOSE_MESSAGE_TOO_BIG = 1009;

  /** Default max payload (matches Node {@code ws} default). */
  static final int DEFAULT_MAX_PAYLOAD = 100 * 1024 * 1024;

  private Rfc6455() {}

  static String acceptKey(String secWebSocketKey) {
    try {
      MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
      byte[] digest = sha1.digest((secWebSocketKey + GUID).getBytes(StandardCharsets.UTF_8));
      return Base64.getEncoder().encodeToString(digest);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-1 required for WebSocket handshake", e);
    }
  }

  static final class Frame {
    final boolean fin;
    final int opcode;
    final byte[] payload;

    Frame(boolean fin, int opcode, byte[] payload) {
      this.fin = fin;
      this.opcode = opcode;
      this.payload = payload == null ? new byte[0] : payload;
    }
  }

  static final class PayloadTooLargeException extends IOException {
    PayloadTooLargeException(long len, int max) {
      super("WebSocket frame too large: " + len + " > maxPayload " + max);
    }
  }

  static Frame readFrame(InputStream in) throws IOException {
    return readFrame(in, DEFAULT_MAX_PAYLOAD);
  }

  static Frame readFrame(InputStream in, int maxPayload) throws IOException {
    int b0 = in.read();
    if (b0 < 0) throw new EOFException("WebSocket EOF");
    int b1 = in.read();
    if (b1 < 0) throw new EOFException("WebSocket EOF");
    boolean fin = (b0 & 0x80) != 0;
    int opcode = b0 & 0x0F;
    boolean masked = (b1 & 0x80) != 0;
    long len = b1 & 0x7F;
    if (len == 126) {
      len = readUnsignedShort(in);
    } else if (len == 127) {
      len = readUnsignedLong(in);
      if (len > Integer.MAX_VALUE) {
        throw new IOException("WebSocket frame too large: " + len);
      }
    }
    if (maxPayload > 0 && len > maxPayload) {
      throw new PayloadTooLargeException(len, maxPayload);
    }
    byte[] mask = null;
    if (masked) {
      mask = readFully(in, 4);
    }
    byte[] payload = readFully(in, (int) len);
    if (mask != null) {
      for (int i = 0; i < payload.length; i++) {
        payload[i] = (byte) (payload[i] ^ mask[i % 4]);
      }
    }
    return new Frame(fin, opcode, payload);
  }

  /** Write a FIN frame. {@code mask} true for client→server; server must pass false. */
  static void writeFrame(OutputStream out, int opcode, byte[] payload, boolean mask)
      throws IOException {
    writeFrame(out, opcode, payload, mask, true);
  }

  /** Write a frame with explicit FIN bit. */
  static void writeFrame(OutputStream out, int opcode, byte[] payload, boolean mask, boolean fin)
      throws IOException {
    if (payload == null) payload = new byte[0];
    ByteArrayOutputStream buf = new ByteArrayOutputStream(payload.length + 14);
    buf.write((fin ? 0x80 : 0x00) | (opcode & 0x0F));
    int len = payload.length;
    if (len < 126) {
      buf.write((mask ? 0x80 : 0) | len);
    } else if (len <= 0xFFFF) {
      buf.write((mask ? 0x80 : 0) | 126);
      buf.write((len >>> 8) & 0xFF);
      buf.write(len & 0xFF);
    } else {
      buf.write((mask ? 0x80 : 0) | 127);
      for (int i = 7; i >= 0; i--) {
        buf.write((int) ((len >>> (8 * i)) & 0xFF));
      }
    }
    byte[] maskKey = null;
    if (mask) {
      maskKey = new byte[4];
      ThreadLocalRandom.current().nextBytes(maskKey);
      buf.write(maskKey);
    }
    if (maskKey != null) {
      for (int i = 0; i < payload.length; i++) {
        buf.write(payload[i] ^ maskKey[i % 4]);
      }
    } else {
      buf.write(payload);
    }
    out.write(buf.toByteArray());
    out.flush();
  }

  static byte[] closePayload(int code, String reason) {
    byte[] reasonBytes =
        reason == null || reason.isEmpty()
            ? new byte[0]
            : reason.getBytes(StandardCharsets.UTF_8);
    if (reasonBytes.length > 123) {
      reasonBytes = java.util.Arrays.copyOf(reasonBytes, 123);
    }
    ByteBuffer bb = ByteBuffer.allocate(2 + reasonBytes.length);
    bb.putShort((short) (code & 0xFFFF));
    bb.put(reasonBytes);
    return bb.array();
  }

  static int readUnsignedShort(InputStream in) throws IOException {
    int hi = in.read();
    int lo = in.read();
    if (hi < 0 || lo < 0) throw new EOFException("WebSocket EOF");
    return (hi << 8) | lo;
  }

  static long readUnsignedLong(InputStream in) throws IOException {
    long v = 0;
    for (int i = 0; i < 8; i++) {
      int b = in.read();
      if (b < 0) throw new EOFException("WebSocket EOF");
      v = (v << 8) | b;
    }
    return v;
  }

  static byte[] readFully(InputStream in, int n) throws IOException {
    byte[] buf = new byte[n];
    int off = 0;
    while (off < n) {
      int r = in.read(buf, off, n - off);
      if (r < 0) throw new EOFException("WebSocket EOF");
      off += r;
    }
    return buf;
  }
}
