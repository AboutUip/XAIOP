// @ts-nocheck
/**
 * Symbol-key mode: Content / Cursor labels that would collide with line-start
 * operators are escaped on the wire with U+001F (UNIT SEPARATOR) as introducer.
 *
 * Default (symbolKeys off): keys MUST NOT begin with an operator head or U+001F.
 * On (symbolKeys true): encoder prefixes one U+001F; parser strips one layer.
 * Double-escape: a logical key that already begins with U+001F gets another.
 *
 * True `#…` custom-annotation lines are unrelated (standalone wire lines).
 */

/** Label escape introducer — U+001F UNIT SEPARATOR. */
export const LABEL_ESCAPE_INTRODUCER = "\u001f";

/**
 * First-character set that would change line class if used as a bare Content /
 * `>name` label head (plus the reserved introducer itself).
 * `.` alone is a reset line; keys like `.k` remain unescaped / allowed.
 * @param {string} key
 * @returns {boolean}
 */
export function keyNeedsSymbolEscape(key) {
  if (typeof key !== "string" || key.length === 0) return false;
  const c = key.charCodeAt(0);
  return (
    c === 0x1f || // U+001F
    c === 0x23 || // #
    c === 0x40 || // @
    c === 0x3e || // >
    c === 0x3c || // <
    c === 0x3d || // =
    c === 0x21 || // !
    c === 0x26 || // &
    c === 0x3f // ?
  );
}

/**
 * @param {string} key logical JSON key
 * @param {boolean} symbolKeys
 * @returns {string} label text for the wire (no leading Cursor op)
 */
export function encodeWireLabel(key, symbolKeys) {
  if (symbolKeys && keyNeedsSymbolEscape(key)) {
    return LABEL_ESCAPE_INTRODUCER + key;
  }
  return key;
}

/**
 * @param {string} wireLabel label as it appears after stripping Cursor ops
 * @param {boolean} symbolKeys
 * @returns {string} logical JSON key
 */
export function decodeWireLabel(wireLabel, symbolKeys) {
  if (
    symbolKeys &&
    typeof wireLabel === "string" &&
    wireLabel.length > 0 &&
    wireLabel.charCodeAt(0) === 0x1f
  ) {
    return wireLabel.slice(1);
  }
  return wireLabel;
}
