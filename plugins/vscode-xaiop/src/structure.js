"use strict";

const { KIND, classifyLine } = require("./classify");

/**
 * Best-effort enter/leave structure for outline, folding, and pair jump.
 * Not a parser — Content / locate / select / delete / `#` are ignored for depth.
 * `.` resets Cursor to the document root, so unmatched nested frames end there.
 *
 * @param {string[]} lines
 * @returns {{
 *   folds: Array<{ start: number, end: number }>,
 *   symbols: Array<Frame>,
 *   pairOf: number[],
 * }}
 *
 * @typedef {{
 *   name: string,
 *   kind: "object"|"array",
 *   start: number,
 *   end: number,
 *   children: Frame[],
 * }} Frame
 */
function analyzeStructure(lines) {
  const n = lines.length;
  const pairOf = Array(n).fill(-1);
  const roots = [];
  /** @type {Frame[]} */
  const stack = [];

  function pushEnter(i, view) {
    const frame = {
      name: frameName(view),
      kind: isArrayKind(view.kind) ? "array" : "object",
      start: i,
      end: n > 0 ? n - 1 : 0,
      children: [],
    };
    const parent = stack.length ? stack[stack.length - 1].children : roots;
    parent.push(frame);
    stack.push(frame);
  }

  function popLeave(i) {
    if (!stack.length) return;
    const open = stack.pop();
    open.end = i;
    if (i > open.start) {
      pairOf[open.start] = i;
      pairOf[i] = open.start;
    }
  }

  function resetToRoot(i) {
    while (stack.length > 1) {
      const open = stack.pop();
      open.end = i > open.start ? i - 1 : open.start;
    }
  }

  for (let i = 0; i < n; i++) {
    const view = classifyLine(lines[i]);
    switch (view.kind) {
      case KIND.OBJECT_ANON:
      case KIND.ARRAY_ANON:
      case KIND.OBJECT_NAMED:
      case KIND.ARRAY_NAMED:
        pushEnter(i, view);
        break;
      case KIND.POP:
        popLeave(i);
        break;
      case KIND.POP_ENTER:
        popLeave(i);
        pushEnter(i, {
          kind: KIND.OBJECT_NAMED,
          name: view.name,
        });
        break;
      case KIND.PHASE:
        resetToRoot(i);
        break;
      default:
        break;
    }
  }

  const folds = [];
  collectFolds(roots, folds, n, pairOf);
  return { folds, symbols: roots, pairOf };
}

function collectFolds(frames, folds, lineCount, pairOf) {
  for (const f of frames) {
    if (f.end > f.start) {
      const unmatchedWhole =
        pairOf[f.start] < 0 && f.start === 0 && f.end === lineCount - 1;
      if (!unmatchedWhole) folds.push({ start: f.start, end: f.end });
    }
    collectFolds(f.children, folds, lineCount, pairOf);
  }
}

function isArrayKind(kind) {
  return kind === KIND.ARRAY_ANON || kind === KIND.ARRAY_NAMED;
}

function frameName(view) {
  if (view.kind === KIND.ARRAY_NAMED && view.name) return `${view.name}-`;
  if (view.name) return view.name;
  if (view.kind === KIND.ARRAY_ANON) return "[]";
  return "{}";
}

function symbolName(frame) {
  if (frame.name === "{}" || frame.name === "[]") {
    return `${frame.name}:${frame.start + 1}`;
  }
  return frame.name;
}

module.exports = { analyzeStructure, symbolName };
