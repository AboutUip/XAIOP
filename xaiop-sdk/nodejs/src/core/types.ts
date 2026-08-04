// @ts-nocheck
/**
 * XAIOP SDK type registry / freeze checking (not protocol wire).
 *
 * Canonical leaf kinds align with PROT-CONTENT: int, float, bool, null, string.
 * Structural: object, array. Meta: any. Registry polarity: allow | deny.
 * Paths use JSON-path house style (`a.b[0]`), same as encode `parseJsonPath`.
 */
import { formatJsonPath, parseJsonPath } from "./encode.js";
import { CONTROL_NS, CONTROL_NAME, encodeControlFrame } from "./control.js";

/** @typedef {'int'|'float'|'bool'|'string'|'null'|'object'|'array'|'any'} TypeKind */
/** @typedef {'allow'|'deny'} TypePolarity */

/**
 * @typedef {{
 *   kind: TypeKind,
 *   fields?: Record<string, CanonicalType>,
 *   element?: CanonicalType,
 * }} CanonicalType
 */

/**
 * @typedef {{
 *   path: string,
 *   type: CanonicalType,
 *   polarity: TypePolarity,
 * }} TypeEntry
 */

/**
 * @typedef {{
 *   version: 1,
 *   entries: TypeEntry[],
 * }} TypeSchemaSnapshot
 */

/** Header + LF; body follows on the next line (see Control Root / `encodeTypeSchemaFrame`). */
export const TYPE_SCHEMA_FRAME_PREFIX = "#!xaiop/types/v1\n";

/** Base type constants (canonical). */
export const TYPE = Object.freeze({
  INT: Object.freeze({ kind: "int" }),
  FLOAT: Object.freeze({ kind: "float" }),
  BOOL: Object.freeze({ kind: "bool" }),
  STRING: Object.freeze({ kind: "string" }),
  NULL: Object.freeze({ kind: "null" }),
  OBJECT: Object.freeze({ kind: "object" }),
  ARRAY: Object.freeze({ kind: "array" }),
  ANY: Object.freeze({ kind: "any" }),
});

/**
 * @param {Record<string, unknown>} fields
 * @returns {CanonicalType}
 */
export function objectType(fields) {
  if (fields == null || typeof fields !== "object" || Array.isArray(fields)) {
    throw new TypeError("objectType(fields) requires a plain object");
  }
  /** @type {Record<string, CanonicalType>} */
  const out = Object.create(null);
  for (const [k, v] of Object.entries(fields)) {
    if (typeof k !== "string" || k.length === 0) {
      throw new TypeError("objectType field names must be non-empty strings");
    }
    out[k] = canonicalizeType(v);
  }
  return { kind: "object", fields: out };
}

/**
 * @param {unknown} element
 * @returns {CanonicalType}
 */
export function arrayType(element) {
  return { kind: "array", element: canonicalizeType(element) };
}

export class XaiopTypeError extends Error {
  /**
   * @param {string} message
   * @param {{ path?: string, expected?: CanonicalType, actual?: CanonicalType, polarity?: TypePolarity }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "XaiopTypeError";
    /** @type {string|undefined} */
    this.path = meta.path;
    /** @type {CanonicalType|undefined} */
    this.expected = meta.expected;
    /** @type {CanonicalType|undefined} */
    this.actual = meta.actual;
    /** @type {TypePolarity|undefined} */
    this.polarity = meta.polarity;
  }
}

/**
 * Normalize user input (constant, builder, or surface string) → canonical.
 * @param {unknown} input
 * @returns {CanonicalType}
 */
export function canonicalizeType(input) {
  if (input == null) {
    throw new TypeError("type is required");
  }
  if (typeof input === "string") {
    return parseTypeSurface(input.trim());
  }
  if (typeof input !== "object") {
    throw new TypeError(`invalid type: ${typeof input}`);
  }
  const kind = /** @type {{ kind?: string }} */ (input).kind;
  if (typeof kind !== "string") {
    throw new TypeError("type object must have a kind");
  }
  switch (kind) {
    case "int":
    case "float":
    case "bool":
    case "string":
    case "null":
    case "any":
      return { kind };
    case "object": {
      const fields = /** @type {{ fields?: unknown }} */ (input).fields;
      if (fields == null) return { kind: "object" };
      return objectType(/** @type {Record<string, unknown>} */ (fields));
    }
    case "array": {
      const element = /** @type {{ element?: unknown }} */ (input).element;
      if (element == null) return { kind: "array" };
      return { kind: "array", element: canonicalizeType(element) };
    }
    default:
      throw new TypeError(`unknown type kind: ${kind}`);
  }
}

/**
 * Surface string: `string` | `array<int>` | `object<name:string,old:int>`.
 * @param {string} text
 * @returns {CanonicalType}
 */
export function parseTypeSurface(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new TypeError("type surface must be a non-empty string");
  }
  const { type, next } = parseTypeExpr(text, 0);
  if (next !== text.length) {
    throw new TypeError(`unexpected trailing type syntax: ${JSON.stringify(text.slice(next))}`);
  }
  return type;
}

/**
 * @param {string} s
 * @param {number} i
 * @returns {{ type: CanonicalType, next: number }}
 */
function parseTypeExpr(s, i) {
  i = skipWs(s, i);
  const start = i;
  while (i < s.length && /[A-Za-z_]/.test(s[i])) i++;
  if (i === start) {
    throw new TypeError(`expected type name at ${JSON.stringify(s.slice(i))}`);
  }
  const name = s.slice(start, i).toLowerCase();
  i = skipWs(s, i);
  if (i < s.length && s[i] === "<") {
    i++;
    if (name === "array") {
      const inner = parseTypeExpr(s, i);
      i = skipWs(s, inner.next);
      if (i >= s.length || s[i] !== ">") {
        throw new TypeError("array<...> missing '>'");
      }
      return { type: { kind: "array", element: inner.type }, next: i + 1 };
    }
    if (name === "object") {
      /** @type {Record<string, CanonicalType>} */
      const fields = Object.create(null);
      i = skipWs(s, i);
      if (i < s.length && s[i] === ">") {
        return { type: { kind: "object" }, next: i + 1 };
      }
      while (true) {
        i = skipWs(s, i);
        const keyStart = i;
        while (i < s.length && /[A-Za-z0-9_]/.test(s[i])) i++;
        if (i === keyStart) {
          throw new TypeError("object field name expected");
        }
        const key = s.slice(keyStart, i);
        i = skipWs(s, i);
        if (i >= s.length || s[i] !== ":") {
          throw new TypeError(`object field ${key} missing ':'`);
        }
        i++;
        const val = parseTypeExpr(s, i);
        fields[key] = val.type;
        i = skipWs(s, val.next);
        if (i < s.length && s[i] === ",") {
          i++;
          continue;
        }
        if (i < s.length && s[i] === ">") {
          return { type: { kind: "object", fields }, next: i + 1 };
        }
        throw new TypeError("object<...> expected ',' or '>'");
      }
    }
    throw new TypeError(`type ${name} does not take parameters`);
  }
  switch (name) {
    case "int":
    case "float":
    case "bool":
    case "string":
    case "null":
    case "object":
    case "array":
    case "any":
      return { type: { kind: name }, next: i };
    default:
      throw new TypeError(`unknown type name: ${name}`);
  }
}

/** @param {string} s @param {number} i */
function skipWs(s, i) {
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  return i;
}

/**
 * Classify a runtime JSON value into a canonical type (observation / freeze).
 * @param {unknown} value
 * @returns {CanonicalType}
 */
export function classifyValue(value) {
  if (value === null) return { kind: "null" };
  if (typeof value === "boolean") return { kind: "bool" };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new XaiopTypeError(`non-finite number cannot be typed (${String(value)})`);
    }
    if (Number.isInteger(value) && Number.isSafeInteger(value)) {
      return { kind: "int" };
    }
    return { kind: "float" };
  }
  if (typeof value === "string") return { kind: "string" };
  if (Array.isArray(value)) {
    /** @type {CanonicalType|undefined} */
    let element;
    for (const el of value) {
      if (el === null) continue;
      const t = classifyValue(el);
      const leaf = stripShape(t);
      if (!element) element = leaf;
      else if (!typeCompatible(element, leaf)) {
        throw new XaiopTypeError("array elements must share one type", {
          expected: element,
          actual: leaf,
        });
      }
    }
    return element ? { kind: "array", element } : { kind: "array" };
  }
  if (typeof value === "object") {
    return { kind: "object" };
  }
  throw new XaiopTypeError(`unsupported runtime type: ${typeof value}`);
}

/** @param {CanonicalType} t @returns {CanonicalType} */
function stripShape(t) {
  if (t.kind === "object") return { kind: "object" };
  if (t.kind === "array") {
    return t.element ? { kind: "array", element: stripShape(t.element) } : { kind: "array" };
  }
  return { kind: t.kind };
}

/**
 * Whether a value satisfies an expected type (allow-match).
 * @param {unknown} value
 * @param {CanonicalType} expected
 */
export function valueMatchesType(value, expected) {
  if (expected.kind === "any") return true;
  if (value === null) return expected.kind === "null";
  if (expected.kind === "null") return false;

  if (expected.kind === "bool") return typeof value === "boolean";
  if (expected.kind === "string") return typeof value === "string";
  if (expected.kind === "int") {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value) &&
      Number.isSafeInteger(value)
    );
  }
  if (expected.kind === "float") {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      !(Number.isInteger(value) && Number.isSafeInteger(value))
    );
  }
  if (expected.kind === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    if (expected.fields) {
      for (const [k, ft] of Object.entries(expected.fields)) {
        if (!Object.prototype.hasOwnProperty.call(value, k)) {
          if (ft.kind === "any") continue;
          return false;
        }
        if (/** @type {any} */ (value)[k] === null && ft.kind !== "null" && ft.kind !== "any") {
          // null value: server allow-check still requires match unless any/null
          if (!valueMatchesType(null, ft)) return false;
          continue;
        }
        if (!valueMatchesType(/** @type {any} */ (value)[k], ft)) return false;
      }
    }
    return true;
  }
  if (expected.kind === "array") {
    if (!Array.isArray(value)) return false;
    if (!expected.element) return true;
    for (const el of value) {
      if (el === null && expected.element.kind !== "null" && expected.element.kind !== "any") {
        if (!valueMatchesType(null, expected.element)) return false;
        continue;
      }
      if (!valueMatchesType(el, expected.element)) return false;
    }
    return true;
  }
  return false;
}

/**
 * Soft compatibility for freeze (object/object, array/array±element).
 * @param {CanonicalType} a
 * @param {CanonicalType} b
 */
export function typeCompatible(a, b) {
  if (!a || !b) return false;
  if (a.kind === "any" || b.kind === "any") return true;
  if (a.kind !== b.kind) return false;
  if (a.kind === "array") {
    if (!a.element || !b.element) return true;
    return typeCompatible(a.element, b.element);
  }
  return true;
}

/** @param {CanonicalType} t */
export function typeToString(t) {
  if (!t) return "?";
  if (t.kind === "array") {
    return t.element ? `array<${typeToString(t.element)}>` : "array";
  }
  if (t.kind === "object" && t.fields) {
    const parts = Object.entries(t.fields).map(
      ([k, v]) => `${k}:${typeToString(v)}`,
    );
    return `object<${parts.join(",")}>`;
  }
  return t.kind;
}

/** Deep-clone canonical for snapshots. */
export function cloneType(t) {
  if (t.kind === "object" && t.fields) {
    /** @type {Record<string, CanonicalType>} */
    const fields = Object.create(null);
    for (const [k, v] of Object.entries(t.fields)) fields[k] = cloneType(v);
    return { kind: "object", fields };
  }
  if (t.kind === "array" && t.element) {
    return { kind: "array", element: cloneType(t.element) };
  }
  return { kind: t.kind };
}

/**
 * Immutable path → type registry (server).
 */
export class TypeRegistry {
  constructor() {
    /** @type {Map<string, TypeEntry>} */
    this._entries = new Map();
  }

  get size() {
    return this._entries.size;
  }

  /**
   * @param {string} path
   * @param {unknown} typeInput
   * @param {{ polarity?: TypePolarity }} [options]
   * @returns {boolean} false if path already registered
   */
  register(path, typeInput, options = {}) {
    const canonPath = normalizeRegistryPath(path);
    if (this._entries.has(canonPath)) return false;
    const polarity = options.polarity === "deny" ? "deny" : "allow";
    const type = canonicalizeType(typeInput);
    if (polarity === "deny" && type.kind === "any") {
      throw new TypeError("cannot register deny polarity for type any");
    }
    this._entries.set(canonPath, {
      path: canonPath,
      type: cloneType(type),
      polarity,
    });
    return true;
  }

  /**
   * @param {Record<string, unknown>|Iterable<[string, unknown]|TypeEntry>} map
   * @param {{ polarity?: TypePolarity }} [options]
   * @returns {{ ok: string[], rejected: string[] }}
   */
  registerMany(map, options = {}) {
    /** @type {string[]} */
    const ok = [];
    /** @type {string[]} */
    const rejected = [];
    if (map && typeof map === "object" && !Array.isArray(map) && typeof map[Symbol.iterator] !== "function") {
      for (const [path, typeInput] of Object.entries(map)) {
        if (this.register(path, typeInput, options)) ok.push(normalizeRegistryPath(path));
        else rejected.push(normalizeRegistryPath(path));
      }
      return { ok, rejected };
    }
    for (const item of /** @type {Iterable<any>} */ (map)) {
      if (Array.isArray(item)) {
        const [path, typeInput] = item;
        if (this.register(path, typeInput, options)) ok.push(normalizeRegistryPath(path));
        else rejected.push(normalizeRegistryPath(path));
      } else if (item && typeof item === "object" && item.path != null) {
        const polarity = item.polarity === "deny" ? "deny" : options.polarity;
        if (this.register(item.path, item.type, { polarity })) {
          ok.push(normalizeRegistryPath(item.path));
        } else rejected.push(normalizeRegistryPath(item.path));
      } else {
        throw new TypeError("registerMany item must be [path, type] or TypeEntry");
      }
    }
    return { ok, rejected };
  }

  /** @param {string} path */
  has(path) {
    return this._entries.has(normalizeRegistryPath(path));
  }

  /** @param {string} path @returns {TypeEntry|undefined} */
  get(path) {
    return this._entries.get(normalizeRegistryPath(path));
  }

  /** @returns {TypeEntry[]} */
  list() {
    return [...this._entries.values()].map((e) => ({
      path: e.path,
      type: cloneType(e.type),
      polarity: e.polarity,
    }));
  }

  /** @returns {TypeSchemaSnapshot} */
  snapshot() {
    return { version: 1, entries: this.list() };
  }

  /**
   * @param {TypeSchemaSnapshot|TypeRegistry} snap
   * @returns {TypeRegistry}
   */
  static fromSnapshot(snap) {
    const reg = new TypeRegistry();
    if (snap instanceof TypeRegistry) {
      for (const e of snap.list()) {
        if (!reg.register(e.path, e.type, { polarity: e.polarity })) {
          throw new XaiopTypeError(`duplicate path in schema: ${e.path}`, {
            path: e.path,
          });
        }
      }
      return reg;
    }
    if (!snap || snap.version !== 1 || !Array.isArray(snap.entries)) {
      throw new TypeError("invalid type schema snapshot");
    }
    for (const e of snap.entries) {
      if (!e || typeof e.path !== "string") {
        throw new TypeError("invalid type schema entry");
      }
      if (!reg.register(e.path, e.type, { polarity: e.polarity })) {
        throw new XaiopTypeError(`duplicate path in schema: ${e.path}`, {
          path: e.path,
        });
      }
    }
    return reg;
  }
}

/** @param {string} path */
function normalizeRegistryPath(path) {
  return formatJsonPath(parseJsonPath(path));
}

/**
 * Server-side check: only registered paths; invokes optional hook.
 */
export class TypeChecker {
  /**
   * @param {TypeRegistry} registry
   * @param {{
   *   onViolation?: (err: XaiopTypeError, ctx: { path: string, value: unknown, entry: TypeEntry }) => void,
   * }} [options]
   */
  constructor(registry, options = {}) {
    this._registry = registry;
    this._onViolation =
      typeof options.onViolation === "function" ? options.onViolation : null;
  }

  get registry() {
    return this._registry;
  }

  /**
   * @param {unknown} value
   * @param {{ throw?: boolean }} [options] default throw true
   * @returns {XaiopTypeError[]}
   */
  checkTree(value, options = {}) {
    const shouldThrow = options.throw !== false;
    /** @type {XaiopTypeError[]} */
    const errors = [];
    const root = unwrapFragment(value);
    this._walk(root, [], errors);
    if (shouldThrow && errors.length) throw errors[0];
    return errors;
  }

  /**
   * @param {unknown} value
   * @param {(string|number)[]} segs
   * @param {XaiopTypeError[]} errors
   */
  _walk(value, segs, errors) {
    if (segs.length > 0) {
      const path = formatJsonPath(segs);
      const entry = this._registry.get(path);
      if (entry) this._checkEntry(path, value, entry, errors);
    }

    if (value !== null && typeof value === "object") {
      if (Array.isArray(value)) {
        const path = segs.length ? formatJsonPath(segs) : null;
        const entry = path ? this._registry.get(path) : undefined;
        const elemType =
          entry && entry.polarity === "allow" && entry.type.kind === "array"
            ? entry.type.element
            : undefined;
        for (let i = 0; i < value.length; i++) {
          const el = value[i];
          const childSegs = segs.concat(i);
          if (elemType && el !== null) {
            const childPath = formatJsonPath(childSegs);
            if (!valueMatchesType(el, elemType)) {
              this._fail(
                new XaiopTypeError(
                  `type mismatch at ${childPath}: expected ${typeToString(elemType)}, got ${typeToString(classifyValueSafe(el))}`,
                  {
                    path: childPath,
                    expected: elemType,
                    actual: classifyValueSafe(el),
                    polarity: "allow",
                  },
                ),
                { path: childPath, value: el, entry },
                errors,
              );
            }
          }
          this._walk(el, childSegs, errors);
        }
      } else {
        for (const key of Object.keys(value)) {
          this._walk(/** @type {any} */ (value)[key], segs.concat(key), errors);
        }
      }
    }
  }

  /**
   * @param {string} path
   * @param {unknown} value
   * @param {TypeEntry} entry
   * @param {XaiopTypeError[]} errors
   */
  _checkEntry(path, value, entry, errors) {
    const matches = valueMatchesType(value, entry.type);
    if (entry.polarity === "allow") {
      if (!matches) {
        this._fail(
          new XaiopTypeError(
            `type mismatch at ${path}: expected ${typeToString(entry.type)}, got ${typeToString(classifyValueSafe(value))}`,
            {
              path,
              expected: entry.type,
              actual: classifyValueSafe(value),
              polarity: "allow",
            },
          ),
          { path, value, entry },
          errors,
        );
      }
    } else if (matches) {
      this._fail(
        new XaiopTypeError(
          `type denied at ${path}: must not be ${typeToString(entry.type)}`,
          {
            path,
            expected: entry.type,
            actual: classifyValueSafe(value),
            polarity: "deny",
          },
        ),
        { path, value, entry },
        errors,
      );
    }
  }

  /**
   * @param {XaiopTypeError} err
   * @param {{ path: string, value: unknown, entry: TypeEntry }} ctx
   * @param {XaiopTypeError[]} errors
   */
  _fail(err, ctx, errors) {
    if (this._onViolation) this._onViolation(err, ctx);
    errors.push(err);
  }
}

/** @param {unknown} v @returns {CanonicalType} */
function classifyValueSafe(v) {
  try {
    return classifyValue(v);
  } catch {
    return { kind: "any" };
  }
}

/** @param {unknown} value */
function unwrapFragment(value) {
  if (
    value &&
    typeof value === "object" &&
    /** @type {any} */ (value).isFragment === true &&
    /** @type {any} */ (value).entries &&
    typeof /** @type {any} */ (value).entries === "object"
  ) {
    return /** @type {any} */ (value).entries;
  }
  return value;
}

/**
 * Client freeze session: first non-null observation locks type; schema optional.
 */
export class TypeFreezeSession {
  /**
   * @param {{
   *   schema?: TypeRegistry|null,
   *   onViolation?: (err: XaiopTypeError) => void,
   * }} [options]
   */
  constructor(options = {}) {
    /** @type {TypeRegistry|null} */
    this._schema = options.schema ?? null;
    /** @type {Map<string, CanonicalType>} */
    this._freeze = new Map();
    /** @type {string[]} */
    this._escapePaths = [];
    this._onViolation =
      typeof options.onViolation === "function" ? options.onViolation : null;
  }

  /** @param {TypeRegistry|TypeSchemaSnapshot|null} schema */
  applySchema(schema) {
    if (schema == null) {
      this._schema = null;
      return;
    }
    this._schema =
      schema instanceof TypeRegistry
        ? schema
        : TypeRegistry.fromSnapshot(schema);
    // Seed freeze from allow schema (non-any).
    for (const e of this._schema.list()) {
      if (e.polarity === "allow" && e.type.kind !== "any") {
        if (!this._freeze.has(e.path)) {
          this._freeze.set(e.path, stripShape(e.type));
        }
      }
    }
  }

  get schema() {
    return this._schema;
  }

  /** @returns {Map<string, CanonicalType>} */
  get freezes() {
    return this._freeze;
  }

  /** Clear freeze for path and descendants (after whole-node delete). */
  clearPath(path) {
    const prefix = normalizeRegistryPath(path);
    for (const key of [...this._freeze.keys()]) {
      if (key === prefix || key.startsWith(prefix + ".") || key.startsWith(prefix + "[")) {
        this._freeze.delete(key);
      }
    }
  }

  /**
   * Observe a Diff / Snapshot tree. `null` leaves are skipped (no check / no freeze).
   * Paths listed in `escapePaths` (and descendants) skip type check / freeze —
   * used for annotation-span remounts (SDK product).
   * @param {unknown} tree
   * @param {{ throw?: boolean, escapePaths?: Iterable<string> }} [options]
   * @returns {XaiopTypeError[]}
   */
  observeTree(tree, options = {}) {
    const shouldThrow = options.throw !== false;
    /** @type {XaiopTypeError[]} */
    const errors = [];
    this._escapePaths = options.escapePaths
      ? [...options.escapePaths]
      : [];
    if (tree === null || tree === undefined) return errors;
    const root = unwrapFragment(tree);
    this._walkObserve(root, [], errors);
    this._escapePaths = [];
    if (shouldThrow && errors.length) throw errors[0];
    return errors;
  }

  /**
   * Drop freezes for paths absent from the commit tree (node removed → refresh).
   * @param {unknown} commit
   */
  reconcileCommit(commit) {
    if (commit === null || commit === undefined) {
      this._freeze.clear();
      return;
    }
    const present = new Set();
    collectPaths(unwrapFragment(commit), [], present);
    for (const key of [...this._freeze.keys()]) {
      if (!present.has(key)) this._freeze.delete(key);
    }
  }

  /**
   * @param {unknown} value
   * @param {(string|number)[]} segs
   * @param {XaiopTypeError[]} errors
   */
  _walkObserve(value, segs, errors) {
    // Root itself is not a JSON path in our registry style; walk children / array els.
    if (segs.length === 0) {
      if (value !== null && typeof value === "object") {
        if (Array.isArray(value)) {
          this._observeArray(value, [], errors);
        } else {
          for (const key of Object.keys(value)) {
            if (this._pathEscaped(key)) continue;
            this._walkObserve(/** @type {any} */ (value)[key], [key], errors);
          }
        }
      }
      return;
    }

    const path = formatJsonPath(segs);

    if (this._pathEscaped(path)) {
      return;
    }

    if (value === null) {
      // Client: null does not enter type check (keeps prior freeze).
      return;
    }

    let observed;
    try {
      observed = stripShape(classifyValue(value));
    } catch (e) {
      const err =
        e instanceof XaiopTypeError
          ? e
          : new XaiopTypeError(String(e), { path });
      if (!err.path) err.path = path;
      this._fail(err, errors);
      return;
    }

    const schemaEntry = this._schema ? this._schema.get(path) : undefined;
    let schemaViolated = false;
    let schemaIgnore = false;
    if (schemaEntry) {
      if (schemaEntry.type.kind === "any" && schemaEntry.polarity === "allow") {
        schemaIgnore = true; // explicit any — no freeze lock / no type constraint
      } else {
        const matches = valueMatchesType(value, schemaEntry.type);
        if (schemaEntry.polarity === "allow" && !matches) {
          schemaViolated = true;
          this._fail(
            new XaiopTypeError(
              `type mismatch at ${path}: expected ${typeToString(schemaEntry.type)}, got ${typeToString(observed)}`,
              {
                path,
                expected: schemaEntry.type,
                actual: observed,
                polarity: "allow",
              },
            ),
            errors,
          );
        } else if (schemaEntry.polarity === "deny" && matches) {
          schemaViolated = true;
          this._fail(
            new XaiopTypeError(
              `type denied at ${path}: must not be ${typeToString(schemaEntry.type)}`,
              {
                path,
                expected: schemaEntry.type,
                actual: observed,
                polarity: "deny",
              },
            ),
            errors,
          );
        }
      }
    }

    // Do not lock a freeze from a schema-violating observation; `any` skips freeze.
    if (!schemaViolated && !schemaIgnore) {
      const frozen = this._freeze.get(path);
      if (frozen) {
        if (!typeCompatible(frozen, observed)) {
          this._fail(
            new XaiopTypeError(
              `type freeze mismatch at ${path}: expected ${typeToString(frozen)}, got ${typeToString(observed)} (replace whole node via delete to refresh)`,
              { path, expected: frozen, actual: observed },
            ),
            errors,
          );
        } else if (
          frozen.kind === "array" &&
          observed.kind === "array" &&
          frozen.element &&
          observed.element &&
          !typeCompatible(frozen.element, observed.element)
        ) {
          this._fail(
            new XaiopTypeError(
              `array element type mismatch at ${path}: expected ${typeToString(frozen.element)}, got ${typeToString(observed.element)}`,
              { path, expected: frozen, actual: observed },
            ),
            errors,
          );
        }
      } else {
        this._freeze.set(path, observed);
      }
    }

    if (Array.isArray(value)) {
      this._observeArray(value, segs, errors);
    } else if (typeof value === "object") {
      for (const key of Object.keys(value)) {
        this._walkObserve(/** @type {any} */ (value)[key], segs.concat(key), errors);
      }
    }
  }

  /**
   * @param {unknown[]} value
   * @param {(string|number)[]} segs
   * @param {XaiopTypeError[]} errors
   */
  _observeArray(value, segs, errors) {
    const path = segs.length ? formatJsonPath(segs) : null;
    /** @type {CanonicalType|undefined} */
    let elemFreeze = path ? this._freeze.get(path)?.element : undefined;

    for (let i = 0; i < value.length; i++) {
      const el = value[i];
      if (el === null) continue;
      let elType;
      try {
        elType = stripShape(classifyValue(el));
      } catch (e) {
        const err =
          e instanceof XaiopTypeError
            ? e
            : new XaiopTypeError(String(e), {
                path: formatJsonPath(segs.concat(i)),
              });
        this._fail(err, errors);
        continue;
      }
      if (!elemFreeze) {
        elemFreeze = elType;
        if (path) {
          const cur = this._freeze.get(path) || { kind: "array" };
          this._freeze.set(path, { kind: "array", element: elemFreeze });
          void cur;
        }
      } else if (!typeCompatible(elemFreeze, elType)) {
        this._fail(
          new XaiopTypeError(
            `array element types must be consistent at ${path ?? "<root>"}: expected ${typeToString(elemFreeze)}, got ${typeToString(elType)}`,
            {
              path: path ?? undefined,
              expected: elemFreeze,
              actual: elType,
            },
          ),
          errors,
        );
      }
      this._walkObserve(el, segs.concat(i), errors);
    }
  }

  /**
   * @param {string} path
   * @returns {boolean}
   */
  _pathEscaped(path) {
    const escapes = this._escapePaths;
    if (!escapes || escapes.length === 0) return false;
    for (let i = 0; i < escapes.length; i++) {
      const e = escapes[i];
      if (e === "") return true; // root-array / escape-all marker
      if (e == null) continue;
      if (path === e) return true;
      if (path.startsWith(e + ".") || path.startsWith(e + "[")) return true;
    }
    return false;
  }

  /** @param {XaiopTypeError} err @param {XaiopTypeError[]} errors */
  _fail(err, errors) {
    if (this._onViolation) this._onViolation(err);
    errors.push(err);
  }
}

/**
 * @param {unknown} value
 * @param {(string|number)[]} segs
 * @param {Set<string>} out
 */
function collectPaths(value, segs, out) {
  if (segs.length) out.add(formatJsonPath(segs));
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectPaths(value[i], segs.concat(i), out);
    }
  } else {
    for (const key of Object.keys(value)) {
      collectPaths(/** @type {any} */ (value)[key], segs.concat(key), out);
    }
  }
}

/** @param {TypeSchemaSnapshot} snapshot */
export function encodeTypeSchemaFrame(snapshot) {
  if (!snapshot || snapshot.version !== 1) {
    throw new TypeError("encodeTypeSchemaFrame requires snapshot version 1");
  }
  return encodeControlFrame(CONTROL_NS, CONTROL_NAME.TYPES, 1, snapshot);
}

/**
 * @param {string} text
 * @returns {TypeSchemaSnapshot|null}
 */
export function tryParseTypeSchemaFrame(text) {
  if (typeof text !== "string" || !text.startsWith(TYPE_SCHEMA_FRAME_PREFIX)) {
    return null;
  }
  const body = text.slice(TYPE_SCHEMA_FRAME_PREFIX.length);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new XaiopTypeError("invalid type schema frame JSON");
  }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new XaiopTypeError("invalid type schema frame payload");
  }
  return /** @type {TypeSchemaSnapshot} */ (parsed);
}
