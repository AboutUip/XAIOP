/**
 * JSON → XAIOP encoder (protocol v0.4.0 wire).
 *
 * Emits strict wire only (no compatibility-mode shapes).
 * `.` frequency is controlled by `dotPolicy` / `phaseEvery` / `shouldPhase`,
 * or by a **path-array overload** of `dotPolicy` (JSON paths like `a.b[0].c`).
 * Aligns with DotCheckpointEngine phase boundaries.
 */

/** @typedef {'none'|'perTopLevelKey'|'perNKeys'|'custom'} DotPolicyName */

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
 *   dotPolicy?: DotPolicyName|string[],
 *   phaseEvery?: number,
 *   maxPhases?: number,
 *   finalDot?: boolean,
 *   keyOrder?: 'insertion'|'sorted',
 *   nullPolicy?: 'encode'|'omit'|'error',
 *   undefinedPolicy?: 'omit'|'error',
 *   shouldPhase?: (ctx: PhaseContext) => boolean,
 * }} EncodeOptions
 */

/** @typedef {DotPolicyName} DotPolicy */

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

  if (opt.pathCuts) {
    return encodeWithPathCuts(value, opt);
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
 */
function normalizeOptions(options) {
  const rawPolicy = options.dotPolicy ?? DOT_POLICY.PER_TOP_LEVEL_KEY;

  if (Array.isArray(rawPolicy)) {
    return normalizePathCutOptions(options, rawPolicy);
  }

  const dotPolicy = rawPolicy;
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
    /** @type {null} */
    pathCuts: null,
  };
}

/**
 * @param {EncodeOptions} options
 * @param {string[]} paths
 */
function normalizePathCutOptions(options, paths) {
  if (options.phaseEvery != null) {
    throw new XaiopEncodeError(
      "dotPolicy path array is mutually exclusive with phaseEvery",
    );
  }
  if (options.maxPhases != null) {
    throw new XaiopEncodeError(
      "dotPolicy path array is mutually exclusive with maxPhases",
    );
  }
  if (options.shouldPhase != null) {
    throw new XaiopEncodeError(
      "dotPolicy path array is mutually exclusive with shouldPhase",
    );
  }

  const style = options.style ?? "reset";
  if (style !== "reset") {
    throw new XaiopEncodeError(
      "dotPolicy path array requires style:'reset' (phase `.` resets Cursor)",
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

  /** @type {string[]} */
  const normalized = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (typeof p !== "string" || p.length === 0) {
      throw new XaiopEncodeError(
        `dotPolicy path array entry ${i} must be a non-empty string`,
      );
    }
    const segs = parseJsonPath(p);
    // Index may only be terminal (or followed by further indexes). Cutting inside
    // an array *element object* cannot round-trip: after `.`, `>name-` appends a
    // new element (protocol); there is no index locate on the wire.
    for (let s = 0; s < segs.length; s++) {
      if (typeof segs[s] === "number") {
        for (let t = s + 1; t < segs.length; t++) {
          if (typeof segs[t] !== "number") {
            throw new XaiopEncodeError(
              `dotPolicy path cannot cut inside an array element object (index must be final): ${JSON.stringify(p)}`,
              { path: p },
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
    style: /** @type {'reset'} */ ("reset"),
    /** sentinel — path mode */
    dotPolicy: /** @type {any} */ ("__paths__"),
    phaseEvery: Number.MAX_SAFE_INTEGER,
    maxPhases: null,
    finalDot: !!options.finalDot,
    keyOrder,
    nullPolicy,
    undefinedPolicy,
    shouldPhase: undefined,
    pathCuts: normalized,
  };
}

/**
 * @param {unknown} value
 * @param {ReturnType<typeof normalizeOptions>} opt
 */
function encodeWithPathCuts(value, opt) {
  const rootKind = resolveRoot(value, opt.root);
  const cutSet = new Set(opt.pathCuts);

  // Strict: every listed path must exist on the value.
  for (const p of opt.pathCuts) {
    assertPathExists(value, rootKind, parseJsonPath(p), p);
  }

  /** @type {string[]} */
  const lines = [];
  /** @type {(string|number)[]} */
  let openStack = [];
  let afterDot = false;

  /**
   * Ensure Cursor is inside `targetAncestors`. After `.`, reopen document root
   * then replay ancestor enters.
   *
   * @param {(string|number)[]} targetAncestors
   * @param {'object'|'array'} rootKindLocal
   * @param {{ arrayTail?: boolean }} [opts] `arrayTail:true` when the last
   *   string segment is a named array container (no following index in path).
   */
  function reopenTo(targetAncestors, rootKindLocal, opts = {}) {
    const arrayTail = opts.arrayTail === true;

    if (afterDot || lines.length === 0) {
      if (rootKindLocal === "array") lines.push("-");
      else lines.push(">");
      afterDot = false;
      openStack = [];
    }

    let i = 0;
    while (
      i < openStack.length &&
      i < targetAncestors.length &&
      openStack[i] === targetAncestors[i]
    ) {
      i++;
    }
    while (openStack.length > i) {
      lines.push("<");
      openStack.pop();
    }

    for (let j = i; j < targetAncestors.length; j++) {
      const seg = targetAncestors[j];
      if (typeof seg === "number") {
        // Index markers track which element we are emitting; the element
        // opener (`>` / `-` / scalar) is written by the emit helpers.
        openStack.push(seg);
        continue;
      }
      const next = targetAncestors[j + 1];
      const isArrayEnter =
        typeof next === "number" ||
        (arrayTail && j === targetAncestors.length - 1);
      lines.push(isArrayEnter ? `>${seg}-` : `>${seg}`);
      openStack.push(seg);
    }
  }

  /**
   * @param {(string|number)[]} segs
   */
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
        { path: "$" },
      );
    }
    const keys = orderedKeys(value, opt.keyOrder);
    if (keys.length === 0) {
      lines.push(">");
      return joinWire(lines, opt.finalDot);
    }
    for (const key of keys) {
      emitObjectPath(key, /** @type {any} */ (value)[key], [key], rootKind);
    }
  }

  if (cutSet.size > 0) {
    // Should be unreachable if assertPathExists passed and walk covered all.
    const left = [...cutSet].join(", ");
    throw new XaiopEncodeError(
      `dotPolicy paths not reached during encode: ${left}`,
    );
  }

  return joinWire(lines, opt.finalDot);

  /**
   * @param {string} key
   * @param {unknown} val
   * @param {(string|number)[]} segs
   * @param {'object'|'array'} rootKindLocal
   */
  function emitObjectPath(key, val, segs, rootKindLocal) {
    assertKey(key, formatJsonPath(segs));

    if (val === undefined) {
      if (opt.undefinedPolicy === "error") {
        throw new XaiopEncodeError("undefined value not allowed", {
          path: formatJsonPath(segs),
        });
      }
      return;
    }

    const parentSegs = segs.slice(0, -1);
    reopenTo(parentSegs, rootKindLocal);

    if (val === null) {
      if (opt.nullPolicy === "error") {
        throw new XaiopEncodeError("null value not allowed", {
          path: formatJsonPath(segs),
        });
      }
      if (opt.nullPolicy === "omit") {
        return;
      }
      lines.push(formatContent(key, null, formatJsonPath(segs)));
      // Content does not push stack; cut still applies to this node.
      maybeCut(segs);
      return;
    }

    if (Array.isArray(val)) {
      lines.push(`>${key}-`);
      openStack.push(key);
      emitArrayPath(val, segs, rootKindLocal);
      // leave array unless cut already reset
      if (!afterDot && openStack.length && openStack[openStack.length - 1] === key) {
        lines.push("<");
        openStack.pop();
      }
      maybeCut(segs);
      return;
    }

    if (isPlainObject(val)) {
      lines.push(`>${key}`);
      openStack.push(key);
      const keys = orderedKeys(val, opt.keyOrder);
      for (const k of keys) {
        emitObjectPath(k, /** @type {any} */ (val)[k], [...segs, k], rootKindLocal);
      }
      if (!afterDot && openStack.length && openStack[openStack.length - 1] === key) {
        lines.push("<");
        openStack.pop();
      }
      maybeCut(segs);
      return;
    }

    lines.push(formatContent(key, val, formatJsonPath(segs)));
    maybeCut(segs);
  }

  /**
   * @param {unknown[]} arr
   * @param {(string|number)[]} arrSegs path of the array itself
   * @param {'object'|'array'} rootKindLocal
   */
  function emitArrayPath(arr, arrSegs, rootKindLocal) {
    // Ensure array container is open (root `-` or named `>key-` via reopenTo).
    if (arrSegs.length === 0) {
      reopenTo([], rootKindLocal);
    }

    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      const elSegs = [...arrSegs, i];
      const elPath = formatJsonPath(elSegs);

      if (el === undefined) {
        throw new XaiopEncodeError(
          "sparse arrays (undefined elements) are not encodable",
          { path: elPath },
        );
      }

      // Position stack at the array container (named arrays use >key-).
      reopenTo(arrSegs, rootKindLocal, { arrayTail: arrSegs.length > 0 });
      // openStack should end at array key (or root array with empty segs).
      openStack.push(i);

      if (el === null) {
        if (opt.nullPolicy === "error") {
          throw new XaiopEncodeError("null array element not allowed", {
            path: elPath,
          });
        }
        lines.push(formatScalarElement(null, elPath));
        openStack.pop();
        maybeCut(elSegs);
        continue;
      }

      if (Array.isArray(el)) {
        lines.push("-");
        // nested array: openStack already has index; emit children under elSegs
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
          emitObjectPath(k, /** @type {any} */ (el)[k], [...elSegs, k], rootKindLocal);
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

  /**
   * Nested anonymous array under an array element (stack already on parent index).
   * @param {unknown[]} arr
   * @param {(string|number)[]} arrSegs
   * @param {'object'|'array'} rootKindLocal
   */
  function emitArrayPathNested(arr, arrSegs, rootKindLocal) {
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      const elSegs = [...arrSegs, i];
      const elPath = formatJsonPath(elSegs);
      if (el === undefined) {
        throw new XaiopEncodeError(
          "sparse arrays (undefined elements) are not encodable",
          { path: elPath },
        );
      }
      openStack.push(i);
      if (el === null) {
        if (opt.nullPolicy === "error") {
          throw new XaiopEncodeError("null array element not allowed", {
            path: elPath,
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
          emitObjectPath(k, /** @type {any} */ (el)[k], [...elSegs, k], rootKindLocal);
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

/**
 * Parse JSON path: `a.b[0].c` → ['a','b',0,'c']
 * @param {string} path
 * @returns {(string|number)[]}
 */
export function parseJsonPath(path) {
  if (typeof path !== "string" || path.length === 0) {
    throw new XaiopEncodeError("JSON path must be a non-empty string");
  }
  /** @type {(string|number)[]} */
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
          `invalid array index in path: ${JSON.stringify(path)}`,
        );
      }
      if (segs.length === 0) {
        throw new XaiopEncodeError(
          `JSON path cannot start with an index: ${JSON.stringify(path)}`,
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
      // Allow same labels encode accepts (no : space operators); keep strict-ish
      if (/\s|:|[><=!]/.test(name) || name.endsWith("-") || name.length === 0) {
        throw new XaiopEncodeError(
          `invalid path segment: ${JSON.stringify(name)}`,
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

/**
 * @param {(string|number)[]} segs
 */
export function formatJsonPath(segs) {
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

/**
 * @param {unknown} root
 * @param {'object'|'array'} rootKind
 * @param {(string|number)[]} segs
 * @param {string} pathStr
 */
function assertPathExists(root, rootKind, segs, pathStr) {
  let cur = root;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (typeof seg === "number") {
      if (!Array.isArray(cur)) {
        throw new XaiopEncodeError(
          `dotPolicy path not found (not an array): ${JSON.stringify(pathStr)}`,
          { path: pathStr },
        );
      }
      if (seg < 0 || seg >= cur.length) {
        throw new XaiopEncodeError(
          `dotPolicy path not found: ${JSON.stringify(pathStr)}`,
          { path: pathStr },
        );
      }
      cur = cur[seg];
    } else {
      if (cur === null || typeof cur !== "object" || Array.isArray(cur)) {
        throw new XaiopEncodeError(
          `dotPolicy path not found: ${JSON.stringify(pathStr)}`,
          { path: pathStr },
        );
      }
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) {
        throw new XaiopEncodeError(
          `dotPolicy path not found: ${JSON.stringify(pathStr)}`,
          { path: pathStr },
        );
      }
      cur = /** @type {any} */ (cur)[seg];
    }
  }
  // rootKind unused but documents expectation
  void rootKind;
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
        emitObjectEntry(lines, k, /** @type {any} */ (el)[k], opt, `${elPath}.${k}`);
      }
      lines.push("<");
      continue;
    }

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
  if (Number.isInteger(n) && Number.isSafeInteger(n)) {
    return String(n);
  }
  const s = String(n);
  if (/^[+-]?\d+$/.test(s)) return s;
  if (
    /^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) ||
    /^[+-]?\d+[eE][+-]?\d+$/.test(s)
  ) {
    return s;
  }
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
  if (key.endsWith("-")) {
    throw new XaiopEncodeError(
      `invalid label name (trailing "-" reserved for arrays): ${JSON.stringify(key)}`,
      { path },
    );
  }
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
  const cleaned = collapseRedundantLeavesBeforePhase(lines);
  if (finalDot) cleaned.push(".");
  return cleaned.join("\n") + "\n";
}

/**
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
