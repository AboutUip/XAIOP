// @ts-nocheck
/**
 * XaiopWs — first-class WebSocket session for skeleton / phase streaming.
 *
 * One package surface:
 *   - listen  → accept + pushJson / pushWire / pushWireLn / end
 *   - connect → consume onPhase / getCommittedSnapshot / onDone
 *              (handlers locked after open — pass early callbacks in options)
 *
 * HTTP / SSE / RAW remain on `XaiopStream` for other paths; skeleton long-lived
 * product sessions are WS-primary here.
 */

import WebSocket from "ws";
import { XaiopWsConnection } from "./connection.js";
import { listen as listenHub } from "./hub.js";
import { encodePhaseJson, encodePhaseObject } from "../../core/phase-encode.js";

export { XaiopWsConnection } from "./connection.js";
export { XaiopWsHub, listen } from "./hub.js";
export { encodePhaseJson, encodePhaseObject };

/**
 * @typedef {import("./connection.js").WsConnectionOptions & {
 *   protocols?: string | string[],
 *   handshakeTimeoutMs?: number,
 *   headers?: Record<string, string>,
 * }} WsConnectOptions
 */

/**
 * @typedef {import("./hub.js").WsListenOptions} WsListenOptions
 */

export class XaiopWs {
  /**
   * Connect as a consumer (or bidirectional peer).
   * @param {string} url
   * @param {WsConnectOptions} [options]
   * @returns {Promise<XaiopWsConnection>}
   */
  static async connect(url, options = {}) {
    if (typeof url !== "string" || !url) {
      throw new TypeError("XaiopWs.connect requires a non-empty url");
    }
    const ws = new WebSocket(url, options.protocols, {
      headers: options.headers,
      handshakeTimeout: options.handshakeTimeoutMs,
    });
    // Attach parsers before `open` so sync server push in `connection` is not lost.
    const conn = new XaiopWsConnection(ws, options);
    try {
      await waitOpen(ws, options.handshakeTimeoutMs ?? 15_000);
    } catch (err) {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      throw err;
    }
    conn.lockHandlers();
    return conn;
  }

  /**
   * Listen for producers/consumers. `port: 0` picks an ephemeral port.
   * @param {WsListenOptions} [options]
   * @returns {Promise<import("./hub.js").XaiopWsHub>}
   */
  static listen(options = {}) {
    return listenHub(options);
  }

  /** Encode helpers (also available as named exports). */
  static encodePhaseJson = encodePhaseJson;
  static encodePhaseObject = encodePhaseObject;
}

/**
 * @param {import("ws").WebSocket} ws
 * @param {number} timeoutMs
 */
function waitOpen(ws, timeoutMs) {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    const cleanup = () => {
      ws.off("open", onOpen);
      ws.off("error", onError);
      if (timer) clearTimeout(timer);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    ws.once("open", onOpen);
    ws.once("error", onError);
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        try {
          ws.terminate();
        } catch {
          /* ignore */
        }
        reject(new Error(`WebSocket handshake timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    }
  });
}
