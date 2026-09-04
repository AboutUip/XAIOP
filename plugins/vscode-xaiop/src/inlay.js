"use strict";

const { KIND, classifyLine, typeValue } = require("./classify");

/**
 * End-of-line type hints for Content / `?` predicate values.
 * Strings are omitted unless forced-string or an escape error.
 *
 * @param {string[]} lines
 * @param {number} fromLine
 * @param {number} toLine
 * @param {boolean} zh
 * @returns {Array<{ line: number, column: number, label: string, kind: string }>}
 */
function typeInlays(lines, fromLine, toLine, zh) {
  const out = [];
  const start = Math.max(0, fromLine);
  const end = Math.min(lines.length - 1, toLine);
  for (let i = start; i <= end; i++) {
    const view = classifyLine(lines[i]);
    if (view.kind !== KIND.CONTENT && view.kind !== KIND.SELECT) continue;
    let typed = null;
    if (view.kind === KIND.CONTENT) {
      typed = typeValue(view.valueText ?? "");
    } else {
      typed = selectTyped(view, lines[i]);
    }
    if (!typed) continue;
    const label = inlayLabel(typed, zh);
    if (!label) continue;
    out.push({
      line: i,
      column: lines[i].length,
      label,
      kind: typed.type === "error" ? "error" : "type",
    });
  }
  return out;
}

function selectTyped(view, raw) {
  const pred = (view.path || raw.slice(1) || "").replace(/^\*/, "");
  const colon = pred.indexOf(":");
  if (colon === -1) return null;
  return typeValue(pred.slice(colon + 1));
}

function inlayLabel(typed, zh) {
  if (!typed) return null;
  if (typed.type === "error") {
    return zh ? "转义错误" : "escape error";
  }
  if (typed.forced) return "forced-string";
  if (typed.type === "string") return null;
  return typed.type;
}

module.exports = { typeInlays, inlayLabel };
