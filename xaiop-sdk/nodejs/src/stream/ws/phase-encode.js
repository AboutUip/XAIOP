/**
 * Encode one skeleton/module phase for WebSocket push.
 * Caller may discard the returned string after send.
 */

import { encodeSync } from "../../encode.js";

/**
 * @param {string} key
 * @param {unknown} value
 * @param {{
 *   final?: boolean,
 *   encodeOptions?: import("../../encode.js").EncodeOptions,
 * }} [options]
 * @returns {string}
 */
export function encodePhaseJson(key, value, options = {}) {
  if (typeof key !== "string" || key.length === 0) {
    throw new TypeError("phase key must be a non-empty string");
  }
  const encodeOptions = {
    ...(options.encodeOptions ?? {}),
    dotPolicy: "none",
  };
  let wire = encodeSync({ [key]: value }, encodeOptions);
  if (!options.final) {
    wire = ensureTrailingNewline(wire) + ".\n";
  }
  return wire;
}

/**
 * Encode a plain object as a single phase.
 * @param {Record<string, unknown>} object
 * @param {{
 *   final?: boolean,
 *   encodeOptions?: import("../../encode.js").EncodeOptions,
 * }} [options]
 * @returns {string}
 */
export function encodePhaseObject(object, options = {}) {
  if (object === null || typeof object !== "object" || Array.isArray(object)) {
    throw new TypeError("phase object must be a plain object");
  }
  const encodeOptions = {
    ...(options.encodeOptions ?? {}),
    dotPolicy: "none",
  };
  let wire = encodeSync(object, encodeOptions);
  if (!options.final) {
    wire = ensureTrailingNewline(wire) + ".\n";
  }
  return wire;
}

/** @param {string} wire */
function ensureTrailingNewline(wire) {
  return wire.endsWith("\n") ? wire : `${wire}\n`;
}
