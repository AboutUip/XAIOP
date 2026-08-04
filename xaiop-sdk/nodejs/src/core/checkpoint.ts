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
 * - First phase / `=`/`!`/`&`: Diff shares one materialize with Commit (no second parse).
 * - Later ordinary Diff: owned parseSync (no redundant clone of a fresh tree).
 * - `emitDiff: false` skips Diff parse when callers only need Commit/final.
 * - `mergeChunkWindow` (default true): batch all complete `.` in the current
 *   buffer window into one feed + one Commit + one onChunk (not per true net chunk).
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
 * @property {boolean} streamProcessing
 * @property {(diff: unknown, meta?: { typeCheckEscapePaths?: string[] }) => void} onChunk
 * @property {boolean} [emitDiff]
 * @property {boolean} [mergeChunkWindow]
 * @property {boolean} [cover] Cover-mode Diff for `&` (default false)
 * @property {boolean} [historySnapshot] Opt-in read-only history (default false)
 * @property {boolean} [historyRealtime] Opt-in realtime forward-jump history (default false)
 * @property {boolean} [retainWireHistory] Retain per-node wire when history on (default true)
 * @property {LineInterceptHandler|LineInterceptHandler[]} [lineIntercept] Initial line interceptors
 * @property {AnnotationSpanHandler|AnnotationSpanHandler[]} [annotationSpan] Initial # span handlers
 */

export class DotCheckpointEngine {
  /** @param {CheckpointHooks} hooks */
  constructor(hooks) {
    this._hooks = hooks;
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

  /** Emit Diff to hooks with optional typeCheck escape metadata. */
  _emitChunk(diff) {
    const escapes = this._pendingTypeCheckEscape;
    this._pendingTypeCheckEscape = [];
    if (escapes && escapes.length > 0) {
      this._hooks.onChunk(diff, { typeCheckEscapePaths: uniqueEscape(escapes) });
    } else {
      this._hooks.onChunk(diff);
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
    this._live = new LiveXaiopParser(this._hooks.compat);
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
   * Only advances when a `.` phase completes or tail is flushed at finish —
   * never from mid-phase partial wire.
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
    if (this._hooks.streamProcessing) this._scanDots(false);
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
    if (!this._hooks.streamProcessing) return Promise.resolve();
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

    if (!this._hooks.streamProcessing) {
      const value = this._parseOwned(this._buffer);
      this._storeCommit(this._buffer.length, value, false);
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
          if (!this._closed && this._hooks.streamProcessing) {
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
      const committed = this._peekCommit();
      this._emitChunk(isolateDiff(committed, committed));
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
    const committed = materializeSnapshot(this._live.value());
    this._storeCommit(lastEnd, committed, false);
    this._emitChunk(isolateDiff(committed, committed));
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
        } else {
          committed = materializeSnapshot(this._live.value());
          diff = isolateDiff(committed, committed);
          fromLive = false;
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
      this._emitChunk(null);
    } else if (!any && opts.isTail && lines.length > 0) {
      this._feedLiveLines(lines);
      const committed = materializeSnapshot(this._live.value());
      this._storeCommit(bufferEnd, committed, false);
      this._emitChunk(
        this._emitDiff ? isolateDiff(committed, committed) : null,
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
    const before = this._history ? this._peekCommit() : null;
    this._sawDot = true;
    const wire = linesToWire(wireLines);
    let diff = null;
    if (this._emitDiff) {
      if (tombstone) {
        const committed = materializeSnapshot(this._live.value());
        diff = cloneJson(tombstone);
        this._storeCommit(bufferEnd, committed, false);
      } else if (opts.committedDiff) {
        const committed = materializeSnapshot(this._live.value());
        diff = isolateDiff(committed, committed);
        this._storeCommit(bufferEnd, committed, false);
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
      this._live = new LiveXaiopParser(this._hooks.compat);
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
      this._live = new LiveXaiopParser(this._hooks.compat);
    }
    this._committedSnapshot = undefined;
    this._commitFromLive = false;
    for (let i = 0; i < lines.length; i++) {
      this._live.feedLine(lines[i]);
    }
  }

  /**
   * @param {string} raw
   * @returns {{ diff: unknown, committed: unknown|undefined, fromLive: boolean }}
   */
  _buildDiff(raw) {
    if (!this._emitDiff) {
      return { diff: null, committed: undefined, fromLive: true };
    }

    // First phase: live tree IS the phase document — share one materialize.
    if (!this._sawDot) {
      const committed = materializeSnapshot(this._live.value());
      return {
        diff: isolateDiff(normalizeEmptyPhase(raw, committed), committed),
        committed,
        fromLive: false,
      };
    }

    // `=` / `!` / `&` see the cumulative tree (向前跨相).
    if (phaseNeedsPriorTree(raw)) {
      const committed = materializeSnapshot(this._live.value());
      return {
        diff: isolateDiff(normalizeEmptyPhase(raw, committed), committed),
        committed,
        fromLive: false,
      };
    }

    // Later ordinary phase: phase-local Diff via owned parse (no extra clone).
    const text = withLeadingDot(raw);
    const diff = normalizeEmptyPhase(raw, this._parseOwned(text));
    return { diff, committed: undefined, fromLive: true };
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
    return materializeOwned(parseSync(text, this._hooks.compat));
  }
}

/**
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
    // `=` (61), `!` (33), `&` (38)
    if (c === 61 || c === 33 || c === 38) return true;
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
 * @param {string} raw
 * @param {unknown} value
 */
function normalizeEmptyPhase(raw, value) {
  const body = raw
    .replace(/^\.\r?\n?/, "")
    .replace(/\r?\n?\.\r?\n?$/, "")
    .trim();
  return body.length === 0 ? null : value;
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
  while (i < text.length) {
    if (text[i] === "\n") {
      let line = text.slice(from, i);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      return { line, end: i + 1, consumedNewline: true };
    }
    i++;
  }
  if (!atEof) return null;
  return { line: text.slice(from), end: text.length, consumedNewline: false };
}

/** @param {string[]} paths */
function uniqueEscape(paths) {
  return [...new Set(paths)];
}
