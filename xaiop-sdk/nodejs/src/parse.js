import { resolveCompatOptions } from "./compat.js";

/** @typedef {'object'|'array'|'fragment'} NodeKind */
/** @typedef {import("./compat.js").CompatFixId} CompatFixId */

/**
 * Deterministic XAIOP parser (protocol v0.2.1 Frozen).
 * Silent repair exists only under an explicit compatibility policy.
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
 * Root fragment: named bindings at Root **without** an entered anonymous outer object.
 * Semantic notation is `"a":{}` (not a standalone JSON document `{"a":{}}`).
 */
export class XaiopFragment {
  /** @param {Record<string, unknown>} entries */
  constructor(entries) {
    /** @type {Record<string, unknown>} */
    this.entries = entries;
  }

  get isFragment() {
    return true;
  }

  /** @returns {string} e.g. `"a":{}` or `"a":{},"b":1` */
  notation() {
    return Object.entries(this.entries)
      .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
      .join(",");
  }
}

/**
 * @param {string} source
 * @param {boolean|CompatPolicy|Partial<Record<CompatFixId, boolean>>} [compat=false]
 *   `false` = strict; `true` = all fixes on; object / CompatPolicy = fine-grained policy
 * @returns {unknown|XaiopFragment}
 */
export function parseSync(source, compat = false) {
  if (typeof source !== "string") {
    throw new TypeError("XAIOP source must be a string");
  }
  return new Parser(source, { compat: resolveCompatOptions(compat) }).parse();
}

/**
 * @param {string} source
 * @param {boolean|CompatPolicy|Partial<Record<CompatFixId, boolean>>} [compat=false]
 * @returns {Promise<unknown|XaiopFragment>}
 */
export async function parseAsync(source, compat = false) {
  return parseSync(source, compat);
}

class Parser {
  /**
   * @param {string} source
   * @param {{ compat?: Readonly<Record<CompatFixId, boolean>>|null }} [options]
   */
  constructor(source, options = {}) {
    this.lines = splitLines(source);
    this.lineNo = 0;
    /** @type {unknown} */
    this.root = undefined;
    /** @type {Record<string, unknown>|null} */
    this.fragmentEntries = null;
    /** @type {'none'|'object'|'array'|'fragment'} */
    this.docKind = "none";
    /** @type {{ kind: NodeKind, value: object|unknown[] }[]} */
    this.stack = [];
    /** @type {'init'|'active'} */
    this.phase = "init";
    /**
     * Fine-grained compatibility policy, or `null` for strict (protocol-faithful) parse.
     * @type {Readonly<Record<CompatFixId, boolean>>|null}
     */
    this.compat = options.compat ?? null;
  }

  /** @returns {boolean} */
  get compatibilityMode() {
    return this.compat != null;
  }

  /**
   * @param {CompatFixId} id
   * @returns {boolean}
   */
  fixEnabled(id) {
    return !!(this.compat && this.compat[id]);
  }

  parse() {
    if (this.fixEnabled("forcedRoot")) {
      this.ensureCompatRootOpener();
    }
    for (let i = 0; i < this.lines.length; i++) {
      this.lineNo = i + 1;
      const raw = this.lines[i];
      const line = stripBom(raw);
      if (line.length === 0) {
        throw new XaiopSyntaxError("empty line is a Content syntax error", {
          line: this.lineNo,
        });
      }
      this.handleLineCompat(line);
    }
    if (this.docKind === "fragment") {
      return new XaiopFragment({ .../** @type {Record<string, unknown>} */ (this.fragmentEntries) });
    }
    if (this.root === undefined) {
      return {};
    }
    return this.root;
  }

  /**
   * Compatibility only: outer document must be a complete anonymous object or array.
   * First line `>` or `-` → leave as declared. Otherwise inject an empty object root
   * (same effect as a missing leading `>`), so `>name` / Content do not enter fragment mode.
   */
  ensureCompatRootOpener() {
    if (this.lines.length === 0) {
      return;
    }
    const first = this.rewriteCompatLine(stripBom(this.lines[0]));
    if (first === ">" || first === "-") {
      return;
    }
    this.root = {};
    this.docKind = "object";
    this.fragmentEntries = null;
    this.stack = [{ kind: "object", value: /** @type {object} */ (this.root) }];
    this.phase = "active";
  }

  /**
   * Compatibility-only deterministic line rewrites for common LLM slips.
   * Honours `rewriteBareNameArray` and `rewriteEnterLine` independently.
   * @param {string} line
   * @returns {string}
   */
  rewriteCompatLine(line) {
    const bareArray = this.fixEnabled("rewriteBareNameArray");
    const enterLine = this.fixEnabled("rewriteEnterLine");
    if (!bareArray && !enterLine) {
      return line;
    }

    // Trailing spaces (model padding); does not touch "key: value" forced-string rule.
    let s = enterLine ? line.replace(/\s+$/, "") : line;
    if (!s) return line;

    // bare `aliases-` / `tags-` (missing `>`) → `>aliases-`
    if (bareArray && /^[A-Za-z_][A-Za-z0-9_]*-$/.test(s)) {
      return `>${s}`;
    }

    if (enterLine && s.startsWith(">") && s.length > 1) {
      const rest = s.slice(1);
      const trimmedRest = rest.trim();
      // `>  ` / `>   ` → bare `>`
      if (!trimmedRest) {
        return ">";
      }
      // `>  characters-` → `>characters-`
      if (/^[A-Za-z_][A-Za-z0-9_]*-$/.test(trimmedRest)) {
        return `>${trimmedRest}`;
      }
      // `>shard_index:1` / `> id:x` — Label names cannot contain `:`; unique intent is Content
      if (trimmedRest.includes(":")) {
        return trimmedRest;
      }
      // `>  meta` → `>meta`
      if (trimmedRest !== rest) {
        return `>${trimmedRest}`;
      }
    }

    return s;
  }

  /**
   * Strict handle, or compatibility path with optional rewrite / ignore / pop-and-retry.
   * @param {string} line
   */
  handleLineCompat(line) {
    if (!this.compat) {
      this.handleLine(line);
      return;
    }

    const effective = this.rewriteCompatLine(line);
    if (!effective) {
      throw new XaiopSyntaxError("empty line is a Content syntax error", {
        line: this.lineNo,
      });
    }

    // Root 上多余的裸 `<`（典型：`.` 后再写 `<`）无合法语义 → 忽略
    if (
      this.fixEnabled("ignoreBareLeaveAtRoot") &&
      effective === "<" &&
      this.isAtDocumentRoot()
    ) {
      return;
    }

    try {
      this.handleLine(effective);
    } catch (err) {
      if (!(err instanceof XaiopSyntaxError)) throw err;
      if (!this.fixEnabled("popAndRetry")) throw err;
      this.recoverByPopping(effective, err);
    }
  }

  /** Cursor is on the document root frame (or empty); bare `<` is illegal here. */
  isAtDocumentRoot() {
    return this.stack.length <= 1;
  }

  /**
   * Pop one level at a time and re-apply `line` until:
   * - it succeeds, or
   * - the error message changes (stop; throw the new error), or
   * - Cursor cannot pop further (throw the original error).
   * @param {string} line
   * @param {XaiopSyntaxError} originalErr
   */
  recoverByPopping(line, originalErr) {
    const originalKey = syntaxErrorKey(originalErr);
    while (this.stack.length > 1) {
      try {
        this.popOnly();
      } catch {
        throw originalErr;
      }
      try {
        this.handleLine(line);
        return;
      } catch (err2) {
        if (!(err2 instanceof XaiopSyntaxError)) throw err2;
        if (syntaxErrorKey(err2) !== originalKey) {
          throw err2;
        }
      }
    }
    throw originalErr;
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

  ensureDocumentObjectRoot() {
    if (this.phase === "init" || this.docKind === "none") {
      this.root = {};
      this.docKind = "object";
      this.fragmentEntries = null;
      this.stack = [{ kind: "object", value: /** @type {object} */ (this.root) }];
      this.phase = "active";
    }
  }

  /** Enter fragment mode: bindings at Root without anonymous outer object. */
  ensureFragmentRoot() {
    if (this.docKind === "object" || this.docKind === "array") {
      return;
    }
    if (this.docKind !== "fragment") {
      this.docKind = "fragment";
      this.fragmentEntries = {};
      this.root = undefined;
      this.stack = [
        {
          kind: "fragment",
          value: /** @type {object} */ (this.fragmentEntries),
        },
      ];
      this.phase = "active";
    }
  }

  resetToRoot() {
    if (this.docKind === "none") {
      this.stack = [];
      this.phase = "init";
      return;
    }
    if (this.docKind === "fragment") {
      this.stack = [
        {
          kind: "fragment",
          value: /** @type {object} */ (this.fragmentEntries),
        },
      ];
      this.phase = "active";
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
      throw new XaiopSyntaxError("< at Root is illegal", { line: this.lineNo });
    }
    this.stack.pop();
  }

  createEnterAnonymousObject() {
    if (this.phase === "init" || this.docKind === "none") {
      this.root = {};
      this.docKind = "object";
      this.fragmentEntries = null;
      this.stack = [{ kind: "object", value: this.root }];
      this.phase = "active";
      return;
    }
    if (this.docKind === "fragment") {
      throw new XaiopSyntaxError(
        "bare > after fragment bindings: declare anonymous root first with a leading >, or stay in fragment with >name",
        { line: this.lineNo },
      );
    }
    const cur = this.current();
    if (cur.kind === "array") {
      const obj = {};
      /** @type {unknown[]} */ (cur.value).push(obj);
      this.stack.push({ kind: "object", value: obj });
      return;
    }
    if (cur.kind === "object") {
      // Already on an object: create-or-update — re-enter current (modify), do not nest.
      return;
    }
    throw new XaiopSyntaxError(
      "bare > creates an array element or root object; unexpected Cursor kind",
      { line: this.lineNo },
    );
  }

  createEnterAnonymousArray() {
    if (this.phase === "init" || this.docKind === "none") {
      this.root = [];
      this.docKind = "array";
      this.fragmentEntries = null;
      this.stack = [{ kind: "array", value: this.root }];
      this.phase = "active";
      return;
    }
    if (this.docKind === "fragment") {
      throw new XaiopSyntaxError(
        "bare - cannot open root array after fragment mode began; start the Stream with -",
        { line: this.lineNo },
      );
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
    if (this.phase === "init" || this.docKind === "none") {
      this.ensureFragmentRoot();
    } else if (this.docKind === "fragment" && this.stack.length === 0) {
      this.ensureFragmentRoot();
    }
    const cur = this.current();
    if (cur.kind === "array") {
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
    const next = {};
    obj[name] = next;
    this.stack.push({ kind: "object", value: next });
  }

  /** @param {string} name */
  createEnterNamedArray(name) {
    if (this.phase === "init" || this.docKind === "none") {
      this.ensureFragmentRoot();
    }
    const cur = this.current();
    if (cur.kind === "array") {
      throw new XaiopSyntaxError(
        `>name- while Cursor is inside an array (use < to leave first): >${name}-`,
        { line: this.lineNo },
      );
    }
    const obj = /** @type {Record<string, unknown>} */ (cur.value);
    const next = [];
    obj[name] = next;
    this.stack.push({ kind: "array", value: next });
  }

  /**
   * @param {string} key
   * @param {unknown} value
   */
  writeContent(key, value) {
    if (this.phase === "init" || this.docKind === "none") {
      // Content at Root without `>` / `-` → fragment binding(s), not an outer `{}`
      this.ensureFragmentRoot();
    }
    const cur = this.current();
    if (cur.kind === "array") {
      if (key === "") {
        /** @type {unknown[]} */ (cur.value).push(value);
        return;
      }
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
    if (this.docKind === "none") {
      throw new XaiopSyntaxError("=path before any tree exists", {
        line: this.lineNo,
      });
    }
    if (!path) {
      throw new XaiopSyntaxError("empty = path", { line: this.lineNo });
    }
    const tree =
      this.docKind === "fragment" ? this.fragmentEntries : this.root;

    let found = fuzzyFind(tree, path.split(">").filter(Boolean));
    if (!found && this.compat) {
      const trimmed = path.trim();
      const cleared = path.replace(/\s+/g, "");

      // Retry 1: trim leading/trailing whitespace (e.g. `= siblings` → `siblings`)
      if (this.fixEnabled("locatePathTrim") && trimmed && trimmed !== path) {
        found = fuzzyFind(tree, trimmed.split(">").filter(Boolean));
      }

      // Retry 2: strip all whitespace (e.g. `=child > inner` → `child>inner`)
      if (
        !found &&
        this.fixEnabled("locatePathStripSpaces") &&
        cleared &&
        cleared !== path &&
        cleared !== trimmed
      ) {
        found = fuzzyFind(tree, cleared.split(">").filter(Boolean));
      }

      // Retry 3: `=siblings-` → locate `siblings` only if that value is an array
      // (LLM reused `>name-` create postfix on `=`). Prefer space-cleared path text.
      if (!found && this.fixEnabled("locatePathArraySuffix")) {
        const forSuffix =
          (this.fixEnabled("locatePathStripSpaces") && cleared) ||
          (this.fixEnabled("locatePathTrim") && trimmed) ||
          path;
        if (forSuffix.split(">").some((s) => s.length > 1 && s.endsWith("-"))) {
          found = fuzzyFindCompatArrayCreateSuffix(
            tree,
            forSuffix.split(">").filter(Boolean),
          );
        }
      }
    }
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
    if (this.docKind === "none") {
      throw new XaiopSyntaxError("!name before any tree exists", {
        line: this.lineNo,
      });
    }
    const matches = [];
    const tree =
      this.docKind === "fragment" ? this.fragmentEntries : this.root;
    collectNamed(tree, name, matches);
    if (matches.length === 0) {
      throw new XaiopSyntaxError(`!name no match: ${name}`, {
        line: this.lineNo,
      });
    }
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

/** Compare syntax errors ignoring the `line N:` prefix. */
function syntaxErrorKey(err) {
  return String(err.message || "").replace(/^line \d+:\s*/, "");
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
  if (rawValue === "null") return null;
  if (isIntToken(rawValue)) return Number(rawValue);
  if (isFloatToken(rawValue)) return Number(rawValue); // IEEE 754 binary64
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
 * Float token (PROT-CONTENT §5.2): not int-only; fraction and/or exponent.
 * Parsed with ECMAScript Number (= IEEE 754 binary64).
 * @param {string} s
 */
function isFloatToken(s) {
  return /^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$|^[+-]?\d+[eE][+-]?\d+$/.test(
    s,
  );
}

/**
 * @param {unknown} node
 * @param {string[]} segments
 * @param {{ kind: NodeKind, value: object|unknown[] }[]} [trail]
 * @returns {{ kind: NodeKind, value: object|unknown[] }[]|null}
 */
function fuzzyFind(node, segments, trail = []) {
  return fuzzyFindInner(node, segments, trail, false);
}

/**
 * Compat-only: a segment `name-` may match key `name` when that value is an array
 * (`>` create postfix reused on `=`). Never matches object/scalar under the stripped name.
 *
 * @param {unknown} node
 * @param {string[]} segments
 * @param {{ kind: NodeKind, value: object|unknown[] }[]} [trail]
 * @returns {{ kind: NodeKind, value: object|unknown[] }[]|null}
 */
function fuzzyFindCompatArrayCreateSuffix(node, segments, trail = []) {
  return fuzzyFindInner(node, segments, trail, true);
}

/**
 * @param {unknown} node
 * @param {string[]} segments
 * @param {{ kind: NodeKind, value: object|unknown[] }[]} trail
 * @param {boolean} allowArrayCreateSuffix
 * @returns {{ kind: NodeKind, value: object|unknown[] }[]|null}
 */
function fuzzyFindInner(node, segments, trail, allowArrayCreateSuffix) {
  if (segments.length === 0) return trail.length ? trail : null;
  if (node === null || typeof node !== "object") return null;

  if (Array.isArray(node)) {
    const frame = { kind: /** @type {NodeKind} */ ("array"), value: node };
    for (const el of node) {
      const hit = fuzzyFindInner(el, segments, [...trail, frame], allowArrayCreateSuffix);
      if (hit) return hit;
    }
    return null;
  }

  const obj = /** @type {Record<string, unknown>} */ (node);
  const frame = { kind: /** @type {NodeKind} */ ("object"), value: obj };
  const [head, ...rest] = segments;

  /** @param {string} key @param {unknown} child */
  const tryChild = (key, child) => {
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
      return fuzzyFindInner(child, rest, [...trail, frame], allowArrayCreateSuffix);
    }
    return null;
  };

  if (Object.prototype.hasOwnProperty.call(obj, head)) {
    const hit = tryChild(head, obj[head]);
    if (hit) return hit;
  } else if (
    allowArrayCreateSuffix &&
    head.length > 1 &&
    head.endsWith("-")
  ) {
    const base = head.slice(0, -1);
    if (
      Object.prototype.hasOwnProperty.call(obj, base) &&
      Array.isArray(obj[base])
    ) {
      const hit = tryChild(base, obj[base]);
      if (hit) return hit;
    }
  }

  // fuzzy: search deeper for full segment match
  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (child !== null && typeof child === "object") {
      const hit = fuzzyFindInner(
        child,
        segments,
        [...trail, frame],
        allowArrayCreateSuffix,
      );
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
