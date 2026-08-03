/**
 * Response consumption modes (multi-select). Default: callback only.
 * Inspection APIs (status/snapshot) are always available and are not modes.
 */

/** @typedef {'callback'|'promise'|'asyncIterator'|'events'} StreamMode */

export const STREAM_MODES = Object.freeze({
  CALLBACK: /** @type {StreamMode} */ ("callback"),
  PROMISE: /** @type {StreamMode} */ ("promise"),
  ASYNC_ITERATOR: /** @type {StreamMode} */ ("asyncIterator"),
  EVENTS: /** @type {StreamMode} */ ("events"),
});

/** @type {ReadonlySet<StreamMode>} */
export const ALL_STREAM_MODES = Object.freeze(
  new Set(Object.values(STREAM_MODES)),
);

/**
 * @param {Iterable<StreamMode>|StreamMode[]|null|undefined} modes
 * @returns {Set<StreamMode>}
 */
export function normalizeModes(modes) {
  if (modes == null) {
    return new Set([STREAM_MODES.CALLBACK]);
  }
  const list = typeof modes === "string" ? [modes] : [...modes];
  /** @type {Set<StreamMode>} */
  const out = new Set();
  for (const m of list) {
    if (!ALL_STREAM_MODES.has(/** @type {StreamMode} */ (m))) {
      throw new TypeError(`unknown stream mode: ${String(m)}`);
    }
    out.add(/** @type {StreamMode} */ (m));
  }
  if (out.size === 0) {
    out.add(STREAM_MODES.CALLBACK);
  }
  return out;
}
