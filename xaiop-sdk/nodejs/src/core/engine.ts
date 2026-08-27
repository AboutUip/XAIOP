// @ts-nocheck
/**
 * In-memory XAIOP engine (isomorphic core).
 */
import { CompatPolicy } from "./compat.js";
import {
  encodeAsync,
  encodeSync as encodeValueSync,
} from "./encode.js";
import {
  formatInjectResult,
  mergeJson,
  mergeToJson as mergeToJsonValue,
  mergeToXaiop as mergeToXaiopValue,
  toMergeableJson,
} from "./merge.js";
import {
  parseAsync,
  parseSync,
  XaiopFragment,
} from "./parse.js";
import {
  TypeChecker,
  TypeRegistry,
  encodeTypeSchemaFrame,
} from "./types.js";

export const PROTOCOL_VERSION = "0.7.0";
export const SDK_VERSION = "0.16.0";

export class XaiopEngine {
  /**
   * @param {{ compatibilityMode?: boolean }} [options]
   */
  constructor(options = {}) {
    /** @type {Map<string, unknown>} */
    this._store = new Map();
    this._seq = 0;
    /** @type {boolean} */
    this._compatibilityMode = !!options.compatibilityMode;
    /**
     * Type-check flag (default off). May be on only in strict mode
     * (`compatibilityMode === false`). When on, registered types are enforced
     * on upload/inject via TypeChecker (+ optional violation hook).
     * @type {boolean}
     */
    this._typeCheck = false;
    /** @type {TypeRegistry} */
    this._typeRegistry = new TypeRegistry();
    /**
     * @type {((err: import("./types.js").XaiopTypeError, ctx: object) => void)|null}
     */
    this._typeViolationHook = null;
    /** Per-fix flags; defaults all `true`. Take effect only while compatibility mode is on. */
    this._compat = new CompatPolicy();
  }

  /** Whether compatibility mode is enabled for this engine instance. */
  get compatibilityMode() {
    return this._compatibilityMode;
  }

  /**
   * Whether the type-check flag is on. Default `false`.
   * Flag only — does not imply type checking is implemented or running.
   */
  get typeCheck() {
    return this._typeCheck;
  }

  /**
   * Enable or disable compatibility mode.
   * Does **not** reset per-fix flags (they stay at defaults — all on —
   * until toggled individually).
   * Turning compatibility mode **on** clears `typeCheck` (strict-only flag).
   * @param {boolean} enabled
   * @returns {this}
   */
  setCompatibilityMode(enabled) {
    this._compatibilityMode = !!enabled;
    if (this._compatibilityMode) this._typeCheck = false;
    return this;
  }

  /**
   * Enable or disable the type-check flag.
   * May be enabled only in strict mode (`compatibilityMode === false`).
   * When enabled, `upload*` / `inject*` run the type registry checker.
   * @param {boolean} enabled
   * @returns {boolean} whether the requested state was applied
   */
  setTypeCheck(enabled) {
    if (enabled) {
      if (this._compatibilityMode) return false;
      this._typeCheck = true;
      return true;
    }
    this._typeCheck = false;
    return true;
  }

  /** Path → type registry (immutable entries once registered). */
  get typeRegistry() {
    return this._typeRegistry;
  }

  /**
   * Register an allow (whitelist) or deny (blacklist) type for a JSON path.
   * Path style: `data.fork`, `items[0]`. Once registered, the path cannot be changed.
   * @param {string} path
   * @param {unknown} type — `TYPE.*`, `objectType`/`arrayType`, or surface string
   * @param {{ polarity?: 'allow'|'deny' }} [options]
   * @returns {boolean} false if path already registered
   */
  registerType(path, type, options = {}) {
    return this._typeRegistry.register(path, type, options);
  }

  /**
   * Register multiple path/type pairs (same polarity option for object-map form).
   * @param {Record<string, unknown>|Iterable<[string, unknown]>} map
   * @param {{ polarity?: 'allow'|'deny' }} [options]
   */
  registerTypes(map, options = {}) {
    return this._typeRegistry.registerMany(map, options);
  }

  /**
   * Blacklist helper — `registerType(path, type, { polarity: 'deny' })`.
   * @param {string} path
   * @param {unknown} type
   * @returns {boolean}
   */
  registerTypeDeny(path, type) {
    return this._typeRegistry.register(path, type, { polarity: "deny" });
  }

  /** @param {string} path */
  getRegisteredType(path) {
    return this._typeRegistry.get(path);
  }

  /** Export schema snapshot for WS `pushTypeConsistency`. */
  exportTypeSchema() {
    return this._typeRegistry.snapshot();
  }

  /**
   * Hook invoked on each registry violation while typeCheck is on (before throw).
   * @param {((err: import("./types.js").XaiopTypeError, ctx: object) => void)|null} fn
   * @returns {this}
   */
  onTypeViolation(fn) {
    this._typeViolationHook = typeof fn === "function" ? fn : null;
    return this;
  }

  /**
   * Encode a type-schema control frame (for tests / manual WS send).
   * Prefer `XaiopWsConnection.pushTypeConsistency(engine)`.
   */
  encodeTypeSchemaFrame() {
    return encodeTypeSchemaFrame(this._typeRegistry.snapshot());
  }

  /** @param {unknown} value */
  _runTypeCheck(value) {
    if (!this._typeCheck) return;
    if (this._typeRegistry.size === 0) return;
    const checker = new TypeChecker(this._typeRegistry, {
      onViolation: this._typeViolationHook || undefined,
    });
    checker.checkTree(value);
  }

  /**
   * @param {import("./compat.js").CompatFixId} id
   * @param {boolean} enabled
   * @returns {boolean}
   */
  _setCompatFix(id, enabled) {
    if (!this._compatibilityMode) return false;
    return this._compat.set(id, enabled);
  }

  /** @returns {false|ReturnType<CompatPolicy["snapshot"]>} */
  _parseCompatArg() {
    return this._compatibilityMode ? this._compat.snapshot() : false;
  }

  // --- Compatibility fix APIs (active only while compatibilityMode is on) ---

  /** Force a complete anonymous object root when the stream does not open with `>` / `-`. */
  get compatForcedRoot() {
    return this._compat.forcedRoot;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatForcedRoot(enabled) {
    return this._setCompatFix("forcedRoot", enabled);
  }

  /** Rewrite bare `name-` → `>name-`. */
  get compatRewriteBareNameArray() {
    return this._compat.rewriteBareNameArray;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatRewriteBareNameArray(enabled) {
    return this._setCompatFix("rewriteBareNameArray", enabled);
  }

  /**
   * Rewrite `>` whitespace / glued `>key:value` / trailing spaces on Structure lines.
   */
  get compatRewriteEnterLine() {
    return this._compat.rewriteEnterLine;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatRewriteEnterLine(enabled) {
    return this._setCompatFix("rewriteEnterLine", enabled);
  }

  /** Ignore redundant bare `<` while Cursor is already at document Root. */
  get compatIgnoreBareLeaveAtRoot() {
    return this._compat.ignoreBareLeaveAtRoot;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatIgnoreBareLeaveAtRoot(enabled) {
    return this._setCompatFix("ignoreBareLeaveAtRoot", enabled);
  }

  /** On `XaiopSyntaxError`, pop Cursor and retry the same line. */
  get compatPopAndRetry() {
    return this._compat.popAndRetry;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatPopAndRetry(enabled) {
    return this._setCompatFix("popAndRetry", enabled);
  }

  /** On `=path not found`, retry after trimming edge whitespace. */
  get compatLocatePathTrim() {
    return this._compat.locatePathTrim;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatLocatePathTrim(enabled) {
    return this._setCompatFix("locatePathTrim", enabled);
  }

  /** On `=path not found`, retry after stripping all whitespace. */
  get compatLocatePathStripSpaces() {
    return this._compat.locatePathStripSpaces;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatLocatePathStripSpaces(enabled) {
    return this._setCompatFix("locatePathStripSpaces", enabled);
  }

  /**
   * On `=path not found`, treat a segment trailing `-` as `>name-` create postfix
   * (match array keys only).
   */
  get compatLocatePathArraySuffix() {
    return this._compat.locatePathArraySuffix;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatLocatePathArraySuffix(enabled) {
    return this._setCompatFix("locatePathArraySuffix", enabled);
  }

  // --- Store APIs ---

  /**
   * Upload XAIOP text. Returns a runtime data id.
   * @param {string} source
   * @returns {Promise<string>}
   */
  async upload(source) {
    return this.uploadSync(source);
  }

  /**
   * @param {string} source
   * @returns {string}
   */
  uploadSync(source) {
    const value = parseSync(source, this._parseCompatArg());
    this._runTypeCheck(value);
    const id = nextId(++this._seq);
    this._store.set(id, value);
    return id;
  }

  /**
   * Encode JSON → XAIOP, then upload. Returns a runtime data id.
   * Compatibility mode does **not** affect encode (strict wire only).
   * @param {unknown} value
   * @param {import("./encode.js").EncodeOptions} [encodeOptions]
   * @returns {Promise<string>}
   */
  async uploadJson(value, encodeOptions = {}) {
    return this.uploadJsonSync(value, encodeOptions);
  }

  /**
   * @param {unknown} value
   * @param {import("./encode.js").EncodeOptions} [encodeOptions]
   * @returns {string}
   */
  uploadJsonSync(value, encodeOptions = {}) {
    const source = encodeValueSync(value, encodeOptions);
    return this.uploadSync(source);
  }

  /**
   * Instance encode (strict wire). Same options as static `encodeSync`.
   * @param {unknown} value
   * @param {import("./encode.js").EncodeOptions} [options]
   * @returns {Promise<string>}
   */
  async encode(value, options = {}) {
    return encodeValueSync(value, options);
  }

  /** Identical to {@link encode}; named to match free `encodeAsync`. */
  async encodeAsync(value, options = {}) {
    return this.encode(value, options);
  }

  /**
   * @param {unknown} value
   * @param {import("./encode.js").EncodeOptions} [options]
   * @returns {string}
   */
  encodeSync(value, options = {}) {
    return encodeValueSync(value, options);
  }

  // --- Merge / inject (pre/post — not streaming) ---

  /**
   * Merge base JSON + XAIOP → JSON. Uses this engine's compat for parse.
   * @param {unknown} baseJson
   * @param {string} xaiopSource
   * @param {import("./merge.js").MergeOptions} [options]
   */
  async mergeToJson(baseJson, xaiopSource, options = {}) {
    return this.mergeToJsonSync(baseJson, xaiopSource, options);
  }

  /**
   * @param {unknown} baseJson
   * @param {string} xaiopSource
   * @param {import("./merge.js").MergeOptions} [options]
   */
  mergeToJsonSync(baseJson, xaiopSource, options = {}) {
    return mergeToJsonValue(baseJson, xaiopSource, {
      ...options,
      compat: options.compat !== undefined ? options.compat : this._parseCompatArg(),
    });
  }

  /**
   * Merge base JSON + XAIOP → XAIOP wire.
   * @param {unknown} baseJson
   * @param {string} xaiopSource
   * @param {import("./merge.js").MergeToXaiopOptions} [options]
   */
  async mergeToXaiop(baseJson, xaiopSource, options = {}) {
    return this.mergeToXaiopSync(baseJson, xaiopSource, options);
  }

  /**
   * @param {unknown} baseJson
   * @param {string} xaiopSource
   * @param {import("./merge.js").MergeToXaiopOptions} [options]
   */
  mergeToXaiopSync(baseJson, xaiopSource, options = {}) {
    return mergeToXaiopValue(baseJson, xaiopSource, {
      ...options,
      compat: options.compat !== undefined ? options.compat : this._parseCompatArg(),
    });
  }

  /**
   * Inject XAIOP into a stored document (mutates store).
   * @param {string} dataId
   * @param {string} xaiopSource
   * @param {import("./merge.js").InjectOptions} [options]
   * @returns {Promise<unknown|string>}
   */
  async injectXaiop(dataId, xaiopSource, options = {}) {
    return this.injectXaiopSync(dataId, xaiopSource, options);
  }

  /**
   * @param {string} dataId
   * @param {string} xaiopSource
   * @param {import("./merge.js").InjectOptions} [options]
   * @returns {unknown|string}
   */
  injectXaiopSync(dataId, xaiopSource, options = {}) {
    const base = this._requireStored(dataId);
    const merged = mergeToJsonValue(base, xaiopSource, {
      conflict: options.conflict,
      compat:
        options.compat !== undefined ? options.compat : this._parseCompatArg(),
    });
    this._runTypeCheck(merged);
    this._store.set(dataId, merged);
    return formatInjectResult(merged, options);
  }

  /**
   * Inject JSON into a stored document (mutates store).
   * @param {string} dataId
   * @param {unknown} jsonValue
   * @param {import("./merge.js").InjectOptions} [options]
   * @returns {Promise<unknown|string>}
   */
  async injectJson(dataId, jsonValue, options = {}) {
    return this.injectJsonSync(dataId, jsonValue, options);
  }

  /**
   * @param {string} dataId
   * @param {unknown} jsonValue
   * @param {import("./merge.js").InjectOptions} [options]
   * @returns {unknown|string}
   */
  injectJsonSync(dataId, jsonValue, options = {}) {
    const base = this._requireStored(dataId);
    const merged = mergeJson(base, jsonValue, options.conflict);
    this._runTypeCheck(merged);
    this._store.set(dataId, merged);
    return formatInjectResult(merged, options);
  }

  /**
   * @param {string} dataId
   * @returns {unknown}
   */
  _requireStored(dataId) {
    if (typeof dataId !== "string" || dataId.length === 0) {
      throw new TypeError("dataId must be a non-empty string");
    }
    if (!this._store.has(dataId)) {
      throw new Error(`unknown data id: ${dataId}`);
    }
    return toMergeableJson(this._store.get(dataId));
  }

  /**
   * @param {string} dataId
   * @returns {Promise<unknown>}
   */
  async get(dataId) {
    return this.getSync(dataId);
  }

  /**
   * @param {string} dataId
   * @returns {unknown}
   */
  getSync(dataId) {
    if (typeof dataId !== "string" || dataId.length === 0) {
      throw new TypeError("dataId must be a non-empty string");
    }
    if (!this._store.has(dataId)) {
      throw new Error(`unknown data id: ${dataId}`);
    }
    const v = this._store.get(dataId);
    if (v instanceof XaiopFragment) {
      return new XaiopFragment(structuredClone(v.entries));
    }
    return structuredClone(v);
  }

  /**
   * @param {string} source
   * @param {boolean} [compatibilityMode=false] — omitted / false = strict;
   *   `true` = all fixes enabled
   * @returns {Promise<unknown>}
   */
  static async parse(source, compatibilityMode = false) {
    return parseAsync(source, compatibilityMode);
  }

  /**
   * @param {string} source
   * @param {boolean} [compatibilityMode=false] — omitted / false = strict;
   *   `true` = all fixes enabled
   * @returns {unknown}
   */
  static parseSync(source, compatibilityMode = false) {
    return parseSync(source, compatibilityMode);
  }

  /**
   * Encode a JSON value to XAIOP wire text (strict; no compat shapes).
   * @param {unknown} value
   * @param {import("./encode.js").EncodeOptions} [options]
   * @returns {Promise<string>}
   */
  static async encode(value, options = {}) {
    return encodeAsync(value, options);
  }

  /** Identical to {@link encode}; named to match free `encodeAsync`. */
  static async encodeAsync(value, options = {}) {
    return encodeAsync(value, options);
  }

  /**
   * @param {unknown} value
   * @param {import("./encode.js").EncodeOptions} [options]
   * @returns {string}
   */
  static encodeSync(value, options = {}) {
    return encodeValueSync(value, options);
  }

  /**
   * @param {unknown} baseJson
   * @param {string} xaiopSource
   * @param {import("./merge.js").MergeOptions} [options]
   */
  static mergeToJson(baseJson, xaiopSource, options = {}) {
    return mergeToJsonValue(baseJson, xaiopSource, options);
  }

  /**
   * @param {unknown} baseJson
   * @param {string} xaiopSource
   * @param {import("./merge.js").MergeToXaiopOptions} [options]
   */
  static mergeToXaiop(baseJson, xaiopSource, options = {}) {
    return mergeToXaiopValue(baseJson, xaiopSource, options);
  }

  /** @returns {boolean} */
  has(dataId) {
    return this._store.has(dataId);
  }

  /** @param {string} dataId */
  delete(dataId) {
    return this._store.delete(dataId);
  }

  clear() {
    this._store.clear();
  }
}

/** @param {number} seq @returns {string} */
function nextId(seq) {
  return `xaiop_${seq}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

