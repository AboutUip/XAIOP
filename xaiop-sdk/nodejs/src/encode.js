/**
 * JSON → XAIOP encoder (protocol v0.2.1 wire).
 *
 * Emits strict wire only (no compatibility-mode shapes).
 * `.` frequency is controlled by `dotPolicy` / `phaseEvery` / `shouldPhase`
 * and aligns with DotCheckpointEngine phase boundaries.
 */

/** @typedef {'none'|'perTopLevelKey'|'perNKeys'|'custom'} DotPolicy */

/**
 * @typedef {{
 *   key: string,
 *   index: number,
 *   total: number,
 *   keysInPhase: number,
 *   phaseIndex: number,
 * }} PhaseContext
 */

/**
 * @typedef {{
 *   root?: 'auto'|'object'|'array',
 *   style?: 'reset'|'relative',
 *   dotPolicy?: DotPolicy,
 *   phaseEvery?: number,
 *   maxPhases?: number,
 *   finalDot?: boolean,
 *   keyOrder?: 'insertion'|'sorted',
 *   nullPolicy?: 'encode'|'omit'|'error',
 *   undefinedPolicy?: 'omit'|'error',
 *   shouldPhase?: (ctx: PhaseContext) => boolean,
 * }} EncodeOptions
 */

export const DOT_POLICY = Object.freeze({
  NONE: "none",
  PER_TOP_LEVEL_KEY: "perTopLevelKey",
  PER_N_KEYS: "perNKeys",
  CUSTOM: "custom",
});

export class XaiopEncodeError extends Error {
  /**
   * @param {string} message
   * @param {{ path?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "XaiopEncodeError";
    /** @type {string|undefined} */
    this.path = meta.path;
  }
}

/**
 * @param {unknown} value
 * @param {EncodeOptions} [options]
 * @returns {string}
 */
export function encodeSync(value, options = {}) {
  const opt = normalizeOptions(options);
  if (value === null || value === undefined) {
    throw new XaiopEncodeError(
      `cannot encode ${value === null ? "null" : "undefined"} as a document root`,
    );
  }

  const rootKind = resolveRoot(value, opt.root);
  /** @type {string[]} */
  const lines = [];

  if (rootKind === "array") {
    if (!Array.isArray(value)) {
      throw new XaiopEncodeError("root:'array' requires an array value");
    }
    lines.push("-");
    emitArrayElements(lines, value, opt, "$");
    return joinWire(lines, opt.finalDot);
  }

  // object document
  if (!isPlainObject(value)) {
    throw new XaiopEncodeError(
      "object document root requires a plain object (or use an array root)",
      { path: "$" },
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
      emitObjectEntry(lines, key, /** @type {any} */ (value)[key], opt, `$.${key}`);
    }
    return joinWire(lines, opt.finalDot);
  }

  // Phased / reset-friendly encoding of top-level keys
  const plan = planPhases(keys, opt);
  for (let p = 0; p < plan.length; p++) {
    if (p > 0) lines.push(".");
    lines.push(">");
    for (const key of plan[p]) {
      emitObjectEntry(
        lines,
        key,
        /** @type {any} */ (value)[key],
        opt,
        `$.${key}`,
      );
    }
  }
  return joinWire(lines, opt.finalDot);
}

/**
 * @param {unknown} value
 * @param {EncodeOptions} [options]
 * @returns {Promise<string>}
 */
export async function encode(value, options = {}) {
  return encodeSync(value, options);
}

/**
 * @param {EncodeOptions} options
 * @returns {Required<Omit<EncodeOptions,'shouldPhase'>> & { shouldPhase?: EncodeOptions['shouldPhase'], phaseEvery: number, maxPhases: number|null }}
 */
function normalizeOptions(options) {
  const dotPolicy = options.dotPolicy ?? DOT_POLICY.PER_TOP_LEVEL_KEY;
  if (
    dotPolicy !== DOT_POLICY.NONE &&
    dotPolicy !== DOT_POLICY.PER_TOP_LEVEL_KEY &&
    dotPolicy !== DOT_POLICY.PER_N_KEYS &&
    dotPolicy !== DOT_POLICY.CUSTOM
  ) {
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

  const maxPhases =
    options.maxPhases == null ? null : options.maxPhases;
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
  if (
    nullPolicy !== "encode" &&
    nullPolicy !== "omit" &&
    nullPolicy !== "error"
  ) {
    throw new XaiopEncodeError(`unknown nullPolicy: ${String(nullPolicy)}`);
  }

  const undefinedPolicy = options.undefinedPolicy ?? "omit";
  if (undefinedPolicy !== "omit" && undefinedPolicy !== "error") {
    throw new XaiopEncodeError(
      `unknown undefinedPolicy: ${String(undefinedPolicy)}`,
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
  };
}

/**
 * @param {unknown} value
 * @param {'auto'|'object'|'array'} root
 */
function resolveRoot(value, root) {
  if (root === "object") return "object";
  if (root === "array") return "array";
  if (Array.isArray(value)) return "array";
  return "object";
}

/**
 * @param {Record<string, unknown>} obj
 * @param {'insertion'|'sorted'} keyOrder
 */
function orderedKeys(obj, keyOrder) {
  const keys = Object.keys(obj);
  if (keyOrder === "sorted") keys.sort();
  return keys;
}

/**
 * @param {string[]} keys
 * @param {ReturnType<typeof normalizeOptions>} opt
 * @returns {string[][]}
 */
function planPhases(keys, opt) {
  if (keys.length === 0) return [];

  if (opt.dotPolicy === DOT_POLICY.NONE) {
    return [keys.slice()];
  }

  if (opt.dotPolicy === DOT_POLICY.CUSTOM) {
    /** @type {string[][]} */
    const phases = [];
    /** @type {string[]} */
    let cur = [];
    for (let i = 0; i < keys.length; i++) {
      cur.push(keys[i]);
      const isLast = i === keys.length - 1;
      const ctx = {
        key: keys[i],
        index: i,
        total: keys.length,
        keysInPhase: cur.length,
        phaseIndex: phases.length,
      };
      const cut = !isLast && !!opt.shouldPhase?.(ctx);
      if (cut) {
        phases.push(cur);
        cur = [];
      }
    }
    if (cur.length) phases.push(cur);
    return applyMaxPhases(phases, opt.maxPhases);
  }

  // perTopLevelKey / perNKeys
  let every = opt.phaseEvery;
  if (opt.maxPhases != null) {
    const need = Math.ceil(keys.length / every);
    if (need > opt.maxPhases) {
      every = Math.ceil(keys.length / opt.maxPhases);
    }
  }

  /** @type {string[][]} */
  const phases = [];
  for (let i = 0; i < keys.length; i += every) {
    phases.push(keys.slice(i, i + every));
  }
  return phases;
}

/**
 * @param {string[][]} phases
 * @param {number|null} maxPhases
 */
function applyMaxPhases(phases, maxPhases) {
  if (maxPhases == null || phases.length <= maxPhases) return phases;
  const head = phases.slice(0, maxPhases - 1);
  const tail = phases.slice(maxPhases - 1).flat();
  return [...head, tail];
}

/**
 * @param {string[]} lines
 * @param {string} key
 * @param {unknown} value
 * @param {ReturnType<typeof normalizeOptions>} opt
 * @param {string} path
 */
function emitObjectEntry(lines, key, value, opt, path) {
  assertKey(key, path);

  if (value === undefined) {
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
    lines.push(formatContent(key, null, path));
    return;
  }

  if (Array.isArray(value)) {
    lines.push(`>${key}-`);
    emitArrayElements(lines, value, opt, path);
    lines.push("<");
    return;
  }

  if (isPlainObject(value)) {
    lines.push(`>${key}`);
    const keys = orderedKeys(value, opt.keyOrder);
    for (const k of keys) {
      emitObjectEntry(lines, k, /** @type {any} */ (value)[k], opt, `${path}.${k}`);
    }
    // Leave object so a following sibling at the same Cursor parent is safe
    // when multiple entries share one phase (relative within phase).
    lines.push("<");
    return;
  }

  lines.push(formatContent(key, value, path));
}

/**
 * @param {string[]} lines
 * @param {unknown[]} arr
 * @param {ReturnType<typeof normalizeOptions>} opt
 * @param {string} path
 */
function emitArrayElements(lines, arr, opt, path) {
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    const elPath = `${path}[${i}]`;

    if (el === undefined) {
      if (opt.undefinedPolicy === "error") {
        throw new XaiopEncodeError("undefined array element not allowed", {
          path: elPath,
        });
      }
      // JSON arrays keep holes as null when stringified; we reject sparse holes
      // by treating undefined as error if policy omit — still skip would shift.
      throw new XaiopEncodeError(
        "sparse arrays (undefined elements) are not encodable",
        { path: elPath },
      );
    }

    if (el === null) {
      if (opt.nullPolicy === "error") {
        throw new XaiopEncodeError("null array element not allowed", {
          path: elPath,
        });
      }
      if (opt.nullPolicy === "omit") {
        // Omitting would change length/indices — still emit typed null.
        // (omit applies to object keys only; arrays stay length-preserving.)
      }
      lines.push(formatScalarElement(null, elPath));
      continue;
    }

    if (Array.isArray(el)) {
      lines.push("-");
      emitArrayElements(lines, el, opt, elPath);
      // nested array element: leave nested array back to parent array
      lines.push("<");
      continue;
    }

    if (isPlainObject(el)) {
      lines.push(">");
      const keys = orderedKeys(el, opt.keyOrder);
      for (const k of keys) {
        emitObjectEntry(lines, k, /** @type {any} */ (el)[k], opt, `${elPath}.${k}`);
      }
      lines.push("<");
      continue;
    }

    // scalar element
    lines.push(formatScalarElement(el, elPath));
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 */
function formatScalarElement(value, path) {
  if (value === null) return ":null";
  if (typeof value === "boolean") return `:${value ? "true" : "false"}`;
  if (typeof value === "number") return `:${formatNumberToken(value, path)}`;
  if (typeof value === "string") {
    assertNoNewline(value, path);
    if (needsForcedString(value)) return `: ${value}`;
    return `:${value}`;
  }
  throw new XaiopEncodeError(
    `unsupported array element type: ${typeName(value)}`,
    { path },
  );
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {string} path
 */
function formatContent(key, value, path) {
  if (value === null) return `${key}:null`;
  if (typeof value === "boolean") return `${key}:${value ? "true" : "false"}`;
  if (typeof value === "number") {
    return `${key}:${formatNumberToken(value, path)}`;
  }
  if (typeof value === "string") {
    assertNoNewline(value, path);
    if (needsForcedString(value)) return `${key}: ${value}`;
    return `${key}:${value}`;
  }
  throw new XaiopEncodeError(
    `unsupported value type: ${typeName(value)}`,
    { path },
  );
}

/**
 * @param {number} n
 * @param {string} path
 */
function formatNumberToken(n, path) {
  if (!Number.isFinite(n)) {
    throw new XaiopEncodeError(
      `non-finite numbers are not encodable as float tokens (${String(n)})`,
      { path },
    );
  }
  // Prefer int token when safe integer
  if (Number.isInteger(n) && Number.isSafeInteger(n)) {
    return String(n);
  }
  // binary64 — ECMAScript Number stringification is the host surface
  const s = String(n);
  // Guard: ensure our float/int tokenizers would accept this
  if (/^[+-]?\d+$/.test(s)) return s;
  if (
    /^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) ||
    /^[+-]?\d+[eE][+-]?\d+$/.test(s)
  ) {
    return s;
  }
  // Extremely unlikely for finite Number; fall back to JSON number text
  const j = JSON.stringify(n);
  if (typeof j === "string") return j;
  throw new XaiopEncodeError(`cannot format number: ${String(n)}`, { path });
}

/** @param {string} s */
function needsForcedString(s) {
  if (s === "true" || s === "false" || s === "null") return true;
  if (/^[+-]?\d+$/.test(s)) return true;
  if (
    /^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) ||
    /^[+-]?\d+[eE][+-]?\d+$/.test(s)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} key
 * @param {string} path
 */
function assertKey(key, path) {
  if (typeof key !== "string" || key.length === 0) {
    throw new XaiopEncodeError("object keys must be non-empty strings", {
      path,
    });
  }
  if (/\s/.test(key) || key.includes(":")) {
    throw new XaiopEncodeError(
      `invalid label name: ${JSON.stringify(key)}`,
      { path },
    );
  }
  // Trailing "-" selects named-array enter (`>name-`). Encoding an object key
  // that ends with "-" would silently change shape (object → array).
  if (key.endsWith("-")) {
    throw new XaiopEncodeError(
      `invalid label name (trailing "-" reserved for arrays): ${JSON.stringify(key)}`,
      { path },
    );
  }
  // Operator / path characters make Structure lines ambiguous.
  if (/[><=!]/.test(key)) {
    throw new XaiopEncodeError(
      `invalid label name (contains Cursor/operator character): ${JSON.stringify(key)}`,
      { path },
    );
  }
}

/**
 * @param {string} s
 * @param {string} path
 */
function assertNoNewline(s, path) {
  if (s.includes("\n") || s.includes("\r")) {
    throw new XaiopEncodeError("string values must not contain CR/LF", {
      path,
    });
  }
}

/** @param {unknown} v */
function isPlainObject(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** @param {unknown} v */
function typeName(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * @param {string[]} lines
 * @param {boolean} finalDot
 */
function joinWire(lines, finalDot) {
  // Drop redundant `<` immediately before `.` or EOF when it only undoes an
  // object enter that the next phase/root reset makes unnecessary?
  // Keep `<` for correctness inside a phase with siblings.
  const cleaned = collapseRedundantLeavesBeforePhase(lines);
  if (finalDot) cleaned.push(".");
  return cleaned.join("\n") + "\n";
}

/**
 * If an object entry ends with `<` and the next line is `.` or end, the leave
 * is redundant (`.` resets; EOF ends). Removing it keeps wire shorter and
 * matches common generator style for last property in a phase.
 * @param {string[]} lines
 */
function collapseRedundantLeavesBeforePhase(lines) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    if (line === "<" && (next === "." || next === undefined)) {
      continue;
    }
    out.push(line);
  }
  return out;
}
