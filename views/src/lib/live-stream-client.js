/**
 * Browser client: fetch chunked XAIOP from the live BFF → DotCheckpointEngine.
 */
import { DotCheckpointEngine } from "xaiop/checkpoint";

/**
 * @param {{
 *   profileId: string,
 *   scaleId: string,
 *   signal?: AbortSignal,
 *   onMeta?: (headers: Headers) => void,
 *   onBytes?: (info: { received: number, chunk: string }) => void,
 *   onCommit?: (snapshot: unknown, info: { committedAt: number, phaseDiff: unknown }) => void,
 *   onDone?: (snapshot: unknown, info: { received: number, elapsedMs: number }) => void,
 *   onError?: (err: Error) => void,
 * }} opts
 */
export async function consumeLiveStream(opts) {
  const started = Date.now();
  const url = `/api/live/stream?profile=${encodeURIComponent(opts.profileId)}&scale=${encodeURIComponent(opts.scaleId)}`;

  /** @type {unknown} */
  let latestCommit = null;
  let received = 0;

  const engine = new DotCheckpointEngine({
    compat: false,
    streamProcessing: true,
    onChunk: (diff) => {
      latestCommit = engine.committedSnapshot;
      opts.onCommit?.(latestCommit, {
        committedAt: engine.committedAt,
        phaseDiff: diff,
      });
    },
  });

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "text/x-xaiop, text/plain, */*" },
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new Error(`live stream HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error("live stream response has no body");
  }

  opts.onMeta?.(res.headers);

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (!text) continue;
      received += text.length;
      opts.onBytes?.({ received, chunk: text });
      engine.push(text);
    }
    const tail = decoder.decode();
    if (tail) {
      received += tail.length;
      opts.onBytes?.({ received, chunk: tail });
      engine.push(tail);
    }
    engine.finish();
    const finalSnap = engine.snapshot ?? engine.committedSnapshot;
    opts.onDone?.(finalSnap, {
      received,
      elapsedMs: Date.now() - started,
    });
    return { snapshot: finalSnap, received, elapsedMs: Date.now() - started };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name !== "AbortError") opts.onError?.(error);
    throw error;
  }
}

/** Flatten batched keys users0, users1, … into one array. */
export function collectBatches(live, prefix) {
  if (!live || typeof live !== "object") return [];
  const keys = Object.keys(live)
    .filter((k) => k === prefix || new RegExp(`^${prefix}\\d+$`).test(k))
    .sort((a, b) => {
      if (a === prefix) return -1;
      if (b === prefix) return 1;
      const na = Number(a.slice(prefix.length)) || 0;
      const nb = Number(b.slice(prefix.length)) || 0;
      return na - nb;
    });
  const out = [];
  for (const k of keys) {
    const arr = live[k];
    if (Array.isArray(arr)) out.push(...arr);
  }
  return out;
}

/**
 * Merge a phase `live` root into the cumulative board model.
 * Generator emits additive batch keys (users0, orders1, …) — O(keys) merge.
 */
export function mergeLive(prev, phaseLive) {
  if (!phaseLive || typeof phaseLive !== "object") return prev;
  const next = prev && typeof prev === "object" ? { ...prev } : {};
  for (const [k, v] of Object.entries(phaseLive)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      next[k] &&
      typeof next[k] === "object" &&
      !Array.isArray(next[k])
    ) {
      next[k] = { ...next[k], ...v };
    } else {
      next[k] = v;
    }
  }
  return next;
}

export function countLeaves(value, depth = 0) {
  if (value == null || depth > 12) return 0;
  if (typeof value !== "object") return 1;
  if (Array.isArray(value)) {
    let n = 0;
    for (const item of value) n += countLeaves(item, depth + 1);
    return n;
  }
  let n = 0;
  for (const v of Object.values(value)) n += countLeaves(v, depth + 1);
  return n;
}

/** Fast leaf estimate from known board shape (avoids deep walks every phase). */
export function estimateBoundLeaves(live) {
  if (!live || typeof live !== "object") return 0;
  const prefixes = [
    "users",
    "orders",
    "events",
    "inventory",
    "series",
    "logs",
    "devices",
    "tickets",
  ];
  const per = {
    users: 6,
    orders: 7,
    events: 5,
    inventory: 5,
    series: 3,
    logs: 4,
    devices: 5,
    tickets: 5,
  };
  let n = 24;
  for (const p of prefixes) {
    n += collectBatches(live, p).length * per[p];
  }
  if (Array.isArray(live.kpis)) n += live.kpis.length * 4;
  if (Array.isArray(live.regions)) n += live.regions.length * 5;
  if (Array.isArray(live.alerts)) n += live.alerts.length * 4;
  if (Array.isArray(live.notifications)) n += live.notifications.length * 4;
  return n;
}
