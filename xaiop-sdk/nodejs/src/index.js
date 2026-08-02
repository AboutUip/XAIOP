import { parseAsync, parseSync, XaiopFragment, XaiopSyntaxError } from "./parse.js";

export const PROTOCOL_VERSION = "0.1.0";

/**
 * Standard XAIOP engine: upload full documents, fetch by runtime data id.
 *
 * Compatibility mode (`compatibilityMode`) is **off** by default.
 * When enabled: force a complete object root if the stream does not start with `>` / `-`;
 * parse errors trigger Cursor pop-and-retry recovery
 * (pop until the line succeeds, the error changes, or Root).
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
  }

  /** Whether compatibility mode is enabled for this engine instance. */
  get compatibilityMode() {
    return this._compatibilityMode;
  }

  /**
   * Enable or disable compatibility mode on this engine.
   * @param {boolean} enabled
   * @returns {this}
   */
  setCompatibilityMode(enabled) {
    this._compatibilityMode = !!enabled;
    return this;
  }

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
    const value = parseSync(source, this._compatibilityMode);
    const id = nextId(++this._seq);
    this._store.set(id, value);
    return id;
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
   * @param {boolean} [compatibilityMode=false] — omitted / false = strict (default)
   * @returns {Promise<unknown>}
   */
  static async parse(source, compatibilityMode = false) {
    return parseAsync(source, compatibilityMode);
  }

  /**
   * @param {string} source
   * @param {boolean} [compatibilityMode=false] — omitted / false = strict (default)
   * @returns {unknown}
   */
  static parseSync(source, compatibilityMode = false) {
    return parseSync(source, compatibilityMode);
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

export { parseAsync, parseSync, XaiopFragment, XaiopSyntaxError };
