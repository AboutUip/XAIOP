/* generated — XAIOP Node parse + encode core (protocol 0.7.0 Draft / SDK 0.16.0)
 * source: scripts/vendor-entry.js → xaiop-sdk/nodejs/src/core/{parse,encode}.ts
 * regenerate: node scripts/bundle.cjs
 */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// scripts/vendor-entry.js
var vendor_entry_exports = {};
__export(vendor_entry_exports, {
  DOT_POLICY: () => DOT_POLICY,
  LiveXaiopParser: () => LiveXaiopParser,
  XaiopEncodeError: () => XaiopEncodeError,
  XaiopFragment: () => XaiopFragment,
  XaiopSyntaxError: () => XaiopSyntaxError,
  encode: () => encode,
  encodeAsync: () => encodeAsync,
  encodeSync: () => encodeSync,
  parseAsync: () => parseAsync,
  parseSync: () => parseSync
});
module.exports = __toCommonJS(vendor_entry_exports);

// ../../xaiop-sdk/nodejs/src/core/compat.ts
var COMPAT_FIX_DEFAULTS = Object.freeze({
  forcedRoot: true,
  rewriteBareNameArray: true,
  rewriteEnterLine: true,
  ignoreBareLeaveAtRoot: true,
  popAndRetry: true,
  locatePathTrim: true,
  locatePathStripSpaces: true,
  locatePathArraySuffix: true
});
var COMPAT_FIX_IDS = Object.freeze(
  /** @type {CompatFixId[]} */
  Object.keys(COMPAT_FIX_DEFAULTS)
);
var CompatPolicy = class {
  /**
   * @param {Partial<Record<CompatFixId, boolean>>} [overrides]
   */
  constructor(overrides = {}) {
    for (const id of COMPAT_FIX_IDS) {
      this[id] = overrides[id] !== void 0 ? !!overrides[id] : COMPAT_FIX_DEFAULTS[id];
    }
  }
  /**
   * Reset every fix to the default (all enabled).
   * @returns {this}
   */
  resetToDefaults() {
    for (const id of COMPAT_FIX_IDS) {
      this[id] = COMPAT_FIX_DEFAULTS[id];
    }
    return this;
  }
  /**
   * Immutable snapshot for the parser (plain object).
   * @returns {Readonly<Record<CompatFixId, boolean>>}
   */
  snapshot() {
    const out = {};
    for (const id of COMPAT_FIX_IDS) {
      out[id] = !!this[id];
    }
    return (
      /** @type {Readonly<Record<CompatFixId, boolean>>} */
      out
    );
  }
  /**
   * @param {CompatFixId} id
   * @param {boolean} enabled
   * @returns {boolean} whether the assignment was applied
   */
  set(id, enabled) {
    if (!Object.prototype.hasOwnProperty.call(COMPAT_FIX_DEFAULTS, id)) {
      return false;
    }
    if (typeof enabled !== "boolean") {
      return false;
    }
    this[id] = enabled;
    return true;
  }
};
function resolveCompatOptions(arg) {
  if (!arg) return null;
  if (arg === true) return new CompatPolicy().snapshot();
  if (arg instanceof CompatPolicy) return arg.snapshot();
  if (typeof arg === "object") return new CompatPolicy(arg).snapshot();
  return null;
}

// ../../xaiop-sdk/nodejs/src/core/label-escape.ts
var LABEL_ESCAPE_INTRODUCER = "";
function keyNeedsSymbolEscape(key) {
  if (typeof key !== "string" || key.length === 0) return false;
  const c = key.charCodeAt(0);
  return c === 31 || // U+001F
  c === 35 || // #
  c === 64 || // @
  c === 62 || // >
  c === 60 || // <
  c === 61 || // =
  c === 33 || // !
  c === 38 || // &
  c === 63;
}
function encodeWireLabel(key, symbolKeys) {
  if (symbolKeys && keyNeedsSymbolEscape(key)) {
    return LABEL_ESCAPE_INTRODUCER + key;
  }
  return key;
}
function decodeWireLabel(wireLabel, symbolKeys) {
  if (symbolKeys && typeof wireLabel === "string" && wireLabel.length > 0 && wireLabel.charCodeAt(0) === 31) {
    return wireLabel.slice(1);
  }
  return wireLabel;
}

// ../../xaiop-sdk/nodejs/src/core/parse.ts
var XaiopSyntaxError = class extends Error {
  /**
   * @param {string} message
   * @param {{ line?: number }} [meta]
   */
  constructor(message, meta = {}) {
    super(meta.line != null ? `line ${meta.line}: ${message}` : message);
    this.name = "XaiopSyntaxError";
    this.line = meta.line;
  }
};
var XaiopFragment = class {
  /** @param {Record<string, unknown>} entries */
  constructor(entries) {
    this.entries = entries;
  }
  get isFragment() {
    return true;
  }
  /** @returns {string} e.g. `"a":{}` or `"a":{},"b":1` */
  notation() {
    return Object.entries(this.entries).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(",");
  }
};
function resolveParseOptions(second = false) {
  if (second && typeof second === "object" && !(second instanceof CompatPolicy) && ("symbolKeys" in second || "compat" in second && !("forcedRoot" in /** @type {object} */
  second))) {
    const o = (
      /** @type {ParseOptions} */
      second
    );
    return {
      compat: resolveCompatOptions(o.compat ?? false),
      symbolKeys: o.symbolKeys === true
    };
  }
  return {
    compat: resolveCompatOptions(
      /** @type {any} */
      second
    ),
    symbolKeys: false
  };
}
function parseSync(source, compatOrOptions = false) {
  if (typeof source !== "string") {
    throw new TypeError("XAIOP source must be a string");
  }
  const { compat, symbolKeys } = resolveParseOptions(compatOrOptions);
  return new Parser(source, { compat, symbolKeys }).parse();
}
async function parseAsync(source, compatOrOptions = false) {
  return parseSync(source, compatOrOptions);
}
var LiveXaiopParser = class {
  /**
   * @param {boolean|import("./compat.js").CompatPolicy|Partial<Record<CompatFixId, boolean>>|ParseOptions} [compatOrOptions=false]
   */
  constructor(compatOrOptions = false) {
    const { compat, symbolKeys } = resolveParseOptions(compatOrOptions);
    this._p = Parser.createLive(compat, symbolKeys);
  }
  /**
   * @param {string} line complete logical line (no trailing LF/CRLF)
   * @returns {this}
   */
  feedLine(line) {
    this._p.feedLine(line);
    return this;
  }
  /**
   * Bulk feed already-validated string lines (checkpoint hot path).
   * @param {string[]} lines
   * @returns {this}
   */
  feedLines(lines) {
    const p = this._p;
    for (let i = 0; i < lines.length; i++) p.feedLineFast(lines[i]);
    return this;
  }
  /**
   * Feed every logical line in `text` (same splitting as `parseSync`).
   * **No half-line buffer across calls:** a trailing segment without LF/CRLF is
   * treated as a complete line. Arbitrary network chunks belong on
   * `DotCheckpointEngine.push` / `XaiopStream`, not here.
   * @param {string} text
   * @returns {this}
   */
  feedText(text) {
    if (typeof text !== "string") {
      throw new TypeError("XAIOP live feedText requires a string");
    }
    if (!text) return this;
    for (const line of splitLines(text)) {
      this._p.feedLineFast(line);
    }
    return this;
  }
  /**
   * Current document value (live reference — further feeds mutate it).
   * Callers that expose snapshots must clone (e.g. `materializeSnapshot`).
   * @returns {unknown|XaiopFragment}
   */
  value() {
    return this._p.result();
  }
  /**
   * Structure lines that restore Cursor after `.` (named `>` / `>name-` chain).
   * Empty when already at Root container.
   * @returns {string[]}
   */
  cursorRestoreLines() {
    return this._p.cursorRestoreLines();
  }
};
var Parser = class _Parser {
  /**
   * @param {string} source
   * @param {{ compat?: Readonly<Record<CompatFixId, boolean>>|null, symbolKeys?: boolean }} [options]
   */
  constructor(source, options = {}) {
    this._source = source;
    this._lines = null;
    this.lineNo = 0;
    this._fed = 0;
    this._compatRootReady = false;
    this.root = void 0;
    this.fragmentEntries = null;
    this.docKind = "none";
    this.stack = [];
    this.broadcastStacks = null;
    this.phase = "init";
    this.compat = options.compat ?? null;
    this.symbolKeys = options.symbolKeys === true;
  }
  /**
   * @param {Readonly<Record<CompatFixId, boolean>>|null} compat
   * @param {boolean} [symbolKeys]
   * @returns {Parser}
   */
  static createLive(compat, symbolKeys = false) {
    return new _Parser("", { compat, symbolKeys });
  }
  /** @returns {string[]} */
  get lines() {
    if (this._lines === null) {
      this._lines = splitLines(this._source);
    }
    return this._lines;
  }
  /** @param {string} wireName */
  _logicalName(wireName) {
    return decodeWireLabel(wireName, this.symbolKeys);
  }
  /**
   * @param {string} line
   */
  feedLine(line) {
    if (typeof line !== "string") {
      throw new TypeError("XAIOP live feedLine requires a string");
    }
    this.feedLineFast(line);
  }
  /**
   * Hot path: `line` must already be a string (no typeof check).
   * @param {string} line
   */
  feedLineFast(line) {
    this._fed += 1;
    this.lineNo = this._fed;
    const logical = this._fed === 1 ? stripBom(line) : line;
    if (this.fixEnabled("forcedRoot") && !this._compatRootReady) {
      this._compatRootReady = true;
      this._injectCompatRootIfNeeded(logical);
    }
    if (logical.length === 0) {
      throw new XaiopSyntaxError("empty line is a Content syntax error", {
        line: this.lineNo
      });
    }
    this.handleLineCompat(logical);
  }
  /**
   * Compatibility forcedRoot for live feeds (mirrors ensureCompatRootOpener).
   * @param {string} firstLine already BOM-stripped
   */
  _injectCompatRootIfNeeded(firstLine) {
    const first = this.rewriteCompatLine(firstLine);
    if (first === ">" || first === "-") {
      return;
    }
    this.root = {};
    this.docKind = "object";
    this.fragmentEntries = null;
    this.stack = [{ kind: "object", value: (
      /** @type {object} */
      this.root
    ) }];
    this.phase = "active";
  }
  /** @returns {unknown|XaiopFragment} */
  result() {
    if (this.docKind === "fragment") {
      return new XaiopFragment(
        /** @type {Record<string, unknown>} */
        this.fragmentEntries
      );
    }
    if (this.root === void 0) {
      return {};
    }
    return this.root;
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
      this._compatRootReady = true;
    }
    if (this.compat === null) {
      return this._parseOneShot(this._source);
    }
    const lines = this.lines;
    for (let i = 0; i < lines.length; i++) {
      this.lineNo = i + 1;
      const line = i === 0 ? stripBom(lines[i]) : lines[i];
      if (line.length === 0) {
        throw new XaiopSyntaxError("empty line is a Content syntax error", {
          line: this.lineNo
        });
      }
      this.handleLineCompat(line);
    }
    return this.result();
  }
  /**
   * Feed the wire without materializing a full line array (STRICT hot path).
   * @param {string} source
   * @returns {unknown|XaiopFragment}
   */
  _parseOneShot(source) {
    const n = source.length;
    let start = 0;
    let lineNo = 0;
    while (start < n) {
      let i = start;
      while (i < n) {
        const c = source.charCodeAt(i);
        if (c === 10 || c === 13) break;
        i++;
      }
      let line = source.slice(start, i);
      let next;
      if (i < n) {
        next = source.charCodeAt(i) === 13 && i + 1 < n && source.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
      } else {
        next = n;
      }
      if (line.length === 0) {
        if (restOnlyEols(source, next)) break;
        lineNo++;
        throw new XaiopSyntaxError("empty line is a Content syntax error", {
          line: lineNo
        });
      }
      lineNo++;
      this.lineNo = lineNo;
      if (lineNo === 1) {
        line = stripBom(line);
        if (line.length === 0) {
          throw new XaiopSyntaxError("empty line is a Content syntax error", {
            line: lineNo
          });
        }
      }
      this.handleLine(line);
      if (next >= n) break;
      start = next;
    }
    return this.result();
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
    this.stack = [{ kind: "object", value: (
      /** @type {object} */
      this.root
    ) }];
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
    let s = enterLine ? line.replace(/\s+$/, "") : line;
    if (!s) return line;
    if (bareArray && /^[A-Za-z_][A-Za-z0-9_]*-$/.test(s)) {
      return `>${s}`;
    }
    if (enterLine && s.startsWith(">") && s.length > 1) {
      const rest = s.slice(1);
      const trimmedRest = rest.trim();
      if (!trimmedRest) {
        return ">";
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*-$/.test(trimmedRest)) {
        return `>${trimmedRest}`;
      }
      if (trimmedRest.includes(":")) {
        return trimmedRest;
      }
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
        line: this.lineNo
      });
    }
    if (this.fixEnabled("ignoreBareLeaveAtRoot") && effective === "<" && this.isAtDocumentRoot()) {
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
    if (line.length === 0) {
      throw new XaiopSyntaxError(
        `Bare Label or unknown line form: ${JSON.stringify(line)}`,
        { line: this.lineNo }
      );
    }
    const head = line.charCodeAt(0);
    if (!isOperatorHeadCode(head)) {
      this._handleContentLine(line);
      return;
    }
    if (head === 35) {
      return;
    }
    if (line === ".") {
      this.resetToRoot();
      return;
    }
    if (line === "<") {
      this.precheckBroadcastPop();
      if (this.broadcastStacks === null) {
        this.popOnly();
      } else {
        this.runOnCursors(() => this.popOnly());
      }
      return;
    }
    if (head === 60 && line.length > 1) {
      const name = this._logicalName(line.slice(1));
      assertName(name, this.lineNo, this.symbolKeys);
      this.precheckBroadcastPop();
      if (this.broadcastStacks === null) {
        this.popOnly();
        this.createEnterNamedObject(name);
      } else {
        this.runOnCursors(() => {
          this.popOnly();
          this.createEnterNamedObject(name);
        });
      }
      return;
    }
    if (head === 61) {
      this.requireNotBroadcast("=");
      this.locatePath(line.slice(1));
      return;
    }
    if (head === 64) {
      this.exactEnter(line.slice(1));
      return;
    }
    if (head === 33) {
      this.requireNotBroadcast("!");
      this.broadcastEnter(line.slice(1));
      return;
    }
    if (head === 63) {
      this.selectArrayElement(line.slice(1));
      return;
    }
    if (head === 38) {
      if (line.length === 1) {
        this.deleteCurrentArrayElement();
        return;
      }
      this.deleteAtPath(line.slice(1));
      return;
    }
    if (line === ">") {
      if (this.broadcastStacks === null) {
        this.createEnterAnonymousObject();
      } else {
        this.runOnCursors(() => this.createEnterAnonymousObject());
      }
      return;
    }
    if (line === "-") {
      if (this.broadcastStacks === null) {
        this.createEnterAnonymousArray();
      } else {
        this.runOnCursors(() => this.createEnterAnonymousArray());
      }
      return;
    }
    if (head === 62 && line.length > 2 && line.endsWith("-")) {
      const name = this._logicalName(line.slice(1, -1));
      assertName(name, this.lineNo, this.symbolKeys);
      if (this.broadcastStacks === null) {
        this.createEnterNamedArray(name);
      } else {
        this.runOnCursors(() => this.createEnterNamedArray(name));
      }
      return;
    }
    if (head === 62 && line.length > 1) {
      if (line.includes(">>")) {
        throw new XaiopSyntaxError("same-symbol stacking >> is forbidden", {
          line: this.lineNo
        });
      }
      const name = line.slice(1);
      if (name.includes(">")) {
        const parts = name.split(">").map((p) => this._logicalName(p));
        for (const p of parts) assertName(p, this.lineNo, this.symbolKeys);
        if (this.broadcastStacks === null) {
          for (const p of parts) this.createEnterNamedObject(p);
        } else {
          this.runOnCursors(() => {
            for (const p of parts) this.createEnterNamedObject(p);
          });
        }
        return;
      }
      const logical = this._logicalName(name);
      assertName(logical, this.lineNo, this.symbolKeys);
      if (this.broadcastStacks === null) {
        this.createEnterNamedObject(logical);
      } else {
        this.runOnCursors(() => this.createEnterNamedObject(logical));
      }
      return;
    }
    this._handleContentLine(line);
  }
  /**
   * Content `key:value` line (must contain a colon).
   * @param {string} line
   */
  _handleContentLine(line) {
    const colon = line.indexOf(":");
    if (colon === -1) {
      throw new XaiopSyntaxError(
        `Bare Label or unknown line form: ${JSON.stringify(line)}`,
        { line: this.lineNo }
      );
    }
    const key = this._logicalName(line.slice(0, colon));
    const value = parseValue(line.slice(colon + 1), this.lineNo);
    if (this.broadcastStacks === null) {
      this.writeContent(key, value);
    } else {
      this.runOnCursors(() => this.writeContent(key, value));
    }
  }
  /** @param {string} op */
  requireNotBroadcast(op) {
    if (this.broadcastStacks) {
      throw new XaiopSyntaxError(
        `${op} while broadcast mode is active (emit . to reset first)`,
        { line: this.lineNo }
      );
    }
  }
  /** Fail before any pop if any broadcast cursor cannot leave. */
  precheckBroadcastPop() {
    if (!this.broadcastStacks) return;
    for (const st of this.broadcastStacks) {
      if (st.length <= 1) {
        throw new XaiopSyntaxError("< at Root is illegal", {
          line: this.lineNo
        });
      }
    }
  }
  /**
   * Run a mutating op on the single Cursor, or fan out to every broadcast Cursor.
   * On any failure, the error propagates (all-or-nothing intent; earlier cursors may
   * already have mutated shared tree nodes).
   * @param {() => void} fn
   */
  runOnCursors(fn) {
    if (!this.broadcastStacks) {
      fn();
      return;
    }
    const stacks = this.broadcastStacks;
    for (let i = 0; i < stacks.length; i++) {
      this.stack = stacks[i].slice();
      fn();
      stacks[i] = this.stack;
    }
    this.stack = stacks[0].slice();
  }
  ensureDocumentObjectRoot() {
    if (this.phase === "init" || this.docKind === "none") {
      this.root = {};
      this.docKind = "object";
      this.fragmentEntries = null;
      this.stack = [{ kind: "object", value: (
        /** @type {object} */
        this.root
      ) }];
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
      this.root = void 0;
      this.stack = [
        {
          kind: "fragment",
          value: (
            /** @type {object} */
            this.fragmentEntries
          )
        }
      ];
      this.phase = "active";
    }
  }
  resetToRoot() {
    this.broadcastStacks = null;
    if (this.docKind === "none") {
      this.stack = [];
      this.phase = "init";
      return;
    }
    if (this.docKind === "fragment") {
      this.stack = [
        {
          kind: "fragment",
          value: (
            /** @type {object} */
            this.fragmentEntries
          )
        }
      ];
      this.phase = "active";
      return;
    }
    this.stack = [
      {
        kind: Array.isArray(this.root) ? "array" : "object",
        value: (
          /** @type {object|unknown[]} */
          this.root
        )
      }
    ];
    this.phase = "active";
  }
  current() {
    if (this.stack.length === 0) {
      throw new XaiopSyntaxError("Cursor is at Root with no container", {
        line: this.lineNo
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
        { line: this.lineNo }
      );
    }
    const cur = this.current();
    if (cur.kind === "array") {
      const obj = {};
      const arr = (
        /** @type {unknown[]} */
        cur.value
      );
      arr.push(obj);
      this.stack.push({
        kind: "object",
        value: obj,
        viaKey: null,
        viaIndex: arr.length - 1
      });
      return;
    }
    if (cur.kind === "object") {
      return;
    }
    throw new XaiopSyntaxError(
      "bare > creates an array element or root object; unexpected Cursor kind",
      { line: this.lineNo }
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
        { line: this.lineNo }
      );
    }
    const cur = this.current();
    const arr = [];
    if (cur.kind === "array") {
      const parent = (
        /** @type {unknown[]} */
        cur.value
      );
      parent.push(arr);
      this.stack.push({
        kind: "array",
        value: arr,
        viaKey: null,
        viaIndex: parent.length - 1
      });
      return;
    }
    throw new XaiopSyntaxError(
      "bare - opens a nested array element or root array; for a named array use >name-",
      { line: this.lineNo }
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
        { line: this.lineNo }
      );
    }
    if (cur.kind === "scalar") {
      throw new XaiopSyntaxError(
        `>name is not valid on a scalar array element: >${name}`,
        { line: this.lineNo }
      );
    }
    const obj = (
      /** @type {Record<string, unknown>} */
      cur.value
    );
    const existing = obj[name];
    if (existing !== void 0 && existing !== null && typeof existing === "object" && !Array.isArray(existing)) {
      this.stack.push({
        kind: "object",
        value: (
          /** @type {object} */
          existing
        ),
        viaKey: name
      });
      return;
    }
    const next = {};
    obj[name] = next;
    this.stack.push({ kind: "object", value: next, viaKey: name });
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
        { line: this.lineNo }
      );
    }
    if (cur.kind === "scalar") {
      throw new XaiopSyntaxError(
        `>name- is not valid on a scalar array element: >${name}-`,
        { line: this.lineNo }
      );
    }
    const obj = (
      /** @type {Record<string, unknown>} */
      cur.value
    );
    const existing = obj[name];
    if (Array.isArray(existing)) {
      this.stack.push({ kind: "array", value: existing, viaKey: name });
      return;
    }
    const next = [];
    obj[name] = next;
    this.stack.push({ kind: "array", value: next, viaKey: name });
  }
  /**
   * @param {string} key
   * @param {unknown} value
   */
  writeContent(key, value) {
    if (this.phase === "init" || this.docKind === "none") {
      this.ensureFragmentRoot();
    }
    const cur = this.current();
    if (cur.kind === "scalar") {
      throw new XaiopSyntaxError(
        "Content is not valid on a scalar array element (use & to delete or . to reset)",
        { line: this.lineNo }
      );
    }
    if (cur.kind === "array") {
      if (key === "") {
        cur.value.push(value);
        return;
      }
      cur.value.push({ [key]: value });
      return;
    }
    const obj = (
      /** @type {Record<string, unknown>} */
      cur.value
    );
    if (key === "") {
      throw new XaiopSyntaxError(
        ":value scalar Content is only valid at array level",
        { line: this.lineNo }
      );
    }
    obj[key] = value;
  }
  /** @param {string} path */
  locatePath(path) {
    if (this.docKind === "none") {
      throw new XaiopSyntaxError("=path before any tree exists", {
        line: this.lineNo
      });
    }
    if (!path) {
      throw new XaiopSyntaxError("empty = path", { line: this.lineNo });
    }
    const tree = this.docKind === "fragment" ? this.fragmentEntries : this.root;
    const segsOf = (p) => p.split(">").filter(Boolean).map((s) => this._logicalName(s));
    let found = fuzzyFind(tree, segsOf(path));
    if (!found && this.compat) {
      const trimmed = path.trim();
      const cleared = path.replace(/\s+/g, "");
      if (this.fixEnabled("locatePathTrim") && trimmed && trimmed !== path) {
        found = fuzzyFind(tree, segsOf(trimmed));
      }
      if (!found && this.fixEnabled("locatePathStripSpaces") && cleared && cleared !== path && cleared !== trimmed) {
        found = fuzzyFind(tree, segsOf(cleared));
      }
      if (!found && this.fixEnabled("locatePathArraySuffix")) {
        const forSuffix = this.fixEnabled("locatePathStripSpaces") && cleared || this.fixEnabled("locatePathTrim") && trimmed || path;
        if (forSuffix.split(">").some((s) => s.length > 1 && s.endsWith("-"))) {
          found = fuzzyFindCompatArrayCreateSuffix(
            tree,
            segsOf(forSuffix)
          );
        }
      }
    }
    if (!found) {
      throw new XaiopSyntaxError(`=path not found: ${path}`, {
        line: this.lineNo
      });
    }
    this.stack = found;
    this.phase = "active";
  }
  /**
   * `@path` — exact path from Root (no fuzzy search).
   * Missing segments are **created** as empty objects in the current document
   * (本相 create-or-enter). Existing object/array at a segment is entered;
   * scalar / wrong-type mid-path is overwritten with `{}`.
   * @param {string} path
   */
  exactEnter(path) {
    this.requireNotBroadcast("@");
    const segments = splitPathSegments(path, this.lineNo, "@", this.symbolKeys);
    if (this.docKind === "none") {
      this.ensureDocumentObjectRoot();
    }
    this.broadcastStacks = null;
    if (this.docKind === "fragment") {
      this.stack = [
        {
          kind: "fragment",
          value: (
            /** @type {object} */
            this.fragmentEntries
          )
        }
      ];
    } else {
      this.stack = [
        {
          kind: Array.isArray(this.root) ? "array" : "object",
          value: (
            /** @type {object|unknown[]} */
            this.root
          )
        }
      ];
    }
    this.phase = "active";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const cur = this.current();
      if (cur.kind === "array") {
        throw new XaiopSyntaxError(
          `@path cannot descend by name while Cursor is inside an array: @${path}`,
          { line: this.lineNo }
        );
      }
      const obj = (
        /** @type {Record<string, unknown>} */
        cur.value
      );
      const existing = obj[seg];
      const isLast = i === segments.length - 1;
      if (Array.isArray(existing)) {
        if (!isLast) {
          const next2 = {};
          obj[seg] = next2;
          this.stack.push({ kind: "object", value: next2, viaKey: seg });
        } else {
          this.stack.push({ kind: "array", value: existing, viaKey: seg });
        }
        continue;
      }
      if (existing !== void 0 && existing !== null && typeof existing === "object") {
        this.stack.push({
          kind: "object",
          value: (
            /** @type {object} */
            existing
          ),
          viaKey: seg
        });
        continue;
      }
      const next = {};
      obj[seg] = next;
      this.stack.push({ kind: "object", value: next, viaKey: seg });
    }
  }
  /**
   * `!path` — complete path-fragment matches over the whole tree (outer prune);
   * enter broadcast multi-cursor mode.
   * @param {string} path
   */
  broadcastEnter(path) {
    if (this.docKind === "none") {
      throw new XaiopSyntaxError("!path before any tree exists", {
        line: this.lineNo
      });
    }
    const segments = splitPathSegments(path, this.lineNo, "!", this.symbolKeys);
    const matches = [];
    const tree = this.docKind === "fragment" ? this.fragmentEntries : this.root;
    const rootKind = this.docKind === "fragment" ? (
      /** @type {NodeKind} */
      "fragment"
    ) : Array.isArray(tree) ? (
      /** @type {NodeKind} */
      "array"
    ) : (
      /** @type {NodeKind} */
      "object"
    );
    collectPathMatches(tree, rootKind, segments, matches);
    if (matches.length === 0) {
      throw new XaiopSyntaxError(`!path no match: ${path}`, {
        line: this.lineNo
      });
    }
    this.broadcastStacks = matches.map((s) => s.slice());
    this.stack = this.broadcastStacks[0].slice();
    this.phase = "active";
  }
  /**
   * {@code ?} — array-local element select. See protocol hierarchy §12.5.
   * @param {string} raw
   */
  selectArrayElement(raw) {
    this.requireNotBroadcast("?");
    if (this.phase === "init" || this.docKind === "none" || this.stack.length === 0) {
      throw new XaiopSyntaxError("? requires an array Cursor", {
        line: this.lineNo
      });
    }
    const cur = this.current();
    if (cur.kind !== "array") {
      throw new XaiopSyntaxError("? requires an array Cursor", {
        line: this.lineNo
      });
    }
    const arr = (
      /** @type {unknown[]} */
      cur.value
    );
    if (!raw) {
      throw new XaiopSyntaxError("empty ? selector", { line: this.lineNo });
    }
    let all = false;
    let rest = raw;
    if (rest.charCodeAt(0) === 42) {
      all = true;
      rest = rest.slice(1);
    }
    let indices;
    if (rest.length === 0) {
      if (!all) {
        throw new XaiopSyntaxError("empty ? selector", { line: this.lineNo });
      }
      if (arr.length === 0) {
        throw new XaiopSyntaxError("? matched no array elements", {
          line: this.lineNo
        });
      }
      indices = arr.map((_, i) => i);
    } else if (!all && isIndexSelector(rest)) {
      const i = Number(rest);
      if (i >= arr.length) {
        throw new XaiopSyntaxError(`? index out of range: ${rest}`, {
          line: this.lineNo
        });
      }
      indices = [i];
    } else {
      const colon = rest.indexOf(":");
      if (colon === -1) {
        throw new XaiopSyntaxError(
          `invalid ? selector: ${JSON.stringify(raw)}`,
          { line: this.lineNo }
        );
      }
      const key = this._logicalName(rest.slice(0, colon));
      if (!key) {
        throw new XaiopSyntaxError("empty ? predicate key", {
          line: this.lineNo
        });
      }
      assertName(key, this.lineNo, this.symbolKeys);
      const want = parseValue(rest.slice(colon + 1), this.lineNo);
      indices = [];
      for (let i = 0; i < arr.length; i++) {
        const el = arr[i];
        if (el && typeof el === "object" && !Array.isArray(el) && Object.prototype.hasOwnProperty.call(el, key) && valuesMatch(el[key], want)) {
          indices.push(i);
          if (!all) break;
        }
      }
      if (indices.length === 0) {
        throw new XaiopSyntaxError(`? matched no array elements: ${raw}`, {
          line: this.lineNo
        });
      }
    }
    const broadcast = all || indices.length > 1;
    if (broadcast) {
      this.broadcastStacks = indices.map((i) => {
        const st = this.stack.slice();
        pushArrayElementFrame(st, arr, i);
        return st;
      });
      this.stack = this.broadcastStacks[0].slice();
    } else {
      pushArrayElementFrame(this.stack, arr, indices[0]);
    }
    this.phase = "active";
  }
  /**
   * Bare {@code &}: delete the current direct array element and land on the parent array.
   */
  deleteCurrentArrayElement() {
    const stacks = this.broadcastStacks ? this.broadcastStacks : [this.stack];
    let parentArr = null;
    const indices = [];
    for (let s = 0; s < stacks.length; s++) {
      const st = stacks[s];
      if (st.length < 2) {
        throw new XaiopSyntaxError(
          "bare & deletes the current array element (Cursor is not an array element)",
          { line: this.lineNo }
        );
      }
      const el = st[st.length - 1];
      const par = st[st.length - 2];
      if (par.kind !== "array") {
        throw new XaiopSyntaxError(
          "bare & deletes the current array element (Cursor is not an array element)",
          { line: this.lineNo }
        );
      }
      const arr = (
        /** @type {unknown[]} */
        par.value
      );
      if (parentArr === null) parentArr = arr;
      else if (parentArr !== arr) {
        throw new XaiopSyntaxError(
          "bare & broadcast requires every Cursor to be an element of the same array",
          { line: this.lineNo }
        );
      }
      indices.push(arrayElementIndex(arr, el, this.lineNo));
    }
    const uniq = [...new Set(indices)].sort((a, b) => b - a);
    for (const i of uniq) {
      parentArr.splice(i, 1);
    }
    const landed = stacks[0].slice(0, -1);
    this.broadcastStacks = null;
    this.stack = landed;
  }
  /**
   * `&path` — delete deepest key. Single Cursor: absolute from Root.
   * Broadcast: relative to each Cursor. Does not move Cursor.
   * @param {string} path
   */
  deleteAtPath(path) {
    const segments = splitPathSegments(path, this.lineNo, "&", this.symbolKeys);
    if (this.broadcastStacks) {
      this.precheckBroadcastDelete(segments);
      this.runOnCursors(() => this.deleteRelative(segments));
      return;
    }
    this.deleteAbsolute(segments);
  }
  /**
   * @param {string[]} segments
   */
  precheckBroadcastDelete(segments) {
    if (!this.broadcastStacks) return;
    const stacks = this.broadcastStacks;
    for (let i = 0; i < stacks.length; i++) {
      this.stack = stacks[i].slice();
      this.precheckRelativeDelete(segments);
    }
    this.stack = stacks[0].slice();
  }
  /**
   * Absolute delete from document Root (single Cursor).
   * @param {string[]} segments
   */
  deleteAbsolute(segments) {
    if (this.docKind === "none") {
      return;
    }
    if (this.docKind === "fragment") {
      throw new XaiopSyntaxError(
        "&path requires an object document root (fragment root is not allowed)",
        { line: this.lineNo }
      );
    }
    if (this.docKind === "array" || Array.isArray(this.root)) {
      throw new XaiopSyntaxError(
        "&path requires an object document root",
        { line: this.lineNo }
      );
    }
    const root = (
      /** @type {Record<string, unknown>} */
      this.root
    );
    this.deleteFromObject(
      root,
      segments,
      /*relative*/
      false
    );
  }
  /**
   * Relative delete from current Cursor (broadcast).
   * @param {string[]} segments
   */
  deleteRelative(segments) {
    const cur = this.current();
    if (cur.kind !== "object" && cur.kind !== "fragment") {
      throw new XaiopSyntaxError(
        "&path relative delete requires an object Cursor",
        { line: this.lineNo }
      );
    }
    const obj = (
      /** @type {Record<string, unknown>} */
      cur.value
    );
    this.deleteFromObject(
      obj,
      segments,
      /*relative*/
      true
    );
  }
  /**
   * Fail before mutate if relative delete would remove a node on the Cursor chain.
   * Missing target is allowed (no-op) — only chain conflicts error.
   * @param {string[]} segments
   */
  precheckRelativeDelete(segments) {
    const cur = this.current();
    if (cur.kind !== "object" && cur.kind !== "fragment") {
      throw new XaiopSyntaxError(
        "&path relative delete requires an object Cursor",
        { line: this.lineNo }
      );
    }
    let obj = (
      /** @type {Record<string, unknown>} */
      cur.value
    );
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
        return;
      }
      const rec = (
        /** @type {Record<string, unknown>} */
        obj
      );
      if (!Object.prototype.hasOwnProperty.call(rec, seg)) {
        return;
      }
      const next = rec[seg];
      if (i === segments.length - 1) {
        this.assertDeleteNotOnCursorChain(next);
        return;
      }
      if (next === null || typeof next !== "object" || Array.isArray(next)) {
        return;
      }
      obj = /** @type {Record<string, unknown>} */
      next;
    }
  }
  /**
   * @param {Record<string, unknown>} start
   * @param {string[]} segments
   * @param {boolean} _relative
   */
  deleteFromObject(start, segments, _relative) {
    let obj = start;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
        return;
      }
      const rec2 = (
        /** @type {Record<string, unknown>} */
        obj
      );
      if (!Object.prototype.hasOwnProperty.call(rec2, seg)) {
        return;
      }
      const next = rec2[seg];
      if (next === null || typeof next !== "object" || Array.isArray(next)) {
        return;
      }
      obj = /** @type {Record<string, unknown>} */
      next;
    }
    const last = segments[segments.length - 1];
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      return;
    }
    const rec = (
      /** @type {Record<string, unknown>} */
      obj
    );
    if (!Object.prototype.hasOwnProperty.call(rec, last)) {
      return;
    }
    const target = rec[last];
    if (target === this.root && segments.length === 0) {
      throw new XaiopSyntaxError("cannot delete document root", {
        line: this.lineNo
      });
    }
    this.assertDeleteNotOnCursorChain(target);
    delete rec[last];
  }
  /**
   * Deleting a value that is the current Cursor node or any ancestor on the stack
   * is a syntax error (all modes).
   * @param {unknown} target
   */
  assertDeleteNotOnCursorChain(target) {
    if (target === null || typeof target !== "object") {
      return;
    }
    const stacks = this.broadcastStacks ? this.broadcastStacks : [this.stack];
    for (const st of stacks) {
      for (let i = 0; i < st.length; i++) {
        if (st[i].value === target) {
          throw new XaiopSyntaxError(
            "&path deletes a node on the Cursor chain",
            { line: this.lineNo }
          );
        }
      }
    }
  }
  /**
   * Lines to re-enter current Cursor after `.` (cover-mode restore).
   * Named object/array keys only; anonymous / array-element frames → error.
   * @returns {string[]}
   */
  cursorRestoreLines() {
    if (this.broadcastStacks) {
      throw new XaiopSyntaxError(
        "cursor restore is not available while broadcast mode is active",
        { line: this.lineNo }
      );
    }
    const lines = [];
    for (let i = 1; i < this.stack.length; i++) {
      const frame = this.stack[i];
      const via = frame.viaKey;
      if (via == null || via === "") {
        throw new XaiopSyntaxError(
          "cannot restore Cursor after . (anonymous or array-element frame on stack)",
          { line: this.lineNo }
        );
      }
      if (frame.kind === "array") {
        lines.push(`>${via}-`);
      } else {
        lines.push(`>${via}`);
      }
    }
    return lines;
  }
};
function splitLines(source) {
  if (source.length === 0) return [];
  const lines = [];
  let start = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c === 10) {
      lines.push(source.slice(start, i));
      start = i + 1;
    } else if (c === 13) {
      lines.push(source.slice(start, i));
      if (i + 1 < source.length && source.charCodeAt(i + 1) === 10) {
        start = i + 2;
        i++;
      } else {
        start = i + 1;
      }
    }
  }
  if (start < source.length) {
    lines.push(source.slice(start));
  }
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}
function stripBom(s) {
  return s.charCodeAt(0) === 65279 ? s.slice(1) : s;
}
function isOperatorHeadCode(c) {
  return c === 62 || // >
  c === 60 || // <
  c === 61 || // =
  c === 33 || // !
  c === 38 || // &
  c === 35 || // #
  c === 46 || // .
  c === 45 || // -
  c === 64 || // @
  c === 63;
}
function restOnlyEols(source, from) {
  for (let i = from; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c !== 10 && c !== 13) return false;
  }
  return true;
}
function syntaxErrorKey(err) {
  return String(err.message || "").replace(/^line \d+:\s*/, "");
}
function isIndexSelector(s) {
  if (!s) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  if (s.length > 1 && s.charCodeAt(0) === 48) return false;
  return true;
}
function valuesMatch(a, b) {
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  if (typeof a === "number" && typeof b === "number") return a === b;
  return Object.is(a, b);
}
function pushArrayElementFrame(stack, arr, index) {
  const el = arr[index];
  if (el !== null && typeof el === "object") {
    if (Array.isArray(el)) {
      stack.push({ kind: "array", value: el, viaKey: null, viaIndex: index });
    } else {
      stack.push({ kind: "object", value: el, viaKey: null, viaIndex: index });
    }
  } else {
    stack.push({ kind: "scalar", value: el, viaKey: null, viaIndex: index });
  }
}
function arrayElementIndex(arr, el, lineNo) {
  const vi = el.viaIndex;
  if (typeof vi === "number" && vi >= 0 && vi < arr.length && Object.is(arr[vi], el.value)) {
    return vi;
  }
  if (el.kind !== "scalar") {
    const idx = arr.indexOf(el.value);
    if (idx >= 0) return idx;
  } else if (typeof vi === "number" && vi >= 0 && vi < arr.length) {
    return vi;
  }
  throw new XaiopSyntaxError(
    "bare & deletes the current array element (element is no longer in the parent array)",
    { line: lineNo }
  );
}
function assertName(name, lineNo, symbolKeys = false) {
  if (!name || /\s/.test(name) || name.includes(":")) {
    throw new XaiopSyntaxError(`invalid label name: ${JSON.stringify(name)}`, {
      line: lineNo
    });
  }
  if (!symbolKeys && (name.includes("@") || name.includes("&"))) {
    throw new XaiopSyntaxError(`invalid label name: ${JSON.stringify(name)}`, {
      line: lineNo
    });
  }
}
function splitPathSegments(path, lineNo, op, symbolKeys = false) {
  if (!path) {
    throw new XaiopSyntaxError(`empty ${op} path`, { line: lineNo });
  }
  if (path.includes(">>") || path.startsWith(">") || path.endsWith(">") || path.split(">").some((s) => s.length === 0)) {
    throw new XaiopSyntaxError(`invalid ${op} path: ${JSON.stringify(path)}`, {
      line: lineNo
    });
  }
  const segments = path.split(">").map((s) => decodeWireLabel(s, symbolKeys));
  for (const s of segments) assertName(s, lineNo, symbolKeys);
  return segments;
}
function tryExactDescend(obj, parentFrame, trail, segments) {
  if (!Object.prototype.hasOwnProperty.call(obj, segments[0])) return null;
  const stack = [...trail, parentFrame];
  let node = (
    /** @type {unknown} */
    obj
  );
  for (const seg of segments) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) {
      return null;
    }
    const cur = (
      /** @type {Record<string, unknown>} */
      node
    );
    if (!Object.prototype.hasOwnProperty.call(cur, seg)) return null;
    const child = cur[seg];
    if (child === null || typeof child !== "object") return null;
    const kind = Array.isArray(child) ? (
      /** @type {NodeKind} */
      "array"
    ) : (
      /** @type {NodeKind} */
      "object"
    );
    stack.push({ kind, value: (
      /** @type {object|unknown[]} */
      child
    ) });
    node = child;
  }
  return stack;
}
function collectPathMatches(node, nodeKind, segments, out, trail = []) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node) || nodeKind === "array") {
    const frame2 = {
      kind: (
        /** @type {NodeKind} */
        "array"
      ),
      value: (
        /** @type {unknown[]} */
        node
      )
    };
    for (
      const el of
      /** @type {unknown[]} */
      node
    ) {
      if (el !== null && typeof el === "object") {
        const kind = Array.isArray(el) ? (
          /** @type {NodeKind} */
          "array"
        ) : (
          /** @type {NodeKind} */
          "object"
        );
        collectPathMatches(el, kind, segments, out, [...trail, frame2]);
      }
    }
    return;
  }
  const obj = (
    /** @type {Record<string, unknown>} */
    node
  );
  const frame = {
    kind: nodeKind === "fragment" ? (
      /** @type {NodeKind} */
      "fragment"
    ) : (
      /** @type {NodeKind} */
      "object"
    ),
    value: obj
  };
  const matched = tryExactDescend(obj, frame, trail, segments);
  const startKey = segments[0];
  if (matched) {
    out.push(matched);
    for (const key of Object.keys(obj)) {
      if (key === startKey) continue;
      const child = obj[key];
      if (child !== null && typeof child === "object") {
        const kind = Array.isArray(child) ? (
          /** @type {NodeKind} */
          "array"
        ) : (
          /** @type {NodeKind} */
          "object"
        );
        collectPathMatches(child, kind, segments, out, [...trail, frame]);
      }
    }
    return;
  }
  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (child !== null && typeof child === "object") {
      const kind = Array.isArray(child) ? (
        /** @type {NodeKind} */
        "array"
      ) : (
        /** @type {NodeKind} */
        "object"
      );
      collectPathMatches(child, kind, segments, out, [...trail, frame]);
    }
  }
}
function unescapeContent(payload, lineNo) {
  if (payload.indexOf("\\") === -1) return payload;
  let out = "";
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    if (c !== 92) {
      out += payload[i];
      continue;
    }
    if (i + 1 >= payload.length) {
      throw new XaiopSyntaxError("incomplete Content escape (trailing backslash)", {
        line: lineNo
      });
    }
    const n = payload.charCodeAt(i + 1);
    if (n === 110) {
      out += "\n";
      i++;
    } else if (n === 114) {
      out += "\r";
      i++;
    } else if (n === 92) {
      out += "\\";
      i++;
    } else {
      throw new XaiopSyntaxError(
        `unknown Content escape \\${payload[i + 1]}`,
        { line: lineNo }
      );
    }
  }
  return out;
}
function parseValue(rawValue, lineNo) {
  if (rawValue.length === 0) return rawValue;
  const c0 = rawValue.charCodeAt(0);
  let payload = rawValue;
  let forced = false;
  if (c0 === 32) {
    let i = 1;
    while (i < rawValue.length && rawValue.charCodeAt(i) === 32) i++;
    payload = rawValue.slice(i);
    forced = true;
  }
  payload = unescapeContent(payload, lineNo);
  if (forced) return payload;
  if (payload === "true") return true;
  if (payload === "false") return false;
  if (payload === "null") return null;
  const p0 = payload.length ? payload.charCodeAt(0) : 0;
  if (p0 === 43 || p0 === 45 || p0 === 46 || p0 >= 48 && p0 <= 57) {
    if (isIntToken(payload)) return Number(payload);
    if (isFloatToken(payload)) return Number(payload);
  }
  return payload;
}
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
function isFloatToken(s) {
  const n = s.length;
  if (n === 0) return false;
  let i = 0;
  let c = s.charCodeAt(0);
  if (c === 43 || c === 45) {
    i = 1;
    if (i >= n) return false;
    c = s.charCodeAt(i);
  }
  let sawDot = false;
  let sawDigit = false;
  if (c === 46) {
    i++;
    if (i >= n) return false;
    c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
    sawDot = true;
    while (i < n) {
      c = s.charCodeAt(i);
      if (c < 48 || c > 57) break;
      sawDigit = true;
      i++;
    }
  } else {
    if (c < 48 || c > 57) return false;
    while (i < n) {
      c = s.charCodeAt(i);
      if (c < 48 || c > 57) break;
      sawDigit = true;
      i++;
    }
    if (i < n && s.charCodeAt(i) === 46) {
      sawDot = true;
      i++;
      while (i < n) {
        c = s.charCodeAt(i);
        if (c < 48 || c > 57) break;
        i++;
      }
    }
  }
  let sawExp = false;
  if (i < n) {
    c = s.charCodeAt(i);
    if (c === 101 || c === 69) {
      sawExp = true;
      i++;
      if (i < n) {
        c = s.charCodeAt(i);
        if (c === 43 || c === 45) i++;
      }
      if (i >= n) return false;
      c = s.charCodeAt(i);
      if (c < 48 || c > 57) return false;
      while (i < n) {
        c = s.charCodeAt(i);
        if (c < 48 || c > 57) break;
        i++;
      }
    }
  }
  if (i !== n || !sawDigit) return false;
  return sawDot || sawExp;
}
function fuzzyFind(node, segments, trail = []) {
  return fuzzyFindInner(node, segments, trail, false);
}
function fuzzyFindCompatArrayCreateSuffix(node, segments, trail = []) {
  return fuzzyFindInner(node, segments, trail, true);
}
function fuzzyFindInner(node, segments, trail, allowArrayCreateSuffix) {
  if (segments.length === 0) return trail.length ? trail : null;
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    const frame2 = { kind: (
      /** @type {NodeKind} */
      "array"
    ), value: node };
    for (const el of node) {
      const hit = fuzzyFindInner(el, segments, [...trail, frame2], allowArrayCreateSuffix);
      if (hit) return hit;
    }
    return null;
  }
  const obj = (
    /** @type {Record<string, unknown>} */
    node
  );
  const frame = { kind: (
    /** @type {NodeKind} */
    "object"
  ), value: obj };
  const [head, ...rest] = segments;
  const tryChild = (key, child) => {
    if (rest.length === 0) {
      if (child !== null && typeof child === "object") {
        const kind = Array.isArray(child) ? "array" : "object";
        return [
          ...trail,
          frame,
          { kind, value: (
            /** @type {object|unknown[]} */
            child
          ) }
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
  } else if (allowArrayCreateSuffix && head.length > 1 && head.endsWith("-")) {
    const base = head.slice(0, -1);
    if (Object.prototype.hasOwnProperty.call(obj, base) && Array.isArray(obj[base])) {
      const hit = tryChild(base, obj[base]);
      if (hit) return hit;
    }
  }
  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (child !== null && typeof child === "object") {
      const hit = fuzzyFindInner(
        child,
        segments,
        [...trail, frame],
        allowArrayCreateSuffix
      );
      if (hit) return hit;
    }
  }
  return null;
}

// ../../xaiop-sdk/nodejs/src/core/encode.ts
var DOT_POLICY = Object.freeze({
  NONE: "none",
  PER_TOP_LEVEL_KEY: "perTopLevelKey",
  PER_N_KEYS: "perNKeys",
  CUSTOM: "custom"
});
var XaiopEncodeError = class extends Error {
  /**
   * @param {string} message
   * @param {{ path?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "XaiopEncodeError";
    this.path = meta.path;
  }
};
function encodeSync(value, options = {}) {
  const opt = normalizeOptions(options);
  if (value === null || value === void 0) {
    throw new XaiopEncodeError(
      `cannot encode ${value === null ? "null" : "undefined"} as a document root`
    );
  }
  if (opt.pathCuts) {
    return encodeWithPathCuts(value, opt);
  }
  const rootKind = resolveRoot(value, opt.root);
  const lines = [];
  if (rootKind === "array") {
    if (!Array.isArray(value)) {
      throw new XaiopEncodeError("root:'array' requires an array value");
    }
    lines.push("-");
    emitArrayElements(lines, value, opt, "$");
    return joinWire(lines, opt.finalDot);
  }
  if (!isPlainObject(value)) {
    throw new XaiopEncodeError(
      "object document root requires a plain object (or use an array root)",
      { path: "$" }
    );
  }
  const keys = orderedKeys(value, opt.keyOrder);
  if (keys.length === 0) {
    lines.push(">");
    return joinWire(lines, opt.finalDot);
  }
  if (opt.dotPolicy === DOT_POLICY.NONE && opt.style === "relative") {
    lines.push(">");
    for (const key of keys) {
      emitObjectEntry(
        lines,
        key,
        /** @type {any} */
        value[key],
        opt,
        `$.${key}`
      );
    }
    return joinWire(lines, opt.finalDot);
  }
  const plan = planPhases(keys, opt);
  for (let p = 0; p < plan.length; p++) {
    if (p > 0) lines.push(".");
    lines.push(">");
    for (const key of plan[p]) {
      emitObjectEntry(
        lines,
        key,
        /** @type {any} */
        value[key],
        opt,
        `$.${key}`
      );
    }
  }
  return joinWire(lines, opt.finalDot);
}
async function encodeAsync(value, options = {}) {
  return encodeSync(value, options);
}
var encode = encodeAsync;
function normalizeOptions(options) {
  const rawPolicy = options.dotPolicy ?? DOT_POLICY.PER_TOP_LEVEL_KEY;
  if (Array.isArray(rawPolicy)) {
    return normalizePathCutOptions(options, rawPolicy);
  }
  const dotPolicy = rawPolicy;
  if (dotPolicy !== DOT_POLICY.NONE && dotPolicy !== DOT_POLICY.PER_TOP_LEVEL_KEY && dotPolicy !== DOT_POLICY.PER_N_KEYS && dotPolicy !== DOT_POLICY.CUSTOM) {
    throw new XaiopEncodeError(`unknown dotPolicy: ${String(dotPolicy)}`);
  }
  let phaseEvery = options.phaseEvery ?? 1;
  if (options.phaseEvery != null) {
    if (!Number.isInteger(options.phaseEvery) || options.phaseEvery < 1) {
      throw new XaiopEncodeError("phaseEvery must be a positive integer");
    }
    phaseEvery = options.phaseEvery;
  }
  if (dotPolicy === DOT_POLICY.PER_TOP_LEVEL_KEY) phaseEvery = 1;
  if (dotPolicy === DOT_POLICY.NONE) phaseEvery = Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(phaseEvery) || phaseEvery < 1) {
    throw new XaiopEncodeError("phaseEvery must be a positive integer");
  }
  const maxPhases = options.maxPhases == null ? null : options.maxPhases;
  if (maxPhases != null && (!Number.isInteger(maxPhases) || maxPhases < 1)) {
    throw new XaiopEncodeError("maxPhases must be a positive integer when set");
  }
  if (dotPolicy === DOT_POLICY.CUSTOM && typeof options.shouldPhase !== "function") {
    throw new XaiopEncodeError("dotPolicy:'custom' requires shouldPhase(ctx)");
  }
  const style = options.style ?? "reset";
  if (style !== "reset" && style !== "relative") {
    throw new XaiopEncodeError(`unknown style: ${String(style)}`);
  }
  const root = options.root ?? "auto";
  if (root !== "auto" && root !== "object" && root !== "array") {
    throw new XaiopEncodeError(`unknown root: ${String(root)}`);
  }
  const keyOrder = options.keyOrder ?? "insertion";
  if (keyOrder !== "insertion" && keyOrder !== "sorted") {
    throw new XaiopEncodeError(`unknown keyOrder: ${String(keyOrder)}`);
  }
  const nullPolicy = options.nullPolicy ?? "encode";
  if (nullPolicy !== "encode" && nullPolicy !== "omit" && nullPolicy !== "error") {
    throw new XaiopEncodeError(`unknown nullPolicy: ${String(nullPolicy)}`);
  }
  const undefinedPolicy = options.undefinedPolicy ?? "omit";
  if (undefinedPolicy !== "omit" && undefinedPolicy !== "error") {
    throw new XaiopEncodeError(
      `unknown undefinedPolicy: ${String(undefinedPolicy)}`
    );
  }
  return {
    root,
    style,
    dotPolicy,
    phaseEvery,
    maxPhases,
    finalDot: !!options.finalDot,
    keyOrder,
    nullPolicy,
    undefinedPolicy,
    shouldPhase: options.shouldPhase,
    symbolKeys: options.symbolKeys === true,
    /** @type {null} */
    pathCuts: null
  };
}
function normalizePathCutOptions(options, paths) {
  if (options.phaseEvery != null) {
    throw new XaiopEncodeError(
      "dotPolicy path array is mutually exclusive with phaseEvery"
    );
  }
  if (options.maxPhases != null) {
    throw new XaiopEncodeError(
      "dotPolicy path array is mutually exclusive with maxPhases"
    );
  }
  if (options.shouldPhase != null) {
    throw new XaiopEncodeError(
      "dotPolicy path array is mutually exclusive with shouldPhase"
    );
  }
  const style = options.style ?? "reset";
  if (style !== "reset") {
    throw new XaiopEncodeError(
      "dotPolicy path array requires style:'reset' (phase `.` resets Cursor)"
    );
  }
  const root = options.root ?? "auto";
  if (root !== "auto" && root !== "object" && root !== "array") {
    throw new XaiopEncodeError(`unknown root: ${String(root)}`);
  }
  const keyOrder = options.keyOrder ?? "insertion";
  if (keyOrder !== "insertion" && keyOrder !== "sorted") {
    throw new XaiopEncodeError(`unknown keyOrder: ${String(keyOrder)}`);
  }
  const nullPolicy = options.nullPolicy ?? "encode";
  if (nullPolicy !== "encode" && nullPolicy !== "omit" && nullPolicy !== "error") {
    throw new XaiopEncodeError(`unknown nullPolicy: ${String(nullPolicy)}`);
  }
  const undefinedPolicy = options.undefinedPolicy ?? "omit";
  if (undefinedPolicy !== "omit" && undefinedPolicy !== "error") {
    throw new XaiopEncodeError(
      `unknown undefinedPolicy: ${String(undefinedPolicy)}`
    );
  }
  const normalized = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (typeof p !== "string" || p.length === 0) {
      throw new XaiopEncodeError(
        `dotPolicy path array entry ${i} must be a non-empty string`
      );
    }
    const segs = parseJsonPath(p);
    for (let s = 0; s < segs.length; s++) {
      if (typeof segs[s] === "number") {
        for (let t = s + 1; t < segs.length; t++) {
          if (typeof segs[t] !== "number") {
            throw new XaiopEncodeError(
              `dotPolicy path cannot cut inside an array element object (index must be final): ${JSON.stringify(p)}`,
              { path: p }
            );
          }
        }
        break;
      }
    }
    const canon = formatJsonPath(segs);
    if (seen.has(canon)) {
      throw new XaiopEncodeError(`duplicate dotPolicy path: ${JSON.stringify(p)}`);
    }
    seen.add(canon);
    normalized.push(canon);
  }
  return {
    root,
    style: (
      /** @type {'reset'} */
      "reset"
    ),
    /** sentinel — path mode */
    dotPolicy: (
      /** @type {any} */
      "__paths__"
    ),
    phaseEvery: Number.MAX_SAFE_INTEGER,
    maxPhases: null,
    finalDot: !!options.finalDot,
    keyOrder,
    nullPolicy,
    undefinedPolicy,
    shouldPhase: void 0,
    symbolKeys: options.symbolKeys === true,
    pathCuts: normalized
  };
}
function encodeWithPathCuts(value, opt) {
  const rootKind = resolveRoot(value, opt.root);
  const cutSet = new Set(opt.pathCuts);
  for (const p of opt.pathCuts) {
    assertPathExists(value, rootKind, parseJsonPath(p), p);
  }
  const lines = [];
  let openStack = [];
  let afterDot = false;
  function reopenTo(targetAncestors, rootKindLocal, opts = {}) {
    const arrayTail = opts.arrayTail === true;
    if (afterDot || lines.length === 0) {
      if (rootKindLocal === "array") lines.push("-");
      else lines.push(">");
      afterDot = false;
      openStack = [];
    }
    let i = 0;
    while (i < openStack.length && i < targetAncestors.length && openStack[i] === targetAncestors[i]) {
      i++;
    }
    while (openStack.length > i) {
      lines.push("<");
      openStack.pop();
    }
    for (let j = i; j < targetAncestors.length; j++) {
      const seg = targetAncestors[j];
      if (typeof seg === "number") {
        openStack.push(seg);
        continue;
      }
      const next = targetAncestors[j + 1];
      const isArrayEnter = typeof next === "number" || arrayTail && j === targetAncestors.length - 1;
      lines.push(isArrayEnter ? `>${encodeWireLabel(String(seg), opt.symbolKeys)}-` : `>${encodeWireLabel(String(seg), opt.symbolKeys)}`);
      openStack.push(seg);
    }
  }
  function maybeCut(segs) {
    const canon = formatJsonPath(segs);
    if (!cutSet.has(canon)) return;
    cutSet.delete(canon);
    lines.push(".");
    afterDot = true;
    openStack = [];
  }
  if (rootKind === "array") {
    if (!Array.isArray(value)) {
      throw new XaiopEncodeError("root:'array' requires an array value");
    }
    emitArrayPath(value, [], rootKind);
  } else {
    if (!isPlainObject(value)) {
      throw new XaiopEncodeError(
        "object document root requires a plain object (or use an array root)",
        { path: "$" }
      );
    }
    const keys = orderedKeys(value, opt.keyOrder);
    if (keys.length === 0) {
      lines.push(">");
      return joinWire(lines, opt.finalDot);
    }
    for (const key of keys) {
      emitObjectPath(
        key,
        /** @type {any} */
        value[key],
        [key],
        rootKind
      );
    }
  }
  if (cutSet.size > 0) {
    const left = [...cutSet].join(", ");
    throw new XaiopEncodeError(
      `dotPolicy paths not reached during encode: ${left}`
    );
  }
  return joinWire(lines, opt.finalDot);
  function emitObjectPath(key, val, segs, rootKindLocal) {
    assertKey(key, formatJsonPath(segs), opt.symbolKeys);
    const wk = encodeWireLabel(key, opt.symbolKeys);
    if (val === void 0) {
      if (opt.undefinedPolicy === "error") {
        throw new XaiopEncodeError("undefined value not allowed", {
          path: formatJsonPath(segs)
        });
      }
      return;
    }
    const parentSegs = segs.slice(0, -1);
    reopenTo(parentSegs, rootKindLocal);
    if (val === null) {
      if (opt.nullPolicy === "error") {
        throw new XaiopEncodeError("null value not allowed", {
          path: formatJsonPath(segs)
        });
      }
      if (opt.nullPolicy === "omit") {
        return;
      }
      lines.push(formatContent(wk, null, formatJsonPath(segs)));
      maybeCut(segs);
      return;
    }
    if (Array.isArray(val)) {
      lines.push(`>${wk}-`);
      openStack.push(key);
      emitArrayPath(val, segs, rootKindLocal);
      if (!afterDot && openStack.length && openStack[openStack.length - 1] === key) {
        lines.push("<");
        openStack.pop();
      }
      maybeCut(segs);
      return;
    }
    if (isPlainObject(val)) {
      lines.push(`>${wk}`);
      openStack.push(key);
      const keys = orderedKeys(val, opt.keyOrder);
      for (const k of keys) {
        emitObjectPath(
          k,
          /** @type {any} */
          val[k],
          [...segs, k],
          rootKindLocal
        );
      }
      if (!afterDot && openStack.length && openStack[openStack.length - 1] === key) {
        lines.push("<");
        openStack.pop();
      }
      maybeCut(segs);
      return;
    }
    lines.push(formatContent(wk, val, formatJsonPath(segs)));
    maybeCut(segs);
  }
  function emitArrayPath(arr, arrSegs, rootKindLocal) {
    if (arrSegs.length === 0) {
      reopenTo([], rootKindLocal);
    }
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      const elSegs = [...arrSegs, i];
      const elPath = formatJsonPath(elSegs);
      if (el === void 0) {
        throw new XaiopEncodeError(
          "sparse arrays (undefined elements) are not encodable",
          { path: elPath }
        );
      }
      reopenTo(arrSegs, rootKindLocal, { arrayTail: arrSegs.length > 0 });
      openStack.push(i);
      if (el === null) {
        if (opt.nullPolicy === "error") {
          throw new XaiopEncodeError("null array element not allowed", {
            path: elPath
          });
        }
        lines.push(formatScalarElement(null, elPath));
        openStack.pop();
        maybeCut(elSegs);
        continue;
      }
      if (Array.isArray(el)) {
        lines.push("-");
        emitArrayPathNested(el, elSegs, rootKindLocal);
        if (!afterDot) {
          lines.push("<");
        }
        if (!afterDot && openStack[openStack.length - 1] === i) openStack.pop();
        maybeCut(elSegs);
        continue;
      }
      if (isPlainObject(el)) {
        lines.push(">");
        const keys = orderedKeys(el, opt.keyOrder);
        for (const k of keys) {
          emitObjectPath(
            k,
            /** @type {any} */
            el[k],
            [...elSegs, k],
            rootKindLocal
          );
        }
        if (!afterDot) {
          lines.push("<");
        }
        if (!afterDot && openStack[openStack.length - 1] === i) openStack.pop();
        maybeCut(elSegs);
        continue;
      }
      lines.push(formatScalarElement(el, elPath));
      openStack.pop();
      maybeCut(elSegs);
    }
  }
  function emitArrayPathNested(arr, arrSegs, rootKindLocal) {
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      const elSegs = [...arrSegs, i];
      const elPath = formatJsonPath(elSegs);
      if (el === void 0) {
        throw new XaiopEncodeError(
          "sparse arrays (undefined elements) are not encodable",
          { path: elPath }
        );
      }
      openStack.push(i);
      if (el === null) {
        if (opt.nullPolicy === "error") {
          throw new XaiopEncodeError("null array element not allowed", {
            path: elPath
          });
        }
        lines.push(formatScalarElement(null, elPath));
        openStack.pop();
        maybeCut(elSegs);
        continue;
      }
      if (Array.isArray(el)) {
        lines.push("-");
        emitArrayPathNested(el, elSegs, rootKindLocal);
        if (!afterDot) lines.push("<");
        if (!afterDot && openStack[openStack.length - 1] === i) openStack.pop();
        maybeCut(elSegs);
        continue;
      }
      if (isPlainObject(el)) {
        lines.push(">");
        const keys = orderedKeys(el, opt.keyOrder);
        for (const k of keys) {
          emitObjectPath(
            k,
            /** @type {any} */
            el[k],
            [...elSegs, k],
            rootKindLocal
          );
        }
        if (!afterDot) lines.push("<");
        if (!afterDot && openStack[openStack.length - 1] === i) openStack.pop();
        maybeCut(elSegs);
        continue;
      }
      lines.push(formatScalarElement(el, elPath));
      openStack.pop();
      maybeCut(elSegs);
    }
  }
}
function parseJsonPath(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new XaiopEncodeError("JSON path must be a non-empty string");
  }
  const segs = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === ".") {
      if (i === 0 || i === path.length - 1) {
        throw new XaiopEncodeError(`invalid JSON path: ${JSON.stringify(path)}`);
      }
      i++;
      if (i >= path.length || path[i] === "." || path[i] === "[") {
        throw new XaiopEncodeError(`invalid JSON path: ${JSON.stringify(path)}`);
      }
      continue;
    }
    if (path[i] === "[") {
      const end = path.indexOf("]", i);
      if (end < 0) {
        throw new XaiopEncodeError(`invalid JSON path: ${JSON.stringify(path)}`);
      }
      const raw = path.slice(i + 1, end);
      if (!/^\d+$/.test(raw)) {
        throw new XaiopEncodeError(
          `invalid array index in path: ${JSON.stringify(path)}`
        );
      }
      if (segs.length === 0) {
        throw new XaiopEncodeError(
          `JSON path cannot start with an index: ${JSON.stringify(path)}`
        );
      }
      segs.push(Number(raw));
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
    if (j === i) {
      throw new XaiopEncodeError(`invalid JSON path: ${JSON.stringify(path)}`);
    }
    const name = path.slice(i, j);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      if (/\s|:|[><=!]/.test(name) || name.endsWith("-") || name.length === 0) {
        throw new XaiopEncodeError(
          `invalid path segment: ${JSON.stringify(name)}`
        );
      }
    }
    segs.push(name);
    i = j;
  }
  if (segs.length === 0) {
    throw new XaiopEncodeError(`invalid JSON path: ${JSON.stringify(path)}`);
  }
  return segs;
}
function formatJsonPath(segs) {
  let out = "";
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (typeof s === "number") {
      out += `[${s}]`;
    } else {
      if (i > 0) out += ".";
      out += s;
    }
  }
  return out;
}
function assertPathExists(root, rootKind, segs, pathStr) {
  let cur = root;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (typeof seg === "number") {
      if (!Array.isArray(cur)) {
        throw new XaiopEncodeError(
          `dotPolicy path not found (not an array): ${JSON.stringify(pathStr)}`,
          { path: pathStr }
        );
      }
      if (seg < 0 || seg >= cur.length) {
        throw new XaiopEncodeError(
          `dotPolicy path not found: ${JSON.stringify(pathStr)}`,
          { path: pathStr }
        );
      }
      cur = cur[seg];
    } else {
      if (cur === null || typeof cur !== "object" || Array.isArray(cur)) {
        throw new XaiopEncodeError(
          `dotPolicy path not found: ${JSON.stringify(pathStr)}`,
          { path: pathStr }
        );
      }
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) {
        throw new XaiopEncodeError(
          `dotPolicy path not found: ${JSON.stringify(pathStr)}`,
          { path: pathStr }
        );
      }
      cur = /** @type {any} */
      cur[seg];
    }
  }
  void rootKind;
}
function resolveRoot(value, root) {
  if (root === "object") return "object";
  if (root === "array") return "array";
  if (Array.isArray(value)) return "array";
  return "object";
}
function orderedKeys(obj, keyOrder) {
  const keys = Object.keys(obj);
  if (keyOrder === "sorted") keys.sort();
  return keys;
}
function planPhases(keys, opt) {
  if (keys.length === 0) return [];
  if (opt.dotPolicy === DOT_POLICY.NONE) {
    return [keys.slice()];
  }
  if (opt.dotPolicy === DOT_POLICY.CUSTOM) {
    const phases2 = [];
    let cur = [];
    for (let i = 0; i < keys.length; i++) {
      cur.push(keys[i]);
      const isLast = i === keys.length - 1;
      const ctx = {
        key: keys[i],
        index: i,
        total: keys.length,
        keysInPhase: cur.length,
        phaseIndex: phases2.length
      };
      const cut = !isLast && !!opt.shouldPhase?.(ctx);
      if (cut) {
        phases2.push(cur);
        cur = [];
      }
    }
    if (cur.length) phases2.push(cur);
    return applyMaxPhases(phases2, opt.maxPhases);
  }
  let every = opt.phaseEvery;
  if (opt.maxPhases != null) {
    const need = Math.ceil(keys.length / every);
    if (need > opt.maxPhases) {
      every = Math.ceil(keys.length / opt.maxPhases);
    }
  }
  const phases = [];
  for (let i = 0; i < keys.length; i += every) {
    phases.push(keys.slice(i, i + every));
  }
  return phases;
}
function applyMaxPhases(phases, maxPhases) {
  if (maxPhases == null || phases.length <= maxPhases) return phases;
  const head = phases.slice(0, maxPhases - 1);
  const tail = phases.slice(maxPhases - 1).flat();
  return [...head, tail];
}
function emitObjectEntry(lines, key, value, opt, path) {
  assertKey(key, path, opt.symbolKeys);
  const wk = encodeWireLabel(key, opt.symbolKeys);
  if (value === void 0) {
    if (opt.undefinedPolicy === "error") {
      throw new XaiopEncodeError("undefined value not allowed", { path });
    }
    return;
  }
  if (value === null) {
    if (opt.nullPolicy === "error") {
      throw new XaiopEncodeError("null value not allowed", { path });
    }
    if (opt.nullPolicy === "omit") {
      return;
    }
    lines.push(formatContent(wk, null, path));
    return;
  }
  if (Array.isArray(value)) {
    lines.push(`>${wk}-`);
    emitArrayElements(lines, value, opt, path);
    lines.push("<");
    return;
  }
  if (isPlainObject(value)) {
    lines.push(`>${wk}`);
    const keys = orderedKeys(value, opt.keyOrder);
    for (const k of keys) {
      emitObjectEntry(
        lines,
        k,
        /** @type {any} */
        value[k],
        opt,
        `${path}.${k}`
      );
    }
    lines.push("<");
    return;
  }
  lines.push(formatContent(wk, value, path));
}
function emitArrayElements(lines, arr, opt, path) {
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    const elPath = `${path}[${i}]`;
    if (el === void 0) {
      if (opt.undefinedPolicy === "error") {
        throw new XaiopEncodeError("undefined array element not allowed", {
          path: elPath
        });
      }
      throw new XaiopEncodeError(
        "sparse arrays (undefined elements) are not encodable",
        { path: elPath }
      );
    }
    if (el === null) {
      if (opt.nullPolicy === "error") {
        throw new XaiopEncodeError("null array element not allowed", {
          path: elPath
        });
      }
      if (opt.nullPolicy === "omit") {
      }
      lines.push(formatScalarElement(null, elPath));
      continue;
    }
    if (Array.isArray(el)) {
      lines.push("-");
      emitArrayElements(lines, el, opt, elPath);
      lines.push("<");
      continue;
    }
    if (isPlainObject(el)) {
      lines.push(">");
      const keys = orderedKeys(el, opt.keyOrder);
      for (const k of keys) {
        emitObjectEntry(
          lines,
          k,
          /** @type {any} */
          el[k],
          opt,
          `${elPath}.${k}`
        );
      }
      lines.push("<");
      continue;
    }
    lines.push(formatScalarElement(el, elPath));
  }
}
function formatScalarElement(value, path) {
  if (value === null) return ":null";
  if (typeof value === "boolean") return `:${value ? "true" : "false"}`;
  if (typeof value === "number") return `:${formatNumberToken(value, path)}`;
  if (typeof value === "string") {
    assertEncodableString(value, path);
    const wire = escapeContent(value);
    if (needsForcedString(value)) return `: ${wire}`;
    return `:${wire}`;
  }
  throw new XaiopEncodeError(
    `unsupported array element type: ${typeName(value)}`,
    { path }
  );
}
function formatContent(key, value, path) {
  if (value === null) return `${key}:null`;
  if (typeof value === "boolean") return `${key}:${value ? "true" : "false"}`;
  if (typeof value === "number") {
    return `${key}:${formatNumberToken(value, path)}`;
  }
  if (typeof value === "string") {
    assertEncodableString(value, path);
    const wire = escapeContent(value);
    if (needsForcedString(value)) return `${key}: ${wire}`;
    return `${key}:${wire}`;
  }
  throw new XaiopEncodeError(
    `unsupported value type: ${typeName(value)}`,
    { path }
  );
}
function formatNumberToken(n, path) {
  if (!Number.isFinite(n)) {
    throw new XaiopEncodeError(
      `non-finite numbers are not encodable as float tokens (${String(n)})`,
      { path }
    );
  }
  if (Number.isInteger(n) && Number.isSafeInteger(n)) {
    return String(n);
  }
  const s = String(n);
  if (isNumberLikeToken(s)) return s;
  const j = JSON.stringify(n);
  if (typeof j === "string") return j;
  throw new XaiopEncodeError(`cannot format number: ${String(n)}`, { path });
}
function isNumberLikeToken(s) {
  const n = s.length;
  if (n === 0) return false;
  let i = 0;
  let c = s.charCodeAt(0);
  if (c === 43 || c === 45) {
    i++;
    if (i >= n) return false;
  }
  let intDigits = 0;
  while (i < n) {
    c = s.charCodeAt(i);
    if (c < 48 || c > 57) break;
    intDigits++;
    i++;
  }
  let fracDigits = -1;
  if (i < n && s.charCodeAt(i) === 46) {
    i++;
    fracDigits = 0;
    while (i < n) {
      c = s.charCodeAt(i);
      if (c < 48 || c > 57) break;
      fracDigits++;
      i++;
    }
  }
  if (intDigits === 0 && fracDigits <= 0) return false;
  if (i < n) {
    c = s.charCodeAt(i);
    if (c !== 101 && c !== 69) return false;
    i++;
    if (i < n) {
      c = s.charCodeAt(i);
      if (c === 43 || c === 45) i++;
    }
    let expDigits = 0;
    while (i < n) {
      c = s.charCodeAt(i);
      if (c < 48 || c > 57) break;
      expDigits++;
      i++;
    }
    if (expDigits === 0) return false;
  }
  return i === n;
}
function needsForcedString(s) {
  if (s.length === 0) return false;
  const c0 = s.charCodeAt(0);
  if (c0 === 116 || c0 === 102 || c0 === 110) {
    return s === "true" || s === "false" || s === "null";
  }
  if (c0 === 43 || c0 === 45 || c0 === 46 || c0 >= 48 && c0 <= 57) {
    return isNumberLikeToken(s);
  }
  return false;
}
function hasWhitespaceOrColon(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 58 || c === 32 || c >= 9 && c <= 13) return true;
    if (c < 128) continue;
    if (c === 160 || c === 5760 || c >= 8192 && c <= 8202 || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279) {
      return true;
    }
  }
  return false;
}
function hasOperatorChar(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 62 || c === 60 || c === 61 || c === 33 || c === 38) return true;
  }
  return false;
}
function assertKey(key, path, symbolKeys = false) {
  if (typeof key !== "string" || key.length === 0) {
    throw new XaiopEncodeError("object keys must be non-empty strings", {
      path
    });
  }
  if (hasWhitespaceOrColon(key)) {
    throw new XaiopEncodeError(
      `invalid label name: ${JSON.stringify(key)}`,
      { path }
    );
  }
  if (key.endsWith("-")) {
    throw new XaiopEncodeError(
      `invalid label name (trailing "-" reserved for arrays): ${JSON.stringify(key)}`,
      { path }
    );
  }
  if (keyNeedsSymbolEscape(key) && !symbolKeys) {
    throw new XaiopEncodeError(
      `invalid label name (must not begin with line-operator or U+001F; enable symbolKeys to escape): ${JSON.stringify(key)}`,
      { path }
    );
  }
  const body = keyNeedsSymbolEscape(key) && symbolKeys ? key.slice(1) : key;
  if (hasOperatorChar(body)) {
    throw new XaiopEncodeError(
      `invalid label name (contains Cursor/operator character): ${JSON.stringify(key)}`,
      { path }
    );
  }
}
function assertEncodableString(s, path) {
  if (s.charCodeAt(0) === 32) {
    throw new XaiopEncodeError(
      "string values must not begin with U+0020 SPACE (wire forced-string marker would strip leading spaces)",
      { path }
    );
  }
}
function escapeContent(s) {
  if (s.indexOf("\\") === -1 && s.indexOf("\n") === -1 && s.indexOf("\r") === -1) {
    return s;
  }
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 92) out += "\\\\";
    else if (c === 10) out += "\\n";
    else if (c === 13) out += "\\r";
    else out += s[i];
  }
  return out;
}
function isPlainObject(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}
function typeName(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
function joinWire(lines, finalDot) {
  let cleaned = collapseRedundantLeavesBeforePhase(lines);
  if (finalDot) {
    if (cleaned === lines) cleaned = lines.slice();
    cleaned.push(".");
  }
  if (cleaned.length === 0) return "";
  return cleaned.join("\n") + "\n";
}
function collapseRedundantLeavesBeforePhase(lines) {
  let drop = 0;
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    if (lines[i] === "<" && (next === "." || next === void 0)) drop++;
  }
  if (drop === 0) return lines;
  const out = new Array(lines.length - drop);
  let w = 0;
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    if (lines[i] === "<" && (next === "." || next === void 0)) continue;
    out[w++] = lines[i];
  }
  return out;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DOT_POLICY,
  LiveXaiopParser,
  XaiopEncodeError,
  XaiopFragment,
  XaiopSyntaxError,
  encode,
  encodeAsync,
  encodeSync,
  parseAsync,
  parseSync
});
