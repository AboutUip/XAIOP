package io.xaiop.internal;

import io.xaiop.Json;
import io.xaiop.XaiopFragment;
import io.xaiop.XaiopSyntaxError;
import io.xaiop.compat.CompatFixId;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Deterministic XAIOP parser (protocol v0.6.0 Frozen).
 * Silent repair exists only under an explicit compatibility policy.
 *
 * <p>Faithful port of the internal {@code class Parser} from the Node.js SDK's
 * {@code parse.ts}, including broadcast (multi-cursor) mode, exact/fuzzy path location,
 * {@code &} delete, {@code #} annotation ignore, compat line rewriting and pop-and-retry
 * recovery. Objects are {@link LinkedHashMap} (insertion order preserved); arrays are
 * {@link ArrayList}.
 */
public final class Parser {

  /** Kind of a container a cursor Frame points at. */
  public enum NodeKind {
    OBJECT,
    ARRAY,
    FRAGMENT
  }

  private enum DocKind {
    NONE,
    OBJECT,
    ARRAY,
    FRAGMENT
  }

  private enum Phase {
    INIT,
    ACTIVE
  }

  /**
   * One Cursor stack frame: a container kind plus the live container reference.
   * {@code viaKey} is the named key used to enter this frame ({@code null} for anonymous /
   * root / array-element frames). Used by {@link #cursorRestoreLines()}.
   */
  static final class Frame {
    final NodeKind kind;
    final Object value;
    final String viaKey;

    Frame(NodeKind kind, Object value) {
      this(kind, value, null);
    }

    Frame(NodeKind kind, Object value, String viaKey) {
      this.kind = kind;
      this.value = value;
      this.viaKey = viaKey;
    }
  }

  private final List<String> lines;
  private int lineNo;
  /** Lines accepted via feedLine (live mode). */
  private int fed;
  /** Whether forcedRoot injection has been decided. */
  private boolean compatRootReady;
  /** {@code null} means JS {@code undefined} (doc not yet created); otherwise a Map or List. */
  private Object root;
  private Map<String, Object> fragmentEntries;
  private DocKind docKind = DocKind.NONE;
  private List<Frame> stack = new ArrayList<>();
  /**
   * When set, write/pop ops fan out to every cursor stack (broadcast mode after {@code !}).
   * Cleared by {@code .}.
   */
  private List<List<Frame>> broadcastStacks;
  private Phase phase = Phase.INIT;
  /** Fine-grained compatibility policy, or {@code null} for strict (protocol-faithful) parse. */
  private final Map<CompatFixId, Boolean> compat;
  /** Decode U+001F label escapes (pair with encode {@code symbolKeys}). */
  private final boolean symbolKeys;

  public Parser(String source, Map<CompatFixId, Boolean> compat) {
    this(source, compat, false);
  }

  public Parser(String source, Map<CompatFixId, Boolean> compat, boolean symbolKeys) {
    if (source == null) {
      throw new NullPointerException("XAIOP source must be a string");
    }
    this.lines = splitLines(source);
    this.compat = compat;
    this.symbolKeys = symbolKeys;
  }

  public static Parser createLive(Map<CompatFixId, Boolean> compat) {
    return createLive(compat, false);
  }

  public static Parser createLive(Map<CompatFixId, Boolean> compat, boolean symbolKeys) {
    return new Parser("", compat, symbolKeys);
  }

  private String logicalName(String wireName) {
    return LabelEscape.decodeWireLabel(wireName, symbolKeys);
  }

  public void feedLine(String line) {
    if (line == null) {
      throw new NullPointerException("XAIOP live feedLine requires a string");
    }
    fed += 1;
    lineNo = fed;
    String logical = fed == 1 ? stripBom(line) : line;
    if (fixEnabled(CompatFixId.forcedRoot) && !compatRootReady) {
      compatRootReady = true;
      injectCompatRootIfNeeded(logical);
    }
    if (logical.isEmpty()) {
      throw new XaiopSyntaxError("empty line is a Content syntax error", lineNo);
    }
    handleLineCompat(logical);
  }

  /** Compatibility forcedRoot for live feeds (mirrors {@link #ensureCompatRootOpener()}). */
  private void injectCompatRootIfNeeded(String firstLine) {
    String first = rewriteCompatLine(firstLine);
    if (first.equals(">") || first.equals("-")) {
      return;
    }
    LinkedHashMap<String, Object> obj = new LinkedHashMap<>();
    root = obj;
    docKind = DocKind.OBJECT;
    fragmentEntries = null;
    stack = new ArrayList<>();
    stack.add(new Frame(NodeKind.OBJECT, obj));
    phase = Phase.ACTIVE;
  }

  public Object result() {
    if (docKind == DocKind.FRAGMENT) {
      return new XaiopFragment(fragmentEntries != null ? fragmentEntries : new LinkedHashMap<>());
    }
    if (root == null) {
      return new LinkedHashMap<String, Object>();
    }
    return root;
  }

  public boolean isCompatibilityMode() {
    return compat != null;
  }

  public boolean fixEnabled(CompatFixId id) {
    return compat != null && Boolean.TRUE.equals(compat.get(id));
  }

  public Object parse() {
    if (fixEnabled(CompatFixId.forcedRoot)) {
      ensureCompatRootOpener();
      compatRootReady = true;
    }
    for (int i = 0; i < lines.size(); i++) {
      lineNo = i + 1;
      // BOM only appears on the first physical line of a stream/document.
      String line = i == 0 ? stripBom(lines.get(i)) : lines.get(i);
      if (line.isEmpty()) {
        throw new XaiopSyntaxError("empty line is a Content syntax error", lineNo);
      }
      handleLineCompat(line);
    }
    return result();
  }

  /**
   * Compatibility only: outer document must be a complete anonymous object or array.
   * First line {@code >} or {@code -} &rarr; leave as declared. Otherwise inject an empty
   * object root (same effect as a missing leading {@code >}), so {@code >name} / Content
   * do not enter fragment mode.
   */
  private void ensureCompatRootOpener() {
    if (lines.isEmpty()) {
      return;
    }
    String first = rewriteCompatLine(stripBom(lines.get(0)));
    if (first.equals(">") || first.equals("-")) {
      return;
    }
    LinkedHashMap<String, Object> obj = new LinkedHashMap<>();
    root = obj;
    docKind = DocKind.OBJECT;
    fragmentEntries = null;
    stack = new ArrayList<>();
    stack.add(new Frame(NodeKind.OBJECT, obj));
    phase = Phase.ACTIVE;
  }

  private static final Pattern BARE_NAME_ARRAY_RE = Pattern.compile("^[A-Za-z_][A-Za-z0-9_]*-$");
  private static final Pattern TRAILING_WS_RE = Pattern.compile("\\s+$");

  /**
   * Compatibility-only deterministic line rewrites for common LLM slips.
   * Honours {@code rewriteBareNameArray} and {@code rewriteEnterLine} independently.
   */
  private String rewriteCompatLine(String line) {
    boolean bareArray = fixEnabled(CompatFixId.rewriteBareNameArray);
    boolean enterLine = fixEnabled(CompatFixId.rewriteEnterLine);
    if (!bareArray && !enterLine) {
      return line;
    }

    // Trailing spaces (model padding); does not touch "key: value" forced-string rule.
    String s = enterLine ? TRAILING_WS_RE.matcher(line).replaceAll("") : line;
    if (s.isEmpty()) return line;

    // bare `aliases-` / `tags-` (missing `>`) -> `>aliases-`
    if (bareArray && BARE_NAME_ARRAY_RE.matcher(s).matches()) {
      return ">" + s;
    }

    if (enterLine && s.startsWith(">") && s.length() > 1) {
      String rest = s.substring(1);
      String trimmedRest = rest.trim();
      // `>  ` / `>   ` -> bare `>`
      if (trimmedRest.isEmpty()) {
        return ">";
      }
      // `>  characters-` -> `>characters-`
      if (BARE_NAME_ARRAY_RE.matcher(trimmedRest).matches()) {
        return ">" + trimmedRest;
      }
      // `>shard_index:1` / `> id:x` -- Label names cannot contain `:`; unique intent is Content
      if (trimmedRest.contains(":")) {
        return trimmedRest;
      }
      // `>  meta` -> `>meta`
      if (!trimmedRest.equals(rest)) {
        return ">" + trimmedRest;
      }
    }

    return s;
  }

  /** Strict handle, or compatibility path with optional rewrite / ignore / pop-and-retry. */
  private void handleLineCompat(String line) {
    if (compat == null) {
      handleLine(line);
      return;
    }

    String effective = rewriteCompatLine(line);
    if (effective.isEmpty()) {
      throw new XaiopSyntaxError("empty line is a Content syntax error", lineNo);
    }

    // Root 上多余的裸 `<`（典型：`.` 后再写 `<`）无合法语义 -> 忽略
    if (fixEnabled(CompatFixId.ignoreBareLeaveAtRoot)
        && effective.equals("<")
        && isAtDocumentRoot()) {
      return;
    }

    try {
      handleLine(effective);
    } catch (XaiopSyntaxError err) {
      if (!fixEnabled(CompatFixId.popAndRetry)) throw err;
      recoverByPopping(effective, err);
    }
  }

  /** Cursor is on the document root frame (or empty); bare {@code <} is illegal here. */
  private boolean isAtDocumentRoot() {
    return stack.size() <= 1;
  }

  /**
   * Pop one level at a time and re-apply {@code line} until:
   * <ul>
   *   <li>it succeeds, or
   *   <li>the error message changes (stop; throw the new error), or
   *   <li>Cursor cannot pop further (throw the original error).
   * </ul>
   */
  private void recoverByPopping(String line, XaiopSyntaxError originalErr) {
    String originalKey = syntaxErrorKey(originalErr);
    while (stack.size() > 1) {
      try {
        popOnly();
      } catch (XaiopSyntaxError e) {
        throw originalErr;
      }
      try {
        handleLine(line);
        return;
      } catch (XaiopSyntaxError err2) {
        if (!syntaxErrorKey(err2).equals(originalKey)) {
          throw err2;
        }
      }
    }
    throw originalErr;
  }

  private void handleLine(String line) {
    // Protocol 0.6.0+: standalone custom-annotation line — no Cursor / tree effect.
    if (line.startsWith("#")) {
      return;
    }

    if (line.equals(".")) {
      resetToRoot();
      return;
    }

    if (line.equals("<")) {
      precheckBroadcastPop();
      runOnCursors(this::popOnly);
      return;
    }

    if (line.startsWith("<") && line.length() > 1) {
      String name = logicalName(line.substring(1));
      assertName(name, lineNo, symbolKeys);
      precheckBroadcastPop();
      runOnCursors(
          () -> {
            popOnly();
            createEnterNamedObject(name);
          });
      return;
    }

    if (line.startsWith("=")) {
      requireNotBroadcast("=");
      locatePath(line.substring(1));
      return;
    }

    if (line.startsWith("@")) {
      exactEnter(line.substring(1));
      return;
    }

    if (line.startsWith("!")) {
      requireNotBroadcast("!");
      broadcastEnter(line.substring(1));
      return;
    }

    if (line.startsWith("&")) {
      deleteAtPath(line.substring(1));
      return;
    }

    if (line.equals(">")) {
      runOnCursors(this::createEnterAnonymousObject);
      return;
    }

    if (line.equals("-")) {
      runOnCursors(this::createEnterAnonymousArray);
      return;
    }

    if (line.startsWith(">") && line.endsWith("-") && line.length() > 2) {
      String name = logicalName(line.substring(1, line.length() - 1));
      assertName(name, lineNo, symbolKeys);
      runOnCursors(() -> createEnterNamedArray(name));
      return;
    }

    if (line.startsWith(">") && line.length() > 1) {
      if (line.contains(">>")) {
        throw new XaiopSyntaxError("same-symbol stacking >> is forbidden", lineNo);
      }
      String name = line.substring(1);
      // In-line >a>b composition: allow split
      if (name.indexOf('>') >= 0) {
        List<String> parts = splitKeepEmpty(name);
        for (String p : parts) assertName(logicalName(p), lineNo, symbolKeys);
        runOnCursors(
            () -> {
              for (String p : parts) createEnterNamedObject(logicalName(p));
            });
        return;
      }
      String logical = logicalName(name);
      assertName(logical, lineNo, symbolKeys);
      runOnCursors(() -> createEnterNamedObject(logical));
      return;
    }

    // Content: must contain :
    int colon = line.indexOf(':');
    if (colon == -1) {
      throw new XaiopSyntaxError(
          "Bare Label or unknown line form: " + Json.stringify(line), lineNo);
    }
    String key = logicalName(line.substring(0, colon));
    String rawValue = line.substring(colon + 1);
    Object value = parseValue(rawValue);
    runOnCursors(() -> writeContent(key, value));
  }

  private void requireNotBroadcast(String op) {
    if (broadcastStacks != null) {
      throw new XaiopSyntaxError(
          op + " while broadcast mode is active (emit . to reset first)", lineNo);
    }
  }

  /** Fail before any pop if any broadcast cursor cannot leave. */
  private void precheckBroadcastPop() {
    if (broadcastStacks == null) return;
    for (List<Frame> st : broadcastStacks) {
      if (st.size() <= 1) {
        throw new XaiopSyntaxError("< at Root is illegal", lineNo);
      }
    }
  }

  private interface Op {
    void run();
  }

  /**
   * Run a mutating op on the single Cursor, or fan out to every broadcast Cursor.
   * On any failure, the error propagates (all-or-nothing intent; earlier cursors may
   * already have mutated shared tree nodes).
   */
  private void runOnCursors(Op fn) {
    if (broadcastStacks == null) {
      fn.run();
      return;
    }
    List<List<Frame>> stacks = broadcastStacks;
    for (int i = 0; i < stacks.size(); i++) {
      stack = new ArrayList<>(stacks.get(i));
      fn.run();
      stacks.set(i, stack);
    }
    stack = new ArrayList<>(stacks.get(0));
  }

  private void ensureDocumentObjectRoot() {
    if (phase == Phase.INIT || docKind == DocKind.NONE) {
      LinkedHashMap<String, Object> obj = new LinkedHashMap<>();
      root = obj;
      docKind = DocKind.OBJECT;
      fragmentEntries = null;
      stack = new ArrayList<>();
      stack.add(new Frame(NodeKind.OBJECT, obj));
      phase = Phase.ACTIVE;
    }
  }

  /** Enter fragment mode: bindings at Root without anonymous outer object. */
  private void ensureFragmentRoot() {
    if (docKind == DocKind.OBJECT || docKind == DocKind.ARRAY) {
      return;
    }
    if (docKind != DocKind.FRAGMENT) {
      docKind = DocKind.FRAGMENT;
      fragmentEntries = new LinkedHashMap<>();
      root = null;
      stack = new ArrayList<>();
      stack.add(new Frame(NodeKind.FRAGMENT, fragmentEntries));
      phase = Phase.ACTIVE;
    }
  }

  private void resetToRoot() {
    broadcastStacks = null;
    if (docKind == DocKind.NONE) {
      stack = new ArrayList<>();
      phase = Phase.INIT;
      return;
    }
    if (docKind == DocKind.FRAGMENT) {
      stack = new ArrayList<>();
      stack.add(new Frame(NodeKind.FRAGMENT, fragmentEntries));
      phase = Phase.ACTIVE;
      return;
    }
    stack = new ArrayList<>();
    stack.add(new Frame(docKind == DocKind.ARRAY ? NodeKind.ARRAY : NodeKind.OBJECT, root));
    phase = Phase.ACTIVE;
  }

  private Frame current() {
    if (stack.isEmpty()) {
      throw new XaiopSyntaxError("Cursor is at Root with no container", lineNo);
    }
    return stack.get(stack.size() - 1);
  }

  private void popOnly() {
    if (stack.size() <= 1) {
      throw new XaiopSyntaxError("< at Root is illegal", lineNo);
    }
    stack.remove(stack.size() - 1);
  }

  @SuppressWarnings("unchecked")
  private void createEnterAnonymousObject() {
    if (phase == Phase.INIT || docKind == DocKind.NONE) {
      LinkedHashMap<String, Object> obj = new LinkedHashMap<>();
      root = obj;
      docKind = DocKind.OBJECT;
      fragmentEntries = null;
      stack = new ArrayList<>();
      stack.add(new Frame(NodeKind.OBJECT, obj));
      phase = Phase.ACTIVE;
      return;
    }
    if (docKind == DocKind.FRAGMENT) {
      throw new XaiopSyntaxError(
          "bare > after fragment bindings: declare anonymous root first with a leading >, or"
              + " stay in fragment with >name",
          lineNo);
    }
    Frame cur = current();
    if (cur.kind == NodeKind.ARRAY) {
      LinkedHashMap<String, Object> obj = new LinkedHashMap<>();
      ((List<Object>) cur.value).add(obj);
      stack.add(new Frame(NodeKind.OBJECT, obj));
      return;
    }
    if (cur.kind == NodeKind.OBJECT) {
      // Already on an object: create-or-update -- re-enter current (modify), do not nest.
      return;
    }
    throw new XaiopSyntaxError(
        "bare > creates an array element or root object; unexpected Cursor kind", lineNo);
  }

  @SuppressWarnings("unchecked")
  private void createEnterAnonymousArray() {
    if (phase == Phase.INIT || docKind == DocKind.NONE) {
      ArrayList<Object> arr = new ArrayList<>();
      root = arr;
      docKind = DocKind.ARRAY;
      fragmentEntries = null;
      stack = new ArrayList<>();
      stack.add(new Frame(NodeKind.ARRAY, arr));
      phase = Phase.ACTIVE;
      return;
    }
    if (docKind == DocKind.FRAGMENT) {
      throw new XaiopSyntaxError(
          "bare - cannot open root array after fragment mode began; start the Stream with -",
          lineNo);
    }
    Frame cur = current();
    ArrayList<Object> arr = new ArrayList<>();
    if (cur.kind == NodeKind.ARRAY) {
      ((List<Object>) cur.value).add(arr);
      stack.add(new Frame(NodeKind.ARRAY, arr));
      return;
    }
    throw new XaiopSyntaxError(
        "bare - opens a nested array element or root array; for a named array use >name-",
        lineNo);
  }

  @SuppressWarnings("unchecked")
  private void createEnterNamedObject(String name) {
    if (phase == Phase.INIT || docKind == DocKind.NONE) {
      ensureFragmentRoot();
    } else if (docKind == DocKind.FRAGMENT && stack.isEmpty()) {
      ensureFragmentRoot();
    }
    Frame cur = current();
    if (cur.kind == NodeKind.ARRAY) {
      throw new XaiopSyntaxError(
          ">name while Cursor is inside an array (use < to leave array first): >" + name,
          lineNo);
    }
    Map<String, Object> obj = (Map<String, Object>) cur.value;
    Object existing = obj.get(name);
    if (existing instanceof Map<?, ?> existingMap) {
      stack.add(new Frame(NodeKind.OBJECT, existingMap, name));
      return;
    }
    LinkedHashMap<String, Object> next = new LinkedHashMap<>();
    obj.put(name, next);
    stack.add(new Frame(NodeKind.OBJECT, next, name));
  }

  @SuppressWarnings("unchecked")
  private void createEnterNamedArray(String name) {
    if (phase == Phase.INIT || docKind == DocKind.NONE) {
      ensureFragmentRoot();
    }
    Frame cur = current();
    if (cur.kind == NodeKind.ARRAY) {
      throw new XaiopSyntaxError(
          ">name- while Cursor is inside an array (use < to leave first): >" + name + "-",
          lineNo);
    }
    Map<String, Object> obj = (Map<String, Object>) cur.value;
    Object existing = obj.get(name);
    // Align with >name objects: re-enter existing array (append); otherwise create.
    if (existing instanceof List<?> existingList) {
      stack.add(new Frame(NodeKind.ARRAY, existingList, name));
      return;
    }
    ArrayList<Object> next = new ArrayList<>();
    obj.put(name, next);
    stack.add(new Frame(NodeKind.ARRAY, next, name));
  }

  @SuppressWarnings("unchecked")
  private void writeContent(String key, Object value) {
    if (phase == Phase.INIT || docKind == DocKind.NONE) {
      // Content at Root without `>` / `-` -> fragment binding(s), not an outer `{}`
      ensureFragmentRoot();
    }
    Frame cur = current();
    if (cur.kind == NodeKind.ARRAY) {
      List<Object> arr = (List<Object>) cur.value;
      if (key.isEmpty()) {
        arr.add(value);
        return;
      }
      LinkedHashMap<String, Object> wrapper = new LinkedHashMap<>();
      wrapper.put(key, value);
      arr.add(wrapper);
      return;
    }
    Map<String, Object> obj = (Map<String, Object>) cur.value;
    if (key.isEmpty()) {
      throw new XaiopSyntaxError(":value scalar Content is only valid at array level", lineNo);
    }
    obj.put(key, value);
  }

  private void locatePath(String path) {
    if (docKind == DocKind.NONE) {
      throw new XaiopSyntaxError("=path before any tree exists", lineNo);
    }
    if (path.isEmpty()) {
      throw new XaiopSyntaxError("empty = path", lineNo);
    }
    Object tree = docKind == DocKind.FRAGMENT ? fragmentEntries : root;

    List<Frame> found = fuzzyFind(tree, pathSegments(path));
    if (found == null && compat != null) {
      String trimmed = path.trim();
      String cleared = path.replaceAll("\\s+", "");

      // Retry 1: trim leading/trailing whitespace (e.g. `= siblings` -> `siblings`)
      if (found == null
          && fixEnabled(CompatFixId.locatePathTrim)
          && !trimmed.isEmpty()
          && !trimmed.equals(path)) {
        found = fuzzyFind(tree, pathSegments(trimmed));
      }

      // Retry 2: strip all whitespace (e.g. `=child > inner` -> `child>inner`)
      if (found == null
          && fixEnabled(CompatFixId.locatePathStripSpaces)
          && !cleared.isEmpty()
          && !cleared.equals(path)
          && !cleared.equals(trimmed)) {
        found = fuzzyFind(tree, pathSegments(cleared));
      }

      // Retry 3: `=siblings-` -> locate `siblings` only if that value is an array
      // (LLM reused `>name-` create postfix on `=`). Prefer space-cleared path text.
      if (found == null && fixEnabled(CompatFixId.locatePathArraySuffix)) {
        String forSuffix;
        if (fixEnabled(CompatFixId.locatePathStripSpaces) && !cleared.isEmpty()) {
          forSuffix = cleared;
        } else if (fixEnabled(CompatFixId.locatePathTrim) && !trimmed.isEmpty()) {
          forSuffix = trimmed;
        } else {
          forSuffix = path;
        }
        boolean hasArraySuffix = false;
        for (String s : splitKeepEmpty(forSuffix)) {
          if (s.length() > 1 && s.endsWith("-")) {
            hasArraySuffix = true;
            break;
          }
        }
        if (hasArraySuffix) {
          found = fuzzyFindCompatArrayCreateSuffix(tree, pathSegments(forSuffix));
        }
      }
    }
    if (found == null) {
      throw new XaiopSyntaxError("=path not found: " + path, lineNo);
    }
    stack = new ArrayList<>(found);
    phase = Phase.ACTIVE;
  }

  /**
   * {@code @path} -- exact path from Root (no fuzzy search).
   * Missing segments are <b>created</b> as empty objects in the current document
   * (本相 create-or-enter). Existing object/array at a segment is entered;
   * scalar / wrong-type mid-path is overwritten with {@code {}}.
   */
  @SuppressWarnings("unchecked")
  private void exactEnter(String path) {
    requireNotBroadcast("@");
    List<String> segments = splitPathSegments(path, lineNo, "@");
    if (docKind == DocKind.NONE) {
      ensureDocumentObjectRoot();
    }
    broadcastStacks = null;

    // Reset Cursor to document Root, then create-or-enter each segment.
    stack = new ArrayList<>();
    if (docKind == DocKind.FRAGMENT) {
      stack.add(new Frame(NodeKind.FRAGMENT, fragmentEntries));
    } else {
      stack.add(new Frame(docKind == DocKind.ARRAY ? NodeKind.ARRAY : NodeKind.OBJECT, root));
    }
    phase = Phase.ACTIVE;

    for (int i = 0; i < segments.size(); i++) {
      String seg = segments.get(i);
      Frame cur = current();
      if (cur.kind == NodeKind.ARRAY) {
        throw new XaiopSyntaxError(
            "@path cannot descend by name while Cursor is inside an array: @" + path, lineNo);
      }
      Map<String, Object> obj = (Map<String, Object>) cur.value;
      Object existing = obj.get(seg);
      boolean isLast = i == segments.size() - 1;

      if (existing instanceof List<?> existingList) {
        if (!isLast) {
          // Need named children further down -- replace array with object.
          LinkedHashMap<String, Object> next = new LinkedHashMap<>();
          obj.put(seg, next);
          stack.add(new Frame(NodeKind.OBJECT, next, seg));
        } else {
          stack.add(new Frame(NodeKind.ARRAY, existingList, seg));
        }
        continue;
      }

      if (existing instanceof Map<?, ?> existingMap) {
        stack.add(new Frame(NodeKind.OBJECT, existingMap, seg));
        continue;
      }

      // Missing or scalar -> create empty object and enter.
      LinkedHashMap<String, Object> next = new LinkedHashMap<>();
      obj.put(seg, next);
      stack.add(new Frame(NodeKind.OBJECT, next, seg));
    }
  }

  /**
   * {@code &path} — delete deepest key. Single Cursor: absolute from Root.
   * Broadcast: relative to each Cursor. Does not move Cursor.
   */
  private void deleteAtPath(String path) {
    List<String> segments = splitPathSegments(path, lineNo, "&");

    if (broadcastStacks != null) {
      precheckBroadcastDelete(segments);
      runOnCursors(() -> deleteRelative(segments));
      return;
    }

    deleteAbsolute(segments);
  }

  private void precheckBroadcastDelete(List<String> segments) {
    if (broadcastStacks == null) return;
    List<List<Frame>> stacks = broadcastStacks;
    for (int i = 0; i < stacks.size(); i++) {
      stack = new ArrayList<>(stacks.get(i));
      precheckRelativeDelete(segments);
    }
    stack = new ArrayList<>(stacks.get(0));
  }

  /** Absolute delete from document Root (single Cursor). */
  @SuppressWarnings("unchecked")
  private void deleteAbsolute(List<String> segments) {
    if (docKind == DocKind.NONE) {
      return; // no-op: nothing to delete
    }
    if (docKind == DocKind.FRAGMENT) {
      throw new XaiopSyntaxError(
          "&path requires an object document root (fragment root is not allowed)", lineNo);
    }
    if (docKind == DocKind.ARRAY || root instanceof List) {
      throw new XaiopSyntaxError("&path requires an object document root", lineNo);
    }
    Map<String, Object> rootMap = (Map<String, Object>) root;
    deleteFromObject(rootMap, segments);
  }

  /** Relative delete from current Cursor (broadcast). */
  @SuppressWarnings("unchecked")
  private void deleteRelative(List<String> segments) {
    Frame cur = current();
    if (cur.kind != NodeKind.OBJECT && cur.kind != NodeKind.FRAGMENT) {
      throw new XaiopSyntaxError(
          "&path relative delete requires an object Cursor", lineNo);
    }
    Map<String, Object> obj = (Map<String, Object>) cur.value;
    deleteFromObject(obj, segments);
  }

  /**
   * Fail before mutate if relative delete would remove a node on the Cursor chain.
   * Missing target is allowed (no-op) — only chain conflicts error.
   */
  @SuppressWarnings("unchecked")
  private void precheckRelativeDelete(List<String> segments) {
    Frame cur = current();
    if (cur.kind != NodeKind.OBJECT && cur.kind != NodeKind.FRAGMENT) {
      throw new XaiopSyntaxError(
          "&path relative delete requires an object Cursor", lineNo);
    }
    Map<String, Object> obj = (Map<String, Object>) cur.value;
    for (int i = 0; i < segments.size(); i++) {
      String seg = segments.get(i);
      if (obj == null) {
        return;
      }
      if (!obj.containsKey(seg)) {
        return; // no-op
      }
      Object next = obj.get(seg);
      if (i == segments.size() - 1) {
        assertDeleteNotOnCursorChain(next);
        return;
      }
      if (!(next instanceof Map)) {
        return;
      }
      obj = (Map<String, Object>) next;
    }
  }

  @SuppressWarnings("unchecked")
  private void deleteFromObject(Map<String, Object> start, List<String> segments) {
    Map<String, Object> obj = start;
    for (int i = 0; i < segments.size() - 1; i++) {
      String seg = segments.get(i);
      if (obj == null || !obj.containsKey(seg)) {
        return;
      }
      Object next = obj.get(seg);
      if (!(next instanceof Map)) {
        return; // cannot descend further — no-op
      }
      obj = (Map<String, Object>) next;
    }

    String last = segments.get(segments.size() - 1);
    if (obj == null || !obj.containsKey(last)) {
      return; // no-op
    }

    Object target = obj.get(last);
    assertDeleteNotOnCursorChain(target);
    obj.remove(last);
  }

  /**
   * Deleting a value that is the current Cursor node or any ancestor on the stack
   * is a syntax error (all modes).
   */
  private void assertDeleteNotOnCursorChain(Object target) {
    if (target == null || (!(target instanceof Map) && !(target instanceof List))) {
      return; // scalars / null cannot be stack frames
    }
    List<List<Frame>> stacks =
        broadcastStacks != null ? broadcastStacks : List.of(stack);
    for (List<Frame> st : stacks) {
      for (Frame frame : st) {
        if (frame.value == target) {
          throw new XaiopSyntaxError(
              "&path deletes a node on the Cursor chain", lineNo);
        }
      }
    }
  }

  /**
   * Lines to re-enter current Cursor after {@code .} (cover-mode restore).
   * Named object/array keys only; anonymous / array-element frames → error.
   */
  /**
   * Live document root kind for Diff isolation ({@code "object"} / {@code "array"} /
   * {@code "fragment"}), or {@code null} when unset.
   */
  public String docKind() {
    return switch (docKind) {
      case OBJECT -> "object";
      case ARRAY -> "array";
      case FRAGMENT -> "fragment";
      case NONE -> null;
    };
  }

  public List<String> cursorRestoreLines() {
    if (broadcastStacks != null) {
      throw new XaiopSyntaxError(
          "cursor restore is not available while broadcast mode is active", lineNo);
    }
    List<String> lines = new ArrayList<>();
    for (int i = 1; i < stack.size(); i++) {
      Frame frame = stack.get(i);
      String via = frame.viaKey;
      if (via == null || via.isEmpty()) {
        throw new XaiopSyntaxError(
            "cannot restore Cursor after . (anonymous or array-element frame on stack)",
            lineNo);
      }
      if (frame.kind == NodeKind.ARRAY) {
        lines.add(">" + via + "-");
      } else {
        lines.add(">" + via);
      }
    }
    return lines;
  }

  /**
   * {@code !path} -- complete path-fragment matches over the whole tree (outer prune);
   * enter broadcast multi-cursor mode.
   */
  private void broadcastEnter(String path) {
    if (docKind == DocKind.NONE) {
      throw new XaiopSyntaxError("!path before any tree exists", lineNo);
    }
    List<String> segments = splitPathSegments(path, lineNo, "!");
    List<List<Frame>> matches = new ArrayList<>();
    Object tree = docKind == DocKind.FRAGMENT ? fragmentEntries : root;
    NodeKind rootKind =
        docKind == DocKind.FRAGMENT
            ? NodeKind.FRAGMENT
            : (tree instanceof List ? NodeKind.ARRAY : NodeKind.OBJECT);
    collectPathMatches(tree, rootKind, segments, matches, new ArrayList<>());
    if (matches.isEmpty()) {
      throw new XaiopSyntaxError("!path no match: " + path, lineNo);
    }
    broadcastStacks = new ArrayList<>();
    for (List<Frame> s : matches) {
      broadcastStacks.add(new ArrayList<>(s));
    }
    stack = new ArrayList<>(broadcastStacks.get(0));
    phase = Phase.ACTIVE;
  }

  // ---------------------------------------------------------------------
  // Static helpers (faithful port of module-level functions in parse.js)
  // ---------------------------------------------------------------------

  /** Splits {@code source} into logical lines (LF / CR / CRLF), dropping trailing empties. */
  static List<String> splitLines(String source) {
    List<String> lines = new ArrayList<>();
    if (source.isEmpty()) return lines;
    int start = 0;
    int n = source.length();
    for (int i = 0; i < n; i++) {
      char c = source.charAt(i);
      if (c == '\n') {
        lines.add(source.substring(start, i));
        start = i + 1;
      } else if (c == '\r') {
        lines.add(source.substring(start, i));
        if (i + 1 < n && source.charAt(i + 1) == '\n') {
          start = i + 2;
          i++;
        } else {
          start = i + 1;
        }
      }
    }
    if (start < n) {
      lines.add(source.substring(start));
    }
    // A final newline does not create an extra empty Content record (drop trailing empties).
    while (!lines.isEmpty() && lines.get(lines.size() - 1).isEmpty()) {
      lines.remove(lines.size() - 1);
    }
    return lines;
  }

  /** Public wrapper used by {@code LiveXaiopParser.feedText} to mirror {@code parseSync} splitting. */
  public static List<String> publicSplitLines(String source) {
    return splitLines(source);
  }

  private static String stripBom(String s) {
    return !s.isEmpty() && s.charAt(0) == '\uFEFF' ? s.substring(1) : s;
  }

  /** Compare syntax errors ignoring the {@code line N:} prefix. */
  private static String syntaxErrorKey(XaiopSyntaxError err) {
    String msg = err.getMessage() != null ? err.getMessage() : "";
    return msg.replaceFirst("^line \\d+:\\s*", "");
  }

  private static final Pattern WHITESPACE_RE = Pattern.compile("\\s");

  private List<String> pathSegments(String path) {
    List<String> segs = splitNonEmpty(path);
    List<String> out = new ArrayList<>(segs.size());
    for (String s : segs) {
      out.add(logicalName(s));
    }
    return out;
  }

  private static void assertName(String name, int lineNo, boolean symbolKeys) {
    if (name == null
        || name.isEmpty()
        || WHITESPACE_RE.matcher(name).find()
        || name.contains(":")) {
      throw new XaiopSyntaxError("invalid label name: " + Json.stringify(name), lineNo);
    }
    if (!symbolKeys && (name.contains("@") || name.contains("&"))) {
      throw new XaiopSyntaxError("invalid label name: " + Json.stringify(name), lineNo);
    }
  }

  private List<String> splitPathSegments(String path, int lineNo, String op) {
    if (path == null || path.isEmpty()) {
      throw new XaiopSyntaxError("empty " + op + " path", lineNo);
    }
    boolean invalid = path.charAt(0) == '>' || path.charAt(path.length() - 1) == '>';
    List<String> segments = new ArrayList<>();
    int start = 0;
    int n = path.length();
    for (int i = 0; i < n; i++) {
      if (path.charAt(i) == '>') {
        if (i == start) {
          invalid = true;
          break;
        }
        segments.add(logicalName(path.substring(start, i)));
        start = i + 1;
      }
    }
    if (!invalid) {
      if (start >= n) {
        invalid = true;
      } else {
        segments.add(logicalName(path.substring(start)));
      }
    }
    if (invalid) {
      throw new XaiopSyntaxError("invalid " + op + " path: " + Json.stringify(path), lineNo);
    }
    for (String s : segments) assertName(s, lineNo, symbolKeys);
    return segments;
  }

  /** {@code segments} split on {@code >}, empty pieces filtered out. */
  private static List<String> splitNonEmpty(String path) {
    List<String> out = new ArrayList<>();
    int start = 0;
    int n = path.length();
    for (int i = 0; i < n; i++) {
      if (path.charAt(i) == '>') {
        if (i > start) out.add(path.substring(start, i));
        start = i + 1;
      }
    }
    if (start < n) out.add(path.substring(start));
    return out;
  }

  /** Like {@code String.split(">", -1)} without regex allocation. */
  private static List<String> splitKeepEmpty(String path) {
    List<String> out = new ArrayList<>();
    int start = 0;
    int n = path.length();
    for (int i = 0; i < n; i++) {
      if (path.charAt(i) == '>') {
        out.add(path.substring(start, i));
        start = i + 1;
      }
    }
    out.add(path.substring(start));
    return out;
  }

  /** Follow {@code segments} as consecutive object keys under {@code obj}. */
  @SuppressWarnings("unchecked")
  private static List<Frame> tryExactDescend(
      Map<String, Object> obj, Frame parentFrame, List<Frame> trail, List<String> segments) {
    if (!obj.containsKey(segments.get(0))) return null;
    List<Frame> stack = new ArrayList<>(trail);
    stack.add(parentFrame);
    Object node = obj;
    for (String seg : segments) {
      if (!(node instanceof Map)) {
        return null;
      }
      Map<String, Object> cur = (Map<String, Object>) node;
      if (!cur.containsKey(seg)) return null;
      Object child = cur.get(seg);
      if (!(child instanceof Map) && !(child instanceof List)) return null;
      NodeKind kind = child instanceof List ? NodeKind.ARRAY : NodeKind.OBJECT;
      stack.add(new Frame(kind, child));
      node = child;
    }
    return stack;
  }

  /**
   * Collect all complete path-fragment matches. When a match starts at a child key,
   * that child's subtree is not searched further (outer prune).
   */
  @SuppressWarnings("unchecked")
  private static void collectPathMatches(
      Object node,
      NodeKind nodeKind,
      List<String> segments,
      List<List<Frame>> out,
      List<Frame> trail) {
    if (!(node instanceof Map) && !(node instanceof List)) return;

    if (node instanceof List || nodeKind == NodeKind.ARRAY) {
      List<Object> arr = (List<Object>) node;
      Frame frame = new Frame(NodeKind.ARRAY, arr);
      List<Frame> childTrail = new ArrayList<>(trail);
      childTrail.add(frame);
      for (Object el : arr) {
        if (el instanceof Map || el instanceof List) {
          NodeKind kind = el instanceof List ? NodeKind.ARRAY : NodeKind.OBJECT;
          collectPathMatches(el, kind, segments, out, childTrail);
        }
      }
      return;
    }

    Map<String, Object> obj = (Map<String, Object>) node;
    Frame frame =
        new Frame(nodeKind == NodeKind.FRAGMENT ? NodeKind.FRAGMENT : NodeKind.OBJECT, obj);

    List<Frame> matched = tryExactDescend(obj, frame, trail, segments);
    String startKey = segments.get(0);
    List<Frame> childTrail = new ArrayList<>(trail);
    childTrail.add(frame);
    if (matched != null) {
      out.add(matched);
      for (String key : obj.keySet()) {
        if (key.equals(startKey)) continue;
        Object child = obj.get(key);
        if (child instanceof Map || child instanceof List) {
          NodeKind kind = child instanceof List ? NodeKind.ARRAY : NodeKind.OBJECT;
          collectPathMatches(child, kind, segments, out, childTrail);
        }
      }
      return;
    }

    for (String key : obj.keySet()) {
      Object child = obj.get(key);
      if (child instanceof Map || child instanceof List) {
        NodeKind kind = child instanceof List ? NodeKind.ARRAY : NodeKind.OBJECT;
        collectPathMatches(child, kind, segments, out, childTrail);
      }
    }
  }

  static Object parseValue(String rawValue) {
    // Forced string: one or more spaces immediately after :
    if (!rawValue.isEmpty() && rawValue.charAt(0) == ' ') {
      int i = 1;
      while (i < rawValue.length() && rawValue.charAt(i) == ' ') i++;
      return rawValue.substring(i);
    }
    if (rawValue.equals("true")) return Boolean.TRUE;
    if (rawValue.equals("false")) return Boolean.FALSE;
    if (rawValue.equals("null")) return null;
    if (isIntToken(rawValue)) {
      try {
        long l = Long.parseLong(rawValue);
        if (l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) {
          return (int) l;
        }
        return l;
      } catch (NumberFormatException overflow) {
        return Double.parseDouble(rawValue);
      }
    }
    if (isFloatToken(rawValue)) {
      return Double.parseDouble(rawValue); // IEEE 754 binary64
    }
    return rawValue;
  }

  private static boolean isIntToken(String s) {
    if (s.isEmpty()) return false;
    int i = 0;
    if (s.charAt(0) == '-' || s.charAt(0) == '+') i++;
    if (i >= s.length()) return false;
    for (; i < s.length(); i++) {
      char c = s.charAt(i);
      if (c < '0' || c > '9') return false;
    }
    return true;
  }

  /** Float token (PROT-CONTENT §5.2): not int-only; fraction and/or exponent. No Matcher alloc. */
  private static boolean isFloatToken(String s) {
    int n = s.length();
    if (n == 0) return false;
    int i = 0;
    if (s.charAt(0) == '+' || s.charAt(0) == '-') i++;
    if (i >= n) return false;

    boolean sawDigit = false;
    boolean sawDot = false;
    boolean sawExp = false;

    // Leading digits or leading "."
    if (s.charAt(i) == '.') {
      sawDot = true;
      i++;
    }
    while (i < n) {
      char c = s.charAt(i);
      if (c >= '0' && c <= '9') {
        sawDigit = true;
        i++;
        continue;
      }
      if (c == '.' && !sawDot && !sawExp) {
        sawDot = true;
        i++;
        continue;
      }
      if ((c == 'e' || c == 'E') && !sawExp && sawDigit) {
        sawExp = true;
        i++;
        if (i < n && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
        int expDigits = 0;
        while (i < n) {
          char d = s.charAt(i);
          if (d < '0' || d > '9') return false;
          expDigits++;
          i++;
        }
        return expDigits > 0 && (sawDot || sawExp);
      }
      return false;
    }
    // Must have digits, and either a fraction or an exponent (int-only rejected by caller first).
    return sawDigit && (sawDot || sawExp);
  }

  private static List<Frame> fuzzyFind(Object node, List<String> segments) {
    return fuzzyFindInner(node, segments, new ArrayList<>(), false);
  }

  /**
   * Compat-only: a segment {@code name-} may match key {@code name} when that value is an array
   * ({@code >} create postfix reused on {@code =}). Never matches object/scalar under the
   * stripped name.
   */
  private static List<Frame> fuzzyFindCompatArrayCreateSuffix(Object node, List<String> segments) {
    return fuzzyFindInner(node, segments, new ArrayList<>(), true);
  }

  @SuppressWarnings("unchecked")
  private static List<Frame> fuzzyFindInner(
      Object node, List<String> segments, List<Frame> trail, boolean allowArrayCreateSuffix) {
    if (segments.isEmpty()) return trail.isEmpty() ? null : new ArrayList<>(trail);
    if (!(node instanceof Map) && !(node instanceof List)) return null;

    if (node instanceof List) {
      List<Object> arr = (List<Object>) node;
      Frame frame = new Frame(NodeKind.ARRAY, arr);
      List<Frame> childTrail = new ArrayList<>(trail);
      childTrail.add(frame);
      for (Object el : arr) {
        List<Frame> hit = fuzzyFindInner(el, segments, childTrail, allowArrayCreateSuffix);
        if (hit != null) return hit;
      }
      return null;
    }

    Map<String, Object> obj = (Map<String, Object>) node;
    Frame frame = new Frame(NodeKind.OBJECT, obj);
    String head = segments.get(0);
    List<String> rest = segments.subList(1, segments.size());

    if (obj.containsKey(head)) {
      List<Frame> hit =
          fuzzyFindTryChild(trail, frame, rest, obj.get(head), allowArrayCreateSuffix);
      if (hit != null) return hit;
    } else if (allowArrayCreateSuffix && head.length() > 1 && head.endsWith("-")) {
      String base = head.substring(0, head.length() - 1);
      Object baseVal = obj.get(base);
      if (obj.containsKey(base) && baseVal instanceof List) {
        List<Frame> hit =
            fuzzyFindTryChild(trail, frame, rest, baseVal, allowArrayCreateSuffix);
        if (hit != null) return hit;
      }
    }

    // fuzzy: search deeper for full segment match
    for (String key : obj.keySet()) {
      Object child = obj.get(key);
      if (child instanceof Map || child instanceof List) {
        List<Frame> childTrail = new ArrayList<>(trail);
        childTrail.add(frame);
        List<Frame> hit = fuzzyFindInner(child, segments, childTrail, allowArrayCreateSuffix);
        if (hit != null) return hit;
      }
    }
    return null;
  }

  private static List<Frame> fuzzyFindTryChild(
      List<Frame> trail, Frame frame, List<String> rest, Object child, boolean allowArrayCreateSuffix) {
    if (rest.isEmpty()) {
      List<Frame> result = new ArrayList<>(trail);
      result.add(frame);
      if (child instanceof Map || child instanceof List) {
        NodeKind kind = child instanceof List ? NodeKind.ARRAY : NodeKind.OBJECT;
        result.add(new Frame(kind, child));
      }
      return result;
    }
    if (child instanceof Map || child instanceof List) {
      List<Frame> childTrail = new ArrayList<>(trail);
      childTrail.add(frame);
      return fuzzyFindInner(child, rest, childTrail, allowArrayCreateSuffix);
    }
    return null;
  }
}
