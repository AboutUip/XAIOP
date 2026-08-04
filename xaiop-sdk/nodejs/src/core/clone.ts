/**
 * Deep-clone JSON-compatible values.
 * Prefers JSON round-trip (faster than structuredClone on plain trees);
 * falls back to structuredClone for non-JSON-safe values.
 */
export function cloneJson(value: unknown): unknown {
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
