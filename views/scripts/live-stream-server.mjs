/**
 * Node.js mock BFF: streams a large XAIOP document with network-profile throttling.
 *
 * Standalone:  node scripts/live-stream-server.mjs
 * Or mounted as Vite middleware via vite.config.js
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import {
  NETWORK_PROFILES,
  LIVE_SCALES,
  getProfile,
  getScale,
  estimateWireBytes,
  estimateTransferMs,
  formatBitrate,
  formatDuration,
} from "../src/data/network-profiles.js";
import {
  describeLivePayload,
  generateLiveWire,
} from "../src/lib/live-wire-gen.js";

const PORT = Number(process.env.LIVE_STREAM_PORT || 8787);
const __filename = fileURLToPath(import.meta.url);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/**
 * Throttle writer matching profile bitrate + RTT + jitter + chunk size.
 * @param {import("node:http").ServerResponse} res
 * @param {import("../src/data/network-profiles.js").NetworkProfile} profile
 * @param {AsyncIterable<string>} parts
 */
async function writeThrottled(res, profile, parts) {
  // TTFB ≈ one-way + processing; use ~½ RTT as first-byte delay
  await sleep(Math.round(profile.rttMs * 0.55));

  let pending = "";
  const chunkBytes = Math.max(16, profile.chunkBytes);
  const bitsPerByte = 8;
  const msPerByte = (bitsPerByte * 1000) / profile.bitrateBps;

  const flush = async (force = false) => {
    while (pending.length >= chunkBytes || (force && pending.length)) {
      const n = Math.min(chunkBytes, pending.length);
      const slice = pending.slice(0, n);
      pending = pending.slice(n);
      if (res.writableEnded || res.destroyed) return false;
      res.write(slice);
      const jitter =
        profile.jitterMs > 0
          ? (Math.random() * 2 - 1) * profile.jitterMs * 0.35
          : 0;
      const wait = Math.max(0, slice.length * msPerByte + jitter);
      if (wait > 0) await sleep(wait);
    }
    return true;
  };

  for await (const part of parts) {
    if (res.writableEnded || res.destroyed) return;
    pending += part;
    const ok = await flush(false);
    if (!ok) return;
  }
  await flush(true);
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @returns {Promise<boolean>} true if handled
 */
export async function handleLiveApi(req, res) {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `http://${host}`);
  const path = url.pathname;

  if (req.method === "OPTIONS" && path.startsWith("/api/live")) {
    cors(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  if (req.method === "GET" && path === "/api/live/profiles") {
    sendJson(res, 200, {
      profiles: NETWORK_PROFILES,
      scales: LIVE_SCALES,
    });
    return true;
  }

  if (req.method === "GET" && path === "/api/live/meta") {
    const profile = getProfile(url.searchParams.get("profile") || "4g");
    const scale = getScale(url.searchParams.get("scale") || "production");
    const desc = describeLivePayload(scale.id);
    const bytes = estimateWireBytes(scale);
    const etaMs = estimateTransferMs(profile, bytes);
    sendJson(res, 200, {
      api: "xaiop-live-bff/v1",
      profile,
      scale,
      routes: desc.apiRoutes,
      estimate: {
        leaves: desc.leaves,
        phases: desc.phases,
        wireBytes: bytes,
        bitrate: formatBitrate(profile.bitrateBps),
        etaMs,
        etaLabel: formatDuration(etaMs),
        chunkBytes: profile.chunkBytes,
        rttMs: profile.rttMs,
      },
    });
    return true;
  }

  if (req.method === "GET" && path === "/api/live/stream") {
    const profile = getProfile(url.searchParams.get("profile") || "4g");
    const scale = getScale(url.searchParams.get("scale") || "production");
    const seed = Number(url.searchParams.get("seed") || Date.now() % 1e9);
    const desc = describeLivePayload(scale.id);
    const bytes = estimateWireBytes(scale);

    cors(res);
    res.writeHead(200, {
      "Content-Type": "text/x-xaiop; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-store",
      "X-XAIOP-API": "live-bff/v1",
      "X-Network-Profile": profile.id,
      "X-Scale": scale.id,
      "X-Estimated-Leaves": String(desc.leaves),
      "X-Estimated-Bytes": String(bytes),
      "X-Chunk-Bytes": String(profile.chunkBytes),
      "X-Bitrate-Bps": String(profile.bitrateBps),
      "X-RTT-Ms": String(profile.rttMs),
      "X-Request-Id": `req_${seed}`,
    });

    try {
      await writeThrottled(
        res,
        profile,
        generateLiveWire({ scaleId: scale.id, seed }),
      );
      if (!res.writableEnded) res.end();
    } catch (err) {
      if (!res.writableEnded) {
        try {
          res.destroy(err instanceof Error ? err : new Error(String(err)));
        } catch {
          /* ignore */
        }
      }
    }
    return true;
  }

  return false;
}

export function createLiveServer() {
  return http.createServer(async (req, res) => {
    const handled = await handleLiveApi(req, res);
    if (!handled) {
      sendJson(res, 404, {
        error: "not_found",
        hint: "GET /api/live/meta | /api/live/profiles | /api/live/stream",
      });
    }
  });
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  const server = createLiveServer();
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[live-stream] http://127.0.0.1:${PORT}/api/live/meta`);
  });
}
