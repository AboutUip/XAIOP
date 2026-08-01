/** @typedef {'object'|'array'} NodeKind */

/**
 * Deterministic XAIOP parser (protocol v0.1.0 Frozen).
 * No silent repair.
 */

export class XaiopSyntaxError extends Error {
  /**
   * @param {string} message
   * @param {{ line?: number }} [meta]
   */
  constructor(message, meta = {}) {
    super(meta.line != null ? `line ${meta.line}: ${message}` : message);
    this.name = "XaiopSyntaxError";
    this.line = meta.line;
  }
}

/**
 * @param {string} source
 * @returns {unknown}
 */
export function parseSync(source) {
  if (typeof source !== "string") {
    throw new TypeError("XAIOP source must be a string");
  }
  return new Parser(source).parse();
}

/**
 * @param {string} source
 * @returns {Promise<unknown>}
 */
export async function parseAsync(source) {
  return parseSync(source);
}

class Parser {
  /** @param {string} source */
  constructor(source) {
    this.lines = splitLines(source);
    this.lineNo = 0;
    /** @type {unknown} */
    this.root = undefined;
    /** @type {{ kind: NodeKind, value: object|unknown[] }[]} */
    this.stack = [];
    /** @type {'init'|'active'} */
    this.phase = "init";
  }

  parse() {
    for (let i = 0; i < this.lines.length; i++) {
      this.lineNo = i + 1;
      const raw = this.lines[i];
      const line = stripBom(raw);
      if (line.length === 0) {
        throw new XaiopSyntaxError("empty line is a Content syntax error", {
          line: this.lineNo,
        });
      }
      this.handleLine(line);
    }
    if (this.root === undefined) {
      return {};
    }
    return this.root;
  }

  /** @param {string} line */
  handleLine(line) {
    if (line === ".") {
      this.resetToRoot();
      return;
    }

    if (line === "<") {
      this.popOnly();
      return;
    }

    if (line.startsWith("<") && line.length > 1) {
      const name = line.slice(1);
      assertName(name, this.lineNo);
      this.popOnly();
      this.createEnterNamedObject(name);
      return;
    }

    if (line.startsWith("=")) {
      this.locatePath(line.slice(1));
      return;
    }

    if (line.startsWith("!")) {
      // Broadcast: move cursor to first match for subsequent writes is underspecified;
      // treat as locate first match named node (object) for append position.
      const name = line.slice(1);
      assertName(name, this.lineNo);
      this.broadcastEnter(name);
      return;
    }

    if (line === ">") {
      this.createEnterAnonymousObject();
      return;
    }

    if (line === "-") {
      this.createEnterAnonymousArray();
      return;
    }

    if (line.startsWith(">") && line.endsWith("-") && line.length > 2) {
      const name = line.slice(1, -1);
      assertName(name, this.lineNo);
      this.createEnterNamedArray(name);
      return;
    }

    if (line.startsWith(">") && line.length > 1) {
      if (line.includes(">>")) {
        throw new XaiopSyntaxError("same-symbol stacking >> is forbidden", {
          line: this.lineNo,
        });
      }
      const name = line.slice(1);
      // In-line >a>b composition: allow split
      if (name.includes(">")) {
        const parts = name.split(">");
        for (const p of parts) {
          assertName(p, this.lineNo);
          this.createEnterNamedObject(p);
        }
        return;
      }
      assertName(name, this.lineNo);
      this.createEnterNamedObject(name);
      return;
    }

    // Content: must contain :
    const colon = line.indexOf(":");
    if (colon === -1) {
      throw new XaiopSyntaxError(
        `Bare Label or unknown line form: ${JSON.stringify(line)}`,
        { line: this.lineNo },
      );
    }
    const key = line.slice(0, colon);
    const rawValue = line.slice(colon + 1);
    const value = parseValue(rawValue);
    this.writeContent(key, value);
  }

  ensureImplicitObjectRoot() {
    if (this.phase === "init") {
      this.root = {};
      this.stack = [{ kind: "object", value: /** @type {object} */ (this.root) }];
      this.phase = "active";
    }
  }

  resetToRoot() {
    if (this.root === undefined) {
      this.stack = [];
      this.phase = "init";
      return;
    }
    this.stack = [
      {
        kind: Array.isArray(this.root) ? "array" : "object",
        value: /** @type {object|unknown[]} */ (this.root),
      },
    ];
    this.phase = "active";
  }

  current() {
    if (this.stack.length === 0) {
      throw new XaiopSyntaxError("Cursor is at Root with no container", {
        line: this.lineNo,
      });
    }
    return this.stack[this.stack.length - 1];
  }

  popOnly() {
    if (this.stack.length <= 1) {
      // Only root container (or empty) — pop would leave Root
      throw new XaiopSyntaxError("< at Root is illegal", { line: this.lineNo });
    }
    this.stack.pop();
  }

  createEnterAnonymousObject() {
    if (this.phase === "init") {
      this.root = {};
      this.stack = [{ kind: "object", value: this.root }];
      this.phase = "active";
      return;
    }
    const cur = this.current();
    const obj = {};
    if (cur.kind === "array") {
      /** @type {unknown[]} */ (cur.value).push(obj);
      this.stack.push({ kind: "object", value: obj });
      return;
    }
    // Object context: create nested anonymous object as overwrite of a transient —
    // protocol: create at cursor. Attach under "" is invalid; treat as syntax for
    // non-array unless at init (handled). Require array context for bare > after init.
    throw new XaiopSyntaxError(
      "bare > creates an array element or root object; inside an object use >name",
      { line: this.lineNo },
    );
  }

  createEnterAnonymousArray() {
    if (this.phase === "init") {
      this.root = [];
      this.stack = [{ kind: "array", value: this.root }];
      this.phase = "active";
      return;
    }
    const cur = this.current();
    const arr = [];
    if (cur.kind === "array") {
      /** @type {unknown[]} */ (cur.value).push(arr);
      this.stack.push({ kind: "array", value: arr });
      return;
    }
    throw new XaiopSyntaxError(
      "bare - opens a nested array element or root array; for a named array use >name-",
      { line: this.lineNo },
    );
  }

  /** @param {string} name */
  createEnterNamedObject(name) {
    this.ensureImplicitObjectRoot();
    const cur = this.current();
    if (cur.kind === "array") {
      // Strict: named child of array is not JSON-natural. Pop to parent object first
      // is Generator duty. Reject to avoid silent repair.
      throw new XaiopSyntaxError(
        `>name while Cursor is inside an array (use < to leave array first): >${name}`,
        { line: this.lineNo },
      );
    }
    const obj = /** @type {Record<string, unknown>} */ (cur.value);
    const existing = obj[name];
    if (
      existing !== undefined &&
      existing !== null &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      this.stack.push({ kind: "object", value: /** @type {object} */ (existing) });
      return;
    }
    // create or overwrite
    const next = {};
    obj[name] = next;
    this.stack.push({ kind: "object", value: next });
  }

  /** @param {string} name */
  createEnterNamedArray(name) {
    this.ensureImplicitObjectRoot();
    const cur = this.current();
    if (cur.kind === "array") {
      throw new XaiopSyntaxError(
        `>name- while Cursor is inside an array (use < to leave first): >${name}-`,
        { line: this.lineNo },
      );
    }
    const obj = /** @type {Record<string, unknown>} */ (cur.value);
    const next = [];
    obj[name] = next; // overwrite/discard
    this.stack.push({ kind: "array", value: next });
  }

  /**
   * @param {string} key
   * @param {unknown} value
   */
  writeContent(key, value) {
    this.ensureImplicitObjectRoot();
    const cur = this.current();
    if (cur.kind === "array") {
      if (key === "") {
        /** @type {unknown[]} */ (cur.value).push(value);
        return;
      }
      // one-line object element
      /** @type {unknown[]} */ (cur.value).push({ [key]: value });
      return;
    }
    const obj = /** @type {Record<string, unknown>} */ (cur.value);
    if (key === "") {
      throw new XaiopSyntaxError(
        ":value scalar Content is only valid at array level",
        { line: this.lineNo },
      );
    }
    obj[key] = value;
  }

  /** @param {string} path */
  locatePath(path) {
    this.ensureImplicitObjectRoot();
    if (!path) {
      throw new XaiopSyntaxError("empty = path", { line: this.lineNo });
    }
    // Fuzzy: find first object node whose key path matches segments
    const segments = path.split(">").filter(Boolean);
    const found = fuzzyFind(this.root, segments);
    if (!found) {
      throw new XaiopSyntaxError(`=path not found: ${path}`, {
        line: this.lineNo,
      });
    }
    this.stack = found;
    this.phase = "active";
  }

  /** @param {string} name */
  broadcastEnter(name) {
    this.ensureImplicitObjectRoot();
    const matches = [];
    collectNamed(this.root, name, matches);
    if (matches.length === 0) {
      throw new XaiopSyntaxError(`!name no match: ${name}`, {
        line: this.lineNo,
      });
    }
    // Enter first match for subsequent Content (broadcast append semantics simplified)
    this.stack = matches[0];
    this.phase = "active";
  }
}

/**
 * @param {string} source
 * @returns {string[]}
 */
function splitLines(source) {
  const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.length === 0) return [];
  const lines = normalized.split("\n");
  // A final newline does not create an extra empty Content record.
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/** @param {string} s */
function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * @param {string} name
 * @param {number} lineNo
 */
function assertName(name, lineNo) {
  if (!name || /\s/.test(name) || name.includes(":")) {
    throw new XaiopSyntaxError(`invalid label name: ${JSON.stringify(name)}`, {
      line: lineNo,
    });
  }
}

/**
 * @param {string} rawValue
 * @returns {unknown}
 */
function parseValue(rawValue) {
  // Forced string: one or more spaces immediately after :
  if (rawValue.length > 0 && rawValue[0] === " ") {
    return rawValue.replace(/^ +/, "");
  }
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (isIntToken(rawValue)) return Number(rawValue);
  return rawValue;
}

/** @param {string} s */
function isIntToken(s) {
  if (s.length === 0) return false;
  let i = 0;
  if (s[0] === "-" || s[0] === "+") i++;
  if (i >= s.length) return false;
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/**
 * @param {unknown} node
 * @param {string[]} segments
 * @param {{ kind: NodeKind, value: object|unknown[] }[]} [trail]
 * @returns {{ kind: NodeKind, value: object|unknown[] }[]|null}
 */
function fuzzyFind(node, segments, trail = []) {
  if (segments.length === 0) return trail.length ? trail : null;
  if (node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    const frame = { kind: /** @type {NodeKind} */ ("array"), value: node };
    for (const el of node) {
      const hit = fuzzyFind(el, segments, [...trail, frame]);
      if (hit) return hit;
    }
    return null;
  }

  const obj = /** @type {Record<string, unknown>} */ (node);
  const frame = { kind: /** @type {NodeKind} */ ("object"), value: obj };
  const [head, ...rest] = segments;

  if (Object.prototype.hasOwnProperty.call(obj, head)) {
    const child = obj[head];
    if (rest.length === 0) {
      if (child !== null && typeof child === "object") {
        const kind = Array.isArray(child) ? "array" : "object";
        return [
          ...trail,
          frame,
          { kind, value: /** @type {object|unknown[]} */ (child) },
        ];
      }
      return [...trail, frame];
    }
    if (child !== null && typeof child === "object") {
      return fuzzyFind(child, rest, [...trail, frame]);
    }
  }

  // fuzzy: search deeper for full segment match
  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (child !== null && typeof child === "object") {
      const hit = fuzzyFind(child, segments, [...trail, frame]);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * @param {unknown} node
 * @param {string} name
 * @param {{ kind: NodeKind, value: object|unknown[] }[][]} out
 * @param {{ kind: NodeKind, value: object|unknown[] }[]} [trail]
 */
function collectNamed(node, name, out, trail = []) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    const frame = { kind: /** @type {NodeKind} */ ("array"), value: node };
    for (const el of node) collectNamed(el, name, out, [...trail, frame]);
    return;
  }
  const obj = /** @type {Record<string, unknown>} */ (node);
  const frame = { kind: /** @type {NodeKind} */ ("object"), value: obj };
  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (key === name && child !== null && typeof child === "object") {
      const kind = Array.isArray(child) ? "array" : "object";
      out.push([
        ...trail,
        frame,
        { kind, value: /** @type {object|unknown[]} */ (child) },
      ]);
    }
    if (child !== null && typeof child === "object") {
      collectNamed(child, name, out, [...trail, frame]);
    }
  }
}
