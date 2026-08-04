/**
 * Browser / isomorphic entry for XAIOP.
 *
 * Re-exports core APIs plus browser-safe streaming transport and WebSocket client.
 * Server listen / hub (`XaiopWs.listen`) is Node-only — use `XaiopBrowserWs.connect`.
 */

export * from "../core/index.js";

export { XaiopStream } from "./XaiopStream.js";
export { TRANSPORT_KIND, openTransport } from "./transport.js";
export {
  XaiopBrowserWs,
  XaiopBrowserWsConnection,
} from "./ws-client.js";
