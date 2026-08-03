package io.xaiop;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal JSON-compatible helpers for the tree shape produced by {@link Parse}:
 * {@link LinkedHashMap}&lt;String,Object&gt; for objects, {@link ArrayList}&lt;Object&gt;
 * for arrays, {@link String}, {@link Integer}/{@link Long}/{@link Double}, {@link Boolean},
 * and {@code null} for leaves.
 *
 * <p>Faithful counterpart to the Node.js SDK's {@code clone.js} (deep clone) plus a small
 * JSON encoder used internally for error messages and {@link XaiopFragment#notation()}.
 */
public final class Json {
  private Json() {}

  /**
   * Deep-clones a JSON-compatible value. Maps become new {@link LinkedHashMap}s (insertion
   * order preserved), lists become new {@link ArrayList}s, and immutable leaves are returned
   * as-is.
   */
  @SuppressWarnings("unchecked")
  public static Object deepClone(Object value) {
    if (value == null) return null;
    if (value instanceof Map<?, ?> map) {
      LinkedHashMap<String, Object> out = new LinkedHashMap<>();
      for (Map.Entry<?, ?> e : map.entrySet()) {
        out.put(String.valueOf(e.getKey()), deepClone(e.getValue()));
      }
      return out;
    }
    if (value instanceof List<?> list) {
      ArrayList<Object> out = new ArrayList<>(list.size());
      for (Object o : list) out.add(deepClone(o));
      return out;
    }
    return value;
  }

  /** Encodes a JSON-compatible value as a JSON string (compact, no whitespace). */
  public static String stringify(Object value) {
    StringBuilder sb = new StringBuilder();
    write(sb, value);
    return sb.toString();
  }

  private static void write(StringBuilder sb, Object value) {
    if (value == null) {
      sb.append("null");
      return;
    }
    if (value instanceof String s) {
      writeString(sb, s);
      return;
    }
    if (value instanceof Boolean b) {
      sb.append(b.booleanValue());
      return;
    }
    if (value instanceof Number n) {
      sb.append(n.toString());
      return;
    }
    if (value instanceof Map<?, ?> map) {
      sb.append('{');
      boolean first = true;
      for (Map.Entry<?, ?> e : map.entrySet()) {
        if (!first) sb.append(',');
        first = false;
        writeString(sb, String.valueOf(e.getKey()));
        sb.append(':');
        write(sb, e.getValue());
      }
      sb.append('}');
      return;
    }
    if (value instanceof List<?> list) {
      sb.append('[');
      boolean first = true;
      for (Object o : list) {
        if (!first) sb.append(',');
        first = false;
        write(sb, o);
      }
      sb.append(']');
      return;
    }
    writeString(sb, value.toString());
  }

  private static void writeString(StringBuilder sb, String s) {
    sb.append('"');
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      switch (c) {
        case '"' -> sb.append("\\\"");
        case '\\' -> sb.append("\\\\");
        case '\n' -> sb.append("\\n");
        case '\r' -> sb.append("\\r");
        case '\t' -> sb.append("\\t");
        case '\b' -> sb.append("\\b");
        case '\f' -> sb.append("\\f");
        default -> {
          if (c < 0x20) {
            sb.append(String.format("\\u%04x", (int) c));
          } else {
            sb.append(c);
          }
        }
      }
    }
    sb.append('"');
  }
}
