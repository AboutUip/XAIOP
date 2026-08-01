import { parseAsync, parseSync, XaiopSyntaxError } from "./parse.js";

export const PROTOCOL_VERSION = "0.1.0";

/**
 * Standard XAIOP engine: upload full documents, fetch by runtime data id.
 */
export class XaiopEngine {
  constructor() {
    /** @type {Map<string, unknown>} */
    this._store = new Map();
    this._seq = 0;
  }

  /**
   * Upload complete (non-streaming) XAIOP text. Returns a runtime data id.
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
    const value = parseSync(source);
    const id = nextId(++this._seq);
    this._store.set(id, value);
    return id;
  }

  /**
   * Resolve a previously uploaded data id to parsed JSON-compatible value.
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
    return structuredClone(this._store.get(dataId));
  }

  /**
   * Static: parse XAIOP text directly to JSON-compatible value (async).
   * @param {string} source
   * @returns {Promise<unknown>}
   */
  static async parse(source) {
    return parseAsync(source);
  }

  /**
   * Static: parse XAIOP text directly (sync).
   * @param {string} source
   * @returns {unknown}
   */
  static parseSync(source) {
    return parseSync(source);
  }

  /** @returns {boolean} */
  has(dataId) {
    return this._store.has(dataId);
  }

  /** Remove a stored document. @param {string} dataId */
  delete(dataId) {
    return this._store.delete(dataId);
  }

  /** Clear all uploaded documents. */
  clear() {
    this._store.clear();
  }
}

/**
 * @param {number} seq
 * @returns {string}
 */
function nextId(seq) {
  return `xaiop_${seq}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export { parseAsync, parseSync, XaiopSyntaxError };
