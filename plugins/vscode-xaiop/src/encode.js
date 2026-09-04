"use strict";

const { encodeSync, XaiopEncodeError } = require("../vendor/xaiop-core.cjs");

/**
 * Editor defaults: one relative tree (no `.` per top-level key).
 * Override with `dotPolicy` / `style` from settings.
 *
 * @param {unknown} value
 * @param {{
 *   dotPolicy?: "none"|"perTopLevelKey"|"perNKeys",
 *   style?: "relative"|"reset",
 *   finalDot?: boolean,
 * }} [options]
 * @returns {{ ok: true, wire: string } | { ok: false, message: string, path?: string }}
 */
function encodeValue(value, options = {}) {
  const dotPolicy = options.dotPolicy || "none";
  const style = options.style || "relative";
  try {
    const wire = encodeSync(value, {
      root: "auto",
      dotPolicy,
      style: dotPolicy === "none" ? style : "reset",
      finalDot: options.finalDot === true,
      keyOrder: "insertion",
      nullPolicy: "encode",
      undefinedPolicy: "omit",
    });
    return { ok: true, wire };
  } catch (err) {
    const message = String(err?.message ?? err);
    const path = err instanceof XaiopEncodeError || err?.name === "XaiopEncodeError"
      ? err.path
      : undefined;
    return { ok: false, message, path };
  }
}

/**
 * Parse a JSON / JSONC buffer for encode.
 * @param {string} text
 * @returns {{ ok: true, value: unknown } | { ok: false, message: string }}
 */
function parseJsonInput(text) {
  const raw = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (!raw) {
    return { ok: false, message: "empty JSON" };
  }
  const attempts = [raw, stripJsonc(raw)];
  let last = "JSON.parse failed";
  for (const candidate of attempts) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch (err) {
      last = String(err?.message ?? err);
    }
  }
  return { ok: false, message: last };
}

/**
 * @param {string} text
 * @param {Parameters<typeof encodeValue>[1]} [options]
 */
function encodeJsonText(text, options) {
  const parsed = parseJsonInput(text);
  if (!parsed.ok) return parsed;
  if (parsed.value === null || typeof parsed.value !== "object") {
    return {
      ok: false,
      message:
        "JSON document root must be an object or array (XAIOP cannot encode a bare scalar as a document).",
    };
  }
  return encodeValue(parsed.value, options);
}

/**
 * Strip `//` and block comments outside of JSON strings. Trailing commas are not repaired.
 * @param {string} text
 */
function stripJsonc(text) {
  let out = "";
  let i = 0;
  let inStr = false;
  let escape = false;
  const s = String(text ?? "");
  while (i < s.length) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inStr = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      i += 2;
      while (i < s.length && s[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

module.exports = {
  encodeValue,
  encodeJsonText,
  parseJsonInput,
  stripJsonc,
};
