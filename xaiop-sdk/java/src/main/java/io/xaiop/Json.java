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
      LinkedHashMap<String, Object> out = new LinkedHashMap<>((map.size() * 4 / 3) + 1);
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

  /**
   * Parses a JSON string into the SDK tree shape ({@link LinkedHashMap} / {@link ArrayList} /
   * scalars). Numbers that fit in {@code int} become {@link Integer}; otherwise {@link Long} or
   * {@link Double}.
   */
  public static Object parse(String text) {
    if (text == null) throw new IllegalArgumentException("JSON text is required");
    Parser p = new Parser(text);
    Object v = p.parseValue();
    p.skipWs();
    if (p.i < p.s.length()) {
      throw new IllegalArgumentException("unexpected trailing JSON");
    }
    return v;
  }

  private static final class Parser {
    final String s;
    int i;

    Parser(String s) {
      this.s = s;
    }

    void skipWs() {
      while (i < s.length()) {
        char c = s.charAt(i);
        if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
        else break;
      }
    }

    Object parseValue() {
      skipWs();
      if (i >= s.length()) throw new IllegalArgumentException("unexpected end of JSON");
      char c = s.charAt(i);
      if (c == '{') return parseObject();
      if (c == '[') return parseArray();
      if (c == '"') return parseString();
      if (c == 't') return parseLiteral("true", Boolean.TRUE);
      if (c == 'f') return parseLiteral("false", Boolean.FALSE);
      if (c == 'n') return parseLiteral("null", null);
      if (c == '-' || (c >= '0' && c <= '9')) return parseNumber();
      throw new IllegalArgumentException("unexpected JSON at index " + i);
    }

    Object parseLiteral(String lit, Object value) {
      if (!s.startsWith(lit, i)) {
        throw new IllegalArgumentException("expected " + lit);
      }
      i += lit.length();
      return value;
    }

    LinkedHashMap<String, Object> parseObject() {
      i++; // {
      LinkedHashMap<String, Object> out = new LinkedHashMap<>();
      skipWs();
      if (i < s.length() && s.charAt(i) == '}') {
        i++;
        return out;
      }
      while (true) {
        skipWs();
        if (i >= s.length() || s.charAt(i) != '"') {
          throw new IllegalArgumentException("expected object key");
        }
        String key = parseString();
        skipWs();
        if (i >= s.length() || s.charAt(i) != ':') {
          throw new IllegalArgumentException("expected ':'");
        }
        i++;
        out.put(key, parseValue());
        skipWs();
        if (i < s.length() && s.charAt(i) == ',') {
          i++;
          continue;
        }
        if (i < s.length() && s.charAt(i) == '}') {
          i++;
          return out;
        }
        throw new IllegalArgumentException("expected ',' or '}'");
      }
    }

    ArrayList<Object> parseArray() {
      i++; // [
      ArrayList<Object> out = new ArrayList<>();
      skipWs();
      if (i < s.length() && s.charAt(i) == ']') {
        i++;
        return out;
      }
      while (true) {
        out.add(parseValue());
        skipWs();
        if (i < s.length() && s.charAt(i) == ',') {
          i++;
          continue;
        }
        if (i < s.length() && s.charAt(i) == ']') {
          i++;
          return out;
        }
        throw new IllegalArgumentException("expected ',' or ']'");
      }
    }

    String parseString() {
      i++; // "
      StringBuilder sb = new StringBuilder();
      while (i < s.length()) {
        char c = s.charAt(i++);
        if (c == '"') return sb.toString();
        if (c == '\\') {
          if (i >= s.length()) throw new IllegalArgumentException("bad string escape");
          char e = s.charAt(i++);
          switch (e) {
            case '"', '\\', '/' -> sb.append(e);
            case 'b' -> sb.append('\b');
            case 'f' -> sb.append('\f');
            case 'n' -> sb.append('\n');
            case 'r' -> sb.append('\r');
            case 't' -> sb.append('\t');
            case 'u' -> {
              if (i + 4 > s.length()) throw new IllegalArgumentException("bad unicode escape");
              int code = Integer.parseInt(s.substring(i, i + 4), 16);
              sb.append((char) code);
              i += 4;
            }
            default -> throw new IllegalArgumentException("bad string escape");
          }
        } else {
          sb.append(c);
        }
      }
      throw new IllegalArgumentException("unterminated string");
    }

    Number parseNumber() {
      int start = i;
      if (s.charAt(i) == '-') i++;
      if (i >= s.length()) throw new IllegalArgumentException("bad number");
      if (s.charAt(i) == '0') {
        i++;
      } else if (s.charAt(i) >= '1' && s.charAt(i) <= '9') {
        while (i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
      } else {
        throw new IllegalArgumentException("bad number");
      }
      boolean isFloat = false;
      if (i < s.length() && s.charAt(i) == '.') {
        isFloat = true;
        i++;
        if (i >= s.length() || s.charAt(i) < '0' || s.charAt(i) > '9') {
          throw new IllegalArgumentException("bad number");
        }
        while (i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
      }
      if (i < s.length() && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
        isFloat = true;
        i++;
        if (i < s.length() && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
        if (i >= s.length() || s.charAt(i) < '0' || s.charAt(i) > '9') {
          throw new IllegalArgumentException("bad number");
        }
        while (i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9') i++;
      }
      String raw = s.substring(start, i);
      if (isFloat) return Double.parseDouble(raw);
      try {
        long l = Long.parseLong(raw);
        if (l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) return (int) l;
        return l;
      } catch (NumberFormatException e) {
        return Double.parseDouble(raw);
      }
    }
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
