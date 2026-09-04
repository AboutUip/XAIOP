"use strict";

const { KIND, tokensForLine, tokenAt } = require("./classify");

const ENTER_KINDS = new Set([
  KIND.OBJECT_NAMED,
  KIND.ARRAY_NAMED,
  KIND.POP_ENTER,
]);

/**
 * Innermost-to-outermost? No: root → leaf chain of frames covering `line`.
 * @param {import("./structure").Frame[]} frames
 * @param {number} line
 * @param {import("./structure").Frame[]} [chain]
 */
function frameChain(frames, line, chain = []) {
  for (const f of frames) {
    if (line >= f.start && line <= f.end) {
      chain.push(f);
      return frameChain(f.children, line, chain);
    }
  }
  return chain;
}

function pathAtLine(frames, line) {
  return frameChain(frames, line).map((f) => {
    if (f.name === "{}") return "{}";
    if (f.name === "[]") return "[]";
    return f.name;
  });
}

function pathLabel(frames, line) {
  return pathAtLine(frames, line).join(" > ");
}

/**
 * Named paths for `=` / `@` completions (anonymous frames are skipped).
 * @param {import("./structure").Frame[]} frames
 * @param {string[]} [prefix]
 * @returns {string[]}
 */
function collectPaths(frames, prefix = []) {
  const out = [];
  for (const f of frames) {
    const named = f.name !== "{}" && f.name !== "[]";
    const seg = named
      ? f.name.endsWith("-")
        ? f.name.slice(0, -1)
        : f.name
      : null;
    const next = seg ? [...prefix, seg] : prefix;
    if (seg) out.push(next.join(">"));
    out.push(...collectPaths(f.children, next));
  }
  return unique(out);
}

function collectNames(frames) {
  return unique(
    collectPaths(frames)
      .flatMap((p) => p.split(">"))
      .filter(Boolean),
  );
}

/**
 * @param {string[]} lines
 * @param {string} name
 * @returns {Array<{ line: number, start: number, end: number, kind: string, definition: boolean }>}
 */
function occurrencesOf(lines, name) {
  if (!name) return [];
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    for (const t of tokensForLine(lines[i])) {
      if (t.role !== "path-segment") continue;
      if ((t.data?.text ?? "") !== name) continue;
      hits.push({
        line: i,
        start: t.start,
        end: t.end,
        kind: t.view.kind,
        definition: ENTER_KINDS.has(t.view.kind),
      });
    }
  }
  return hits;
}

function nameAt(lineText, column) {
  const token = tokenAt(lineText, column);
  if (token?.role === "path-segment" && token.data?.text) {
    return { name: token.data.text, start: token.start, end: token.end };
  }
  return null;
}

function isLegalLabel(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    !/[\s:@&]/.test(name)
  );
}

function selectionSpans(lines, line, column, frames) {
  const spans = [];
  const text = lines[line] ?? "";
  const token = tokenAt(text, column);
  if (token && token.end > token.start) {
    spans.push({
      startLine: line,
      start: token.start,
      endLine: line,
      end: token.end,
    });
  }
  spans.push({
    startLine: line,
    start: 0,
    endLine: line,
    end: text.length,
  });
  const chain = frameChain(frames, line);
  for (let i = chain.length - 1; i >= 0; i--) {
    const f = chain[i];
    const endText = lines[f.end] ?? "";
    spans.push({
      startLine: f.start,
      start: 0,
      endLine: f.end,
      end: endText.length,
    });
  }
  return spans;
}

function unique(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

module.exports = {
  frameChain,
  pathAtLine,
  pathLabel,
  collectPaths,
  collectNames,
  occurrencesOf,
  nameAt,
  isLegalLabel,
  selectionSpans,
  ENTER_KINDS,
};
