// @ts-nocheck
/**
 * WebSocket hub — accept connections for skeleton / phase push.
 */

import { WebSocketServer } from "ws";
import { XaiopWsConnection } from "./connection.js";

/**
 * @typedef {import("./connection.js").WsConnectionOptions & {
 *   port?: number,
 *   host?: string,
 *   path?: string,
 *   server?: import("node:http").Server | import("node:https").Server,
 *   backlog?: number,
 *   perMessageDeflate?: boolean | object,
 *   maxPayload?: number,
 * }} WsListenOptions
 */

export class XaiopWsHub {
  /**
   * @param {import("ws").WebSocketServer} wss
   * @param {WsListenOptions} [connectionOptions]
   */
  constructor(wss, connectionOptions = {}) {
    if (!wss) throw new TypeError("XaiopWsHub requires a WebSocketServer");
    /** @type {import("ws").WebSocketServer} */
    this._wss = wss;
    this._connectionOptions = connectionOptions;
    /** @type {((conn: XaiopWsConnection, req: import("node:http").IncomingMessage) => void)|null} */
    this._onConnection = null;
    /** @type {Set<XaiopWsConnection>} */
    this._connections = new Set();
    /** @type {((err: Error) => void)|null} */
    this._onError = null;

    this._wss.on("connection", (socket, req) => {
      const conn = new XaiopWsConnection(socket, this._connectionOptions);
      this._connections.add(conn);
      void conn.closed.then(() => {
        this._connections.delete(conn);
      });
      if (this._onConnection) this._onConnection(conn, req);
    });

    this._wss.on("error", (err) => {
      const e = err instanceof Error ? err : new Error(String(err));
      if (this._onError) this._onError(e);
    });
  }

  /** Underlying `ws` WebSocketServer. */
  get server() {
    return this._wss;
  }

  /** Listening port, or `null` if not bound / path-only attach. */
  get port() {
    const addr = this._wss.address();
    if (addr && typeof addr === "object" && "port" in addr) {
      return /** @type {{ port: number }} */ (addr).port;
    }
    return null;
  }

  /**
   * `ws://host:port` for loopback tests when the hub owns the port.
   * @param {string} [host]
   */
  url(host = "127.0.0.1") {
    const port = this.port;
    if (port == null) {
      throw new Error("hub has no bound port (attach mode?)");
    }
    return `ws://${host}:${port}`;
  }

  /** Active accepted connections. */
  get connections() {
    return [...this._connections];
  }

  /**
   * @param {(conn: XaiopWsConnection, req: import("node:http").IncomingMessage) => void} fn
   */
  onConnection(fn) {
    this._onConnection = typeof fn === "function" ? fn : null;
    return this;
  }

  /** @param {(err: Error) => void} fn */
  onError(fn) {
    this._onError = typeof fn === "function" ? fn : null;
    return this;
  }

  /**
   * Close the hub and all connections.
   * @returns {Promise<void>}
   */
  close() {
    for (const conn of [...this._connections]) {
      try {
        void conn.end();
      } catch {
        /* ignore */
      }
    }
    return new Promise((resolve, reject) => {
      this._wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * @param {WsListenOptions} [options]
 * @returns {Promise<XaiopWsHub>}
 */
export async function listen(options = {}) {
  /** @type {import("ws").ServerOptions} */
  const wssOpts = {
    path: options.path,
    backlog: options.backlog,
    perMessageDeflate: options.perMessageDeflate,
    maxPayload: options.maxPayload,
  };

  /** @type {import("ws").WebSocketServer} */
  let wss;
  if (options.server) {
    wss = new WebSocketServer({ ...wssOpts, server: options.server });
  } else {
    wss = new WebSocketServer({
      ...wssOpts,
      host: options.host,
      port: options.port ?? 0,
    });
  }

  await waitServerListening(wss, !!options.server);
  return new XaiopWsHub(wss, options);
}

/**
 * @param {import("ws").WebSocketServer} wss
 * @param {boolean} attached
 */
function waitServerListening(wss, attached) {
  if (attached) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onListening = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const cleanup = () => {
      wss.off("listening", onListening);
      wss.off("error", onError);
    };
    wss.once("listening", onListening);
    wss.once("error", onError);
    try {
      if (wss.address()) {
        cleanup();
        resolve();
      }
    } catch {
      /* wait for event */
    }
  });
}
