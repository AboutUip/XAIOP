// @ts-nocheck
/**
 * Browser WebSocket client for XAIOP phases.
 *
 * Uses native `globalThis.WebSocket` only — no `ws` package, no listen / hub.
 */

import { CompatPolicy } from "../core/compat.js";
import { cloneJson } from "../core/clone.js";
import { DotCheckpointEngine } from "../core/checkpoint.js";
import { encodePhaseJson, encodePhaseObject } from "../core/phase-encode.js";
import { ControlPlaneHost } from "../core/control-host.js";
import { ResumeWireLog } from "../core/resume-log.js";
import { stampWireWithLogSeq } from "../core/control.js";
import {
  TypeFreezeSession,
} from "../core/types.js";

/**
 * @typedef {{
 *   streamProcessing?: boolean,
 *   compatibilityMode?: boolean,
 *   mergeChunkWindow?: boolean,
 *   asyncParse?: boolean,
 *   cover?: boolean,
 *   typeCheck?: boolean,
 *   typeSchema?: import("../core/types.js").TypeSchemaSnapshot|import("../core/types.js").TypeRegistry,
 *   lineIntercept?: import("../core/line-intercept.js").LineInterceptHandler|import("../core/line-intercept.js").LineInterceptHandler[],
 *   annotationSpan?: import("../core/annotation-span.js").AnnotationSpanHandler|import("../core/annotation-span.js").AnnotationSpanHandler[],
 *   session?: boolean|{ sessionId?: string, role?: string, capabilities?: string[], epoch?: number },
 *   autoAck?: boolean,
 *   autoSession?: boolean,
 *   retainOutbound?: boolean,
 *   onControlError?: (err: import("../core/control.js").XaiopControlError) => void,
 *   onSession?: (body: unknown) => void,
 *   onResume?: (body: unknown) => void,
 *   onAck?: (body: unknown) => void,
 *   onSnapshot?: (body: unknown) => void,
 * }} BrowserWsConnectionOptions
 */

/**
 * @typedef {BrowserWsConnectionOptions & {
 *   protocols?: string | string[],
 *   handshakeTimeoutMs?: number,
 *   onPhase?: (diff: unknown) => void,
 *   onChunk?: (diff: unknown) => void,
 *   onDone?: (json: unknown) => void,
 *   onError?: (err: Error) => void,
 * }} BrowserWsConnectOptions
 */

/** One native WebSocket carrying XAIOP phases (consume and/or push). */
export class XaiopBrowserWsConnection {
  /**
   * @param {WebSocket} socket
   * @param {BrowserWsConnectOptions} [options]
   */
  constructor(socket, options = {}) {
    if (!socket || typeof socket.send !== "function") {
      throw new TypeError(
        "XaiopBrowserWsConnection requires a WebSocket-like socket",
      );
    }
    /** @type {WebSocket} */
    this._ws = socket;
    this._streamProcessing = options.streamProcessing !== false;
    this._compatibilityMode = !!options.compatibilityMode;
    this._mergeChunkWindow = options.mergeChunkWindow !== false;
    this._asyncParse = options.asyncParse === true;
    this._cover = options.cover === true;
    this._symbolKeys = options.symbolKeys === true;
    this._typeCheck = !!options.typeCheck && !this._compatibilityMode;
    this._compat = new CompatPolicy();

    /** @type {string} */
    this._buffer = "";
    /** @type {unknown|undefined} */
    this._snapshot = undefined;
    /** @type {unknown|undefined} */
    this._committedSnapshot = undefined;
    /** @type {boolean} */
    this._committedAvailable = false;
    /** @type {Error|null} */
    this._lastError = null;
    this._closed = false;
    this._finished = false;
    /** @type {Promise<void>} */
    this._asyncIngestChain = Promise.resolve();

    /** @type {((diff: unknown) => void)|null} */
    this._onPhase =
      typeof options.onPhase === "function"
        ? options.onPhase
        : typeof options.onChunk === "function"
          ? options.onChunk
          : null;
    /** @type {((json: unknown) => void)|null} */
    this._onDone = typeof options.onDone === "function" ? options.onDone : null;
    /** @type {((err: Error) => void)|null} */
    this._onError =
      typeof options.onError === "function" ? options.onError : null;

    /** @type {TextDecoder} */
    this._binaryDecoder = new TextDecoder("utf-8");

    /** @type {TypeFreezeSession|null} */
    this._typeSession = this._typeCheck ? new TypeFreezeSession() : null;
    if (this._typeSession && options.typeSchema) {
      this._typeSession.applySchema(options.typeSchema);
    }
    /** @type {string[]} */
    this._typeCheckEscapePaths = [];

    /** After `XaiopBrowserWs.connect` resolves, consumer handler mutators throw. */
    /** @type {boolean} */
    this._handlersLocked = false;

    /** @type {ControlPlaneHost} */
    this._control = new ControlPlaneHost({
      send: (text) => this.pushWire(text),
      getCommittedSnapshot: () => this.getCommittedSnapshot(),
      session: options.session,
      autoAck: options.autoAck === true,
      onControlError: (err) => {
        if (typeof options.onControlError === "function") {
          options.onControlError(err);
        } else if (this._onError) {
          this._onError(err);
        }
      },
      onSession: options.onSession,
      onResume: options.onResume,
      onAck: options.onAck,
      onSnapshot: (body) => {
        if (body && typeof body === "object" && "tree" in body) {
          this._control.lastSnapshot = body.tree;
        }
        if (typeof options.onSnapshot === "function") options.onSnapshot(body);
      },
      onTypes: (snapshot) => {
        if (this._typeSession) this._typeSession.applySchema(snapshot);
      },
    });

    this._outboundSeq = 0;
    this._autoRecordOutbound =
      !!options.session || options.retainOutbound === true;
    /** @type {ResumeWireLog|null} */
    this._outboundLog = this._autoRecordOutbound ? new ResumeWireLog() : null;

    this._engine = new DotCheckpointEngine({
      streamProcessing: this._streamProcessing,
      compat: this._compatibilityMode ? this._compat.snapshot() : false,
      symbolKeys: this._symbolKeys,
      mergeChunkWindow: this._mergeChunkWindow,
      cover: this._cover,
      lineIntercept: options.lineIntercept,
      annotationSpan: options.annotationSpan,
      onChunk: (diff, meta) => {
        this._buffer = this._engine.buffer;
        this._syncCommitted();
        this._control.notePhaseMeta(meta);
        if (meta?.typeCheckEscapePaths?.length) {
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
          const committed = this._engine.committedSnapshot;
          if (committed !== undefined) {
            this._typeSession.reconcileCommit(
              committed === null ? {} : committed,
            );
          }
        }
        if (this._onPhase) this._onPhase(diff, meta);
      },
    });
    this._control.bindCheckpoint(this._engine);

    if (options.autoSession === true) {
      if (this._ws.readyState === 1) {
        try { this._control.sendSession(); } catch { /* ignore */ }
      } else {
        this._ws.addEventListener("open", () => {
          try { this._control.sendSession(); } catch { /* ignore */ }
        }, { once: true });
      }
    }

    /** @type {(() => void)|null} */
    this._resolveClosed = null;
    /** @type {Promise<void>} */
    this._closedPromise = new Promise((resolve) => {
      this._resolveClosed = resolve;
    });

    /** @type {((v: unknown) => void)|null} */
    this._resolveDone = null;
    /** @type {((e: Error) => void)|null} */
    this._rejectDone = null;
    /** @type {Promise<unknown>} */
    this._donePromise = new Promise((resolve, reject) => {
      this._resolveDone = resolve;
      this._rejectDone = reject;
    });

    /** @type {((ev: MessageEvent) => void)|null} */
    this._onMessage = null;
    /** @type {(() => void)|null} */
    this._onClose = null;
    /** @type {((ev: Event) => void)|null} */
    this._onErrorSock = null;

    this._bindSocket();
  }

  get readyState() {
    return this._ws.readyState;
  }

  get closed() {
    return this._closedPromise;
  }

  /** Resolves with final Snapshot when the peer closes (or rejects on error). */
  get done() {
    return this._donePromise;
  }

  get lastError() {
    return this._lastError;
  }

  /** Whether client-side type freeze/schema checking is on. */
  get typeCheck() {
    return this._typeCheck;
  }

  getBufferedText() {
    return this._buffer;
  }

  /** @returns {unknown|undefined} */
  getSnapshot() {
    return this._snapshot === undefined ? undefined : cloneJson(this._snapshot);
  }

  /** @returns {unknown|undefined} */
  getCommittedSnapshot() {
    if (this._committedSnapshot === undefined) {
      if (!this._committedAvailable) return undefined;
      const c = this._engine.committedSnapshot;
      if (c === null || c === undefined) return undefined;
      this._committedSnapshot = c;
    }
    return cloneJson(this._committedSnapshot);
  }

  /**
   * Called by `XaiopBrowserWs.connect` after handshake.
   * @returns {this}
   */
  lockHandlers() {
    this._handlersLocked = true;
    return this;
  }

  /** @returns {boolean} */
  get handlersLocked() {
    return this._handlersLocked;
  }

  _assertHandlersMutable(api) {
    if (this._handlersLocked) {
      throw new TypeError(
        `${api} after connect is locked — pass onPhase/onDone/onError/lineIntercept/annotationSpan in connect options (no replay of early frames)`,
      );
    }
  }

  /** @param {(diff: unknown) => void} fn */
  onPhase(fn) {
    this._assertHandlersMutable("onPhase");
    this._onPhase = typeof fn === "function" ? fn : null;
    return this;
  }

  /** Alias of `onPhase` (same phase Diff as `XaiopStream.onChunk`). */
  onChunk(fn) {
    return this.onPhase(fn);
  }

  /**
   * Append a pre-parse line interceptor (`DotCheckpointEngine` buffer layer).
   * @param {import("../core/line-intercept.js").LineInterceptHandler} fn
   * @returns {this}
   */
  onLineIntercept(fn) {
    this._assertHandlersMutable("onLineIntercept");
    this._engine.onLineIntercept(fn);
    return this;
  }

  /** @returns {this} */
  clearLineIntercepts() {
    this._assertHandlersMutable("clearLineIntercepts");
    this._engine.clearLineIntercepts();
    return this;
  }

  /**
   * @param {import("../core/annotation-span.js").AnnotationSpanHandler} fn
   * @returns {this}
   */
  onAnnotationSpan(fn) {
    this._assertHandlersMutable("onAnnotationSpan");
    this._engine.onAnnotationSpan(fn);
    return this;
  }

  /** @returns {this} */
  clearAnnotationSpans() {
    this._assertHandlersMutable("clearAnnotationSpans");
    this._engine.clearAnnotationSpans();
    return this;
  }

  /** @param {(json: unknown) => void} fn */
  onDone(fn) {
    this._assertHandlersMutable("onDone");
    this._onDone = typeof fn === "function" ? fn : null;
    return this;
  }

  /** @param {(err: Error) => void} fn */
  onError(fn) {
    this._assertHandlersMutable("onError");
    this._onError = typeof fn === "function" ? fn : null;
    return this;
  }

  onResume(fn) {
    this._assertHandlersMutable("onResume");
    this._control.onResume(fn);
    return this;
  }

  onSession(fn) {
    this._assertHandlersMutable("onSession");
    this._control.onSession(fn);
    return this;
  }

  onAck(fn) {
    this._assertHandlersMutable("onAck");
    this._control.onAck(fn);
    return this;
  }

  onSnapshot(fn) {
    this._assertHandlersMutable("onSnapshot");
    this._control.onSnapshot(fn);
    return this;
  }

  onControlError(fn) {
    this._assertHandlersMutable("onControlError");
    this._control.onControlError(fn);
    return this;
  }

  /**
   * Encode `{ [key]: value }` as one phase and send. Discard the wire after send.
   * @param {string} key
   * @param {unknown} value
   * @param {{ final?: boolean, encodeOptions?: object }} [options]
   * @returns {boolean} false if socket not open
   */
  pushJson(key, value, options = {}) {
    const wire = encodePhaseJson(key, value, options);
    return this._pushOutboundPhase(wire);
  }

  /**
   * Encode a plain object as one phase and send.
   * @param {Record<string, unknown>} object
   * @param {{ final?: boolean, encodeOptions?: object }} [options]
   * @returns {boolean}
   */
  pushObject(object, options = {}) {
    const wire = encodePhaseObject(object, options);
    return this._pushOutboundPhase(wire);
  }

  /** @param {string} wire */
  _pushOutboundPhase(wire) {
    if (this._autoRecordOutbound) {
      const next = this._outboundSeq + 1;
      const ok = this.pushWire(stampWireWithLogSeq(next, wire));
      if (ok) this.noteOutboundPhase(wire);
      return ok;
    }
    return this.pushWire(wire);
  }

  /**
   * Send raw XAIOP text **as-is** (no automatic newline). Prefer {@link pushWireLn}
   * when consecutive frames need a trailing LF.
   * @param {string} text
   * @returns {boolean}
   */
  pushWire(text) {
    if (typeof text !== "string") {
      throw new TypeError("pushWire requires a string");
    }
    if (this._closed || this._ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this._ws.send(text);
    return true;
  }

  /**
   * Like {@link pushWire}, but appends `\n` when `text` does not already end with LF.
   * @param {string} text
   * @returns {boolean}
   */
  pushWireLn(text) {
    if (typeof text !== "string") {
      throw new TypeError("pushWireLn requires a string");
    }
    return this.pushWire(text.endsWith("\n") ? text : `${text}\n`);
  }

  get sessionId() {
    return this._control.sessionId;
  }

  get phaseSeq() {
    return this._engine.phaseSeq;
  }

  /** Session resume cursor (logSeq when stamped). */
  get logSeq() {
    return this._control.phaseSeq;
  }

  get outboundSeq() {
    return this._outboundSeq;
  }

  get ackedSeq() {
    return this._control.ackedSeq;
  }

  get outboundLog() {
    return this._outboundLog;
  }

  noteOutboundPhase(wire, committed) {
    this._outboundSeq += 1;
    if (this._outboundLog && typeof wire === "string") {
      this._outboundLog.record({
        seq: this._outboundSeq,
        wire,
        committed,
      });
    }
    return this._outboundSeq;
  }

  replayOutboundAfter(fromSeq) {
    if (!this._outboundLog) {
      throw new TypeError(
        "replayOutboundAfter requires session: true (or retainOutbound: true)",
      );
    }
    return this._outboundLog.wiresAfter(fromSeq);
  }

  _maybeRecordOutbound(wire) {
    if (!this._autoRecordOutbound) return;
    this.noteOutboundPhase(wire);
  }

  sendSession(extra = {}) {
    return this._control.sendSession(extra);
  }

  sendAck(seq) {
    return this._control.sendAck(seq);
  }

  sendResume(body) {
    return this._control.sendResume(body);
  }

  sendSnapshot(json) {
    return this._control.sendSnapshot(json);
  }

  getResumeState() {
    const base = this._control.getResumeState(this.getCommittedSnapshot());
    if (!base) return null;
    return {
      ...base,
      seq: base.seq,
      logSeq: base.seq,
      inboundSeq: this._engine.phaseSeq,
      outboundSeq: this._outboundSeq,
    };
  }

  /**
   * Close the socket after outgoing buffers drain.
   * @param {{ code?: number, reason?: string }} [opts]
   * @returns {Promise<void>}
   */
  async end(opts = {}) {
    if (this._closed) return;
    await waitBufferedAmount(this._ws);
    try {
      this._ws.close(opts.code ?? 1000, opts.reason ?? "");
    } catch {
      /* ignore */
    }
  }

  /** Abort abruptly. */
  abort() {
    if (this._closed) return false;
    try {
      this._ws.close(1001, "aborted");
    } catch {
      /* ignore */
    }
    return true;
  }

  _bindSocket() {
    const ws = this._ws;

    /**
     * @param {MessageEvent} ev
     */
    const onMessage = (ev) => {
      if (this._finished) return;
      try {
        const data = ev?.data;
        let text = "";
        if (typeof data === "string") {
          text = data;
        } else if (data instanceof ArrayBuffer) {
          text = this._binaryDecoder.decode(new Uint8Array(data), {
            stream: true,
          });
        } else if (ArrayBuffer.isView(data)) {
          text = this._binaryDecoder.decode(
            new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
            { stream: true },
          );
        } else if (typeof Blob !== "undefined" && data instanceof Blob) {
          void data.arrayBuffer().then(
            (buf) => {
              if (this._finished) return;
              try {
                const t = this._binaryDecoder.decode(new Uint8Array(buf), {
                  stream: true,
                });
                if (t) this._ingestText(t);
              } catch (err) {
                this._fail(
                  err instanceof Error ? err : new Error(String(err)),
                );
              }
            },
            (err) => {
              this._fail(err instanceof Error ? err : new Error(String(err)));
            },
          );
          return;
        } else if (data != null) {
          text = String(data);
        }
        if (!text) return;
        this._ingestText(text);
      } catch (err) {
        this._fail(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const onClose = () => {
      this._tearDownListeners();
      const finishClose = () => {
        try {
          const tail = this._binaryDecoder.decode();
          let wire = "";
          if (tail) wire += this._control.push(tail);
          wire += this._control.flush();
          if (wire && !this._finished) {
            if (this._asyncParse) {
              return this._engine.pushAsync(wire).then(() => {
                this._buffer = this._engine.buffer;
                this._syncCommitted();
              });
            }
            this._engine.push(wire);
            this._buffer = this._engine.buffer;
            this._syncCommitted();
          }
        } catch {
          /* ignore */
        }
        return Promise.resolve();
      };
      void (this._asyncParse
        ? this._asyncIngestChain.catch(() => {}).then(finishClose)
        : finishClose()
      ).then(() => this._completeFromPeerClose());
    };

    /**
     * @param {Event} _ev
     */
    const onError = (_ev) => {
      const e = new Error("WebSocket error");
      this._lastError = e;
      if (this._onError) this._onError(e);
    };

    this._onMessage = onMessage;
    this._onClose = onClose;
    this._onErrorSock = onError;

    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);
  }

  /** @param {string} text */
  _ingestText(text) {
    const wire = this._control.push(text);
    if (!wire) return;
    if (this._asyncParse) {
      this._asyncIngestChain = this._asyncIngestChain
        .then(() => this._engine.pushAsync(wire))
        .then(() => {
          this._buffer = this._engine.buffer;
          this._syncCommitted();
        })
        .catch((err) => {
          this._fail(err instanceof Error ? err : new Error(String(err)));
        });
    } else {
      this._engine.push(wire);
      this._buffer = this._engine.buffer;
      this._syncCommitted();
    }
  }

  _tearDownListeners() {
    const ws = this._ws;
    if (this._onMessage) ws.removeEventListener("message", this._onMessage);
    if (this._onClose) ws.removeEventListener("close", this._onClose);
    if (this._onErrorSock) ws.removeEventListener("error", this._onErrorSock);
  }

  _syncCommitted() {
    if (this._engine.committedAt <= 0) return;
    this._committedSnapshot = undefined;
    this._committedAvailable = true;
  }

  _completeFromPeerClose() {
    if (this._finished) {
      this._closed = true;
      this._resolveClosed?.();
      return;
    }
    this._finished = true;
    this._closed = true;

    const done = () => {
      try {
        this._buffer = this._engine.buffer;
        this._syncCommitted();
        this._snapshot = this._engine.snapshot;
        const finalJson =
          this._snapshot === undefined ? {} : cloneJson(this._snapshot);
        if (this._typeSession && finalJson && typeof finalJson === "object") {
          this._typeSession.observeTree(finalJson, {
            escapePaths: this._typeCheckEscapePaths,
          });
          this._typeSession.reconcileCommit(finalJson);
        }
        if (this._onDone) this._onDone(finalJson);
        this._resolveDone?.(finalJson);
      } catch (err) {
        this._fail(err instanceof Error ? err : new Error(String(err)));
      } finally {
        this._resolveClosed?.();
      }
    };

    const run = this._asyncParse
      ? this._engine.finishAsync()
      : Promise.resolve().then(() => {
          this._engine.finish();
        });

    void run.then(done, (err) => {
      this._fail(err instanceof Error ? err : new Error(String(err)));
      this._resolveClosed?.();
    });
  }

  /** @param {Error} err */
  _fail(err) {
    if (this._finished) return;
    this._finished = true;
    this._lastError = err;
    if (this._onError) this._onError(err);
    this._rejectDone?.(err);
    if (!this._closed) {
      try {
        this._ws.close(1011, String(err.message || "error").slice(0, 120));
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Browser-only WebSocket surface (`connect` only — `listen` is Node-only).
 */
export class XaiopBrowserWs {
  /**
   * Connect as a consumer (or bidirectional peer).
   * @param {string} url
   * @param {BrowserWsConnectOptions} [options]
   * @returns {Promise<XaiopBrowserWsConnection>}
   */
  static async connect(url, options = {}) {
    if (typeof url !== "string" || !url) {
      throw new TypeError("XaiopBrowserWs.connect requires a non-empty url");
    }
    const WS = globalThis.WebSocket;
    if (typeof WS !== "function") {
      throw new Error("WebSocket is not available in this runtime");
    }
    const ws =
      options.protocols != null
        ? new WS(url, options.protocols)
        : new WS(url);
    // Attach parsers before `open` so early frames are not lost.
    const conn = new XaiopBrowserWsConnection(ws, options);
    try {
      await waitOpen(ws, options.handshakeTimeoutMs ?? 15_000);
    } catch (err) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      throw err;
    }
    conn.lockHandlers();
    return conn;
  }

  /** Encode helpers (also available from core). */
  static encodePhaseJson = encodePhaseJson;
  static encodePhaseObject = encodePhaseObject;
}

/**
 * @param {WebSocket} ws
 * @param {number} timeoutMs
 */
function waitOpen(ws, timeoutMs) {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    /** @type {(() => void)|undefined} */
    let onOpen;
    /** @type {(() => void)|undefined} */
    let onError;
    const cleanup = () => {
      if (onOpen) ws.removeEventListener("open", onOpen);
      if (onError) ws.removeEventListener("error", onError);
      if (timer) clearTimeout(timer);
    };
    onOpen = () => {
      cleanup();
      resolve(undefined);
    };
    onError = () => {
      cleanup();
      reject(new Error("WebSocket error"));
    };
    ws.addEventListener("open", onOpen);
    ws.addEventListener("error", onError);
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        reject(new Error(`WebSocket handshake timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    }
  });
}

/**
 * @param {WebSocket} ws
 * @returns {Promise<void>}
 */
function waitBufferedAmount(ws) {
  if (!ws || typeof ws.bufferedAmount !== "number") {
    return Promise.resolve();
  }
  if (ws.bufferedAmount === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (ws.bufferedAmount === 0 || Date.now() - started > 2000) {
        resolve(undefined);
        return;
      }
      setTimeout(tick, 1);
    };
    tick();
  });
}
