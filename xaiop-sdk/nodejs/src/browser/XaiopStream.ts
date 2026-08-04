// @ts-nocheck
/**
 * XaiopStream — independent streaming client for XAIOP over the network.
 *
 * - Chunk = parse of each `.`-bounded phase (later-wins); not JSON-tree diffs.
 * - `done` / snapshot = parse of the full buffered stream.
 * - Own CompatPolicy (default compatibilityMode **off**).
 * - Multi-select consumption modes; inspection APIs always available.
 */

import { CompatPolicy } from "../core/compat.js";
import { cloneJson } from "../core/clone.js";
import { DotCheckpointEngine } from "../core/checkpoint.js";
import {
  ALL_STREAM_MODES,
  normalizeModes,
  STREAM_MODES,
} from "../core/modes.js";
import { isStreamBusy, STREAM_STATUS } from "../core/states.js";
import {
  TypeFreezeSession,
  tryParseTypeSchemaFrame,
} from "../core/types.js";
import { openTransport, TRANSPORT_KIND } from "./transport.js";

/**
 * @typedef {import("../core/modes.js").StreamMode} StreamMode
 * @typedef {import("../core/states.js").StreamStatus} StreamStatus
 * @typedef {import("./transport.js").TransportKind} TransportKind
 * @typedef {import("./transport.js").TransportRequest} TransportRequest
 */

export class XaiopStream {
  /**
   * @param {string} url
   * @param {{
   *   streamProcessing?: boolean,
   *   compatibilityMode?: boolean,
   *   modes?: StreamMode[]|Iterable<StreamMode>,
   *   mergeChunkWindow?: boolean,
   *   asyncParse?: boolean,
   *   historySnapshot?: boolean,
   *   historyRealtime?: boolean,
   *   retainWireHistory?: boolean,
   *   cover?: boolean,
   *   typeCheck?: boolean,
   *   typeSchema?: import("../core/types.js").TypeSchemaSnapshot|import("../core/types.js").TypeRegistry,
   *   lineIntercept?: import("../core/line-intercept.js").LineInterceptHandler|import("../core/line-intercept.js").LineInterceptHandler[],
   *   annotationSpan?: import("../core/annotation-span.js").AnnotationSpanHandler|import("../core/annotation-span.js").AnnotationSpanHandler[],
   * }} [options]
   */
  constructor(url, options = {}) {
    if (typeof url !== "string" || url.length === 0) {
      throw new TypeError("XaiopStream requires a non-empty url");
    }
    /** @type {string} */
    this._url = url;
    /** @type {boolean} */
    this._streamProcessing = options.streamProcessing !== false;
    /** @type {boolean} */
    this._compatibilityMode = !!options.compatibilityMode;
    /** Window-merge complete `.` phases (default true). */
    this._mergeChunkWindow = options.mergeChunkWindow !== false;
    /**
     * When true, transport text uses `pushAsync` (coalesced setImmediate drain).
     * Default false for deterministic framing tests; prefer true in production.
     */
    this._asyncParse = options.asyncParse === true;
    /** @type {boolean} */
    this._historySnapshot = options.historySnapshot === true;
    /** @type {boolean} */
    this._historyRealtime = options.historyRealtime === true;
    /** @type {boolean} */
    this._retainWireHistory = options.retainWireHistory !== false;
    /** Cover-mode Diff for `&` deletes (default false). */
    this._cover = options.cover === true;
    /** Client type freeze / schema check (strict only). */
    this._typeCheck = !!options.typeCheck && !this._compatibilityMode;
    /** U+001F label escape dialect. */
    this._symbolKeys = options.symbolKeys === true;
    this._compat = new CompatPolicy();
    /** @type {TypeFreezeSession|null} */
    this._typeSession = this._typeCheck ? new TypeFreezeSession() : null;
    if (this._typeSession && options.typeSchema) {
      this._typeSession.applySchema(options.typeSchema);
    }
    /** @type {Set<StreamMode>} */
    this._modes = normalizeModes(options.modes);

    /** @type {StreamStatus} */
    this._status = STREAM_STATUS.IDLE;
    /** @type {Error|null} */
    this._lastError = null;
    /** @type {unknown|undefined} */
    this._snapshot = undefined;
    /** Committed prefix snapshot (phase boundaries / EOF). Separate from final `_snapshot`. */
    /** @type {unknown|undefined} */
    this._committedSnapshot = undefined;
    /** True after a phase commit; tree may still be lazy in the engine. */
    this._committedAvailable = false;
    /** @type {string} */
    this._buffer = "";

    /** @type {((diff: unknown) => void)|null} */
    this._onChunk = null;
    /** @type {((json: unknown) => void)|null} */
    this._onDone = null;
    /** @type {((err: Error) => void)|null} */
    this._onError = null;

    /**
     * Pending line interceptors until engine exists; then mirrored on engine.
     * @type {Array<(ctx: { raw: string, view: import("../core/line-intercept.js").LineView }) => string|null|void>}
     */
    this._lineInterceptors = [];
    if (options.lineIntercept) {
      const init = Array.isArray(options.lineIntercept)
        ? options.lineIntercept
        : [options.lineIntercept];
      for (let i = 0; i < init.length; i++) {
        if (typeof init[i] === "function") this._lineInterceptors.push(init[i]);
      }
    }

    /**
     * @type {import("../core/annotation-span.js").AnnotationSpanHandler[]}
     */
    this._annotationSpanHandlers = [];
    if (options.annotationSpan) {
      const init = Array.isArray(options.annotationSpan)
        ? options.annotationSpan
        : [options.annotationSpan];
      for (let i = 0; i < init.length; i++) {
        if (typeof init[i] === "function") {
          this._annotationSpanHandlers.push(init[i]);
        }
      }
    }

    /** @type {string[]} */
    this._typeCheckEscapePaths = [];

    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();

    /** @type {Array<{diff: unknown, resolve: Function, reject: Function}>} */
    this._iterWaiters = [];
    /** @type {unknown[]} */
    this._iterQueue = [];
    this._iterDone = false;
    /** @type {Error|null} */
    this._iterError = null;

    /** @type {((v: unknown) => void)|null} */
    this._promiseResolve = null;
    /** @type {((e: Error) => void)|null} */
    this._promiseReject = null;

    /** @type {AbortController|null} */
    this._abortController = null;
    /** @type {{ abort: () => void }|null} */
    this._transportHandle = null;
    /** @type {DotCheckpointEngine|null} */
    this._engine = null;
    /** Serializes asyncParse ingest before finish. */
    /** @type {Promise<void>} */
    this._asyncIngestChain = Promise.resolve();
  }

  // --- Inspection (always available) ---

  get url() {
    return this._url;
  }

  get status() {
    return this._status;
  }

  get streamProcessing() {
    return this._streamProcessing;
  }

  /** Default true — batch complete `.` in the buffer window. */
  get mergeChunkWindow() {
    return this._mergeChunkWindow;
  }

  /** When true, ingest uses coalesced `pushAsync`. */
  get asyncParse() {
    return this._asyncParse;
  }

  /** Opt-in snapshot history (read-only). */
  get historySnapshot() {
    return this._historySnapshot;
  }

  /** Opt-in realtime history (forward jump). */
  get historyRealtime() {
    return this._historyRealtime;
  }

  /**
   * Active parse history for the current `send` engine, or `null`.
   * @returns {import("./history.js").ParseHistory|null}
   */
  get history() {
    return this._engine?.history ?? null;
  }

  get compatibilityMode() {
    return this._compatibilityMode;
  }

  get lastError() {
    return this._lastError;
  }

  getModes() {
    return [...this._modes];
  }

  /** @returns {unknown|undefined} */
  getSnapshot() {
    return this._snapshot === undefined
      ? undefined
      : cloneJson(this._snapshot);
  }

  /**
   * JSON committed through the last `.` phase (or EOF flush).
   * Usable mid-stream; does **not** alter `getSnapshot()` (final-only after finish).
   * @returns {unknown|undefined}
   */
  getCommittedSnapshot() {
    if (this._committedSnapshot === undefined) {
      if (!this._committedAvailable || !this._engine) return undefined;
      const c = this._engine.committedSnapshot;
      if (c === null || c === undefined) return undefined;
      this._committedSnapshot = c;
    }
    return cloneJson(this._committedSnapshot);
  }

  /** @returns {string} */
  getBufferedText() {
    return this._buffer;
  }

  isBusy() {
    return isStreamBusy(this._status);
  }

  /**
   * @returns {{
   *   status: StreamStatus,
   *   url: string,
   *   streamProcessing: boolean,
   *   compatibilityMode: boolean,
   *   modes: StreamMode[],
   *   busy: boolean,
   *   hasSnapshot: boolean,
   *   hasCommittedSnapshot: boolean,
   *   bufferLength: number,
   *   lastError: string|null,
   * }}
   */
  getStatus() {
    return {
      status: this._status,
      url: this._url,
      streamProcessing: this._streamProcessing,
      compatibilityMode: this._compatibilityMode,
      mergeChunkWindow: this._mergeChunkWindow,
      asyncParse: this._asyncParse,
      modes: this.getModes(),
      busy: this.isBusy(),
      hasSnapshot: this._snapshot !== undefined,
      hasCommittedSnapshot:
        this._committedAvailable || this._committedSnapshot !== undefined,
      bufferLength: this._buffer.length,
      lastError: this._lastError ? String(this._lastError.message || this._lastError) : null,
    };
  }

  // --- Configuration (idle-like only where noted) ---

  /**
   * @param {string} url
   * @returns {boolean} false if busy or invalid
   */
  setUrl(url) {
    if (this.isBusy()) return false;
    if (typeof url !== "string" || url.length === 0) return false;
    const prev = this._url;
    this._url = url;
    // Snapshot lifecycle: new URL releases retained history on the idle stream
    // (and on any leftover engine history still attached).
    if (prev !== url && this._historySnapshot) {
      const h = this._engine?.history;
      if (h?.snapshotEnabled) h.setSource(url);
    }
    return true;
  }

  /**
   * Realtime jump on the active engine (requires `historyRealtime`).
   * @param {number} index
   */
  jumpTo(index) {
    if (!this._engine) {
      throw new Error("XaiopStream.jumpTo requires an active send/engine");
    }
    const result = this._engine.jumpTo(index);
    this._buffer = this._engine.buffer;
    this._committedSnapshot = this._engine.committedSnapshot ?? undefined;
    this._committedAvailable = this._committedSnapshot !== undefined;
    this._snapshot = undefined;
    return result;
  }

  /**
   * @param {boolean} enabled
   * @returns {boolean}
   */
  setStreamProcessing(enabled) {
    if (this.isBusy()) return false;
    if (typeof enabled !== "boolean") return false;
    this._streamProcessing = enabled;
    return true;
  }

  /**
   * @param {boolean} enabled
   * @returns {this}
   */
  setCompatibilityMode(enabled) {
    this._compatibilityMode = !!enabled;
    return this;
  }

  /**
   * @param {import("../compat.js").CompatFixId} id
   * @param {boolean} enabled
   * @returns {boolean}
   */
  _setCompatFix(id, enabled) {
    if (!this._compatibilityMode) return false;
    return this._compat.set(id, enabled);
  }

  get compatForcedRoot() {
    return this._compat.forcedRoot;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatForcedRoot(enabled) {
    return this._setCompatFix("forcedRoot", enabled);
  }

  get compatRewriteBareNameArray() {
    return this._compat.rewriteBareNameArray;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatRewriteBareNameArray(enabled) {
    return this._setCompatFix("rewriteBareNameArray", enabled);
  }

  get compatRewriteEnterLine() {
    return this._compat.rewriteEnterLine;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatRewriteEnterLine(enabled) {
    return this._setCompatFix("rewriteEnterLine", enabled);
  }

  get compatIgnoreBareLeaveAtRoot() {
    return this._compat.ignoreBareLeaveAtRoot;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatIgnoreBareLeaveAtRoot(enabled) {
    return this._setCompatFix("ignoreBareLeaveAtRoot", enabled);
  }

  get compatPopAndRetry() {
    return this._compat.popAndRetry;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatPopAndRetry(enabled) {
    return this._setCompatFix("popAndRetry", enabled);
  }

  get compatLocatePathTrim() {
    return this._compat.locatePathTrim;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatLocatePathTrim(enabled) {
    return this._setCompatFix("locatePathTrim", enabled);
  }

  get compatLocatePathStripSpaces() {
    return this._compat.locatePathStripSpaces;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatLocatePathStripSpaces(enabled) {
    return this._setCompatFix("locatePathStripSpaces", enabled);
  }

  get compatLocatePathArraySuffix() {
    return this._compat.locatePathArraySuffix;
  }
  /** @param {boolean} enabled @returns {boolean} */
  setCompatLocatePathArraySuffix(enabled) {
    return this._setCompatFix("locatePathArraySuffix", enabled);
  }

  /**
   * Replace active consumption modes. Busy → false.
   * @param {StreamMode[]|Iterable<StreamMode>} modes
   * @returns {boolean}
   */
  setModes(modes) {
    if (this.isBusy()) return false;
    try {
      this._modes = normalizeModes(modes);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @param {StreamMode} mode
   * @returns {boolean}
   */
  enableMode(mode) {
    if (this.isBusy()) return false;
    if (!ALL_STREAM_MODES.has(mode)) return false;
    this._modes.add(mode);
    return true;
  }

  /**
   * @param {StreamMode} mode
   * @returns {boolean}
   */
  disableMode(mode) {
    if (this.isBusy()) return false;
    if (!ALL_STREAM_MODES.has(mode)) return false;
    if (this._modes.size <= 1 && this._modes.has(mode)) {
      // Keep at least callback
      this._modes = new Set([STREAM_MODES.CALLBACK]);
      return mode !== STREAM_MODES.CALLBACK;
    }
    this._modes.delete(mode);
    if (this._modes.size === 0) {
      this._modes.add(STREAM_MODES.CALLBACK);
    }
    return true;
  }

  // --- Callback mode ---

  /**
   * @param {(diff: unknown) => void} fn
   * @returns {this}
   */
  onChunk(fn) {
    if (typeof fn !== "function") throw new TypeError("onChunk requires a function");
    this._onChunk = fn;
    return this;
  }

  /**
   * Append a pre-parse line interceptor (engine buffer layer; not `onChunk`).
   * @param {(ctx: { raw: string, view: import("../core/line-intercept.js").LineView }) => string|null|void} fn
   * @returns {this}
   */
  onLineIntercept(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("onLineIntercept requires a function");
    }
    this._lineInterceptors.push(fn);
    if (this._engine) this._engine.onLineIntercept(fn);
    return this;
  }

  /** @returns {this} */
  clearLineIntercepts() {
    this._lineInterceptors.length = 0;
    if (this._engine) this._engine.clearLineIntercepts();
    return this;
  }

  /**
   * Phase `#` annotation-span handler (before Diff / typeCheck).
   * @param {import("../core/annotation-span.js").AnnotationSpanHandler} fn
   * @returns {this}
   */
  onAnnotationSpan(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("onAnnotationSpan requires a function");
    }
    this._annotationSpanHandlers.push(fn);
    if (this._engine) this._engine.onAnnotationSpan(fn);
    return this;
  }

  /** @returns {this} */
  clearAnnotationSpans() {
    this._annotationSpanHandlers.length = 0;
    if (this._engine) this._engine.clearAnnotationSpans();
    return this;
  }

  /**
   * @param {(json: unknown) => void} fn
   * @returns {this}
   */
  onDone(fn) {
    if (typeof fn !== "function") throw new TypeError("onDone requires a function");
    this._onDone = fn;
    return this;
  }

  /**
   * @param {(err: Error) => void} fn
   * @returns {this}
   */
  onError(fn) {
    if (typeof fn !== "function") throw new TypeError("onError requires a function");
    this._onError = fn;
    return this;
  }

  offChunk() {
    this._onChunk = null;
    return this;
  }
  offDone() {
    this._onDone = null;
    return this;
  }
  offError() {
    this._onError = null;
    return this;
  }

  // --- Events mode ---

  /**
   * @param {'chunk'|'done'|'error'|'status'} event
   * @param {Function} listener
   * @returns {this}
   */
  on(event, listener) {
    if (typeof listener !== "function") {
      throw new TypeError("listener must be a function");
    }
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(listener);
    return this;
  }

  /**
   * @param {'chunk'|'done'|'error'|'status'} event
   * @param {Function} listener
   * @returns {this}
   */
  off(event, listener) {
    this._listeners.get(event)?.delete(listener);
    return this;
  }

  /**
   * @param {'chunk'|'done'|'error'|'status'} event
   * @param {Function} listener
   * @returns {this}
   */
  once(event, listener) {
    const wrap = (...args) => {
      this.off(event, wrap);
      listener(...args);
    };
    return this.on(event, wrap);
  }

  // --- Async iterator mode ---

  /**
   * Async-iterate checkpoint diffs for the **current / next** send cycle.
   * @returns {AsyncGenerator<unknown, void, void>}
   */
  async *chunks() {
    if (!this._modes.has(STREAM_MODES.ASYNC_ITERATOR)) {
      throw new Error("asyncIterator mode is not enabled");
    }
    while (true) {
      if (this._iterQueue.length > 0) {
        yield this._iterQueue.shift();
        continue;
      }
      if (this._iterError) throw this._iterError;
      if (this._iterDone) return;
      await new Promise((resolve, reject) => {
        this._iterWaiters.push({ diff: null, resolve, reject });
      });
    }
  }

  [Symbol.asyncIterator]() {
    return this.chunks();
  }

  // --- Send / abort ---

  /**
   * Start one network request. Rejects if already busy.
   *
   * @param {Omit<TransportRequest, 'url'> & { url?: string }} [options]
   * @returns {Promise<unknown>|undefined} Promise of final JSON when `promise` mode is on
   */
  send(options = {}) {
    if (this.isBusy()) {
      const err = new Error("XaiopStream is busy; abort or wait before send");
      if (this._modes.has(STREAM_MODES.PROMISE)) {
        return Promise.reject(err);
      }
      throw err;
    }

    const url = options.url ?? this._url;
    if (typeof url !== "string" || !url) {
      throw new TypeError("send requires a url");
    }
    this._url = url;

    this._resetCycle();
    this._status = STREAM_STATUS.CONNECTING;
    this._emitStatus();

    /** @type {Promise<unknown>|undefined} */
    let promise;
    if (this._modes.has(STREAM_MODES.PROMISE)) {
      promise = new Promise((resolve, reject) => {
        this._promiseResolve = resolve;
        this._promiseReject = reject;
      });
    }

    this._abortController = new AbortController();
    const signal = anySignalLocal([
      options.signal,
      this._abortController.signal,
    ]);

    this._engine = new DotCheckpointEngine({
      streamProcessing: this._streamProcessing,
      compat: this._compatibilityMode ? this._compat.snapshot() : false,
      symbolKeys: this._symbolKeys,
      emitDiff: this._wantsPhaseDiff(),
      mergeChunkWindow: this._mergeChunkWindow,
      historySnapshot: this._historySnapshot,
      historyRealtime: this._historyRealtime,
      retainWireHistory: this._retainWireHistory,
      cover: this._cover,
      lineIntercept: this._lineInterceptors.slice(),
      annotationSpan: this._annotationSpanHandlers.slice(),
      onChunk: (diff, meta) => this._deliverChunk(diff, meta),
    });
    if (this._historySnapshot && this._engine.history) {
      this._engine.history.setSource(url);
    }

    void this._runTransport({ ...options, url, signal });

    return promise;
  }

  /**
   * @param {TransportRequest & { signal: AbortSignal }} req
   */
  _runTransport(req) {
    try {
      this._transportHandle = openTransport(req, {
        onText: (text) => {
          if (this._status === STREAM_STATUS.CONNECTING) {
            this._status = STREAM_STATUS.STREAMING;
            this._emitStatus();
          }
          try {
            const schema = tryParseTypeSchemaFrame(text);
            if (schema) {
              if (this._typeSession) this._typeSession.applySchema(schema);
              return;
            }
            if (this._asyncParse) {
              this._asyncIngestChain = this._asyncIngestChain
                .then(() => this._engine.pushAsync(text))
                .then(() => {
                  this._buffer = this._engine.buffer;
                  this._syncCommittedFromEngine();
                  if (this._engine.snapshot !== undefined) {
                    this._snapshot = this._engine.snapshot;
                  }
                })
                .catch((err) => {
                  this._fail(
                    err instanceof Error ? err : new Error(String(err)),
                  );
                });
            } else {
              this._engine.push(text);
              this._buffer = this._engine.buffer;
              this._syncCommittedFromEngine();
              if (this._engine.snapshot !== undefined) {
                this._snapshot = this._engine.snapshot;
              }
            }
          } catch (err) {
            this._fail(err instanceof Error ? err : new Error(String(err)));
          }
        },
        onDone: () => {
          try {
            this._completeSuccessfully();
          } catch (err) {
            this._fail(err instanceof Error ? err : new Error(String(err)));
          }
        },
        onError: (err) => {
          this._fail(err);
        },
      });
    } catch (err) {
      this._fail(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Abort the in-flight request.
   * @returns {boolean} true if an abort was signaled
   */
  abort() {
    if (!this.isBusy() && !this._abortController) return false;
    try {
      this._abortController?.abort(new Error("aborted"));
      this._transportHandle?.abort();
    } catch {
      /* ignore */
    }
    if (this.isBusy() || this._status === STREAM_STATUS.CONNECTING) {
      this._status = STREAM_STATUS.ABORTED;
      this._lastError = new Error("aborted");
      this._rejectPromise(this._lastError);
      this._rejectIterators(this._lastError);
      this._deliverError(this._lastError);
      this._emitStatus();
      this._clearTransport();
      return true;
    }
    return false;
  }

  // --- Internal delivery ---

  _resetCycle() {
    this._lastError = null;
    this._snapshot = undefined;
    this._committedSnapshot = undefined;
    this._committedAvailable = false;
    this._buffer = "";
    this._iterQueue = [];
    this._iterDone = false;
    this._iterError = null;
    this._iterWaiters = [];
    this._promiseResolve = null;
    this._promiseReject = null;
    this._engine = null;
    this._clearTransport();
  }

  _clearTransport() {
    this._transportHandle = null;
    this._abortController = null;
  }

  _completeSuccessfully() {
    this._status = STREAM_STATUS.COMPLETING;
    this._emitStatus();

    const runFinish = () => {
      if (this._asyncParse) {
        return this._engine.finishAsync();
      }
      this._engine.finish();
      return Promise.resolve();
    };

    void this._asyncIngestChain
      .catch(() => {})
      .then(() => runFinish())
      .then(() => {
        this._buffer = this._engine.buffer;
        this._syncCommittedFromEngine();
        this._snapshot = this._engine.snapshot;

        const finalJson =
          this._snapshot === undefined ? {} : cloneJson(this._snapshot);

        this._deliverDone(finalJson);

        this._status = STREAM_STATUS.COMPLETED;
        this._emitStatus();
        this._clearTransport();
      })
      .catch((err) => {
        this._fail(err instanceof Error ? err : new Error(String(err)));
      });
  }

  /**
   * Pull committed-prefix bookkeeping from the checkpoint engine.
   * Avoids materializing/cloning the full tree on every phase unless a reader
   * asks via `getCommittedSnapshot()`.
   */
  _syncCommittedFromEngine() {
    if (!this._engine) return;
    if (this._engine.committedAt <= 0) return;
    // Invalidate cache; materialize lazily on getCommittedSnapshot.
    this._committedSnapshot = undefined;
    this._committedAvailable = true;
  }

  /**
   * Whether any active mode will observe phase Diffs.
   * When false, checkpoint skips per-phase Diff parses (Commit/final unchanged).
   * @returns {boolean}
   */
  _wantsPhaseDiff() {
    if (this._modes.has(STREAM_MODES.ASYNC_ITERATOR)) return true;
    if (this._modes.has(STREAM_MODES.EVENTS)) return true;
    if (this._modes.has(STREAM_MODES.CALLBACK) && this._onChunk) return true;
    return false;
  }

  /**
   * @param {unknown} diff
   * @param {{ typeCheckEscapePaths?: string[] }} [meta]
   */
  _deliverChunk(diff, meta) {
    // Commit lands in the engine before this hook; sync so mid-chunk readers see it.
    this._syncCommittedFromEngine();
    if (meta?.typeCheckEscapePaths?.length) {
      if (!this._typeCheckEscapePaths) this._typeCheckEscapePaths = [];
      for (const p of meta.typeCheckEscapePaths) {
        this._typeCheckEscapePaths.push(p);
      }
    }
    if (this._typeSession) {
      if (diff !== null && diff !== undefined) {
        this._typeSession.observeTree(diff, {
          escapePaths: this._typeCheckEscapePaths,
        });
      }
      const committed = this._engine?.committedSnapshot;
      if (committed !== undefined) {
        this._typeSession.reconcileCommit(committed === null ? {} : committed);
      }
    }
    if (!this._wantsPhaseDiff()) return;
    if (this._modes.has(STREAM_MODES.CALLBACK) && this._onChunk) {
      this._onChunk(diff);
    }
    if (this._modes.has(STREAM_MODES.EVENTS)) {
      this._emit("chunk", diff);
    }
    if (this._modes.has(STREAM_MODES.ASYNC_ITERATOR)) {
      this._iterQueue.push(diff);
      while (this._iterWaiters.length > 0) {
        this._iterWaiters.shift().resolve();
      }
    }
  }

  /**
   * @param {unknown} json
   */
  _deliverDone(json) {
    this._iterDone = true;
    while (this._iterWaiters.length > 0) {
      this._iterWaiters.shift().resolve();
    }

    if (this._modes.has(STREAM_MODES.CALLBACK) && this._onDone) {
      this._onDone(json);
    }
    if (this._modes.has(STREAM_MODES.EVENTS)) {
      this._emit("done", json);
    }
    if (this._modes.has(STREAM_MODES.PROMISE) && this._promiseResolve) {
      this._promiseResolve(json);
      this._promiseResolve = null;
      this._promiseReject = null;
    }
  }

  /**
   * @param {Error} err
   */
  _fail(err) {
    if (
      this._status === STREAM_STATUS.COMPLETED ||
      this._status === STREAM_STATUS.ERROR ||
      this._status === STREAM_STATUS.ABORTED
    ) {
      return;
    }
    this._status = STREAM_STATUS.ERROR;
    this._lastError = err;
    this._rejectPromise(err);
    this._rejectIterators(err);
    this._deliverError(err);
    this._emitStatus();
    this._clearTransport();
    try {
      this._abortController?.abort(err);
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {Error} err
   */
  _deliverError(err) {
    if (this._modes.has(STREAM_MODES.CALLBACK) && this._onError) {
      this._onError(err);
    }
    if (this._modes.has(STREAM_MODES.EVENTS)) {
      this._emit("error", err);
    }
  }

  /** @param {Error} err */
  _rejectPromise(err) {
    if (this._promiseReject) {
      this._promiseReject(err);
      this._promiseResolve = null;
      this._promiseReject = null;
    }
  }

  /** @param {Error} err */
  _rejectIterators(err) {
    this._iterError = err;
    this._iterDone = true;
    while (this._iterWaiters.length > 0) {
      this._iterWaiters.shift().reject(err);
    }
  }

  /**
   * @param {string} event
   * @param {...unknown} args
   */
  _emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch {
        /* isolate listener errors */
      }
    }
  }

  _emitStatus() {
    if (this._modes.has(STREAM_MODES.EVENTS)) {
      this._emit("status", this.getStatus());
    }
  }
}

/**
 * @param {(AbortSignal|undefined|null)[]} signals
 * @returns {AbortSignal}
 */
function anySignalLocal(signals) {
  const list = signals.filter(Boolean);
  if (list.length === 0) return new AbortController().signal;
  if (list.length === 1) return /** @type {AbortSignal} */ (list[0]);
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(/** @type {AbortSignal[]} */ (list));
  }
  const ac = new AbortController();
  for (const s of /** @type {AbortSignal[]} */ (list)) {
    if (s.aborted) {
      ac.abort(s.reason);
      return ac.signal;
    }
    s.addEventListener("abort", () => ac.abort(s.reason), { once: true });
  }
  return ac.signal;
}
