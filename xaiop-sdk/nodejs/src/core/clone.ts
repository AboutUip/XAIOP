/**
 * Deep-clone JSON-compatible values (objects / arrays / scalars).
 * Hand-walks plain trees (hot path for Checkpoint Diff/Commit); falls back
 * to structuredClone / JSON for exotic values.
 */
export function cloneJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t !== "object") {
    try {
      return structuredClone(value);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) {
    const n = value.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = cloneJson(value[i]);
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const src = value as Record<string, unknown>;
    const keys = Object.keys(src);
    const out: Record<string, unknown> = {};
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      out[k] = cloneJson(src[k]);
    }
    return out;
  }
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
}
