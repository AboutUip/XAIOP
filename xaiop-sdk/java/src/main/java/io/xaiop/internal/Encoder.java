package io.xaiop.internal;

import io.xaiop.DotPolicy;
import io.xaiop.EncodeOptions;
import io.xaiop.Json;
import io.xaiop.XaiopEncodeError;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * JSON &rarr; XAIOP encoder engine (protocol v0.6.0 wire), faithful port of the Node.js SDK's
 * {@code encode.js}. Internal: use {@link io.xaiop.Encode} instead.
 *
 * <p>Emits strict wire only (no compatibility-mode shapes). {@code .} frequency comes from
 * {@code dotPolicy} / {@code phaseEvery} / {@code shouldPhase}, or from an explicit path array.
 */
public final class Encoder {
  /** Sentinel policy name for the path-array mode (mirrors the JS {@code "__paths__"}). */
  private static final String PATHS = "__paths__";

  private static final Pattern INT_TOKEN = Pattern.compile("^[+-]?\\d+$");
  private static final Pattern FLOAT_TOKEN =
      Pattern.compile("^[+-]?(?:\\d+\\.\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?$|^[+-]?\\d+[eE][+-]?\\d+$");
  private static final Pattern PLAIN_SEGMENT = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*$");
  private static final Pattern BAD_SEGMENT = Pattern.compile("[\\s:><=!]");
  private static final Pattern WHITESPACE = Pattern.compile("\\s");
  private static final Pattern CURSOR_CHAR = Pattern.compile("[><=!&]");

  /** Largest integer exactly representable by a IEEE-754 double (JS {@code MAX_SAFE_INTEGER}). */
  private static final long MAX_SAFE_INTEGER = 9007199254740991L;

  /** 17 significant decimal digits always round-trip through a binary64. */
  private static final int MAX_SIGNIFICANT_DIGITS = 17;

  private Encoder() {}

  public static String encode(Object value, EncodeOptions options) {
    Opt opt = normalize(options == null ? EncodeOptions.defaults() : options);
    if (value == null) {
      throw new XaiopEncodeError("cannot encode null as a document root");
    }

    if (opt.pathCuts != null) {
      return new PathCutEncoder(opt).run(value);
    }

    boolean arrayRoot = resolveArrayRoot(value, opt.root);
    List<String> lines = new ArrayList<>();

    if (arrayRoot) {
      if (!(value instanceof List)) {
        throw new XaiopEncodeError("root:'array' requires an array value");
      }
      lines.add("-");
      emitArrayElements(lines, (List<?>) value, opt, "$");
      return joinWire(lines, opt.finalDot);
    }

    if (!(value instanceof Map)) {
      throw new XaiopEncodeError(
          "object document root requires a plain object (or use an array root)", "$");
    }

    List<Entry> entries = orderedEntries((Map<?, ?>) value, opt.keyOrder);
    if (entries.isEmpty()) {
      lines.add(">");
      return joinWire(lines, opt.finalDot);
    }

    if (DotPolicy.NONE.equals(opt.dotPolicy) && opt.style == EncodeOptions.Style.RELATIVE) {
      lines.add(">");
      for (Entry e : entries) {
        emitObjectEntry(lines, e.key(), e.value(), opt, "$." + e.key());
      }
      return joinWire(lines, opt.finalDot);
    }

    List<List<Entry>> plan = planPhases(entries, opt);
    for (int p = 0; p < plan.size(); p++) {
      if (p > 0) lines.add(".");
      lines.add(">");
      for (Entry e : plan.get(p)) {
        emitObjectEntry(lines, e.key(), e.value(), opt, "$." + e.key());
      }
    }
    return joinWire(lines, opt.finalDot);
  }

  // --- options ---------------------------------------------------------------

  /** Normalized (validated) option snapshot; mirrors the JS {@code normalizeOptions} result. */
  private static final class Opt {
    EncodeOptions.Root root;
    EncodeOptions.Style style;
    String dotPolicy;
    long phaseEvery;
    Integer maxPhases;
    boolean finalDot;
    EncodeOptions.KeyOrder keyOrder;
    EncodeOptions.NullPolicy nullPolicy;
    EncodeOptions.UndefinedPolicy undefinedPolicy;
    Predicate<EncodeOptions.PhaseContext> shouldPhase;
    List<String> pathCuts;
    boolean symbolKeys;
  }

  private static Opt normalize(EncodeOptions options) {
    Opt opt = new Opt();
    opt.root = options.root();
    opt.style = options.style();
    opt.finalDot = options.finalDot();
    opt.keyOrder = options.keyOrder();
    opt.nullPolicy = options.nullPolicy();
    opt.undefinedPolicy = options.undefinedPolicy();

    if (options.dotPolicyPaths() != null) {
      return normalizePathCuts(options, opt);
    }

    String dotPolicy = options.dotPolicy();
    if (!DotPolicy.isKnown(dotPolicy)) {
      throw new XaiopEncodeError("unknown dotPolicy: " + dotPolicy);
    }
    opt.dotPolicy = dotPolicy;

    long phaseEvery = 1;
    if (options.phaseEvery() != null) {
      if (options.phaseEvery() < 1) {
        throw new XaiopEncodeError("phaseEvery must be a positive integer");
      }
      phaseEvery = options.phaseEvery();
    }
    if (DotPolicy.PER_TOP_LEVEL_KEY.equals(dotPolicy)) phaseEvery = 1;
    if (DotPolicy.NONE.equals(dotPolicy)) phaseEvery = MAX_SAFE_INTEGER;
    opt.phaseEvery = phaseEvery;

    if (options.maxPhases() != null && options.maxPhases() < 1) {
      throw new XaiopEncodeError("maxPhases must be a positive integer when set");
    }
    opt.maxPhases = options.maxPhases();

    if (DotPolicy.CUSTOM.equals(dotPolicy) && options.shouldPhase() == null) {
      throw new XaiopEncodeError("dotPolicy:'custom' requires shouldPhase(ctx)");
    }
    opt.shouldPhase = options.shouldPhase();
    opt.symbolKeys = options.symbolKeys();
    opt.pathCuts = null;
    return opt;
  }

  private static Opt normalizePathCuts(EncodeOptions options, Opt opt) {
    if (options.phaseEvery() != null) {
      throw new XaiopEncodeError("dotPolicy path array is mutually exclusive with phaseEvery");
    }
    if (options.maxPhases() != null) {
      throw new XaiopEncodeError("dotPolicy path array is mutually exclusive with maxPhases");
    }
    if (options.shouldPhase() != null) {
      throw new XaiopEncodeError("dotPolicy path array is mutually exclusive with shouldPhase");
    }
    if (options.style() != EncodeOptions.Style.RESET) {
      throw new XaiopEncodeError(
          "dotPolicy path array requires style:'reset' (phase `.` resets Cursor)");
    }

    List<String> normalized = new ArrayList<>();
    Set<String> seen = new LinkedHashSet<>();
    List<String> paths = options.dotPolicyPaths();
    for (int i = 0; i < paths.size(); i++) {
      String p = paths.get(i);
      if (p == null || p.isEmpty()) {
        throw new XaiopEncodeError(
            "dotPolicy path array entry " + i + " must be a non-empty string");
      }
      List<Object> segs = parseJsonPath(p);
      // An index may only be terminal (or followed by further indexes). Cutting inside an array
      // *element object* cannot round-trip: after `.`, `>name-` appends a new element.
      for (int s = 0; s < segs.size(); s++) {
        if (segs.get(s) instanceof Integer) {
          for (int t = s + 1; t < segs.size(); t++) {
            if (!(segs.get(t) instanceof Integer)) {
              throw new XaiopEncodeError(
                  "dotPolicy path cannot cut inside an array element object (index must be final): "
                      + Json.stringify(p),
                  p);
            }
          }
          break;
        }
      }
      String canon = formatJsonPath(segs);
      if (!seen.add(canon)) {
        throw new XaiopEncodeError("duplicate dotPolicy path: " + Json.stringify(p));
      }
      normalized.add(canon);
    }

    opt.style = EncodeOptions.Style.RESET;
    opt.dotPolicy = PATHS;
    opt.phaseEvery = MAX_SAFE_INTEGER;
    opt.maxPhases = null;
    opt.shouldPhase = null;
    opt.symbolKeys = options.symbolKeys();
    opt.pathCuts = normalized;
    return opt;
  }

  // --- path-array encoding ---------------------------------------------------

  /**
   * Cuts a phase exactly after each listed JSON path. After a `.` the Cursor is at Root, so the
   * encoder replays the ancestor {@code >key} enters before the next node.
   */
  private static final class PathCutEncoder {
    private final Opt opt;
    private final List<String> lines = new ArrayList<>();
    private final Set<String> cutSet;
    private List<Object> openStack = new ArrayList<>();
    private boolean afterDot;
    private boolean arrayRoot;

    PathCutEncoder(Opt opt) {
      this.opt = opt;
      this.cutSet = new LinkedHashSet<>(opt.pathCuts);
    }

    String run(Object value) {
      arrayRoot = resolveArrayRoot(value, opt.root);

      for (String p : opt.pathCuts) {
        assertPathExists(value, parseJsonPath(p), p);
      }

      if (arrayRoot) {
        if (!(value instanceof List)) {
          throw new XaiopEncodeError("root:'array' requires an array value");
        }
        emitArray((List<?>) value, List.of());
      } else {
        if (!(value instanceof Map)) {
          throw new XaiopEncodeError(
              "object document root requires a plain object (or use an array root)", "$");
        }
        List<Entry> entries = orderedEntries((Map<?, ?>) value, opt.keyOrder);
        if (entries.isEmpty()) {
          lines.add(">");
          return joinWire(lines, opt.finalDot);
        }
        for (Entry e : entries) {
          emitObject(e.key(), e.value(), List.of(e.key()));
        }
      }

      if (!cutSet.isEmpty()) {
        throw new XaiopEncodeError(
            "dotPolicy paths not reached during encode: " + String.join(", ", cutSet));
      }
      return joinWire(lines, opt.finalDot);
    }

    private void reopenTo(List<Object> targetAncestors, boolean arrayTail) {
      if (afterDot || lines.isEmpty()) {
        lines.add(arrayRoot ? "-" : ">");
        afterDot = false;
        openStack = new ArrayList<>();
      }

      int i = 0;
      while (i < openStack.size()
          && i < targetAncestors.size()
          && Objects.equals(openStack.get(i), targetAncestors.get(i))) {
        i++;
      }
      while (openStack.size() > i) {
        lines.add("<");
        openStack.remove(openStack.size() - 1);
      }

      for (int j = i; j < targetAncestors.size(); j++) {
        Object seg = targetAncestors.get(j);
        if (seg instanceof Integer) {
          // Index markers only track which element is being emitted; the element opener
          // (`>` / `-` / scalar) is written by the emit helpers.
          openStack.add(seg);
          continue;
        }
        Object next = j + 1 < targetAncestors.size() ? targetAncestors.get(j + 1) : null;
        boolean isArrayEnter =
            next instanceof Integer || (arrayTail && j == targetAncestors.size() - 1);
        lines.add(
            isArrayEnter
                ? ">" + LabelEscape.encodeWireLabel(String.valueOf(seg), opt.symbolKeys) + "-"
                : ">" + LabelEscape.encodeWireLabel(String.valueOf(seg), opt.symbolKeys));
        openStack.add(seg);
      }
    }

    private void maybeCut(List<Object> segs) {
      if (!cutSet.remove(formatJsonPath(segs))) return;
      lines.add(".");
      afterDot = true;
      openStack = new ArrayList<>();
    }

    private void emitObject(String key, Object val, List<Object> segs) {
      String path = formatJsonPath(segs);
      String wk = wireLabel(key, path, opt.symbolKeys);

      reopenTo(segs.subList(0, segs.size() - 1), false);

      if (val == null) {
        if (opt.nullPolicy == EncodeOptions.NullPolicy.ERROR) {
          throw new XaiopEncodeError("null value not allowed", path);
        }
        if (opt.nullPolicy == EncodeOptions.NullPolicy.OMIT) {
          return;
        }
        lines.add(formatContent(wk, null, path));
        maybeCut(segs);
        return;
      }

      if (val instanceof List<?> list) {
        lines.add(">" + wk + "-");
        openStack.add(key);
        emitArray(list, segs);
        if (!afterDot && !openStack.isEmpty() && Objects.equals(peek(), key)) {
          lines.add("<");
          pop();
        }
        maybeCut(segs);
        return;
      }

      if (val instanceof Map<?, ?> map) {
        lines.add(">" + wk);
        openStack.add(key);
        for (Entry e : orderedEntries(map, opt.keyOrder)) {
          emitObject(e.key(), e.value(), append(segs, e.key()));
        }
        if (!afterDot && !openStack.isEmpty() && Objects.equals(peek(), key)) {
          lines.add("<");
          pop();
        }
        maybeCut(segs);
        return;
      }

      lines.add(formatContent(wk, val, path));
      maybeCut(segs);
    }

    /** @param arrSegs path of the array itself ({@code []} for the document root array). */
    private void emitArray(List<?> arr, List<Object> arrSegs) {
      if (arrSegs.isEmpty()) {
        reopenTo(List.of(), false);
      }

      for (int i = 0; i < arr.size(); i++) {
        reopenTo(arrSegs, !arrSegs.isEmpty());
        emitElement(arr.get(i), append(arrSegs, i));
      }
    }

    /** Nested anonymous array under an array element (stack already on the parent index). */
    private void emitArrayNested(List<?> arr, List<Object> arrSegs) {
      for (int i = 0; i < arr.size(); i++) {
        emitElement(arr.get(i), append(arrSegs, i));
      }
    }

    private void emitElement(Object el, List<Object> elSegs) {
      String elPath = formatJsonPath(elSegs);
      Object index = elSegs.get(elSegs.size() - 1);
      openStack.add(index);

      if (el == null) {
        if (opt.nullPolicy == EncodeOptions.NullPolicy.ERROR) {
          throw new XaiopEncodeError("null array element not allowed", elPath);
        }
        lines.add(formatScalarElement(null, elPath));
        pop();
        maybeCut(elSegs);
        return;
      }

      if (el instanceof List<?> nested) {
        lines.add("-");
        emitArrayNested(nested, elSegs);
        if (!afterDot) lines.add("<");
        if (!afterDot && !openStack.isEmpty() && Objects.equals(peek(), index)) pop();
        maybeCut(elSegs);
        return;
      }

      if (el instanceof Map<?, ?> map) {
        lines.add(">");
        for (Entry e : orderedEntries(map, opt.keyOrder)) {
          emitObject(e.key(), e.value(), append(elSegs, e.key()));
        }
        if (!afterDot) lines.add("<");
        if (!afterDot && !openStack.isEmpty() && Objects.equals(peek(), index)) pop();
        maybeCut(elSegs);
        return;
      }

      lines.add(formatScalarElement(el, elPath));
      pop();
      maybeCut(elSegs);
    }

    private Object peek() {
      return openStack.get(openStack.size() - 1);
    }

    private void pop() {
      openStack.remove(openStack.size() - 1);
    }
  }

  private static void assertPathExists(Object root, List<Object> segs, String pathStr) {
    Object cur = root;
    for (Object seg : segs) {
      if (seg instanceof Integer idx) {
        if (!(cur instanceof List<?> list)) {
          throw new XaiopEncodeError(
              "dotPolicy path not found (not an array): " + Json.stringify(pathStr), pathStr);
        }
        if (idx < 0 || idx >= list.size()) {
          throw new XaiopEncodeError(
              "dotPolicy path not found: " + Json.stringify(pathStr), pathStr);
        }
        cur = list.get(idx);
      } else {
        if (!(cur instanceof Map<?, ?> map) || !map.containsKey(seg)) {
          throw new XaiopEncodeError(
              "dotPolicy path not found: " + Json.stringify(pathStr), pathStr);
        }
        cur = map.get(seg);
      }
    }
  }

  // --- JSON paths ------------------------------------------------------------

  /** Parses {@code a.b[0].c} into {@code ["a","b",0,"c"]} ({@link String} / {@link Integer}). */
  public static List<Object> parseJsonPath(String path) {
    if (path == null || path.isEmpty()) {
      throw new XaiopEncodeError("JSON path must be a non-empty string");
    }
    List<Object> segs = new ArrayList<>();
    int i = 0;
    while (i < path.length()) {
      char c = path.charAt(i);
      if (c == '.') {
        if (i == 0 || i == path.length() - 1) {
          throw new XaiopEncodeError("invalid JSON path: " + Json.stringify(path));
        }
        i++;
        if (path.charAt(i) == '.' || path.charAt(i) == '[') {
          throw new XaiopEncodeError("invalid JSON path: " + Json.stringify(path));
        }
        continue;
      }
      if (c == '[') {
        int end = path.indexOf(']', i);
        if (end < 0) {
          throw new XaiopEncodeError("invalid JSON path: " + Json.stringify(path));
        }
        String raw = path.substring(i + 1, end);
        if (!raw.chars().allMatch(Character::isDigit) || raw.isEmpty()) {
          throw new XaiopEncodeError("invalid array index in path: " + Json.stringify(path));
        }
        if (segs.isEmpty()) {
          throw new XaiopEncodeError(
              "JSON path cannot start with an index: " + Json.stringify(path));
        }
        segs.add(Integer.valueOf(raw));
        i = end + 1;
        continue;
      }
      int j = i;
      while (j < path.length() && path.charAt(j) != '.' && path.charAt(j) != '[') j++;
      if (j == i) {
        throw new XaiopEncodeError("invalid JSON path: " + Json.stringify(path));
      }
      String name = path.substring(i, j);
      if (!PLAIN_SEGMENT.matcher(name).matches()
          && (BAD_SEGMENT.matcher(name).find() || name.endsWith("-"))) {
        throw new XaiopEncodeError("invalid path segment: " + Json.stringify(name));
      }
      segs.add(name);
      i = j;
    }
    if (segs.isEmpty()) {
      throw new XaiopEncodeError("invalid JSON path: " + Json.stringify(path));
    }
    return segs;
  }

  /** Inverse of {@link #parseJsonPath(String)}. */
  public static String formatJsonPath(List<Object> segs) {
    StringBuilder out = new StringBuilder();
    for (int i = 0; i < segs.size(); i++) {
      Object s = segs.get(i);
      if (s instanceof Integer) {
        out.append('[').append(s).append(']');
      } else {
        if (i > 0) out.append('.');
        out.append(s);
      }
    }
    return out.toString();
  }

  // --- phase planning --------------------------------------------------------

  private static List<List<Entry>> planPhases(List<Entry> entries, Opt opt) {
    List<List<Entry>> phases = new ArrayList<>();
    if (entries.isEmpty()) return phases;

    if (DotPolicy.NONE.equals(opt.dotPolicy)) {
      phases.add(new ArrayList<>(entries));
      return phases;
    }

    if (DotPolicy.CUSTOM.equals(opt.dotPolicy)) {
      List<Entry> cur = new ArrayList<>();
      for (int i = 0; i < entries.size(); i++) {
        cur.add(entries.get(i));
        boolean isLast = i == entries.size() - 1;
        EncodeOptions.PhaseContext ctx =
            new EncodeOptions.PhaseContext(
                entries.get(i).key(), i, entries.size(), cur.size(), phases.size());
        if (!isLast && opt.shouldPhase.test(ctx)) {
          phases.add(cur);
          cur = new ArrayList<>();
        }
      }
      if (!cur.isEmpty()) phases.add(cur);
      return applyMaxPhases(phases, opt.maxPhases);
    }

    long every = opt.phaseEvery;
    if (opt.maxPhases != null) {
      long need = ceilDiv(entries.size(), every);
      if (need > opt.maxPhases) {
        every = ceilDiv(entries.size(), opt.maxPhases);
      }
    }
    int step = (int) Math.min(every, Math.max(entries.size(), 1));
    for (int i = 0; i < entries.size(); i += step) {
      phases.add(new ArrayList<>(entries.subList(i, Math.min(i + step, entries.size()))));
    }
    return phases;
  }

  private static List<List<Entry>> applyMaxPhases(List<List<Entry>> phases, Integer maxPhases) {
    if (maxPhases == null || phases.size() <= maxPhases) return phases;
    List<List<Entry>> out = new ArrayList<>(phases.subList(0, maxPhases - 1));
    List<Entry> tail = new ArrayList<>();
    for (List<Entry> phase : phases.subList(maxPhases - 1, phases.size())) {
      tail.addAll(phase);
    }
    out.add(tail);
    return out;
  }

  private static long ceilDiv(long a, long b) {
    return (a + b - 1) / b;
  }

  // --- emission --------------------------------------------------------------

  private static void emitObjectEntry(
      List<String> lines, String key, Object value, Opt opt, String path) {
    String wk = wireLabel(key, path, opt.symbolKeys);

    if (value == null) {
      if (opt.nullPolicy == EncodeOptions.NullPolicy.ERROR) {
        throw new XaiopEncodeError("null value not allowed", path);
      }
      if (opt.nullPolicy == EncodeOptions.NullPolicy.OMIT) {
        return;
      }
      lines.add(formatContent(wk, null, path));
      return;
    }

    if (value instanceof List<?> list) {
      lines.add(">" + wk + "-");
      emitArrayElements(lines, list, opt, path);
      lines.add("<");
      return;
    }

    if (value instanceof Map<?, ?> map) {
      lines.add(">" + wk);
      for (Entry e : orderedEntries(map, opt.keyOrder)) {
        emitObjectEntry(lines, e.key(), e.value(), opt, path + "." + e.key());
      }
      lines.add("<");
      return;
    }

    lines.add(formatContent(wk, value, path));
  }

  private static void emitArrayElements(List<String> lines, List<?> arr, Opt opt, String path) {
    for (int i = 0; i < arr.size(); i++) {
      Object el = arr.get(i);
      String elPath = path + "[" + i + "]";

      if (el == null) {
        if (opt.nullPolicy == EncodeOptions.NullPolicy.ERROR) {
          throw new XaiopEncodeError("null array element not allowed", elPath);
        }
        // Omitting would change length/indices — still emit a typed null.
        lines.add(formatScalarElement(null, elPath));
        continue;
      }

      if (el instanceof List<?> nested) {
        lines.add("-");
        emitArrayElements(lines, nested, opt, elPath);
        lines.add("<");
        continue;
      }

      if (el instanceof Map<?, ?> map) {
        lines.add(">");
        for (Entry e : orderedEntries(map, opt.keyOrder)) {
          emitObjectEntry(lines, e.key(), e.value(), opt, elPath + "." + e.key());
        }
        lines.add("<");
        continue;
      }

      lines.add(formatScalarElement(el, elPath));
    }
  }

  private static String formatScalarElement(Object value, String path) {
    if (value == null) return ":null";
    if (value instanceof Boolean b) return ":" + b;
    if (value instanceof Number n) return ":" + formatNumberToken(n, path);
    if (value instanceof CharSequence cs) {
      String s = cs.toString();
      assertEncodableString(s, path);
      return needsForcedString(s) ? ": " + s : ":" + s;
    }
    throw new XaiopEncodeError("unsupported array element type: " + typeName(value), path);
  }

  private static String formatContent(String key, Object value, String path) {
    if (value == null) return key + ":null";
    if (value instanceof Boolean b) return key + ":" + b;
    if (value instanceof Number n) return key + ":" + formatNumberToken(n, path);
    if (value instanceof CharSequence cs) {
      String s = cs.toString();
      assertEncodableString(s, path);
      return needsForcedString(s) ? key + ": " + s : key + ":" + s;
    }
    throw new XaiopEncodeError("unsupported value type: " + typeName(value), path);
  }

  private static String formatNumberToken(Number n, String path) {
    if (n instanceof Integer || n instanceof Long || n instanceof Short || n instanceof Byte
        || n instanceof BigInteger) {
      return n.toString();
    }

    if (n instanceof Double || n instanceof Float) {
      // Floats round-trip through their own shortest form so 0.1f does not widen to 0.100000001.
      double d = n instanceof Float f ? Double.parseDouble(Float.toString(f)) : n.doubleValue();
      if (!Double.isFinite(d)) {
        throw new XaiopEncodeError(
            "non-finite numbers are not encodable as float tokens (" + n + ")", path);
      }
      if (d == Math.rint(d) && Math.abs(d) <= MAX_SAFE_INTEGER) {
        return Long.toString((long) d);
      }
      return jsNumberToken(d);
    }

    String s = n instanceof BigDecimal bd ? bd.toPlainString() : n.toString();
    if (INT_TOKEN.matcher(s).matches() || FLOAT_TOKEN.matcher(s).matches()) {
      return s;
    }
    throw new XaiopEncodeError("cannot format number: " + s, path);
  }

  /**
   * Renders a finite double exactly as ECMAScript's {@code Number::toString} does, so float
   * tokens stay byte-identical across SDKs: the shortest decimal that round-trips, written plain
   * while the decimal exponent is in {@code (-7, 21]} and exponential (lowercase, signed) outside.
   *
   * <p>{@link Double#toString} cannot stand in for this. Before JDK 19 it may emit more digits
   * than necessary, and it still renders the smallest subnormals as {@code 4.9E-324} where
   * ECMAScript produces {@code 5e-324}. It is only used here as an upper bound on the digit
   * count, which it always is.
   */
  private static String jsNumberToken(double value) {
    double d = Math.abs(value);
    String sign = value < 0 ? "-" : "";

    BigDecimal exact = new BigDecimal(d);
    BigDecimal shortest = null;
    for (int k = significantDigits(Double.toString(d)); k >= 1; k--) {
      BigDecimal candidate = exact.round(new MathContext(k, RoundingMode.HALF_EVEN));
      if (candidate.doubleValue() != d) break;
      shortest = candidate;
    }
    if (shortest == null) {
      shortest = exact.round(new MathContext(MAX_SIGNIFICANT_DIGITS, RoundingMode.HALF_EVEN));
    }

    BigDecimal trimmed = shortest.stripTrailingZeros();
    String digits = trimmed.unscaledValue().toString();
    int k = digits.length();
    // The ECMAScript spec's `n`: value = 0.<digits> x 10^n.
    int n = k - trimmed.scale();

    if (k <= n && n <= 21) return sign + digits + "0".repeat(n - k);
    if (n > 0 && n <= 21) return sign + digits.substring(0, n) + "." + digits.substring(n);
    if (n > -6 && n <= 0) return sign + "0." + "0".repeat(-n) + digits;

    String mantissa = k == 1 ? digits : digits.charAt(0) + "." + digits.substring(1);
    int exponent = n - 1;
    return sign + mantissa + "e" + (exponent >= 0 ? "+" : "-") + Math.abs(exponent);
  }

  /** Digit count of {@code repr}'s mantissa, ignoring leading zeros; an upper bound on `k`. */
  private static int significantDigits(String repr) {
    int e = repr.indexOf('E');
    String mantissa = e < 0 ? repr : repr.substring(0, e);
    int digits = 0;
    boolean started = false;
    for (int i = 0; i < mantissa.length(); i++) {
      char c = mantissa.charAt(i);
      if (c < '0' || c > '9') continue;
      if (c != '0') started = true;
      if (started) digits++;
    }
    return Math.min(Math.max(digits, 1), MAX_SIGNIFICANT_DIGITS);
  }

  /** A scalar string that would otherwise parse back as a bool / null / number. */
  private static boolean needsForcedString(String s) {
    if (s.equals("true") || s.equals("false") || s.equals("null")) return true;
    return INT_TOKEN.matcher(s).matches() || FLOAT_TOKEN.matcher(s).matches();
  }

  private static void assertKey(String key, String path, boolean symbolKeys) {
    if (key == null || key.isEmpty()) {
      throw new XaiopEncodeError("object keys must be non-empty strings", path);
    }
    if (WHITESPACE.matcher(key).find() || key.indexOf(':') >= 0) {
      throw new XaiopEncodeError("invalid label name: " + Json.stringify(key), path);
    }
    if (key.endsWith("-")) {
      throw new XaiopEncodeError(
          "invalid label name (trailing \"-\" reserved for arrays): " + Json.stringify(key), path);
    }
    if (LabelEscape.keyNeedsSymbolEscape(key) && !symbolKeys) {
      throw new XaiopEncodeError(
          "invalid label name (must not begin with line-operator or U+001F; enable symbolKeys to escape): "
              + Json.stringify(key),
          path);
    }
    String body =
        LabelEscape.keyNeedsSymbolEscape(key) && symbolKeys ? key.substring(1) : key;
    if (CURSOR_CHAR.matcher(body).find()) {
      throw new XaiopEncodeError(
          "invalid label name (contains Cursor/operator character): " + Json.stringify(key), path);
    }
  }

  private static String wireLabel(String key, String path, boolean symbolKeys) {
    assertKey(key, path, symbolKeys);
    return LabelEscape.encodeWireLabel(key, symbolKeys);
  }

  private static void assertEncodableString(String s, String path) {
    if (s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
      throw new XaiopEncodeError("string values must not contain CR/LF", path);
    }
    // PROT-CONTENT forced-string: spaces after ':' are markers, not payload.
    // Emitting key: + value that begins with U+0020 would silently drop those
    // spaces on parse — refuse instead of corrupting data.
    if (!s.isEmpty() && s.charAt(0) == ' ') {
      throw new XaiopEncodeError(
          "string values must not begin with U+0020 SPACE (wire forced-string marker would strip leading spaces)",
          path);
    }
  }

  private static String typeName(Object v) {
    if (v == null) return "null";
    if (v instanceof List) return "array";
    return v.getClass().getSimpleName();
  }

  private static boolean resolveArrayRoot(Object value, EncodeOptions.Root root) {
    if (root == EncodeOptions.Root.OBJECT) return false;
    if (root == EncodeOptions.Root.ARRAY) return true;
    return value instanceof List;
  }

  private static String joinWire(List<String> lines, boolean finalDot) {
    List<String> cleaned = collapseRedundantLeavesBeforePhase(lines);
    if (finalDot) cleaned.add(".");
    return String.join("\n", cleaned) + "\n";
  }

  /** A `<` immediately before `.` (or EOF) is a no-op: the phase reset already leaves. */
  private static List<String> collapseRedundantLeavesBeforePhase(List<String> lines) {
    List<String> out = new ArrayList<>(lines.size());
    for (int i = 0; i < lines.size(); i++) {
      String line = lines.get(i);
      String next = i + 1 < lines.size() ? lines.get(i + 1) : null;
      if (line.equals("<") && (next == null || next.equals("."))) {
        continue;
      }
      out.add(line);
    }
    return out;
  }

  // --- key ordering ----------------------------------------------------------

  /** One object entry with its key coerced to the wire's label type. */
  private record Entry(String key, Object value) {}

  private static List<Entry> orderedEntries(Map<?, ?> map, EncodeOptions.KeyOrder keyOrder) {
    List<Entry> entries = new ArrayList<>(map.size());
    for (Map.Entry<?, ?> e : map.entrySet()) {
      entries.add(new Entry(e.getKey() == null ? null : String.valueOf(e.getKey()), e.getValue()));
    }
    if (keyOrder == EncodeOptions.KeyOrder.SORTED) {
      entries.sort((a, b) -> {
        if (a.key() == null || b.key() == null) return 0;
        return a.key().compareTo(b.key());
      });
    }
    return entries;
  }

  private static List<Object> append(List<Object> segs, Object seg) {
    List<Object> out = new ArrayList<>(segs.size() + 1);
    out.addAll(segs);
    out.add(seg);
    return out;
  }
}
