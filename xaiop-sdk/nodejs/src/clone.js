/** StructuredClone helper (shared by stream materialize / engine snapshots). */

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function cloneJson(value) {
  if (value === undefined) return undefined;
  return structuredClone(value);
}
