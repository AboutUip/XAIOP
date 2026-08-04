// @ts-nocheck
/**
 * Optional parse-chain history (flight recorder) for `.` phase boundaries.
 *
 * Two independent modes (both default **off**):
 * - **Snapshot** — read-only cursor: export time-root, range view, compare, URL lifecycle.
 * - **Realtime** — live jump: keep positioning node, permanently discard everything after.
 *
 * Both may be enabled together: inspect via snapshot, then cut the live sequence with realtime.
 */

import { cloneJson } from "./clone.js";
import { parseSync } from "./parse.js";
import { materializeSnapshot } from "./materialize.js";

/** @typedef {'dot'|'tail'} HistoryNodeKind */

/**
 * @typedef {{
 *   index: number,
 *   kind: HistoryNodeKind,
 *   bufferStart: number,
 *   bufferEnd: number,
 *   wire: string|null,
 *   before: unknown,
 *   after: unknown,
 *   diff: unknown,
 * }} HistoryNode
 */

export const HISTORY_NODE_KIND = Object.freeze({
  DOT: /** @type {'dot'} */ ("dot"),
  TAIL: /** @type {'tail'} */ ("tail"),
});

/**
 * @param {{
 *   snapshot?: boolean,
 *   realtime?: boolean,
 *   retainWire?: boolean,
 *   compat?: boolean|object|false,
 * }} [options]
 */
export class ParseHistory {
  constructor(options = {}) {
    /** @type {boolean} */
    this._snapshot = options.snapshot === true;
    /** @type {boolean} */
    this._realtime = options.realtime === true;
    /** @type {boolean} */
    this._retainWire = options.retainWire !== false;
    /** @type {boolean|object|false} */
    this._compat = options.compat ?? false;

    /** @type {HistoryNode[]} */
    this._nodes = [];
    /**
     * Realtime live cursor. Starts at `-1` (before first node).
     * `jumpTo(i)` requires `i > liveCursor` (forward-only along the retained sequence).
     * @type {number}
     */
    this._liveCursor = -1;
    /** @type {string|null} */
    this._sourceKey = null;
    /**
     * Maintained read-only range view for snapshot mode.
     * @type {{ from: number, to: number, nodes: HistoryNode[], json: unknown }|null}
     */
    this._rangeView = null;
  }

  /** True when either mode is on. */
  get enabled() {
    return this._snapshot || this._realtime;
  }

  get snapshotEnabled() {
    return this._snapshot;
  }

  get realtimeEnabled() {
    return this._realtime;
  }

  /** Whether per-node wire text is retained (for `jumpTo` rebuild). */
  get retainWireEnabled() {
    return this._retainWire;
  }

  get length() {
    return this._nodes.length;
  }

  /**
   * Drop all history nodes and range view (e.g. before `compactCommitted`).
   * Modes (snapshot / realtime / retainWire) stay as constructed.
   * @returns {this}
   */
  clear() {
    this._nodes.length = 0;
    this._liveCursor = -1;
    this._rangeView = null;
    return this;
  }

  /** Realtime head index (`-1` before any jump). */
  get liveCursor() {
    return this._liveCursor;
  }

  get sourceKey() {
    return this._sourceKey;
  }

  /**
   * Anytime info snapshot (safe to log / UI).
   * @returns {{
   *   snapshot: boolean,
   *   realtime: boolean,
   *   length: number,
   *   liveCursor: number,
   *   sourceKey: string|null,
   *   hasRangeView: boolean,
   *   rangeView: { from: number, to: number }|null,
   * }}
   */
  info() {
    return {
      snapshot: this._snapshot,
      realtime: this._realtime,
      length: this._nodes.length,
      liveCursor: this._liveCursor,
      sourceKey: this._sourceKey,
      hasRangeView: this._rangeView != null,
      rangeView: this._rangeView
        ? { from: this._rangeView.from, to: this._rangeView.to }
        : null,
    };
  }

  /**
   * Append a phase-boundary record. No-op when both modes are off.
   * @param {{
   *   kind?: HistoryNodeKind,
   *   bufferStart: number,
   *   bufferEnd: number,
   *   wire?: string,
   *   before: unknown,
   *   after: unknown,
   *   diff: unknown,
   * }} entry
   * @returns {HistoryNode|null}
   */
  record(entry) {
    if (!this.enabled) return null;
    const index = this._nodes.length;
    /** @type {HistoryNode} */
    const node = {
      index,
      kind: entry.kind === HISTORY_NODE_KIND.TAIL ? HISTORY_NODE_KIND.TAIL : HISTORY_NODE_KIND.DOT,
      bufferStart: entry.bufferStart | 0,
      bufferEnd: entry.bufferEnd | 0,
      wire: this._retainWire
        ? entry.wire != null
          ? String(entry.wire)
          : null
        : null,
      before: cloneJson(entry.before),
      after: cloneJson(entry.after),
      diff: cloneJson(entry.diff),
    };
    this._nodes.push(node);
    // Ingest advances the tip; realtime cursor stays until jump (forward from -1).
    this._invalidateRangeIfNeeded();
    return node;
  }

  /**
   * Snapshot: export the full node array as a **time root** (deep clone).
   * @returns {HistoryNode[]}
   */
  exportTimeRoot() {
    this._requireSnapshot("exportTimeRoot");
    return this._nodes.map((n) => cloneNode(n));
  }

  /**
   * @param {number} index
   * @returns {HistoryNode}
   */
  getNode(index) {
    return cloneNode(this._nodeAt(index));
  }

  /** @param {number} index */
  getDiff(index) {
    return cloneJson(this._nodeAt(index).diff);
  }

  /** @param {number} index */
  getBefore(index) {
    return cloneJson(this._nodeAt(index).before);
  }

  /** @param {number} index */
  getAfter(index) {
    return cloneJson(this._nodeAt(index).after);
  }

  /**
   * Snapshot: read-only compare of `after` trees at two indices.
   * @param {number} indexA
   * @param {number} indexB
   * @returns {{ a: unknown, b: unknown, indexA: number, indexB: number }}
   */
  compare(indexA, indexB) {
    this._requireSnapshot("compare");
    return {
      indexA,
      indexB,
      a: this.getAfter(indexA),
      b: this.getAfter(indexB),
    };
  }

  /**
   * Snapshot: maintain a read-only view over `[from, to]` (inclusive).
   * Re-parses concatenated retained wire when available; otherwise uses `after` of `to`.
   * @param {number} from
   * @param {number} to
   * @returns {{ from: number, to: number, nodes: HistoryNode[], json: unknown }}
   */
  viewRange(from, to) {
    this._requireSnapshot("viewRange");
    const a = this._normalizeIndex(from);
    const b = this._normalizeIndex(to);
    if (a > b) {
      throw new RangeError(`viewRange: from (${from}) > to (${to})`);
    }
    if (
      this._rangeView &&
      this._rangeView.from === a &&
      this._rangeView.to === b
    ) {
      return {
        from: a,
        to: b,
        nodes: this._rangeView.nodes.map((n) => cloneNode(n)),
        json: cloneJson(this._rangeView.json),
      };
    }

    const slice = this._nodes.slice(a, b + 1);
    const nodes = slice.map((n) => cloneNode(n));
    let json;
    const wires = slice.map((n) => n.wire).filter((w) => w != null);
    if (wires.length === slice.length) {
      const text = /** @type {string[]} */ (wires).join("");
      json = materializeSnapshot(parseSync(text, this._compat));
    } else {
      json = cloneJson(slice[slice.length - 1].after);
    }
    this._rangeView = { from: a, to: b, nodes, json };
    return {
      from: a,
      to: b,
      nodes: nodes.map((n) => cloneNode(n)),
      json: cloneJson(json),
    };
  }

  /**
   * Snapshot lifecycle: bind a source key (e.g. stream URL).
   * A **different** key releases retained nodes + range view.
   * @param {string|null|undefined} key
   * @returns {{ released: boolean, previous: string|null }}
   */
  setSource(key) {
    this._requireSnapshot("setSource");
    const next =
      key == null || key === ""
        ? null
        : typeof key === "string"
          ? key
          : String(key);
    const previous = this._sourceKey;
    if (previous != null && next != null && previous !== next) {
      this._releaseSnapshotData();
      this._sourceKey = next;
      return { released: true, previous };
    }
    if (previous != null && next == null) {
      this._releaseSnapshotData();
      this._sourceKey = null;
      return { released: true, previous };
    }
    this._sourceKey = next;
    return { released: false, previous };
  }

  /** Clear range view and all recorded nodes (snapshot release). */
  release() {
    this._requireSnapshot("release");
    this._releaseSnapshotData();
    this._sourceKey = null;
  }

  /**
   * Realtime: jump live head forward to `index`.
   * Keeps nodes `[0..index]` (positioning node retained); discards everything after.
   * Requires `index > liveCursor` (forward-only). Discarded nodes cannot be restored.
   *
   * @param {number} index
   * @returns {{
   *   index: number,
   *   kept: number,
   *   discarded: number,
   *   after: unknown,
   *   bufferEnd: number,
   *   wirePrefix: string|null,
   * }}
   */
  jumpTo(index) {
    this._requireRealtime("jumpTo");
    const i = this._normalizeIndex(index);
    if (i <= this._liveCursor) {
      throw new RangeError(
        `realtime jumpTo only moves forward (index ${i} <= liveCursor ${this._liveCursor})`,
      );
    }
    const discarded = this._nodes.length - (i + 1);
    const keptNodes = this._nodes.slice(0, i + 1);
    this._nodes = keptNodes;
    this._liveCursor = i;
    this._rangeView = null;

    const tip = keptNodes[i];
    let wirePrefix = null;
    if (this._retainWire && keptNodes.every((n) => n.wire != null)) {
      wirePrefix = keptNodes.map((n) => n.wire).join("");
    }

    return {
      index: i,
      kept: keptNodes.length,
      discarded: Math.max(0, discarded),
      after: cloneJson(tip.after),
      bufferEnd: tip.bufferEnd,
      wirePrefix,
    };
  }

  /** @param {number} index */
  canJumpTo(index) {
    if (!this._realtime) return false;
    if (!Number.isInteger(index) || index < 0 || index >= this._nodes.length) {
      return false;
    }
    return index > this._liveCursor;
  }

  // --- internals ---

  /** @param {string} api */
  _requireSnapshot(api) {
    if (!this._snapshot) {
      throw new Error(`ParseHistory.${api} requires snapshot mode`);
    }
  }

  /** @param {string} api */
  _requireRealtime(api) {
    if (!this._realtime) {
      throw new Error(`ParseHistory.${api} requires realtime mode`);
    }
  }

  /** @param {number} index */
  _normalizeIndex(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this._nodes.length) {
      throw new RangeError(
        `history index out of range: ${index} (length ${this._nodes.length})`,
      );
    }
    return index;
  }

  /** @param {number} index */
  _nodeAt(index) {
    return this._nodes[this._normalizeIndex(index)];
  }

  _releaseSnapshotData() {
    this._nodes = [];
    this._liveCursor = -1;
    this._rangeView = null;
  }

  _invalidateRangeIfNeeded() {
    if (!this._rangeView) return;
    if (this._rangeView.to >= this._nodes.length) {
      this._rangeView = null;
    }
  }
}

/** @param {HistoryNode} n */
function cloneNode(n) {
  return {
    index: n.index,
    kind: n.kind,
    bufferStart: n.bufferStart,
    bufferEnd: n.bufferEnd,
    wire: n.wire,
    before: cloneJson(n.before),
    after: cloneJson(n.after),
    diff: cloneJson(n.diff),
  };
}
