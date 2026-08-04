// @ts-nocheck
/**
 * Phase annotation-span (#) intercept — SDK product, not wire grammar.
 *
 * After phase lines are ready (JSON-facing capture), before Diff delivery:
 * on `#`, collect forward same-level siblings (+ subtrees) as JSON, call handlers,
 * remount returned JSON. Escapes typeCheck for handled keys (and their trees).
 */

import { encodeSync } from "./encode.js";
import { formatJsonPath } from "./encode.js";
import { LiveXaiopParser } from "./parse.js";
import { materializeSnapshot } from "./materialize.js";

/**
 * @typedef {{
 *   annotation: string,
 *   annotationRaw: string,
 *   path: string,
 *   depth: number,
 *   json: unknown,
 *   jsonText: string,
 * }} AnnotationSpanView
 *
 * @typedef {(
 *   annotation: string,
 *   view: AnnotationSpanView,
 * ) => unknown} AnnotationSpanHandler
 *
 * @typedef {{ kind: 'object'|'array', key: string|null }} SimFrame
 */

/**
 * @param {string[]} phaseLines
 * @param {AnnotationSpanHandler[]} handlers
 * @returns {{ lines: string[], escapePaths: string[] }}
 */
export function applyAnnotationSpans(phaseLines, handlers) {
  if (!handlers || handlers.length === 0) {
    return { lines: phaseLines, escapePaths: [] };
  }

  /** @type {SimFrame[]} */
  const stack = [];
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  const escapePaths = [];

  let i = 0;
  while (i < phaseLines.length) {
    const line = phaseLines[i];

    if (line === ".") {
      out.push(line);
      stack.length = 0;
      i += 1;
      continue;
    }

    if (line.startsWith("#")) {
      const depth = stack.length;
      const parentPath = pathFromStack(stack);
      const annotation = line.slice(1);
      const collected = collectForwardSiblings(phaseLines, i + 1, depth);
      const captureLines = collected.lines;
      const parentKind =
        stack.length > 0 && stack[stack.length - 1].kind === "array"
          ? "array"
          : "object";
      const json = materializeCapture(captureLines, parentKind);
      /** @type {AnnotationSpanView} */
      const view = {
        annotation,
        annotationRaw: line,
        path: parentPath,
        depth,
        json,
        jsonText: stableJsonText(json),
      };

      let result = undefined;
      for (let h = 0; h < handlers.length; h++) {
        const fn = handlers[h];
        if (typeof fn !== "function") continue;
        const ret = fn(annotation, view);
        if (ret === null) {
          result = null;
          break;
        }
        if (ret !== undefined) {
          result = ret;
          // Keep going so later handlers can see updated? Spec: first decisive
          // non-undefined wins unless null short-circuit — use last non-undefined
          // before null. Simpler: first non-undefined wins (like short-circuit).
          break;
        }
      }

      if (result === undefined) {
        // Default protocol: keep # + capture for normal feed (# ignored by parser).
        out.push(line);
        for (let k = 0; k < captureLines.length; k++) {
          applySimLine(stack, captureLines[k]);
          out.push(captureLines[k]);
        }
        addEscapeKeys(escapePaths, parentPath, json);
        // "之后的同层级" — remaining same-level after capture is empty by definition
        // (capture took all forward siblings). Keys before # stay checked.
      } else if (result === null) {
        // Drop # + capture; do not advance sim for dropped capture.
        // Stack stays at pre-# state — following lines still apply.
      } else {
        const remount = normalizeHandlerJson(result);
        const siblingLines = encodeAsSiblingLines(remount, parentKind);
        for (let k = 0; k < siblingLines.length; k++) {
          applySimLine(stack, siblingLines[k]);
          out.push(siblingLines[k]);
        }
        addEscapeKeys(escapePaths, parentPath, remount);
      }

      i = collected.end;
      continue;
    }

    applySimLine(stack, line);
    out.push(line);
    i += 1;
  }

  return { lines: out, escapePaths: uniquePaths(escapePaths) };
}

/**
 * @param {string[]} lines
 * @param {number} from
 * @param {number} baseDepth
 */
function collectForwardSiblings(lines, from, baseDepth) {
  /** @type {string[]} */
  const capture = [];
  /** @type {SimFrame[]} */
  // Synthetic stack of length baseDepth so relative pops work.
  const stack = [];
  for (let d = 0; d < baseDepth; d++) {
    stack.push({ kind: "object", key: null });
  }

  let i = from;
  while (i < lines.length) {
    const line = lines[i];
    if (line === ".") break;

    const depthBefore = stack.length;
    if (line === "<" || (line.startsWith("<") && line.length > 1)) {
      // Would leave the capture level?
      if (line === "<") {
        if (depthBefore <= baseDepth) break;
      } else {
        // <name = pop + enter: net depth unchanged if depthBefore > baseDepth;
        // if depthBefore === baseDepth, pop would leave — stop.
        if (depthBefore <= baseDepth) break;
      }
    }

    // Relocate ops end capture at this level (leave "same parent" walk).
    if (
      line.startsWith("=") ||
      line.startsWith("@") ||
      line.startsWith("!")
    ) {
      break;
    }

    capture.push(line);
    applySimLine(stack, line);
    i += 1;
  }

  return { lines: capture, end: i };
}

/** @param {string[]} captureLines @param {'object'|'array'} [parentKind] */
function materializeCapture(captureLines, parentKind = "object") {
  if (captureLines.length === 0) return parentKind === "array" ? [] : {};
  const live = new LiveXaiopParser(false);
  live.feedLine(parentKind === "array" ? "-" : ">");
  for (let i = 0; i < captureLines.length; i++) {
    live.feedLine(captureLines[i]);
  }
  const snap = materializeSnapshot(live.value());
  if (snap === null || snap === undefined) {
    return parentKind === "array" ? [] : {};
  }
  if (typeof snap !== "object") return { value: snap };
  return snap;
}

/** @param {unknown} json */
function stableJsonText(json) {
  try {
    return JSON.stringify(json);
  } catch {
    return "null";
  }
}

/** @param {unknown} result */
function normalizeHandlerJson(result) {
  if (typeof result === "string") {
    const t = result.trim();
    if (t.length === 0) return {};
    return JSON.parse(t);
  }
  if (result === null || result === undefined) return {};
  if (typeof result !== "object") {
    throw new TypeError(
      "annotation span handler must return JSON object/array, JSON text, null, or undefined",
    );
  }
  return result;
}

/**
 * Encode object/array as sibling wire lines (no outer document `>`).
 * When `parentKind` is `array`, array remounts omit the leading `-` so elements
 * land in the already-open array frame.
 * @param {unknown} value
 * @param {'object'|'array'} [parentKind]
 * @returns {string[]}
 */
export function encodeAsSiblingLines(value, parentKind = "object") {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") {
    throw new TypeError("remount value must be a plain object or array");
  }
  if (Array.isArray(value)) {
    const live = encodeSync(value, { dotPolicy: "none" });
    const lines = splitWireLines(live);
    if (parentKind === "array" && lines.length > 0 && lines[0] === "-") {
      return lines.slice(1);
    }
    return lines;
  }
  const live = encodeSync(value, { dotPolicy: "none" });
  const lines = splitWireLines(live);
  if (parentKind === "array") {
    // Object element under array: keep anonymous `>` opener from encode.
    return lines;
  }
  if (lines.length > 0 && lines[0] === ">") return lines.slice(1);
  return lines;
}

/** @param {string} text */
function splitWireLines(text) {
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = t.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/**
 * @param {SimFrame[]} stack
 * @param {string} line
 */
function applySimLine(stack, line) {
  if (line.startsWith("#")) return;
  if (line === ".") {
    stack.length = 0;
    return;
  }
  if (line === "<") {
    if (stack.length > 0) stack.pop();
    return;
  }
  if (line.startsWith("<") && line.length > 1) {
    if (stack.length > 0) stack.pop();
    stack.push({ kind: "object", key: line.slice(1) });
    return;
  }
  if (line.startsWith("=") || line.startsWith("@") || line.startsWith("!")) {
    const path = line.slice(1);
    const segs = path.split(">").filter(Boolean);
    stack.length = 0;
    for (const s of segs) stack.push({ kind: "object", key: s });
    return;
  }
  if (line.startsWith("&")) return;

  if (line === ">") {
    stack.push({ kind: "object", key: null });
    return;
  }
  if (line === "-") {
    stack.push({ kind: "array", key: null });
    return;
  }
  if (line.startsWith(">") && line.endsWith("-") && line.length > 2) {
    stack.push({ kind: "array", key: line.slice(1, -1) });
    return;
  }
  if (line.startsWith(">") && line.length > 1) {
    const name = line.slice(1);
    if (name.includes(">")) {
      for (const p of name.split(">")) {
        if (p) stack.push({ kind: "object", key: p });
      }
      return;
    }
    stack.push({ kind: "object", key: name });
    return;
  }
  // Content: no depth change
}

/** @param {SimFrame[]} stack */
function pathFromStack(stack) {
  /** @type {(string|number)[]} */
  const segs = [];
  for (let i = 0; i < stack.length; i++) {
    const fr = stack[i];
    if (fr.key != null && fr.key !== "") segs.push(fr.key);
  }
  return segs.length ? formatJsonPath(segs) : "";
}

/**
 * @param {string[]} escapePaths
 * @param {string} parentPath
 * @param {unknown} json
 */
function addEscapeKeys(escapePaths, parentPath, json) {
  if (json === null || json === undefined) return;
  if (typeof json !== "object") {
    if (parentPath) escapePaths.push(parentPath);
    return;
  }
  if (Array.isArray(json)) {
    const base = parentPath || "";
    for (let i = 0; i < json.length; i++) {
      const p = base ? `${base}[${i}]` : `[${i}]`;
      escapePaths.push(p);
    }
    if (!parentPath) escapePaths.push(""); // root array — escape all via prefix ""
    return;
  }
  for (const key of Object.keys(json)) {
    const p = parentPath ? `${parentPath}.${key}` : key;
    escapePaths.push(p);
  }
}

/** @param {string[]} paths */
function uniquePaths(paths) {
  return [...new Set(paths.filter((p) => typeof p === "string"))];
}

/**
 * Whether `path` is under any escape prefix (exact or descendant).
 * @param {string} path
 * @param {Iterable<string>} escapePaths
 */
export function pathEscapesTypeCheck(path, escapePaths) {
  if (!escapePaths) return false;
  for (const e of escapePaths) {
    if (e === "") return true; // escape everything
    if (path === e) return true;
    if (path.startsWith(e + ".") || path.startsWith(e + "[")) return true;
  }
  return false;
}
