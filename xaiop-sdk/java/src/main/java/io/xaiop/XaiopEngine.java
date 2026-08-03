package io.xaiop;

import io.xaiop.compat.CompatFixId;
import io.xaiop.compat.CompatPolicy;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Standard XAIOP engine: upload full documents, fetch by runtime data id. Faithful port of the
 * Node.js SDK's {@code XaiopEngine} ({@code index.js}), sync-first for Java.
 *
 * <p>Compatibility mode is <b>off</b> by default. When enabled without further tuning, every
 * deterministic fix is on; individual fixes are toggled through
 * {@link #setCompatFix(CompatFixId, boolean)}, which -- like the JS per-fix setters -- returns
 * {@code false} (and changes nothing) while compatibility mode is off.
 */
public class XaiopEngine {
  private final Map<String, Object> store = new LinkedHashMap<>();
  private final AtomicInteger seq = new AtomicInteger();
  private final CompatPolicy compat = new CompatPolicy();
  private boolean compatibilityMode;

  public XaiopEngine() {
    this(false);
  }

  public XaiopEngine(boolean compatibilityMode) {
    this.compatibilityMode = compatibilityMode;
  }

  // --- Compatibility ---------------------------------------------------------

  /** Whether compatibility mode is enabled for this engine instance. */
  public boolean compatibilityMode() {
    return compatibilityMode;
  }

  /**
   * Enables or disables compatibility mode. Does <b>not</b> reset per-fix flags (they stay at
   * their defaults -- all on -- until toggled individually).
   */
  public XaiopEngine setCompatibilityMode(boolean enabled) {
    this.compatibilityMode = enabled;
    return this;
  }

  /** @return the per-fix flag (meaningful only while compatibility mode is on). */
  public boolean compatFix(CompatFixId id) {
    return compat.get(id);
  }

  /**
   * @return {@code true} when applied; {@code false} when compatibility mode is off (the flag is
   *     left unchanged), mirroring the JS {@code setCompat*} contract.
   */
  public boolean setCompatFix(CompatFixId id, boolean enabled) {
    if (!compatibilityMode) return false;
    return compat.set(id, enabled);
  }

  /** Compatibility argument for parse: the policy snapshot, or {@code null} when off (strict). */
  private Map<CompatFixId, Boolean> parseCompatArg() {
    return compatibilityMode ? compat.snapshot() : null;
  }

  // --- Store -----------------------------------------------------------------

  /** Uploads XAIOP text using this engine's compatibility mode. @return runtime data id. */
  public String uploadSync(String source) {
    Object value = Parse.parse(source, parseCompatArg());
    String id = nextId(seq.incrementAndGet());
    store.put(id, value);
    return id;
  }

  /**
   * Encodes JSON &rarr; XAIOP, then uploads. Compatibility mode does <b>not</b> affect encode
   * (strict wire only).
   */
  public String uploadJsonSync(Object value) {
    return uploadJsonSync(value, EncodeOptions.defaults());
  }

  public String uploadJsonSync(Object value, EncodeOptions encodeOptions) {
    return uploadSync(Encode.encode(value, encodeOptions));
  }

  /** Instance encode (strict wire). Same options as the static {@link #encode(Object)}. */
  public String encodeSync(Object value) {
    return Encode.encode(value, EncodeOptions.defaults());
  }

  public String encodeSync(Object value, EncodeOptions options) {
    return Encode.encode(value, options);
  }

  /** @return a deep copy of the stored document ({@link XaiopFragment} preserved). */
  public Object getSync(String dataId) {
    Object v = store.get(requireKnownId(dataId));
    if (v instanceof XaiopFragment fragment) {
      @SuppressWarnings("unchecked")
      Map<String, Object> entries = (Map<String, Object>) Json.deepClone(fragment.getEntries());
      return new XaiopFragment(entries);
    }
    return Json.deepClone(v);
  }

  public boolean has(String dataId) {
    return dataId != null && store.containsKey(dataId);
  }

  /** @return whether an entry was removed. */
  public boolean delete(String dataId) {
    return store.remove(dataId) != null;
  }

  public void clear() {
    store.clear();
  }

  // --- Merge / inject (pre/post — not streaming) ------------------------------

  /** Merges base JSON + XAIOP &rarr; JSON, using this engine's compatibility mode for parse. */
  public Object mergeToJsonSync(Object baseJson, String xaiopSource) {
    return mergeToJsonSync(baseJson, xaiopSource, MergeOptions.defaults());
  }

  public Object mergeToJsonSync(Object baseJson, String xaiopSource, MergeOptions options) {
    return Merge.mergeToJson(baseJson, xaiopSource, withEngineCompat(options));
  }

  /** Merges base JSON + XAIOP &rarr; XAIOP wire. */
  public String mergeToXaiopSync(Object baseJson, String xaiopSource) {
    return mergeToXaiopSync(baseJson, xaiopSource, MergeOptions.defaults());
  }

  public String mergeToXaiopSync(Object baseJson, String xaiopSource, MergeOptions options) {
    return Merge.mergeToXaiop(baseJson, xaiopSource, withEngineCompat(options));
  }

  /** Injects XAIOP into a stored document (mutates the store). */
  public Object injectXaiopSync(String dataId, String xaiopSource) {
    return injectXaiopSync(dataId, xaiopSource, MergeOptions.defaults());
  }

  public Object injectXaiopSync(String dataId, String xaiopSource, MergeOptions options) {
    MergeOptions opt = options == null ? MergeOptions.defaults() : options;
    Object base = requireStored(dataId);
    Object merged = Merge.mergeToJson(base, xaiopSource, withEngineCompat(opt));
    store.put(dataId, merged);
    return Merge.formatInjectResult(merged, opt);
  }

  /** Injects a JSON tree into a stored document (mutates the store). */
  public Object injectJsonSync(String dataId, Object jsonValue) {
    return injectJsonSync(dataId, jsonValue, MergeOptions.defaults());
  }

  public Object injectJsonSync(String dataId, Object jsonValue, MergeOptions options) {
    MergeOptions opt = options == null ? MergeOptions.defaults() : options;
    Object base = requireStored(dataId);
    Object merged = Merge.mergeJson(base, jsonValue, opt.conflict());
    store.put(dataId, merged);
    return Merge.formatInjectResult(merged, opt);
  }

  // --- Static helpers --------------------------------------------------------

  /** Static parse &rarr; JSON tree or (strict) {@link XaiopFragment}; no store, no id. */
  public static Object parse(String source) {
    return Parse.parse(source);
  }

  /** @param compatibilityMode {@code false} = strict; {@code true} = all fixes enabled. */
  public static Object parse(String source, boolean compatibilityMode) {
    return Parse.parse(source, compatibilityMode);
  }

  /** Encodes a JSON value to XAIOP wire text (strict; no compatibility shapes). */
  public static String encode(Object value) {
    return Encode.encode(value);
  }

  public static String encode(Object value, EncodeOptions options) {
    return Encode.encode(value, options);
  }

  public static Object mergeToJson(Object baseJson, String xaiopSource) {
    return Merge.mergeToJson(baseJson, xaiopSource);
  }

  public static Object mergeToJson(Object baseJson, String xaiopSource, MergeOptions options) {
    return Merge.mergeToJson(baseJson, xaiopSource, options);
  }

  public static String mergeToXaiop(Object baseJson, String xaiopSource) {
    return Merge.mergeToXaiop(baseJson, xaiopSource);
  }

  public static String mergeToXaiop(Object baseJson, String xaiopSource, MergeOptions options) {
    return Merge.mergeToXaiop(baseJson, xaiopSource, options);
  }

  // --- internals -------------------------------------------------------------

  /** Caller-pinned compatibility wins; otherwise the engine's own mode applies. */
  private MergeOptions withEngineCompat(MergeOptions options) {
    MergeOptions opt = options == null ? MergeOptions.defaults() : options;
    return opt.hasCompat() ? opt : opt.withCompat(parseCompatArg());
  }

  private Object requireStored(String dataId) {
    return Merge.toMergeableJson(store.get(requireKnownId(dataId)));
  }

  private String requireKnownId(String dataId) {
    if (dataId == null || dataId.isEmpty()) {
      throw new IllegalArgumentException("dataId must be a non-empty string");
    }
    if (!store.containsKey(dataId)) {
      throw new IllegalArgumentException("unknown data id: " + dataId);
    }
    return dataId;
  }

  private static String nextId(int seq) {
    return "xaiop_"
        + seq
        + "_"
        + Long.toString(System.currentTimeMillis(), 36)
        + "_"
        + Long.toString(ThreadLocalRandom.current().nextLong(1L << 31), 36);
  }
}
