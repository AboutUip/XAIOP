/**
 * One WebSocket carrying XAIOP phases (push and/or consume).
 * Same connection type for listen-accept and connect — one SDK surface.
 */

import { CompatPolicy } from "../../compat.js";
import { cloneJson } from "../../clone.js";
import { DotCheckpointEngine } from "../checkpoint.js";
import { encodePhaseJson, encodePhaseObject } from "./phase-encode.js";

/**
 * @typedef {{
 *   streamProcessing?: boolean,
 *   compatibilityMode?: boolean,
 * }} WsConnectionOptions
 */

export class XaiopWsConnection {
  /**
   * @param {import("ws").WebSocket} socket
   * @param {WsConnectionOptions & {
   *   onPhase?: (diff: unknown) => void,
   *   onChunk?: (diff: unknown) => void,
   *   onDone?: (json: unknown) => void,
   *   onError?: (err: Error) => void,
   * }} [options]
   */
  constructor(socket, options = {}) {
    if (!socket || typeof socket.send !== "function") {
      throw new TypeError("XaiopWsConnection requires a WebSocket-like socket");
    }
    /** @type {import("ws").WebSocket} */
    this._ws = socket;
    this._streamProcessing = options.streamProcessing !== false;
    this._compatibilityMode = !!options.compatibilityMode;
    this._compat = new CompatPolicy();

    /** @type {string} */
    this._buffer = "";
    /** @type {unknown|undefined} */
    this._snapshot = undefined;
    /** @type {unknown|undefined} */
    this._committedSnapshot = undefined;
    /** @type {Error|null} */
    this._lastError = null;
    this._closed = false;
    this._finished = false;

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

    this._engine = new DotCheckpointEngine({
      streamProcessing: this._streamProcessing,
      compat: this._compatibilityMode ? this._compat.snapshot() : false,
      onChunk: (diff) => {
        this._buffer = this._engine.buffer;
        this._syncCommitted();
        if (this._onPhase) this._onPhase(diff);
      },
    });

    /** @type {Promise<void>} */
    this._closedPromise = new Promise((resolve) => {
      this._resolveClosed = resolve;
    });

    /** @type {Promise<unknown>} */
    this._donePromise = new Promise((resolve, reject) => {
      this._resolveDone = resolve;
      this._rejectDone = reject;
    });

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

  getBufferedText() {
    return this._buffer;
  }

  /** @returns {unknown|undefined} */
  getSnapshot() {
    return this._snapshot === undefined ? undefined : cloneJson(this._snapshot);
  }

  /** @returns {unknown|undefined} */
  getCommittedSnapshot() {
    return this._committedSnapshot === undefined
      ? undefined
      : cloneJson(this._committedSnapshot);
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
    if (this._closed || this._ws.readyState !== 1 /* OPEN */) {
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
      this._ws.terminate?.();
      this._ws.close(1001, "aborted");
    } catch {
      /* ignore */
    }
    return true;
  }

  _bindSocket() {
    const ws = this._ws;

    const onMessage = (data, _isBinary) => {
      if (this._finished) return;
      try {
        let text = "";
        if (typeof data === "string") {
          text = data;
        } else if (Buffer.isBuffer(data)) {
          text = this._binaryDecoder.decode(data, { stream: true });
        } else if (data instanceof ArrayBuffer) {
          text = this._binaryDecoder.decode(new Uint8Array(data), {
            stream: true,
          });
        } else if (ArrayBuffer.isView(data)) {
          text = this._binaryDecoder.decode(
            new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
            { stream: true },
          );
        } else {
          text = String(data);
        }
        if (!text) return;
        this._engine.push(text);
        this._buffer = this._engine.buffer;
        this._syncCommitted();
      } catch (err) {
        this._fail(err instanceof Error ? err : new Error(String(err)));
      }
    };

    const onClose = () => {
      this._tearDownListeners();
      try {
        const tail = this._binaryDecoder.decode();
        if (tail && !this._finished) {
          this._engine.push(tail);
          this._buffer = this._engine.buffer;
          this._syncCommitted();
        }
      } catch {
        /* ignore */
      }
      this._completeFromPeerClose();
    };

    const onError = (err) => {
      const e = err instanceof Error ? err : new Error(String(err));
      this._lastError = e;
      if (this._onError) this._onError(e);
    };

    this._onMessage = onMessage;
    this._onClose = onClose;
    this._onErrorSock = onError;

    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", onError);
  }

  _tearDownListeners() {
    const ws = this._ws;
    if (this._onMessage) ws.off("message", this._onMessage);
    if (this._onClose) ws.off("close", this._onClose);
    if (this._onErrorSock) ws.off("error", this._onErrorSock);
  }

  _syncCommitted() {
    const c = this._engine.committedSnapshot;
    if (c === null || c === undefined) return;
    this._committedSnapshot = c;
  }

  _completeFromPeerClose() {
    if (this._finished) {
      this._closed = true;
      this._resolveClosed?.();
      return;
    }
    this._finished = true;
    this._closed = true;
    try {
      this._engine.finish();
      this._buffer = this._engine.buffer;
      this._syncCommitted();
      this._snapshot = this._engine.snapshot;
      const finalJson =
        this._snapshot === undefined ? {} : cloneJson(this._snapshot);
      if (this._onDone) this._onDone(finalJson);
      this._resolveDone?.(finalJson);
    } catch (err) {
      this._fail(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this._resolveClosed?.();
    }
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
 * @param {import("ws").WebSocket} ws
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
        resolve();
        return;
      }
      setTimeout(tick, 1);
    };
    tick();
  });
}
