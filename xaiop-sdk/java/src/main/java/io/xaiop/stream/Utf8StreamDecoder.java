package io.xaiop.stream;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Streaming UTF-8 decoder for binary frames split across chunks. Buffers an incomplete trailing
 * code unit sequence until the next push / {@link #flush()}.
 */
public final class Utf8StreamDecoder {
  private final ByteArrayOutputStream pending = new ByteArrayOutputStream(32);

  public String push(byte[] bytes) {
    if (bytes == null || bytes.length == 0) return "";
    pending.write(bytes, 0, bytes.length);
    return drain(false);
  }

  public String push(java.nio.ByteBuffer buffer) {
    if (buffer == null || !buffer.hasRemaining()) return "";
    byte[] bytes = new byte[buffer.remaining()];
    buffer.get(bytes);
    return push(bytes);
  }

  public String flush() {
    return drain(true);
  }

  private String drain(boolean end) {
    byte[] all = pending.toByteArray();
    if (all.length == 0) return "";
    int keep = end ? 0 : incompleteSuffixLen(all);
    int complete = all.length - keep;
    if (complete <= 0) return "";
    String out = new String(all, 0, complete, StandardCharsets.UTF_8);
    pending.reset();
    if (keep > 0) pending.write(all, complete, keep);
    return out;
  }

  /** How many trailing bytes form an incomplete UTF-8 sequence (0..3). */
  static int incompleteSuffixLen(byte[] all) {
    if (all.length == 0) return 0;
    int i = all.length - 1;
    // count continuation bytes from the end
    int cont = 0;
    while (i >= 0 && (all[i] & 0xC0) == 0x80) {
      cont++;
      i--;
      if (cont >= 3) break;
    }
    if (i < 0) return all.length; // all continuations — wait
    int b = all[i] & 0xFF;
    int need;
    if (b < 0x80) need = 1;
    else if (b < 0xC0) return cont + 1; // stray continuation — treat as incomplete cluster
    else if (b < 0xE0) need = 2;
    else if (b < 0xF0) need = 3;
    else if (b < 0xF8) need = 4;
    else need = 1;
    int have = cont + 1;
    return have < need ? have : 0;
  }
}
