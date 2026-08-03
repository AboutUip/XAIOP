import {
  COMPAT_FIX_DEFAULTS,
  COMPAT_FIX_IDS,
  CompatPolicy,
} from "./compat.js";
import {
  DOT_POLICY,
  encode as encodeAsync,
  encodeSync as encodeValueSync,
  formatJsonPath,
  parseJsonPath,
  XaiopEncodeError,
} from "./encode.js";
import {
  formatInjectResult,
  MERGE_CONFLICT,
  mergeJson,
  mergeToJson as mergeToJsonValue,
  mergeToXaiop as mergeToXaiopValue,
  toMergeableJson,
} from "./merge.js";
import {
  LiveXaiopParser,
  parseAsync,
  parseSync,
  XaiopFragment,
  XaiopSyntaxError,
} from "./parse.js";
import {
  DotCheckpointEngine,
  encodePhaseJson,
  encodePhaseObject,
  HISTORY_NODE_KIND,
  isStreamBusy,
  materializeSnapshot,
  ParseHistory,
  STREAM_MODES,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopStream,
  XaiopWs,
  XaiopWsConnection,
  XaiopWsHub,
} from "./stream/index.js";

export const PROTOCOL_VERSION = "0.4.0";
export const SDK_VERSION = "0.7.0";

/**
 * Standard XAIOP engine: upload full documents, fetch by runtime data id.
 *
 * Compatibility mode (`compatibilityMode`) is **off** by default.
 * When enabled without further tuning, **every** deterministic fix is on.
 * Each fix has a dedicated setter returning `boolean`:
 * `true` when applied, `false` when compatibility mode is off or the
 * argument is not a boolean.
 */
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
    /** Per-fix flags; defaults all `true`. Take effect only while compatibility mode is on. */
    this._compat = new CompatPolicy();
  }

  /** Whether compatibility mode is enabled for this engine instance. */
  get compatibilityMode() {
    return this._compatibilityMode;
  }

  /**
   * Enable or disable compatibility mode.
   * Does **not** reset per-fix flags (they stay at defaults — all on —
   * until toggled individually).
   * @param {boolean} enabled
   * @returns {this}
   */
  setCompatibilityMode(enabled) {
    this._compatibilityMode = !!enabled;
    return this;
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

export {
  COMPAT_FIX_DEFAULTS,
  COMPAT_FIX_IDS,
  CompatPolicy,
  DOT_POLICY,
  DotCheckpointEngine,
  encodeAsync as encode,
  encodePhaseJson,
  encodePhaseObject,
  encodeValueSync as encodeSync,
  formatJsonPath,
  HISTORY_NODE_KIND,
  isStreamBusy,
  materializeSnapshot,
  MERGE_CONFLICT,
  mergeJson,
  mergeToJsonValue as mergeToJson,
  mergeToXaiopValue as mergeToXaiop,
  parseAsync,
  parseJsonPath,
  parseSync,
  ParseHistory,
  LiveXaiopParser,
  STREAM_MODES,
  STREAM_STATUS,
  TRANSPORT_KIND,
  XaiopEncodeError,
  XaiopFragment,
  XaiopStream,
  XaiopSyntaxError,
  XaiopWs,
  XaiopWsConnection,
  XaiopWsHub,
};
