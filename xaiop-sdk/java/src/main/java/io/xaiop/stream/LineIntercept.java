package io.xaiop.stream;

import java.util.List;

/**
 * Minimal line classification + fixed view template for checkpoint interceptors.
 *
 * <p>Faithful port of the Node.js SDK's {@code line-intercept.js}. Not a type system — only enough
 * structure to read / rewrite / skip a wire line.
 */
public final class LineIntercept {
  private LineIntercept() {}

  /**
   * Fixed template for one logical XAIOP line (no trailing newline). Unused slots are {@code null}.
   */
  public record LineView(
      String kind,
      String raw,
      String name,
      String path,
      String key,
      String valueText,
      String annotationText) {}

  /** Context handed to each {@link Handler}. */
  public record Context(String raw, LineView view) {}

  /**
   * Line interceptor.
   *
   * <ul>
   *   <li>return a {@link String} → feed that text (next handler sees it)
   *   <li>return {@code null} → skip the line (short-circuit; later handlers not called)
   *   <li>to keep the current text unchanged, return {@link Context#raw()}
   * </ul>
   */
  @FunctionalInterface
  public interface Handler {
    String apply(Context ctx);
  }

  /** Empty fixed template (all optional slots present as {@code null}). */
  public static LineView emptyLineView(String raw) {
    return emptyLineView(raw, LineKind.UNKNOWN);
  }

  /** Empty fixed template with an explicit kind. */
  public static LineView emptyLineView(String raw, String kind) {
    String r = raw == null ? "" : raw;
    String k = kind == null ? LineKind.UNKNOWN : kind;
    return new LineView(k, r, null, null, null, null, null);
  }

  /**
   * Classify a logical XAIOP line (no trailing newline) into a fixed view.
   *
   * <p>Best-effort; never throws — unknown forms get {@link LineKind#UNKNOWN}.
   */
  public static LineView classifyLine(String line) {
    String raw = line == null ? "" : line;
    if (".".equals(raw)) {
      return emptyLineView(raw, LineKind.PHASE);
    }
    if (raw.startsWith("#")) {
      return new LineView(LineKind.ANNOTATION, raw, null, null, null, null, raw.substring(1));
    }
    if ("<".equals(raw)) {
      return emptyLineView(raw, LineKind.POP);
    }
    if (raw.startsWith("<") && raw.length() > 1) {
      return new LineView(LineKind.POP_ENTER, raw, raw.substring(1), null, null, null, null);
    }
    if (raw.startsWith("=")) {
      return new LineView(LineKind.LOCATE, raw, null, raw.substring(1), null, null, null);
    }
    if (raw.startsWith("@")) {
      return new LineView(LineKind.EXACT, raw, null, raw.substring(1), null, null, null);
    }
    if (raw.startsWith("!")) {
      return new LineView(LineKind.BROADCAST, raw, null, raw.substring(1), null, null, null);
    }
    if (raw.startsWith("&")) {
      return new LineView(LineKind.DELETE, raw, null, raw.substring(1), null, null, null);
    }
    if (raw.startsWith("?")) {
      return new LineView(LineKind.SELECT, raw, null, raw.substring(1), null, null, null);
    }
    if (">".equals(raw)) {
      return emptyLineView(raw, LineKind.OBJECT_ANON);
    }
    if ("-".equals(raw)) {
      return emptyLineView(raw, LineKind.ARRAY_ANON);
    }
    if (raw.startsWith(">") && raw.endsWith("-") && raw.length() > 2) {
      return new LineView(
          LineKind.ARRAY_NAMED, raw, raw.substring(1, raw.length() - 1), null, null, null, null);
    }
    if (raw.startsWith(">") && raw.length() > 1) {
      return new LineView(LineKind.OBJECT_NAMED, raw, raw.substring(1), null, null, null, null);
    }
    int colon = raw.indexOf(':');
    if (colon != -1) {
      return new LineView(
          LineKind.CONTENT,
          raw,
          null,
          null,
          raw.substring(0, colon),
          raw.substring(colon + 1),
          null);
    }
    return emptyLineView(raw, LineKind.UNKNOWN);
  }

  /**
   * Run interceptors in registration order.
   *
   * <ul>
   *   <li>return {@code string} → feed that text (next handler sees it)
   *   <li>return {@code null} → skip line (short-circuit; later handlers not called)
   *   <li>to keep current text, return the current raw (see {@link Handler})
   * </ul>
   *
   * @return effective line text, or {@code null} when skipped
   */
  public static String runLineInterceptChain(String line, List<? extends Handler> handlers) {
    if (handlers == null || handlers.isEmpty()) {
      return line;
    }
    String current = line;
    for (Handler fn : handlers) {
      if (fn == null) {
        continue;
      }
      LineView view = classifyLine(current);
      String out = fn.apply(new Context(current, view));
      if (out == null) {
        return null;
      }
      current = out;
    }
    return current;
  }
}
