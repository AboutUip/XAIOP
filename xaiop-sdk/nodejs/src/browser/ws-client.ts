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
import {
  TypeFreezeSession,
  tryParseTypeSchemaFrame,
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

    this._engine = new DotCheckpointEngine({
      streamProcessing: this._streamProcessing,
      compat: this._compatibilityMode ? this._compat.snapshot() : false,
      mergeChunkWindow: this._mergeChunkWindow,
      cover: this._cover,
      lineIntercept: options.lineIntercept,
      annotationSpan: options.annotationSpan,
      onChunk: (diff, meta) => {
        this._buffer = this._engine.buffer;
        this._syncCommitted();
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
        if (this._onPhase) this._onPhase(diff);
      },
    });

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

  /** @param {(diff: unknown) => void} fn */
  onPhase(fn) {
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
    this._engine.onLineIntercept(fn);
    return this;
  }

  /** @returns {this} */
  clearLineIntercepts() {
    this._engine.clearLineIntercepts();
    return this;
  }

  /**
   * @param {import("../core/annotation-span.js").AnnotationSpanHandler} fn
   * @returns {this}
   */
  onAnnotationSpan(fn) {
    this._engine.onAnnotationSpan(fn);
    return this;
  }

  /** @returns {this} */
  clearAnnotationSpans() {
    this._engine.clearAnnotationSpans();
    return this;
  }

  /** @param {(json: unknown) => void} fn */
  onDone(fn) {
    this._onDone = typeof fn === "function" ? fn : null;
    return this;
  }

  /** @param {(err: Error) => void} fn */
  onError(fn) {
    this._onError = typeof fn === "function" ? fn : null;
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
    return this.pushWire(wire);
  }

  /**
   * Encode a plain object as one phase and send.
   * @param {Record<string, unknown>} object
   * @param {{ final?: boolean, encodeOptions?: object }} [options]
   * @returns {boolean}
   */
  pushObject(object, options = {}) {
    const wire = encodePhaseObject(object, options);
    return this.pushWire(wire);
  }

  /**
   * Send raw XAIOP text (complete lines preferred).
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
          if (tail && !this._finished) {
            if (this._asyncParse) {
              return this._engine.pushAsync(tail).then(() => {
                this._buffer = this._engine.buffer;
                this._syncCommitted();
              });
            }
            this._engine.push(tail);
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
          this._syncCommitted();
        })
        .catch((err) => {
          this._fail(err instanceof Error ? err : new Error(String(err)));
        });
    } else {
      this._engine.push(text);
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
