package io.xaiop.stream;

import io.xaiop.DotPolicy;
import io.xaiop.Encode;
import io.xaiop.EncodeOptions;
import io.xaiop.Json;
import io.xaiop.Parse;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Phase annotation-span ({@code #}) intercept — SDK product, not wire grammar.
 *
 * <p>Faithful port of the Node.js SDK's {@code annotation-span.js}. After phase lines are ready
 * (JSON-facing capture), before Diff delivery: on {@code #}, collect forward same-level siblings
 * (+ subtrees) as JSON, call handlers, remount returned JSON. Escapes typeCheck for handled keys
 * (and their trees).
 *
 * <p>Handler return semantics (Java):
 *
 * <ul>
 *   <li>{@link #KEEP} — keep {@code #} + capture wire; still report escape paths
 *   <li>{@code null} — drop {@code #} + capture
 *   <li>{@link Map} / {@link List} / JSON text {@link String} — remount as sibling wire
 * </ul>
 */
public final class AnnotationSpan {
  /**
   * Sentinel meaning "keep wire" (Node {@code undefined}). Distinct from {@code null} (drop).
   */
  public static final Object KEEP = new Object();

  private AnnotationSpan() {}

  /** View handed to each {@link Handler}. */
  public record View(
      String annotation,
      String annotationRaw,
      String path,
      int depth,
      Object json,
      String jsonText) {}

  /**
   * Annotation-span handler.
   *
   * @see AnnotationSpan#KEEP
   */
  @FunctionalInterface
  public interface Handler {
    Object apply(String annotation, View view);
  }

  /** Result of {@link #applyAnnotationSpans}. */
  public record Result(List<String> lines, List<String> escapePaths) {}

  private record SimFrame(String kind, String key) {}

  private record Capture(List<String> lines, int end) {}

  /**
   * Apply annotation-span handlers to phase lines.
   *
   * @param phaseLines logical lines of one phase (may include trailing {@code .})
   * @param handlers registration-order handlers; first decisive non-{@link #KEEP} wins
   */
  public static Result applyAnnotationSpans(
      List<String> phaseLines, List<? extends Handler> handlers) {
    if (handlers == null || handlers.isEmpty()) {
      return new Result(phaseLines, List.of());
    }

    List<SimFrame> stack = new ArrayList<>();
    List<String> out = new ArrayList<>();
    List<String> escapePaths = new ArrayList<>();

    int i = 0;
    while (i < phaseLines.size()) {
      String line = phaseLines.get(i);

      if (".".equals(line)) {
        out.add(line);
        stack.clear();
        i += 1;
        continue;
      }

      // SDK Control Root (`#!…`) must never become Annotation Span.
      if (line.startsWith("#!")) {
        out.add(line);
        i += 1;
        continue;
      }

      if (line.startsWith("#")) {
        int depth = stack.size();
        String parentPath = pathFromStack(stack);
        String annotation = line.substring(1);
        Capture collected = collectForwardSiblings(phaseLines, i + 1, depth);
        List<String> captureLines = collected.lines();
        String parentKind =
            !stack.isEmpty() && "array".equals(stack.get(stack.size() - 1).kind())
                ? "array"
                : "object";
        Object json = materializeCapture(captureLines, parentKind);
        View view =
            new View(annotation, line, parentPath, depth, json, stableJsonText(json));

        Object result = KEEP;
        for (Handler fn : handlers) {
          if (fn == null) continue;
          Object ret = fn.apply(annotation, view);
          if (ret == null) {
            result = null;
            break;
          }
          if (ret != KEEP) {
            result = ret;
            break;
          }
        }

        if (result == KEEP) {
          out.add(line);
          for (String captureLine : captureLines) {
            applySimLine(stack, captureLine);
            out.add(captureLine);
          }
          addEscapeKeys(escapePaths, parentPath, json);
        } else if (result == null) {
          // Drop # + capture; do not advance sim for dropped capture.
        } else {
          Object remount = normalizeHandlerJson(result);
          List<String> siblingLines = encodeAsSiblingLines(remount, parentKind);
          for (String sibling : siblingLines) {
            applySimLine(stack, sibling);
            out.add(sibling);
          }
          addEscapeKeys(escapePaths, parentPath, remount);
        }

        i = collected.end();
        continue;
      }

      applySimLine(stack, line);
      out.add(line);
      i += 1;
    }

    return new Result(out, uniquePaths(escapePaths));
  }

  /**
   * Encode object/array as sibling wire lines (no outer document {@code >}).
   *
   * <p>When {@code parentKind} is {@code array}, array remounts omit the leading {@code -} so
   * elements land in the already-open array frame.
   */
  public static List<String> encodeAsSiblingLines(Object value) {
    return encodeAsSiblingLines(value, "object");
  }

  /** @param parentKind {@code "object"} or {@code "array"} */
  public static List<String> encodeAsSiblingLines(Object value, String parentKind) {
    if (value == null) return List.of();
    if (!(value instanceof Map || value instanceof List)) {
      throw new IllegalArgumentException("remount value must be a plain object or array");
    }
    String kind = parentKind == null ? "object" : parentKind;
    EncodeOptions opts = EncodeOptions.builder().dotPolicy(DotPolicy.NONE).build();
    String live = Encode.encode(value, opts);
    List<String> lines = splitWireLines(live);
    if (value instanceof List) {
      if ("array".equals(kind) && !lines.isEmpty() && "-".equals(lines.get(0))) {
        return new ArrayList<>(lines.subList(1, lines.size()));
      }
      return lines;
    }
    if ("array".equals(kind)) {
      // Object element under array: keep anonymous `>` opener from encode.
      return lines;
    }
    if (!lines.isEmpty() && ">".equals(lines.get(0))) {
      return new ArrayList<>(lines.subList(1, lines.size()));
    }
    return lines;
  }

  /**
   * Whether {@code path} is under any escape prefix (exact or descendant).
   */
  public static boolean pathEscapesTypeCheck(String path, Collection<String> escapePaths) {
    if (escapePaths == null) return false;
    for (String e : escapePaths) {
      if (e == null) continue;
      if (e.isEmpty()) return true; // escape everything
      if (path != null && path.equals(e)) return true;
      if (path != null && (path.startsWith(e + ".") || path.startsWith(e + "["))) return true;
    }
    return false;
  }

  // --- internals -------------------------------------------------------------

  private static Capture collectForwardSiblings(List<String> lines, int from, int baseDepth) {
    List<String> capture = new ArrayList<>();
    List<SimFrame> stack = new ArrayList<>();
    for (int d = 0; d < baseDepth; d++) {
      stack.add(new SimFrame("object", null));
    }

    int i = from;
    while (i < lines.size()) {
      String line = lines.get(i);
      if (".".equals(line)) break;

      int depthBefore = stack.size();
      if ("<".equals(line) || (line.startsWith("<") && line.length() > 1)) {
        if (depthBefore <= baseDepth) break;
      }

      if (line.startsWith("=") || line.startsWith("@") || line.startsWith("!")) {
        break;
      }

      capture.add(line);
      applySimLine(stack, line);
      i += 1;
    }

    return new Capture(capture, i);
  }

  private static Object materializeCapture(List<String> captureLines, String parentKind) {
    if (captureLines.isEmpty()) {
      return "array".equals(parentKind) ? new ArrayList<>() : new LinkedHashMap<String, Object>();
    }
    Parse.LiveXaiopParser live = new Parse.LiveXaiopParser(false);
    live.feedLine("array".equals(parentKind) ? "-" : ">");
    for (String line : captureLines) {
      live.feedLine(line);
    }
    Object snap = Materialize.materializeSnapshot(live.value());
    if (snap == null) {
      return "array".equals(parentKind) ? new ArrayList<>() : new LinkedHashMap<String, Object>();
    }
    if (!(snap instanceof Map || snap instanceof List)) {
      LinkedHashMap<String, Object> wrap = new LinkedHashMap<>();
      wrap.put("value", snap);
      return wrap;
    }
    return snap;
  }

  private static String stableJsonText(Object json) {
    try {
      return Json.stringify(json);
    } catch (RuntimeException e) {
      return "null";
    }
  }

  private static Object normalizeHandlerJson(Object result) {
    if (result instanceof String s) {
      String t = s.trim();
      if (t.isEmpty()) return new LinkedHashMap<String, Object>();
      return Json.parse(t);
    }
    if (result == null) return new LinkedHashMap<String, Object>();
    if (!(result instanceof Map || result instanceof List)) {
      throw new IllegalArgumentException(
          "annotation span handler must return JSON object/array, JSON text, null, or KEEP");
    }
    return result;
  }

  private static List<String> splitWireLines(String text) {
    String t = text.replace("\r\n", "\n").replace('\r', '\n');
    String[] parts = t.split("\n", -1);
    List<String> out = new ArrayList<>(parts.length);
    for (String p : parts) out.add(p);
    if (!out.isEmpty() && out.get(out.size() - 1).isEmpty()) {
      out.remove(out.size() - 1);
    }
    return out;
  }

  private static void applySimLine(List<SimFrame> stack, String line) {
    if (line.startsWith("#")) return;
    if (".".equals(line)) {
      stack.clear();
      return;
    }
    if ("<".equals(line)) {
      if (!stack.isEmpty()) stack.remove(stack.size() - 1);
      return;
    }
    if (line.startsWith("<") && line.length() > 1) {
      if (!stack.isEmpty()) stack.remove(stack.size() - 1);
      stack.add(new SimFrame("object", line.substring(1)));
      return;
    }
    if (line.startsWith("=") || line.startsWith("@") || line.startsWith("!")) {
      String path = line.substring(1);
      stack.clear();
      for (String s : path.split(">")) {
        if (!s.isEmpty()) stack.add(new SimFrame("object", s));
      }
      return;
    }
    if (line.startsWith("&")) return;

    if (">".equals(line)) {
      stack.add(new SimFrame("object", null));
      return;
    }
    if ("-".equals(line)) {
      stack.add(new SimFrame("array", null));
      return;
    }
    if (line.startsWith(">") && line.endsWith("-") && line.length() > 2) {
      stack.add(new SimFrame("array", line.substring(1, line.length() - 1)));
      return;
    }
    if (line.startsWith(">") && line.length() > 1) {
      String name = line.substring(1);
      if (name.contains(">")) {
        for (String p : name.split(">")) {
          if (!p.isEmpty()) stack.add(new SimFrame("object", p));
        }
        return;
      }
      stack.add(new SimFrame("object", name));
    }
    // Content: no depth change
  }

  private static String pathFromStack(List<SimFrame> stack) {
    List<Object> segs = new ArrayList<>();
    for (SimFrame fr : stack) {
      if (fr.key() != null && !fr.key().isEmpty()) segs.add(fr.key());
    }
    return segs.isEmpty() ? "" : Encode.formatJsonPath(segs);
  }

  @SuppressWarnings("unchecked")
  private static void addEscapeKeys(List<String> escapePaths, String parentPath, Object json) {
    if (json == null) return;
    if (!(json instanceof Map || json instanceof List)) {
      if (parentPath != null && !parentPath.isEmpty()) escapePaths.add(parentPath);
      return;
    }
    if (json instanceof List<?> list) {
      String base = parentPath == null ? "" : parentPath;
      for (int i = 0; i < list.size(); i++) {
        String p = base.isEmpty() ? "[" + i + "]" : base + "[" + i + "]";
        escapePaths.add(p);
      }
      if (parentPath == null || parentPath.isEmpty()) {
        escapePaths.add(""); // root array — escape all via prefix ""
      }
      return;
    }
    for (String key : ((Map<String, ?>) json).keySet()) {
      String p =
          parentPath == null || parentPath.isEmpty() ? key : parentPath + "." + key;
      escapePaths.add(p);
    }
  }

  private static List<String> uniquePaths(List<String> paths) {
    Set<String> seen = new LinkedHashSet<>();
    for (String p : paths) {
      if (p != null) seen.add(p);
    }
    return new ArrayList<>(seen);
  }
}
