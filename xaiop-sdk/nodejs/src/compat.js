/**
 * Compatibility-mode fix policy (SDK ingest only; wire protocol unchanged).
 *
 * Each key is an independent, deterministic correction. Defaults are **all on**.
 * Engine instance APIs toggle these only while `compatibilityMode` is enabled.
 */

/** @typedef {keyof typeof COMPAT_FIX_DEFAULTS} CompatFixId */

/** @type {Readonly<Record<CompatFixId, true>>} */
export const COMPAT_FIX_DEFAULTS = Object.freeze({
  forcedRoot: true,
  rewriteBareNameArray: true,
  rewriteEnterLine: true,
  ignoreBareLeaveAtRoot: true,
  popAndRetry: true,
  locatePathTrim: true,
  locatePathStripSpaces: true,
  locatePathArraySuffix: true,
});

/** Ordered list of fix ids (stable for docs / iteration). */
export const COMPAT_FIX_IDS = Object.freeze(
  /** @type {CompatFixId[]} */ (Object.keys(COMPAT_FIX_DEFAULTS)),
);

/**
 * Mutable per-engine (or per-parse) compatibility fix flags.
 * Constructing with no overrides yields every fix enabled.
 */
export class CompatPolicy {
  /**
   * @param {Partial<Record<CompatFixId, boolean>>} [overrides]
   */
  constructor(overrides = {}) {
    for (const id of COMPAT_FIX_IDS) {
      this[id] =
        overrides[id] !== undefined ? !!overrides[id] : COMPAT_FIX_DEFAULTS[id];
    }
  }

  /**
   * Reset every fix to the default (all enabled).
   * @returns {this}
   */
  resetToDefaults() {
    for (const id of COMPAT_FIX_IDS) {
      this[id] = COMPAT_FIX_DEFAULTS[id];
    }
    return this;
  }

  /**
   * Immutable snapshot for the parser (plain object).
   * @returns {Readonly<Record<CompatFixId, boolean>>}
   */
  snapshot() {
    /** @type {Record<string, boolean>} */
    const out = {};
    for (const id of COMPAT_FIX_IDS) {
      out[id] = !!this[id];
    }
    return /** @type {Readonly<Record<CompatFixId, boolean>>} */ (out);
  }

  /**
   * @param {CompatFixId} id
   * @param {boolean} enabled
   * @returns {boolean} whether the assignment was applied
   */
  set(id, enabled) {
    if (!Object.prototype.hasOwnProperty.call(COMPAT_FIX_DEFAULTS, id)) {
      return false;
    }
    if (typeof enabled !== "boolean") {
      return false;
    }
    this[id] = enabled;
    return true;
  }
}

/**
 * Normalize parse / upload second-arg style options into a policy snapshot, or `null` (strict).
 *
 * - `false` / omitted / nullish → strict (`null`)
 * - `true` → all fixes enabled
 * - `CompatPolicy` → its snapshot
 * - plain object → treated as overrides on defaults
 *
 * @param {boolean|CompatPolicy|Partial<Record<CompatFixId, boolean>>|null|undefined} arg
 * @returns {Readonly<Record<CompatFixId, boolean>>|null}
 */
export function resolveCompatOptions(arg) {
  if (!arg) return null;
  if (arg === true) return new CompatPolicy().snapshot();
  if (arg instanceof CompatPolicy) return arg.snapshot();
  if (typeof arg === "object") return new CompatPolicy(arg).snapshot();
  return null;
}
