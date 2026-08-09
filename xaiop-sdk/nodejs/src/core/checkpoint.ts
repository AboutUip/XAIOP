// @ts-nocheck
import { scheduleImmediate } from "./schedule.js";
/**
 * Dot-checkpoint stream parser (XAIOP PROT-HIER / PROT-BOUND).
 *
 * `.` bounds **phases**. Diff is the phase document (later-wins unit);
 * Commit is the live cumulative tree.
 *
 * `cover: true` — at consecutive `&` runs, inject `.`, emit deepest-key `null`
 * tombstone Diffs, then restore Cursor with a `>` chain before following lines
 * (canonical wire for history). Default `cover: false` only updates the live
 * tree; already-emitted Diffs are not rewritten.
 *
 * Performance (space/speed):
 * - One LiveXaiopParser for Commit (phase lines fed once, no prefix re-parse).
 * - First phase / `=`/`!`/`&`/`@`: one materialize for Diff; Commit stays live-backed
 *   until read (avoids Diff≡Commit double clone).
 * - Later ordinary Diff: owned parseSync (no redundant clone of a fresh tree).
 * - `emitDiff: false` skips Diff parse when callers only need Commit/final; `onChunk` optional.
 * - `compactCommitted()` discards `buffer[0..committedAt)` while keeping the live tree (long sessions).
 * - `mergeChunkWindow` (default true): batch all complete `.` in the current
 *   buffer window into one feed + one Commit + one onChunk (not per true net chunk).
 * - `streamProcessing` (default true): mid-stream `.` phase scan (same as Stream / WS).
 * - `pushAsync` / `finishAsync`: coalesce drains on setImmediate (yield + fewer scans).
 */

import { cloneJson } from "./clone.js";
import { LiveXaiopParser, parseSync } from "./parse.js";
import { ParseHistory } from "./history.js";
import { materializeOwned, materializeSnapshot } from "./materialize.js";
import { runLineInterceptChain } from "./line-intercept.js";
import { applyAnnotationSpans } from "./annotation-span.js";

/**
 * @typedef {import("./line-intercept.js").LineView} LineView
 * @typedef {import("./line-intercept.js").LineInterceptHandler} LineInterceptHandler
 * @typedef {import("./annotation-span.js").AnnotationSpanHandler} AnnotationSpanHandler
 *
 * @typedef {object} CheckpointHooks
 * @property {false|boolean|object} compat
 * @property {boolean} [streamProcessing] Mid-stream `.` phases (default true; same as XaiopStream / WS)
 * @property {boolean} [symbolKeys] Decode U+001F label escapes (default false; pair with encode `symbolKeys`)
 * @property {((diff: unknown, meta?: { typeCheckEscapePaths?: string[], seq?: number, seqs?: number[], logSeq?: number, logSeqs?: number[] }) => void)|undefined} [onChunk] Optional; omitted / non-function → Diff delivery no-ops (Commit still runs). Safe with `emitDiff: false`.
 * @property {boolean} [emitDiff]
 * @property {boolean} [mergeChunkWindow]
 * @property {boolean} [cover] Cover-mode Diff for `&` (default false)
 * @property {boolean} [historySnapshot] Opt-in read-only history (default false)
 * @property {boolean} [historyRealtime] Opt-in realtime forward-jump history (default false)
 * @property {boolean} [retainWireHistory] Retain per-node wire when history on (default true)
 * @property {LineInterceptHandler|LineInterceptHandler[]} [lineIntercept] Initial line interceptors
 * @property {AnnotationSpanHandler|AnnotationSpanHandler[]} [annotationSpan] Initial # span handlers
 * @property {boolean} [phaseSeq] Allocate monotonic phase seq in onChunk meta (default true)
 */

export class DotCheckpointEngine {
  /** @param {CheckpointHooks} hooks */
  constructor(hooks) {
    this._hooks = hooks;
    /** @type {boolean} */
    this._streamProcessing = hooks.streamProcessing !== false;
    /** @type {boolean} */
    this._emitDiff = hooks.emitDiff !== false;
    /** @type {boolean} */
    this._mergeChunkWindow = hooks.mergeChunkWindow !== false;
    /** @type {boolean} */
    this._cover = hooks.cover === true;
    /** @type {string} */
    this._buffer = "";
    /** @type {number} */
    this._segmentStart = 0;
    /** @type {number} */
    this._scanAt = 0;
    /** @type {boolean} */
    this._sawDot = false;
    /** @type {unknown|undefined} */
    this._latestSnapshot = undefined;
    /** Bytes of buffer covered by completed phases (through last `.` or flushed tail). */
    this._committedAt = 0;
    /**
     * Cached materialized commit, or `null` when empty commit, or `undefined`
     * when live tree is authoritative but not yet cloned.
     * @type {unknown|null|undefined}
     */
    this._committedSnapshot = null;
    /** Live tree matches last commit boundary (may need materialize on read). */
    this._commitFromLive = false;
    this._closed = false;
    /** @type {LiveXaiopParser|null} */
    this._live = null;
    /** Lines of the current open phase (avoid re-split of raw on commit). */
    /** @type {string[]} */
    this._phaseLines = [];

    /** @type {boolean} */
    this._asyncDrainScheduled = false;
    /** @type {Promise<void>|null} */
    this._asyncDrainPromise = null;
    /** @type {(() => void)|null} */
    this._asyncDrainCancel = null;

    const snap = hooks.historySnapshot === true;
    const live = hooks.historyRealtime === true;
    /** @type {ParseHistory|null} */
    this._history =
      snap || live
        ? new ParseHistory({
            snapshot: snap,
            realtime: live,
            retainWire: hooks.retainWireHistory !== false,
            compat: hooks.compat ?? false,
          })
        : null;

    /**
     * Pre-parse line interceptors (registration order).
     * Return `null` to skip the line; `string` to rewrite; `undefined` to keep.
     * @type {LineInterceptHandler[]}
     */
    this._lineInterceptors = [];
    if (hooks.lineIntercept) {
      const init = Array.isArray(hooks.lineIntercept)
        ? hooks.lineIntercept
        : [hooks.lineIntercept];
      for (let i = 0; i < init.length; i++) {
        if (typeof init[i] === "function") this._lineInterceptors.push(init[i]);
      }
    }

    /**
     * Phase `#` annotation-span handlers (after JSON capture, before Diff).
     * @type {AnnotationSpanHandler[]}
     */
    this._annotationSpanHandlers = [];
    /** @type {string[]} */
    this._pendingTypeCheckEscape = [];
    if (hooks.annotationSpan) {
      const init = Array.isArray(hooks.annotationSpan)
        ? hooks.annotationSpan
        : [hooks.annotationSpan];
      for (let i = 0; i < init.length; i++) {
        if (typeof init[i] === "function") {
          this._annotationSpanHandlers.push(init[i]);
        }
      }
    }

    /**
     * Monotonic phase sequence for resume (physical `.` / finish-tail units).
     * Disabled only when `phaseSeq: false`.
     * @type {boolean}
     */
    this._phaseSeqEnabled = hooks.phaseSeq !== false;
    /** @type {number} */
    this._phaseSeq = 0;
    /**
     * Seqs allocated for the next `_emitChunk` (window may batch several).
     * @type {number[]}
     */
    this._pendingSeqs = [];
    /**
     * Session-log seqs queued by `#!xaiop/seq/v1` (FIFO → next physical phases).
     * @type {number[]}
     */
    this._logSeqQueue = [];
    /**
     * Log seqs paired into the next `_emitChunk`.
     * @type {number[]}
     */
    this._pendingLogSeqs = [];
  }

  /**
   * Register a line interceptor (append; registration order = call order).
   * Fires after a complete logical line is split from the receive buffer and
   * **before** the line enters phase accumulation / `feedLine`.
   * Not related to `onChunk` / `onPhase` (those are post-parse Diff callbacks).
   *
   * Handler return:
   * - `string` — text actually fed downstream (next handler sees this)
   * - `null` — **skip** this line (short-circuit; ≠ Content `:null`)
   * - `undefined` — keep current text
   *
   * @param {LineInterceptHandler} fn
   * @returns {this}
   */
  onLineIntercept(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("onLineIntercept requires a function");
    }
    this._lineInterceptors.push(fn);
    return this;
  }

  /** Remove all line interceptors. @returns {this} */
  clearLineIntercepts() {
    this._lineInterceptors.length = 0;
    return this;
  }

  /** @returns {number} */
  get lineInterceptCount() {
    return this._lineInterceptors.length;
  }

  /**
   * Register a phase `#` annotation-span handler (append; registration order).
   * Fires when phase JSON for the capture is ready, **before** Diff / typeCheck.
   * Handler: `(annotation, view) => json|null|undefined`.
   * Remounted keys (and same-level capture keys) **escape typeCheck**.
   * @param {AnnotationSpanHandler} fn
   * @returns {this}
   */
  onAnnotationSpan(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("onAnnotationSpan requires a function");
    }
    this._annotationSpanHandlers.push(fn);
    return this;
  }

  /** @returns {this} */
  clearAnnotationSpans() {
    this._annotationSpanHandlers.length = 0;
    return this;
  }

  /** @returns {number} */
  get annotationSpanCount() {
    return this._annotationSpanHandlers.length;
  }

  /**
   * @param {string[]} lines
   * @returns {string[]}
   */
  _applyAnnotationSpans(lines) {
    if (this._annotationSpanHandlers.length === 0) return lines;
    const { lines: next, escapePaths } = applyAnnotationSpans(
      lines,
      this._annotationSpanHandlers,
    );
    if (escapePaths.length) {
      for (let i = 0; i < escapePaths.length; i++) {
        this._pendingTypeCheckEscape.push(escapePaths[i]);
      }
    }
    return next;
  }

  /** Highest completed phase seq (0 = none). */
  get phaseSeq() {
    return this._phaseSeq;
  }

  /**
   * Queue a session-log seq for the next physical phase unit(s).
   * Called when demux dispatches `#!xaiop/seq/v1`.
   * @param {number} seq
   * @returns {this}
   */
  noteLogSeq(seq) {
    const n = Number(seq);
    if (!Number.isInteger(n) || n < 1) {
      throw new TypeError("noteLogSeq requires seq >= 1");
    }
    this._logSeqQueue.push(n);
    return this;
  }

  /**
   * Allocate one seq for the next emit (call once per physical phase unit).
   * @returns {number|undefined}
   */
  _allocPhaseSeq() {
    if (!this._phaseSeqEnabled) return undefined;
    this._phaseSeq += 1;
    this._pendingSeqs.push(this._phaseSeq);
    if (this._logSeqQueue.length > 0) {
      this._pendingLogSeqs.push(this._logSeqQueue.shift());
    }
    return this._phaseSeq;
  }

  /** Emit Diff to hooks with optional typeCheck escape + phase seq metadata. */
  _emitChunk(diff) {
    const escapes = this._pendingTypeCheckEscape;
    this._pendingTypeCheckEscape = [];
    const seqs = this._pendingSeqs;
    this._pendingSeqs = [];
    const logSeqs = this._pendingLogSeqs;
    this._pendingLogSeqs = [];
    const cb = this._hooks.onChunk;
    if (typeof cb !== "function") return;
    /** @type {{ typeCheckEscapePaths?: string[], seq?: number, seqs?: number[], logSeq?: number, logSeqs?: number[] }} */
    const meta = {};
    if (escapes && escapes.length > 0) {
      meta.typeCheckEscapePaths = uniqueEscape(escapes);
    }
    if (seqs && seqs.length > 0) {
      meta.seqs = seqs.slice();
      meta.seq = seqs[seqs.length - 1];
    }
    if (logSeqs && logSeqs.length > 0) {
      meta.logSeqs = logSeqs.slice();
      meta.logSeq = logSeqs[logSeqs.length - 1];
    }
    if (Object.keys(meta).length > 0) {
      cb(diff, meta);
    } else {
      cb(diff);
    }
  }

  /**
   * @param {string} line
   * @returns {string|null}
   */
  _acceptLine(line) {
    if (this._lineInterceptors.length === 0) return line;
    return runLineInterceptChain(line, this._lineInterceptors);
  }

  /**
   * Wire used for Diff owned-parse / history when interceptors may have
   * rewritten or skipped lines (buffer slice would disagree with feed).
   * @param {string[]} lines
   * @param {number} bufferStart
   * @param {number} bufferEnd
   * @returns {string}
   */
  _phaseWire(lines, bufferStart, bufferEnd) {
    if (
      this._lineInterceptors.length > 0 ||
      this._annotationSpanHandlers.length > 0
    ) {
      return linesToWire(lines);
    }
    return this._buffer.slice(bufferStart, bufferEnd);
  }

  get buffer() {
    return this._buffer;
  }

  get snapshot() {
    return this._latestSnapshot;
  }

  get committedAt() {
    return this._committedAt;
  }

  /**
   * Receive-buffer sizes without reading the full wire string.
   * @returns {{
   *   length: number,
   *   committedAt: number,
   *   pendingBytes: number,
   *   openPhase: boolean,
   * }}
   */
  bufferStats() {
    const length = this._buffer.length;
    const committedAt = this._committedAt;
    return {
      length,
      committedAt,
      pendingBytes: Math.max(0, length - committedAt),
      openPhase: this._segmentStart < length,
    };
  }

  /**
   * Discard committed wire `buffer[0 .. committedAt)` while keeping the live
   * Commit tree and any uncommitted tail. Does **not** re-parse.
   *
   * Conflicts with parse history that still references buffer indices / retained
   * wire (especially `historyRealtime` + `retainWireHistory`). Pass
   * `{ dropHistory: true }` to clear history first, or disable those modes.
   *
   * @param {{ dropHistory?: boolean }} [options]
   * @returns {{ discardedBytes: number, length: number }}
   */
  compactCommitted(options = {}) {
    if (this._closed) {
      throw new Error("compactCommitted: checkpoint engine is closed");
    }
    this._resolveAsyncDrainEarly();

    const dropHistory = options.dropHistory === true;
    if (this._history) {
      if (
        this._history.realtimeEnabled &&
        this._history.retainWireEnabled &&
        !dropHistory
      ) {
        throw new Error(
          "compactCommitted conflicts with historyRealtime + retainWireHistory; pass dropHistory: true or disable retainWireHistory",
        );
      }
      if (this._history.length > 0 && !dropHistory) {
        throw new Error(
          "compactCommitted invalidates history buffer indices; pass dropHistory: true",
        );
      }
      if (dropHistory) {
        this._history.clear();
      }
    }

    const cut = this._committedAt | 0;
    if (cut <= 0) {
      return { discardedBytes: 0, length: this._buffer.length };
    }
    if (cut > this._buffer.length) {
      // Defensive: treat as full compact of available wire.
      const discardedBytes = this._buffer.length;
      this._buffer = "";
      this._committedAt = 0;
      this._segmentStart = 0;
      this._scanAt = 0;
      this._phaseLines = [];
      return { discardedBytes, length: 0 };
    }

    this._buffer = this._buffer.slice(cut);
    this._committedAt = 0;
    this._segmentStart = Math.max(0, this._segmentStart - cut);
    this._scanAt = Math.max(0, this._scanAt - cut);
    // Live tree + committedSnapshot / _commitFromLive unchanged.
    return { discardedBytes: cut, length: this._buffer.length };
  }

  /** Whether mid-stream `.` phase scanning is on (default true). */
  get streamProcessing() {
    return this._streamProcessing;
  }

  /** Whether buffer-window `.` batching is on (default true). */
  get mergeChunkWindow() {
    return this._mergeChunkWindow;
  }

  /**
   * Opt-in parse history (`null` when both history modes are off).
   * @returns {ParseHistory|null}
   */
  get history() {
    return this._history;
  }

  /**
   * Anytime history summary (empty object when history is off).
   */
  historyInfo() {
    return this._history ? this._history.info() : { snapshot: false, realtime: false, length: 0, liveCursor: -1, sourceKey: null, hasRangeView: false, rangeView: null };
  }

  /**
   * Realtime: jump live head forward to history index; discard nodes after.
   * Rebuilds Commit / buffer / live parser from the retained prefix.
   * @param {number} index
   */
  jumpTo(index) {
    if (!this._history || !this._history.realtimeEnabled) {
      throw new Error("jumpTo requires historyRealtime");
    }
    this._resolveAsyncDrainEarly();
    const result = this._history.jumpTo(index);
    this._rebuildFromHistoryJump(result);
    return result;
  }

  /**
   * @param {{
   *   after: unknown,
   *   bufferEnd: number,
   *   wirePrefix: string|null,
   * }} result
   */
  _rebuildFromHistoryJump(result) {
    const end = result.bufferEnd;
    if (result.wirePrefix != null) {
      this._buffer = result.wirePrefix;
    } else if (end <= this._buffer.length) {
      this._buffer = this._buffer.slice(0, end);
    } else {
      this._buffer = this._buffer.slice(0, Math.min(end, this._buffer.length));
    }
    this._live = new LiveXaiopParser({
      compat: this._hooks.compat,
      symbolKeys: this._hooks.symbolKeys === true,
    });
    if (this._buffer.length > 0) {
      if (this._lineInterceptors.length > 0) {
        let at = 0;
        while (at < this._buffer.length) {
          const info = readLine(this._buffer, at, true);
          if (!info) break;
          at = info.end;
          const accepted = this._acceptLine(info.line);
          if (accepted !== null) this._live.feedLine(accepted);
        }
      } else {
        this._live.feedText(this._buffer);
      }
    }
    this._sawDot = this._buffer.includes("\n.") || this._buffer.startsWith(".") || /(^|\n)\.\r?(\n|$)/.test(this._buffer);
    // Simpler: if history had any dot node, we saw a dot.
    this._sawDot = true;
    this._segmentStart = this._buffer.length;
    this._scanAt = this._buffer.length;
    this._phaseLines = [];
    this._committedAt = this._buffer.length;
    this._committedSnapshot = result.after ?? null;
    this._commitFromLive = false;
    this._latestSnapshot = undefined;
    this._closed = false;
  }

  /**
   * Materialized parse of buffer[0..committedAt).
   * Advances when a `.` phase completes or the unfinished tail is flushed at
   * `finish()` — never from mid-phase partial wire.
   *
   * After a phase commit the value may be **live-backed** until first read:
   * this getter materializes (and caches) then. Use `committedAt > 0` to test
   * whether a commit exists; do not treat a pre-read internal cache hole as
   * "no commit". Prefer this getter over guessing Diff/`onChunk` payloads.
   */
  get committedSnapshot() {
    if (this._commitFromLive && this._live) {
      this._committedSnapshot = materializeSnapshot(this._live.value());
      this._commitFromLive = false;
    }
    return this._committedSnapshot === undefined
      ? null
      : this._committedSnapshot;
  }

  /**
   * Synchronous ingest. Scans immediately (respects mergeChunkWindow).
   * @param {string} chunk
   */
  push(chunk) {
    if (this._closed) throw new Error("checkpoint engine is closed");
    if (typeof chunk !== "string") {
      throw new TypeError("stream chunk must be a string");
    }
    if (!chunk) return;
    this._buffer += chunk;
    this._resolveAsyncDrainEarly();
    if (this._streamProcessing) this._scanDots(false);
  }

  /**
   * Async ingest: append now, coalesce scan on `setImmediate`.
   * Multiple rapid `pushAsync` calls share one drain (true window merge across
   * bursts) and yield the event loop — not a thin Promise around `push`.
   * @param {string} chunk
   * @returns {Promise<void>}
   */
  pushAsync(chunk) {
    if (this._closed) {
      return Promise.reject(new Error("checkpoint engine is closed"));
    }
    if (typeof chunk !== "string") {
      return Promise.reject(new TypeError("stream chunk must be a string"));
    }
    if (!chunk) return Promise.resolve();
    this._buffer += chunk;
    if (!this._streamProcessing) return Promise.resolve();
    return this._scheduleAsyncDrain();
  }

  /**
   * Synchronous finish.
   */
  finish() {
    if (this._closed) return;
    this._resolveAsyncDrainEarly();
    this._finishBody();
  }

  /**
   * Async finish: await pending async drain, then finish on a later turn.
   * @returns {Promise<void>}
   */
  async finishAsync() {
    if (this._closed) return;
    if (this._asyncDrainPromise) {
      await this._asyncDrainPromise;
    }
    await new Promise((resolve, reject) => {
      scheduleImmediate(() => {
        try {
          if (!this._closed) this._finishBody();
          resolve();
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
  }

  _finishBody() {
    this._closed = true;

    if (!this._streamProcessing) {
      const value = this._parseOwned(this._buffer);
      this._storeCommit(this._buffer.length, value, false);
      this._allocPhaseSeq();
      this._emitChunk(value);
      this._latestSnapshot = value;
      this._segmentStart = this._buffer.length;
      this._scanAt = this._buffer.length;
      this._phaseLines = [];
      return;
    }

    this._scanDots(true);
    this._flushTail();
    if (this._committedAt === this._buffer.length) {
      this._latestSnapshot = this.committedSnapshot ?? undefined;
    } else {
      this._latestSnapshot = this._parseOwned(this._buffer);
      this._storeCommit(this._buffer.length, this._latestSnapshot, false);
    }
  }

  /** @returns {Promise<void>} */
  _scheduleAsyncDrain() {
    if (this._asyncDrainPromise) return this._asyncDrainPromise;
    let cancelled = false;
    this._asyncDrainCancel = () => {
      cancelled = true;
    };
    this._asyncDrainScheduled = true;
    this._asyncDrainPromise = new Promise((resolve, reject) => {
      scheduleImmediate(() => {
        this._asyncDrainScheduled = false;
        this._asyncDrainPromise = null;
        this._asyncDrainCancel = null;
        if (cancelled) {
          resolve();
          return;
        }
        try {
          if (!this._closed && this._streamProcessing) {
            this._scanDots(false);
          }
          resolve();
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
    return this._asyncDrainPromise;
  }

  /**
   * Sync `push` / `finish` already scanned (or will): cancel pending async drain
   * work so setImmediate does not double-scan; waiters still resolve.
   */
  _resolveAsyncDrainEarly() {
    if (this._asyncDrainCancel) this._asyncDrainCancel();
  }

  /** @param {boolean} atEof */
  _scanDots(atEof) {
    if (this._mergeChunkWindow) {
      this._scanDotsMerged(atEof);
      return;
    }
    while (this._scanAt < this._buffer.length) {
      const info = readLine(this._buffer, this._scanAt, atEof);
      if (!info) break;
      this._scanAt = info.end;
      const accepted = this._acceptLine(info.line);
      if (accepted === null) {
        if (!info.consumedNewline && atEof) break;
        continue;
      }
      this._phaseLines.push(accepted);
      if (accepted === ".") this._emitPhase(info.end);
      if (!info.consumedNewline && atEof) break;
    }
  }

  /**
   * Collect every complete `.` currently available, feed once, emit once.
   * @param {boolean} atEof
   */
  _scanDotsMerged(atEof) {
    /** @type {{ end: number, lines: string[], start: number }[]} */
    const closed = [];
    let phaseLines = this._phaseLines;
    let segmentStart = this._segmentStart;

    while (this._scanAt < this._buffer.length) {
      const info = readLine(this._buffer, this._scanAt, atEof);
      if (!info) break;
      this._scanAt = info.end;
      const accepted = this._acceptLine(info.line);
      if (accepted === null) {
        if (!info.consumedNewline && atEof) break;
        continue;
      }
      phaseLines.push(accepted);
      if (accepted === ".") {
        closed.push({
          end: info.end,
          lines: phaseLines,
          start: segmentStart,
        });
        phaseLines = [];
        segmentStart = info.end;
      }
      if (!info.consumedNewline && atEof) break;
    }

    this._phaseLines = phaseLines;
    this._segmentStart = segmentStart;

    if (closed.length === 0) return;
    this._emitClosedWindow(closed);
  }

  /**
   * @param {{ end: number, lines: string[], start: number }[]} closed
   */
  _emitClosedWindow(closed) {
    const lastEnd = closed[closed.length - 1].end;

    if (this._cover) {
      for (let i = 0; i < closed.length; i++) {
        const phase = closed[i];
        this._emitCoverPhase(phase.lines, phase.start, phase.end);
      }
      this._segmentStart = lastEnd;
      return;
    }

    // One seq per physical `.` even when Diff delivery is window-merged.
    for (let i = 0; i < closed.length; i++) {
      this._allocPhaseSeq();
    }

    if (this._history) {
      // Per-`.` records even when Diff delivery stays window-merged.
      for (let i = 0; i < closed.length; i++) {
        const phase = closed[i];
        phase.lines = this._applyAnnotationSpans(phase.lines);
        const before = this._peekCommit();
        const raw = this._phaseWire(phase.lines, phase.start, phase.end);
        const hadPriorDot = this._sawDot;
        this._feedLiveLines(phase.lines);
        this._sawDot = hadPriorDot;
        const { diff, committed, fromLive } = this._buildDiff(raw);
        this._sawDot = true;
        this._storeCommit(phase.end, committed, fromLive);
        this._history.record({
          kind: "dot",
          bufferStart: phase.start,
          bufferEnd: phase.end,
          wire: raw,
          before,
          after: this._peekCommit(),
          diff,
        });
      }
      this._segmentStart = lastEnd;
      if (!this._emitDiff) {
        this._emitChunk(null);
        return;
      }
      if (closed.length === 1) {
        this._emitChunk(this._history.getDiff(this._history.length - 1));
        return;
      }
      // Cumulative Diff for merged multi-`.` window — one clone only,
      // and only when a consumer will actually receive it.
      this._emitChunk(
        typeof this._hooks.onChunk === "function"
          ? cloneJson(this._peekCommit())
          : null,
      );
      return;
    }

    const allLines = [];
    for (let i = 0; i < closed.length; i++) {
      const lines = this._applyAnnotationSpans(closed[i].lines);
      closed[i].lines = lines;
      for (let j = 0; j < lines.length; j++) allLines.push(lines[j]);
    }
    const sawDotBefore = this._sawDot;

    this._feedLiveLines(allLines);
    this._sawDot = true;
    this._segmentStart = lastEnd;

    if (!this._emitDiff) {
      this._storeCommit(lastEnd, undefined, true);
      this._emitChunk(null);
      return;
    }

    if (closed.length === 1) {
      const raw = this._phaseWire(
        closed[0].lines,
        closed[0].start,
        closed[0].end,
      );
      // _buildDiff uses this._sawDot as "prior dot existed"; restore pre-batch.
      this._sawDot = sawDotBefore;
      const { diff, committed, fromLive } = this._buildDiff(raw);
      this._sawDot = true;
      this._storeCommit(lastEnd, committed, fromLive);
      this._emitChunk(diff);
      return;
    }

    // Multi-phase window: one Commit + one Diff = cumulative tree after batch.
    // Commit stays live-backed; Diff is a single materialize (no second isolate clone).
    this._storeCommit(lastEnd, undefined, true);
    this._emitChunk(
      typeof this._hooks.onChunk === "function"
        ? materializeSnapshot(this._live.value())
        : null,
    );
  }

  /** @param {number} end exclusive end of the `.` line */
  _emitPhase(end) {
    const start = this._segmentStart;
    const lines = this._applyAnnotationSpans(this._phaseLines);
    const raw = this._phaseWire(lines, start, end);
    this._phaseLines = [];
    if (this._cover) {
      this._emitCoverPhase(lines, start, end);
      this._segmentStart = end;
      return;
    }
    this._allocPhaseSeq();
    const before = this._history ? this._peekCommit() : null;
    this._feedLiveLines(lines);
    const { diff, committed, fromLive } = this._buildDiff(raw);
    this._sawDot = true;
    this._segmentStart = end;
    this._storeCommit(end, committed, fromLive);
    if (this._history) {
      this._history.record({
        kind: "dot",
        bufferStart: start,
        bufferEnd: end,
        wire: raw,
        before,
        after: this._peekCommit(),
        diff,
      });
    }
    this._emitChunk(diff);
  }

  _flushTail() {
    if (this._segmentStart < this._buffer.length) {
      const start = this._segmentStart;
      const lines = this._applyAnnotationSpans(this._phaseLines);
      const raw = this._phaseWire(lines, start, this._buffer.length);
      this._phaseLines = [];
      if (this._cover) {
        this._emitCoverPhase(lines, start, this._buffer.length, {
          isTail: true,
        });
        this._segmentStart = this._buffer.length;
        return;
      }
      this._allocPhaseSeq();
      const before = this._history ? this._peekCommit() : null;
      this._feedLiveLines(lines);
      let diff;
      let committed;
      let fromLive;
      if (!this._sawDot) {
        if (!this._emitDiff) {
          committed = undefined;
          diff = null;
          fromLive = true;
        } else if (isEmptyPhaseWire(raw)) {
          committed = undefined;
          diff = null;
          fromLive = true;
        } else {
          // One materialize for Diff; Commit stays live-backed.
          committed = undefined;
          diff = materializeSnapshot(this._live.value());
          fromLive = true;
        }
      } else {
        ({ diff, committed, fromLive } = this._buildDiff(raw));
      }
      this._segmentStart = this._buffer.length;
      this._storeCommit(this._buffer.length, committed, fromLive);
      if (this._history) {
        this._history.record({
          kind: "tail",
          bufferStart: start,
          bufferEnd: this._buffer.length,
          wire: raw,
          before,
          after: this._peekCommit(),
          diff,
        });
      }
      this._emitChunk(diff);
      return;
    }
    if (!this._sawDot && this._buffer.length === 0) {
      this._phaseLines = [];
      this._storeCommit(0, null, false);
      this._emitChunk(null);
    }
  }

  /**
   * Cover-mode emit: split on consecutive `&` runs; inject `.` + Cursor restore.
   * @param {string[]} lines
   * @param {number} bufferStart
   * @param {number} bufferEnd
   * @param {{ isTail?: boolean }} [opts]
   */
  _emitCoverPhase(lines, bufferStart, bufferEnd, opts = {}) {
    lines = this._applyAnnotationSpans(lines);
    const trailingDot = lines.length > 0 && lines[lines.length - 1] === ".";
    const bodyLen = trailingDot ? lines.length - 1 : lines.length;
    /** @type {string[]} */
    let pendingRestore = [];
    let i = 0;
    let any = false;

    while (i < bodyLen) {
      let j = i;
      while (j < bodyLen && !isAmpLine(lines[j])) j++;

      if (j < bodyLen) {
        const prefix = pendingRestore.concat(lines.slice(i, j));
        pendingRestore = [];
        this._ensureLive();
        if (prefix.length > 0) {
          this._feedLiveLines(prefix);
        }
        const restore = this._live.cursorRestoreLines();
        if (prefix.length > 0) {
          this._feedLiveLines(["."]);
          this._emitCoverChunk(prefix.concat(["."]), null, bufferStart, bufferEnd, "dot");
          any = true;
        }

        let k = j;
        while (k < bodyLen && isAmpLine(lines[k])) k++;
        const amps = lines.slice(j, k);
        this._feedLiveLines(amps);
        const tombstone = buildDeleteTombstone(amps);
        this._feedLiveLines(["."]);
        this._emitCoverChunk(amps.concat(["."]), tombstone, bufferStart, bufferEnd, "dot");
        any = true;
        pendingRestore = restore;
        i = k;
        continue;
      }

      const restBody = pendingRestore.concat(lines.slice(i, bodyLen));
      pendingRestore = [];
      if (restBody.length > 0) {
        this._feedLiveLines(restBody);
      }
      if (trailingDot) {
        this._feedLiveLines(["."]);
        const wireLines = restBody.concat(["."]);
        this._emitCoverChunk(
          wireLines.length ? wireLines : ["."],
          null,
          bufferStart,
          bufferEnd,
          "dot",
        );
        any = true;
      } else if (restBody.length > 0) {
        const committed = materializeSnapshot(this._live.value());
        this._storeCommit(bufferEnd, committed, false);
        this._emitCoverChunk(
          restBody,
          null,
          bufferStart,
          bufferEnd,
          opts.isTail ? "tail" : "dot",
          { committedDiff: true },
        );
        any = true;
      }
      i = bodyLen;
    }

    if (pendingRestore.length > 0) {
      this._feedLiveLines(pendingRestore);
      const committed = materializeSnapshot(this._live.value());
      this._storeCommit(bufferEnd, committed, false);
      this._sawDot = true;
    } else if (!any && trailingDot) {
      this._feedLiveLines(["."]);
      this._sawDot = true;
      this._storeCommit(bufferEnd, undefined, true);
      if (this._history) {
        this._history.record({
          kind: "dot",
          bufferStart,
          bufferEnd,
          wire: ".\n",
          before: this._peekCommit(),
          after: this._peekCommit(),
          diff: null,
        });
      }
      this._allocPhaseSeq();
      this._emitChunk(null);
    } else if (!any && opts.isTail && lines.length > 0) {
      this._feedLiveLines(lines);
      this._storeCommit(bufferEnd, undefined, true);
      this._allocPhaseSeq();
      this._emitChunk(
        this._emitDiff ? materializeSnapshot(this._live.value()) : null,
      );
    }

    this._sawDot = this._sawDot || trailingDot || any;
  }

  /**
   * Live already fed for this segment. Emit Diff / history / onChunk.
   * @param {string[]} wireLines
   * @param {Record<string, unknown>|null} tombstone
   * @param {number} bufferStart
   * @param {number} bufferEnd
   * @param {'dot'|'tail'} kind
   * @param {{ committedDiff?: boolean }} [opts]
   */
  _emitCoverChunk(wireLines, tombstone, bufferStart, bufferEnd, kind, opts = {}) {
    this._allocPhaseSeq();
    const before = this._history ? this._peekCommit() : null;
    this._sawDot = true;
    const wire = linesToWire(wireLines);
    let diff = null;
    if (this._emitDiff) {
      if (tombstone) {
        diff = cloneJson(tombstone);
        this._storeCommit(bufferEnd, undefined, true);
      } else if (opts.committedDiff) {
        diff = materializeSnapshot(this._live.value());
        this._storeCommit(bufferEnd, undefined, true);
      } else {
        const built = this._buildDiff(wire);
        diff = built.diff;
        this._storeCommit(bufferEnd, built.committed, built.fromLive);
      }
    } else {
      this._storeCommit(bufferEnd, undefined, true);
    }
    if (this._history) {
      this._history.record({
        kind,
        bufferStart,
        bufferEnd,
        wire,
        before,
        after: this._peekCommit(),
        diff,
      });
    }
    this._emitChunk(diff);
  }

  _ensureLive() {
    if (!this._live) {
      this._live = new LiveXaiopParser({
      compat: this._hooks.compat,
      symbolKeys: this._hooks.symbolKeys === true,
    });
    }
  }

  /** Current commit tree without forcing unnecessary clones when possible. */
  _peekCommit() {
    if (this._commitFromLive && this._live) {
      return materializeSnapshot(this._live.value());
    }
    if (this._committedSnapshot === undefined) return null;
    return this._committedSnapshot;
  }

  /** @param {string[]} lines */
  _feedLiveLines(lines) {
    if (!this._live) {
      this._live = new LiveXaiopParser({
        compat: this._hooks.compat,
        symbolKeys: this._hooks.symbolKeys === true,
      });
    }
    // Invalidate cached commit; live tree is ahead until `_storeCommit`.
    // Keep `_commitFromLive` true so peeks/getters still materialize from live
    // between feed and store (false + undefined would look like "no commit").
    this._committedSnapshot = undefined;
    this._commitFromLive = true;
    this._live.feedLines(lines);
  }

  /**
   * @param {string} raw
   * @returns {{ diff: unknown, committed: unknown|undefined, fromLive: boolean }}
   */
  _buildDiff(raw) {
    if (!this._emitDiff) {
      return { diff: null, committed: undefined, fromLive: true };
    }

    // First phase / locate / fallback: Diff is a clone of the live Commit tree.
    // Keep Commit live-backed (fromLive) so we pay one materialize for Diff,
    // not materialize + isolateDiff second clone.
    if (!this._sawDot || phaseNeedsPriorTree(raw)) {
      if (isEmptyPhaseWire(raw)) {
        return { diff: null, committed: undefined, fromLive: true };
      }
      return {
        diff: materializeSnapshot(this._live.value()),
        committed: undefined,
        fromLive: true,
      };
    }

    // Later ordinary phase: phase-local Diff. After a prior `.`, Cursor is at the
    // live document Root — but a fresh parseSync of `.\n>name…` alone is a
    // **fragment** (no bare `>` / `-` root). Prefix a synthetic object root when
    // needed so Diff matches wire continuation semantics (D1 / framing split).
    try {
      const text = withLeadingDot(ensureDiffDocumentRoot(raw, this._liveRootKind()));
      const diff = normalizeEmptyPhase(raw, this._parseOwned(text));
      return { diff, committed: undefined, fromLive: true };
    } catch {
      // Commit already applied; never abort the stream solely because Diff
      // isolation failed — fall back to cumulative committed as Diff.
      if (isEmptyPhaseWire(raw)) {
        return { diff: null, committed: undefined, fromLive: true };
      }
      return {
        diff: materializeSnapshot(this._live.value()),
        committed: undefined,
        fromLive: true,
      };
    }
  }

  /**
   * Live document root kind for Diff isolation (`object` default after a `.`).
   * @returns {'object'|'array'|'fragment'|null}
   */
  _liveRootKind() {
    if (!this._live) return null;
    const inner = this._live._p;
    if (inner && typeof inner.docKind === "string") {
      if (inner.docKind === "array") return "array";
      if (inner.docKind === "fragment") return "fragment";
      if (inner.docKind === "object") return "object";
    }
    try {
      const v = this._live.value();
      if (Array.isArray(v)) return "array";
    } catch {
      /* ignore */
    }
    return "object";
  }

  /**
   * @param {number} at
   * @param {unknown|undefined} snapshot
   * @param {boolean} fromLive
   */
  _storeCommit(at, snapshot, fromLive) {
    this._committedAt = at;
    this._commitFromLive = fromLive;
    if (fromLive) {
      this._committedSnapshot = undefined;
    } else {
      this._committedSnapshot = snapshot ?? null;
    }
  }

  /**
   * Fresh parse; ownership transferred (plain roots not cloned again).
   * @param {string} text
   * @returns {unknown}
   */
  _parseOwned(text) {
    if (text.length === 0) return null;
    return materializeOwned(
      parseSync(text, {
        compat: this._hooks.compat,
        symbolKeys: this._hooks.symbolKeys === true,
      }),
    );
  }
}

/**
 * When Diff and Commit would be the same tree, return an isolated clone.
 * Prefer calling sites that materialize once and keep Commit live-backed.
 * @param {unknown} diff
 * @param {unknown} committed
 */
function isolateDiff(diff, committed) {
  if (diff === null || diff === undefined) return diff;
  if (diff === committed) return cloneJson(committed);
  return diff;
}

/** @param {string} raw */
function withLeadingDot(raw) {
  if (raw === "." || raw.startsWith(".\n") || raw.startsWith(".\r\n")) {
    return raw;
  }
  return raw.startsWith("\n") ? `.${raw}` : `.\n${raw}`;
}

/**
 * First substantive phase line (skip leading `.` lines / blanks).
 * @param {string} raw
 * @returns {string|null}
 */
function firstPhaseLine(raw) {
  let i = 0;
  const n = raw.length;
  while (i < n) {
    if (raw.charCodeAt(i) === 13) {
      i++;
      continue;
    }
    if (raw.charCodeAt(i) === 10) {
      i++;
      continue;
    }
    let j = i;
    while (j < n) {
      const ch = raw.charCodeAt(j);
      if (ch === 10) break;
      if (ch === 13) break;
      j++;
    }
    let line = raw.slice(i, j);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === "." || line === "") {
      i = j + 1;
      continue;
    }
    return line;
  }
  return null;
}

/**
 * True when the phase already opens a document root (`>` or `-` alone).
 * @param {string} raw
 */
function phaseHasBareDocumentRoot(raw) {
  const line = firstPhaseLine(raw);
  return line === ">" || line === "-";
}

/**
 * After a prior `.`, phase-local Diff parse needs a document root. Named enter
 * (`>rules-`) or Content at Root is legal on the live Cursor but illegal as a
 * standalone fragment parse — prefix synthetic `>` for object documents.
 * @param {string} raw
 * @param {'object'|'array'|'fragment'|null|undefined} rootKind
 */
function ensureDiffDocumentRoot(raw, rootKind) {
  if (phaseHasBareDocumentRoot(raw)) return raw;
  // Array-root documents usually continue with bare `>` (new element) — already
  // handled by phaseHasBareDocumentRoot. Named labels on array root are rare;
  // leave raw unchanged (fallback catch uses committed Diff).
  if (rootKind === "array") return raw;
  return `>\n${raw}`;
}

/** @param {string} raw */
function phaseNeedsPriorTree(raw) {
  let i = 0;
  const n = raw.length;
  while (i < n) {
    if (raw.charCodeAt(i) === 13) {
      i++;
      continue;
    }
    if (raw.charCodeAt(i) === 10) {
      i++;
      continue;
    }
    const c = raw.charCodeAt(i);
    // `=` (61), `!` (33), `&` (38), `@` (64) — create-vs-enter needs prior tree
    if (c === 61 || c === 33 || c === 38 || c === 64) return true;
    while (i < n) {
      const ch = raw.charCodeAt(i);
      if (ch === 10) {
        i++;
        break;
      }
      if (ch === 13) {
        i++;
        if (i < n && raw.charCodeAt(i) === 10) i++;
        break;
      }
      i++;
    }
  }
  return false;
}

/**
 * True when phase wire is only `.` / blank framing (empty Diff → null).
 * Equivalent to:
 *   raw.replace(/^\.\r?\n?/, "").replace(/\r?\n?\.\r?\n?$/, "").trim() === ""
 * @param {string} raw
 */
function isEmptyPhaseWire(raw) {
  let start = 0;
  let end = raw.length;
  // /^\.\r?\n?/
  if (start < end && raw.charCodeAt(start) === 46) {
    start++;
    if (start < end && raw.charCodeAt(start) === 13) start++;
    if (start < end && raw.charCodeAt(start) === 10) start++;
  }
  // /\r?\n?\.\r?\n?$/ — try match from end
  if (end > start) {
    let e = end;
    if (e > start && raw.charCodeAt(e - 1) === 10) e--;
    if (e > start && raw.charCodeAt(e - 1) === 13) e--;
    if (e > start && raw.charCodeAt(e - 1) === 46) {
      e--;
      if (e > start && raw.charCodeAt(e - 1) === 10) e--;
      if (e > start && raw.charCodeAt(e - 1) === 13) e--;
      end = e;
    }
  }
  // trim
  while (start < end) {
    const c = raw.charCodeAt(start);
    if (c === 32 || c === 9 || c === 10 || c === 13) {
      start++;
      continue;
    }
    break;
  }
  while (end > start) {
    const c = raw.charCodeAt(end - 1);
    if (c === 32 || c === 9 || c === 10 || c === 13) {
      end--;
      continue;
    }
    break;
  }
  return start >= end;
}

/**
 * @param {string} raw
 * @param {unknown} value
 */
function normalizeEmptyPhase(raw, value) {
  return isEmptyPhaseWire(raw) ? null : value;
}

/** @param {string} line */
function isAmpLine(line) {
  return line.charCodeAt(0) === 38; // '&'
}

/**
 * Merge `&a>b` lines into one deepest-null tombstone object.
 * @param {string[]} amps
 * @returns {Record<string, unknown>}
 */
function buildDeleteTombstone(amps) {
  /** @type {Record<string, unknown>} */
  const root = {};
  for (const line of amps) {
    const path = line.slice(1);
    const segments = path.split(">").filter(Boolean);
    if (segments.length === 0) continue;
    let cur = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const existing = cur[seg];
      if (
        existing === null ||
        typeof existing !== "object" ||
        Array.isArray(existing)
      ) {
        cur[seg] = {};
      }
      cur = /** @type {Record<string, unknown>} */ (cur[seg]);
    }
    cur[segments[segments.length - 1]] = null;
  }
  return root;
}

/** @param {string[]} lines */
function linesToWire(lines) {
  if (lines.length === 0) return "";
  return `${lines.join("\n")}\n`;
}

/**
 * @param {string} text
 * @param {number} from
 * @param {boolean} atEof
 * @returns {{ line: string, end: number, consumedNewline: boolean }|null}
 */
function readLine(text, from, atEof) {
  if (from >= text.length) return null;
  let i = from;
  const n = text.length;
  while (i < n) {
    if (text.charCodeAt(i) === 10) {
      let end = i;
      if (end > from && text.charCodeAt(end - 1) === 13) end--;
      return {
        line: text.slice(from, end),
        end: i + 1,
        consumedNewline: true,
      };
    }
    i++;
  }
  if (!atEof) return null;
  return { line: text.slice(from), end: n, consumedNewline: false };
}

/** @param {string[]} paths */
function uniqueEscape(paths) {
  return [...new Set(paths)];
}
