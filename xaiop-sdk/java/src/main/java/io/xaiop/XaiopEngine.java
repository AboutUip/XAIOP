package io.xaiop;

import io.xaiop.compat.CompatFixId;
import io.xaiop.compat.CompatPolicy;
import io.xaiop.types.TypeChecker;
import io.xaiop.types.TypeEntry;
import io.xaiop.types.TypePolarity;
import io.xaiop.types.TypeRegistry;
import io.xaiop.types.TypeSchemaSnapshot;
import io.xaiop.types.Types;
import io.xaiop.types.XaiopTypeError;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;

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
  /**
   * Type-check flag (default off). May be on only in strict mode ({@code compatibilityMode ==
   * false}). When on, registered types are enforced on upload/inject via {@link TypeChecker}.
   */
  private boolean typeCheck;
  private final TypeRegistry typeRegistry = new TypeRegistry();
  private BiConsumer<XaiopTypeError, TypeChecker.ViolationContext> typeViolationHook;

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
   * their defaults -- all on -- until toggled individually). Turning compatibility mode
   * <b>on</b> clears {@code typeCheck} (strict-only flag).
   */
  public XaiopEngine setCompatibilityMode(boolean enabled) {
    this.compatibilityMode = enabled;
    if (this.compatibilityMode) this.typeCheck = false;
    return this;
  }

  // --- Type check ------------------------------------------------------------

  /** Whether the type-check flag is on. Default {@code false}. */
  public boolean typeCheck() {
    return typeCheck;
  }

  /**
   * Enable or disable the type-check flag. May be enabled only in strict mode.
   *
   * @return whether the requested state was applied
   */
  public boolean setTypeCheck(boolean enabled) {
    if (enabled) {
      if (compatibilityMode) return false;
      typeCheck = true;
      return true;
    }
    typeCheck = false;
    return true;
  }

  /** Path → type registry (immutable entries once registered). */
  public TypeRegistry typeRegistry() {
    return typeRegistry;
  }

  /**
   * Register an allow (whitelist) or deny (blacklist) type for a JSON path.
   *
   * @return {@code false} if path already registered
   */
  public boolean registerType(String path, Object type, TypePolarity polarity) {
    return typeRegistry.register(path, type, polarity);
  }

  public boolean registerType(String path, Object type) {
    return typeRegistry.register(path, type, TypePolarity.ALLOW);
  }

  /** Register multiple path/type pairs. */
  public TypeRegistry.RegisterManyResult registerTypes(Object map, TypePolarity polarity) {
    return typeRegistry.registerMany(map, polarity);
  }

  public TypeRegistry.RegisterManyResult registerTypes(Object map) {
    return typeRegistry.registerMany(map);
  }

  /** Blacklist helper — {@code registerType(path, type, DENY)}. */
  public boolean registerTypeDeny(String path, Object type) {
    return typeRegistry.register(path, type, TypePolarity.DENY);
  }

  public TypeEntry getRegisteredType(String path) {
    return typeRegistry.get(path);
  }

  /** Export schema snapshot for WS {@code pushTypeConsistency}. */
  public TypeSchemaSnapshot exportTypeSchema() {
    return typeRegistry.snapshot();
  }

  /**
   * Hook invoked on each registry violation while typeCheck is on (before throw).
   *
   * @param fn handler or {@code null} to clear
   */
  public XaiopEngine onTypeViolation(
      BiConsumer<XaiopTypeError, TypeChecker.ViolationContext> fn) {
    typeViolationHook = fn;
    return this;
  }

  /** Encode a type-schema control frame (for tests / manual WS send). */
  public String encodeTypeSchemaFrame() {
    return Types.encodeTypeSchemaFrame(typeRegistry.snapshot());
  }

  private void runTypeCheck(Object value) {
    if (!typeCheck) return;
    if (typeRegistry.size() == 0) return;
    TypeChecker checker = new TypeChecker(typeRegistry, typeViolationHook);
    checker.checkTree(value);
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
    runTypeCheck(value);
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
    runTypeCheck(merged);
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
    runTypeCheck(merged);
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
