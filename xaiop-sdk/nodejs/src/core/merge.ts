// @ts-nocheck
/**
 * JSON ↔ XAIOP merge / inject (pre/post-processing — not streaming).
 *
 * Conflict policy applies only to **conflicting keys** (deep object walk).
 * Arrays and scalars are atomic at their key.
 */

import { cloneJson } from "./clone.js";
import { encodeSync } from "./encode.js";
import { parseSync, XaiopFragment } from "./parse.js";
import { materializeSnapshot } from "./materialize.js";

/** @typedef {'overwrite'|'keep'} MergeConflict */

export const MERGE_CONFLICT = Object.freeze({
  OVERWRITE: /** @type {'overwrite'} */ ("overwrite"),
  KEEP: /** @type {'keep'} */ ("keep"),
});

/**
 * @typedef {{
 *   conflict?: MergeConflict,
 *   compat?: boolean | object | false,
 * }} MergeOptions
 */

/**
 * @typedef {MergeOptions & {
 *   encodeOptions?: import("./encode.js").EncodeOptions,
 * }} MergeToXaiopOptions
 */

/**
 * @typedef {MergeOptions & {
 *   as?: 'json'|'xaiop',
 *   encodeOptions?: import("./encode.js").EncodeOptions,
 * }} InjectOptions
 */

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * @param {MergeConflict|undefined} conflict
 * @returns {MergeConflict}
 */
function normalizeConflict(conflict) {
  const c = conflict ?? MERGE_CONFLICT.OVERWRITE;
  if (c !== MERGE_CONFLICT.OVERWRITE && c !== MERGE_CONFLICT.KEEP) {
    throw new TypeError(
      `merge conflict must be "overwrite" or "keep", got ${JSON.stringify(c)}`,
    );
  }
  return c;
}

/**
 * Deep-merge `overlay` into a clone of `base`.
 * Object keys recurse; array/scalar values conflict as a whole at that key.
 *
 * @param {unknown} base
 * @param {unknown} overlay
 * @param {MergeConflict} [conflict]
 * @returns {unknown}
 */
export function mergeJson(base, overlay, conflict = MERGE_CONFLICT.OVERWRITE) {
  const policy = normalizeConflict(conflict);
  return mergeInto(cloneJson(base), cloneJson(overlay), policy);
}

/**
 * Mutating merge: write overlay keys into `target` (already owned).
 * @param {unknown} target
 * @param {unknown} overlay
 * @param {MergeConflict} conflict
 * @returns {unknown}
 */
function mergeInto(target, overlay, conflict) {
  if (!isPlainObject(target) || !isPlainObject(overlay)) {
    // Root (or nested atomic) conflict: whole value
    return conflict === MERGE_CONFLICT.OVERWRITE ? overlay : target;
  }

  for (const key of Object.keys(overlay)) {
    const ov = /** @type {any} */ (overlay)[key];
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      /** @type {any} */ (target)[key] = ov;
      continue;
    }
    const tv = /** @type {any} */ (target)[key];
    if (isPlainObject(tv) && isPlainObject(ov)) {
      mergeInto(tv, ov, conflict);
      continue;
    }
    // Conflicting key (type mismatch, array, or scalar): overwrite or keep
    if (conflict === MERGE_CONFLICT.OVERWRITE) {
      /** @type {any} */ (target)[key] = ov;
    }
    // keep → leave tv
  }
  return target;
}

/**
 * Normalize a parse / store value to a plain JSON tree for merging.
 * @param {unknown} value
 * @returns {unknown}
 */
export function toMergeableJson(value) {
  if (value instanceof XaiopFragment) {
    return materializeSnapshot(value);
  }
  return cloneJson(value);
}

/**
 * Merge base JSON with an XAIOP document → JSON.
 *
 * @param {unknown} baseJson
 * @param {string} xaiopSource
 * @param {MergeOptions} [options]
 * @returns {unknown}
 */
export function mergeToJson(baseJson, xaiopSource, options = {}) {
  if (typeof xaiopSource !== "string") {
    throw new TypeError("xaiopSource must be a string");
  }
  const overlay = materializeSnapshot(
    parseSync(xaiopSource, options.compat ?? false),
  );
  return mergeJson(baseJson, overlay, options.conflict);
}

/**
 * Merge base JSON with an XAIOP document → XAIOP wire (post-process encode).
 * Default encode uses `dotPolicy: "none"` (not a streaming phase layout).
 *
 * @param {unknown} baseJson
 * @param {string} xaiopSource
 * @param {MergeToXaiopOptions} [options]
 * @returns {string}
 */
export function mergeToXaiop(baseJson, xaiopSource, options = {}) {
  const json = mergeToJson(baseJson, xaiopSource, options);
  return encodeSync(json, options.encodeOptions ?? { dotPolicy: "none" });
}

/**
 * @param {unknown} value
 * @param {InjectOptions} [options]
 * @returns {unknown|string}
 */
export function formatInjectResult(value, options = {}) {
  const as = options.as ?? "json";
  if (as === "xaiop") {
    return encodeSync(value, options.encodeOptions ?? { dotPolicy: "none" });
  }
  if (as !== "json") {
    throw new TypeError(`inject as must be "json" or "xaiop", got ${JSON.stringify(as)}`);
  }
  return cloneJson(value);
}
