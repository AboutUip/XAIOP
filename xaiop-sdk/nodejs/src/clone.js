/**
 * Deep-clone JSON-compatible values.
 * Prefers JSON round-trip (faster than structuredClone on plain trees);
 * falls back to structuredClone for non-JSON-safe values.
 */

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function cloneJson(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return structuredClone(value);
  }
}
