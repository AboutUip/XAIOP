// @ts-nocheck
/**
 * Network transports for XaiopStream (Node ≥ 18).
 *
 * Kinds:
 * - `http` — fetch / HTTP(S) with streaming body (default)
 * - `sse`  — Server-Sent Events over HTTP; concatenates `data:` fields
 * - `websocket` — WebSocket text frames (`globalThis.WebSocket` or `ws`)
 * - `raw` — caller-supplied async iterable / ReadableStream of string|Uint8Array
 */

import { Readable } from "node:stream";
import WsClient from "ws";

/** @typedef {'http'|'sse'|'websocket'|'raw'} TransportKind */

/**
 * @typedef {object} TransportRequest
 * @property {string} url
 * @property {TransportKind} [transport]
 * @property {string} [method]
 * @property {Record<string, string>} [headers]
 * @property {string|ArrayBuffer|Uint8Array|ReadableStream|null} [body]
 * @property {number} [timeoutMs]
 * @property {AbortSignal} [signal]
 * @property {string|string[]} [protocols] WebSocket subprotocols
 * @property {string[]} [sseEvents] SSE: only these event names
 * @property {AsyncIterable<string|Uint8Array>|ReadableStream|Readable} [source] raw source
 * @property {typeof fetch} [fetch]
 */

/**
 * @typedef {object} TransportHandlers
 * @property {(text: string) => void} onText
 * @property {() => void} onDone
 * @property {(err: Error) => void} onError
 */

export const TRANSPORT_KIND = Object.freeze({
  HTTP: /** @type {TransportKind} */ ("http"),
  SSE: /** @type {TransportKind} */ ("sse"),
  WEBSOCKET: /** @type {TransportKind} */ ("websocket"),
  RAW: /** @type {TransportKind} */ ("raw"),
});

/**
 * Streaming UTF-8 decoder for binary frames split across chunks.
 * @returns {{ push: (bytes: ArrayBuffer|ArrayBufferView) => string, flush: () => string }}
 */
function createUtf8StreamDecoder() {
  const decoder = new TextDecoder("utf-8");
  return {
    /**
     * @param {ArrayBuffer|ArrayBufferView} bytes
     * @returns {string}
     */
    push(bytes) {
      const u8 =
        bytes instanceof Uint8Array
          ? bytes
          : ArrayBuffer.isView(bytes)
            ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
            : new Uint8Array(/** @type {ArrayBuffer} */ (bytes));
      return decoder.decode(u8, { stream: true });
    },
    flush() {
      return decoder.decode();
    },
  };
}

/** @param {(text: string) => void} onText @param {string} text */
function emitText(onText, text) {
  if (text) onText(text);
}

/**
 * Start a transport. Returns an abort handle **immediately**; I/O runs in background.
 *
 * @param {TransportRequest} req
 * @param {TransportHandlers} handlers
 * @returns {{ abort: () => void }}
 */
export function openTransport(req, handlers) {
  const kind = req.transport ?? TRANSPORT_KIND.HTTP;
  const ac = new AbortController();
  const signal = anySignal([req.signal, ac.signal]);

  let timeoutId;
  if (req.timeoutMs != null && req.timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      ac.abort(new Error(`transport timeout after ${req.timeoutMs}ms`));
    }, req.timeoutMs);
  }

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };

  const run = async () => {
    try {
      if (kind === TRANSPORT_KIND.RAW) {
        await runRaw(req, handlers, signal);
      } else if (kind === TRANSPORT_KIND.WEBSOCKET) {
        await runWebSocket(req, handlers, signal);
      } else if (kind === TRANSPORT_KIND.SSE) {
        await runSse(req, handlers, signal);
      } else {
        await runHttp(req, handlers, signal);
      }
      cleanup();
      if (!signal.aborted) handlers.onDone();
    } catch (err) {
      cleanup();
      if (signal.aborted) {
        const reason =
          typeof signal.reason === "string"
            ? new Error(signal.reason)
            : signal.reason instanceof Error
              ? signal.reason
              : new Error("aborted");
        handlers.onError(reason);
      } else {
        handlers.onError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };

  void run();

  return {
    abort: () => {
      ac.abort(new Error("aborted"));
      cleanup();
    },
  };
}

/**
 * @param {TransportRequest} req
 * @param {TransportHandlers} handlers
 * @param {AbortSignal} signal
 */
async function runHttp(req, handlers, signal) {
  const fetchFn = req.fetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("fetch is not available in this runtime");
  }
  const res = await fetchFn(req.url, {
    method: req.method ?? "GET",
    headers: req.headers,
    body: req.body ?? undefined,
    signal,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
  }
  if (!res.body) {
    const text = await res.text();
    if (text) handlers.onText(text);
    return;
  }
  await readStreamToText(res.body, handlers.onText, signal);
}

/**
 * @param {TransportRequest} req
 * @param {TransportHandlers} handlers
 * @param {AbortSignal} signal
 */
async function runSse(req, handlers, signal) {
  const fetchFn = req.fetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("fetch is not available in this runtime");
  }
  const headers = { Accept: "text/event-stream", ...(req.headers ?? {}) };
  const res = await fetchFn(req.url, {
    method: req.method ?? "GET",
    headers,
    body: req.body ?? undefined,
    signal,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
  }
  if (!res.body) {
    throw new Error("SSE response has no body");
  }

  const allow = req.sseEvents ? new Set(req.sseEvents) : null;
  let buf = "";
  await readStreamToText(
    res.body,
    (chunk) => {
      buf += chunk;
      const parts = buf.split(/\r?\n\r?\n/);
      buf = parts.pop() ?? "";
      for (const block of parts) {
        const data = parseSseBlock(block, allow);
        if (data) handlers.onText(data);
      }
    },
    signal,
  );
  if (buf.trim()) {
    const data = parseSseBlock(buf, allow);
    if (data) handlers.onText(data);
  }
}

/**
 * @param {string} block
 * @param {Set<string>|null} allow
 * @returns {string}
 */
function parseSseBlock(block, allow) {
  let event = "message";
  /** @type {string[]} */
  const dataLines = [];
  for (const raw of block.split(/\r?\n/)) {
    if (!raw || raw.startsWith(":")) continue;
    const i = raw.indexOf(":");
    const field = i === -1 ? raw : raw.slice(0, i);
    let value = i === -1 ? "" : raw.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (allow && !allow.has(event)) return "";
  if (dataLines.length === 0) return "";
  return dataLines.join("\n");
}

/**
 * @param {TransportRequest} req
 * @param {TransportHandlers} handlers
 * @param {AbortSignal} signal
 */
async function runWebSocket(req, handlers, signal) {
  const WS =
    typeof globalThis.WebSocket === "function" ? globalThis.WebSocket : WsClient;

  await new Promise((resolve, reject) => {
    const ws =
      req.protocols != null
        ? new WS(req.url, req.protocols)
        : new WS(req.url);
    const binaryDecoder = createUtf8StreamDecoder();

    const onAbort = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error("aborted"));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    const onMessage = (ev) => {
      const data = ev?.data !== undefined ? ev.data : ev;
      if (typeof data === "string") {
        emitText(handlers.onText, data);
      } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
        emitText(handlers.onText, binaryDecoder.push(data));
      } else if (data instanceof ArrayBuffer) {
        emitText(handlers.onText, binaryDecoder.push(data));
      } else if (ArrayBuffer.isView(data)) {
        emitText(handlers.onText, binaryDecoder.push(data));
      }
    };

    const onError = () => {
      reject(new Error("WebSocket error"));
    };

    const onClose = () => {
      signal.removeEventListener("abort", onAbort);
      try {
        emitText(handlers.onText, binaryDecoder.flush());
      } catch {
        /* ignore flush errors on close */
      }
      resolve(undefined);
    };

    if (typeof ws.addEventListener === "function") {
      ws.addEventListener("message", onMessage);
      ws.addEventListener("error", onError);
      ws.addEventListener("close", onClose);
    } else {
      ws.on("message", (data) => onMessage({ data }));
      ws.on("error", onError);
      ws.on("close", onClose);
    }
  });
}

/**
 * @param {TransportRequest} req
 * @param {TransportHandlers} handlers
 * @param {AbortSignal} signal
 */
async function runRaw(req, handlers, signal) {
  if (!req.source) {
    throw new TypeError("raw transport requires `source`");
  }
  const iterable = asAsyncIterable(req.source);
  const binaryDecoder = createUtf8StreamDecoder();
  for await (const piece of iterable) {
    if (signal.aborted) throw new Error("aborted");
    if (typeof piece === "string") {
      emitText(handlers.onText, piece);
    } else if (piece instanceof Uint8Array || piece instanceof ArrayBuffer) {
      emitText(handlers.onText, binaryDecoder.push(piece));
    } else if (ArrayBuffer.isView(piece)) {
      emitText(handlers.onText, binaryDecoder.push(piece));
    } else {
      throw new TypeError("raw source yielded unsupported chunk type");
    }
  }
  emitText(handlers.onText, binaryDecoder.flush());
}

/**
 * @param {ReadableStream|AsyncIterable|Readable} source
 * @returns {AsyncIterable}
 */
function asAsyncIterable(source) {
  if (source instanceof Readable) {
    return /** @type {AsyncIterable} */ (
      Readable.toWeb(source)
    );
  }
  if (source && typeof /** @type {ReadableStream} */ (source).getReader === "function") {
    return streamToAsyncIterable(/** @type {ReadableStream} */ (source));
  }
  return /** @type {AsyncIterable} */ (source);
}

/**
 * @param {ReadableStream} stream
 * @param {(text: string) => void} onText
 * @param {AbortSignal} signal
 */
async function readStreamToText(stream, onText, signal) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      if (signal.aborted) {
        await reader.cancel("aborted");
        throw new Error("aborted");
      }
      const { done, value } = await reader.read();
      if (done) break;
      const text =
        typeof value === "string"
          ? value
          : decoder.decode(value, { stream: true });
      if (text) onText(text);
    }
    const tail = decoder.decode();
    if (tail) onText(tail);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {ReadableStream} stream
 */
async function* streamToAsyncIterable(stream) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {(AbortSignal|undefined|null)[]} signals
 * @returns {AbortSignal}
 */
function anySignal(signals) {
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
