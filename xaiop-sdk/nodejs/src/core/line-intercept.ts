// @ts-nocheck
/**
 * Minimal line classification + fixed view template for checkpoint interceptors.
 * Not a type system — only enough structure to read / rewrite / skip a wire line.
 */

/** Stable kind ids for the fixed LineView template. */
export const LINE_KIND = Object.freeze({
  PHASE: "phase",
  ANNOTATION: "annotation",
  POP: "pop",
  POP_ENTER: "pop_enter",
  LOCATE: "locate",
  EXACT: "exact",
  BROADCAST: "broadcast",
  DELETE: "delete",
  SELECT: "select",
  OBJECT_ANON: "object_anon",
  ARRAY_ANON: "array_anon",
  ARRAY_NAMED: "array_named",
  OBJECT_NAMED: "object_named",
  CONTENT: "content",
  UNKNOWN: "unknown",
});

/**
 * @typedef {{
 *   kind: string,
 *   raw: string,
 *   name: string|null,
 *   path: string|null,
 *   key: string|null,
 *   valueText: string|null,
 *   annotationText: string|null,
 * }} LineView
 *
 * @typedef {(ctx: { raw: string, view: LineView }) => string|null|void} LineInterceptHandler
 */

/**
 * Empty fixed template (all optional slots present).
 * @param {string} raw
 * @param {string} kind
 * @returns {LineView}
 */
export function emptyLineView(raw, kind = LINE_KIND.UNKNOWN) {
  return {
    kind,
    raw,
    name: null,
    path: null,
    key: null,
    valueText: null,
    annotationText: null,
  };
}

/**
 * Classify a logical XAIOP line (no trailing newline) into a fixed view.
 * Best-effort; never throws — unknown forms get `kind: unknown`.
 * @param {string} line
 * @returns {LineView}
 */
export function classifyLine(line) {
  const raw = typeof line === "string" ? line : String(line ?? "");
  if (raw === ".") {
    return emptyLineView(raw, LINE_KIND.PHASE);
  }
  if (raw.startsWith("#")) {
    const view = emptyLineView(raw, LINE_KIND.ANNOTATION);
    view.annotationText = raw.slice(1);
    return view;
  }
  if (raw === "<") {
    return emptyLineView(raw, LINE_KIND.POP);
  }
  if (raw.startsWith("<") && raw.length > 1) {
    const view = emptyLineView(raw, LINE_KIND.POP_ENTER);
    view.name = raw.slice(1);
    return view;
  }
  if (raw.startsWith("=")) {
    const view = emptyLineView(raw, LINE_KIND.LOCATE);
    view.path = raw.slice(1);
    return view;
  }
  if (raw.startsWith("@")) {
    const view = emptyLineView(raw, LINE_KIND.EXACT);
    view.path = raw.slice(1);
    return view;
  }
  if (raw.startsWith("!")) {
    const view = emptyLineView(raw, LINE_KIND.BROADCAST);
    view.path = raw.slice(1);
    return view;
  }
  if (raw.startsWith("&")) {
    const view = emptyLineView(raw, LINE_KIND.DELETE);
    view.path = raw.slice(1);
    return view;
  }
  if (raw.startsWith("?")) {
    const view = emptyLineView(raw, LINE_KIND.SELECT);
    view.path = raw.slice(1);
    return view;
  }
  if (raw === ">") {
    return emptyLineView(raw, LINE_KIND.OBJECT_ANON);
  }
  if (raw === "-") {
    return emptyLineView(raw, LINE_KIND.ARRAY_ANON);
  }
  if (raw.startsWith(">") && raw.endsWith("-") && raw.length > 2) {
    const view = emptyLineView(raw, LINE_KIND.ARRAY_NAMED);
    view.name = raw.slice(1, -1);
    return view;
  }
  if (raw.startsWith(">") && raw.length > 1) {
    const view = emptyLineView(raw, LINE_KIND.OBJECT_NAMED);
    view.name = raw.slice(1);
    return view;
  }
  const colon = raw.indexOf(":");
  if (colon !== -1) {
    const view = emptyLineView(raw, LINE_KIND.CONTENT);
    view.key = raw.slice(0, colon);
    view.valueText = raw.slice(colon + 1);
    return view;
  }
  return emptyLineView(raw, LINE_KIND.UNKNOWN);
}

/**
 * Run interceptors in registration order.
 * - return `string` → feed that text (next handler sees it)
 * - return `null` → skip line (short-circuit; later handlers not called)
 * - return `undefined` / omit → keep current text
 * @param {string} line
 * @param {Array<(ctx: { raw: string, view: LineView }) => string|null|void>} handlers
 * @returns {string|null}
 */
export function runLineInterceptChain(line, handlers) {
  if (!handlers || handlers.length === 0) return line;
  let current = line;
  for (let i = 0; i < handlers.length; i++) {
    const fn = handlers[i];
    if (typeof fn !== "function") continue;
    const view = classifyLine(current);
    const out = fn({ raw: current, view });
    if (out === null) return null;
    if (typeof out === "string") current = out;
  }
  return current;
}
