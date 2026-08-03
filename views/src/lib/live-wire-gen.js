/**
 * Production-scale XAIOP wire generator for the live stream lab.
 * Emits multi-phase documents shaped like a BFF aggregating REST resources:
 *   /v1/meta, /v1/kpis, /v1/users, /v1/orders, /v1/events, …
 *
 * Progressive batches keep wire O(n) (no rewriting growing arrays each phase).
 */

import { getScale, estimateLeaves } from "../data/network-profiles.js";

const CITIES = [
  "Shanghai",
  "Tokyo",
  "Singapore",
  "Seoul",
  "Sydney",
  "Berlin",
  "London",
  "Paris",
  "Toronto",
  "Austin",
  "SaoPaulo",
  "Dubai",
];
const SKUS = ["TRX", "NVM", "PLK", "QRT", "HZN", "ORB", "FLT", "ARC"];
const LEVELS = ["info", "warn", "error", "debug"];
const TICKET_STATUS = ["open", "pending", "solved", "closed"];
const DEVICE_STATE = ["online", "idle", "offline", "maintenance"];
const EVENT_TYPE = ["click", "purchase", "refund", "login", "search", "view"];

function esc(v) {
  return String(v).replace(/[\r\n]/g, " ");
}

function field(k, v) {
  return `${k}:${esc(v)}`;
}

function obj(fields) {
  const lines = [">"];
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    lines.push(field(k, v));
  }
  lines.push("<");
  return lines;
}

function phase(...parts) {
  return [">", ...parts.flat(), "."].join("\n") + "\n";
}

function finalPhase(...parts) {
  return [">", ...parts.flat()].join("\n") + "\n";
}

function pad(n, w = 5) {
  return String(n).padStart(w, "0");
}

/**
 * @param {string} scaleId
 * @returns {{
 *   scale: import("../data/network-profiles.js").LiveScale,
 *   leaves: number,
 *   phases: number,
 *   apiRoutes: string[],
 * }}
 */
export function describeLivePayload(scaleId) {
  const scale = getScale(scaleId);
  const c = scale.counts;
  const batch = 200;
  const userBatches = Math.ceil(c.users / batch);
  const orderBatches = Math.ceil(c.orders / batch);
  const eventBatches = Math.ceil(c.events / batch);
  const invBatches = Math.ceil(c.inventory / batch);
  const seriesBatches = Math.ceil(c.series / batch);
  const logBatches = Math.ceil(c.logs / batch);
  const deviceBatches = Math.ceil(c.devices / batch);
  const ticketBatches = Math.ceil(c.tickets / batch);
  const phases =
    3 +
    1 +
    userBatches +
    orderBatches +
    eventBatches +
    invBatches +
    seriesBatches +
    logBatches +
    deviceBatches +
    ticketBatches +
    4;
  return {
    scale,
    leaves: estimateLeaves(scale),
    phases,
    apiRoutes: [
      "GET /v1/meta",
      "GET /v1/kpis",
      "GET /v1/users",
      "GET /v1/orders",
      "GET /v1/events",
      "GET /v1/inventory",
      "GET /v1/metrics/series",
      "GET /v1/logs",
      "GET /v1/devices",
      "GET /v1/tickets",
      "GET /v1/regions",
      "GET /v1/alerts",
      "GET /v1/notifications",
      "GET /v1/summary",
    ],
  };
}

/**
 * Async generator yielding XAIOP wire phase strings (each ends with `.` except last).
 * @param {{ scaleId?: string, seed?: number }} [opts]
 */
export async function* generateLiveWire(opts = {}) {
  const scale = getScale(opts.scaleId ?? "production");
  const c = scale.counts;
  const seed = opts.seed ?? 20260803;
  let rnd = seed;
  const next = () => {
    rnd = (rnd * 1664525 + 1013904223) >>> 0;
    return rnd;
  };
  const pick = (arr) => arr[next() % arr.length];
  const batchSize = 200;
  const t0 = Date.now();

  yield phase(
    ">live",
    field("id", `ops-${scale.id}-${seed}`),
    field("api", "xaiop-live-bff/v1"),
    field("scale", scale.id),
    field("targetLeaves", estimateLeaves(scale)),
    field("generatedAt", new Date(t0).toISOString()),
  );

  yield phase(
    ">live",
    ">meta",
    field("title", "Production Ops Board"),
    field("region", "ap-east-1"),
    field("env", "production"),
    field("source", "BFF aggregate stream"),
    field("protocol", "XAIOP"),
    "<",
  );

  // KPIs — one shot
  {
    const parts = [">live", ">kpis-"];
    for (let i = 0; i < c.kpis; i++) {
      parts.push(
        ...obj({
          id: `kpi-${pad(i, 3)}`,
          name: `metric_${i}`,
          value: (next() % 50000) / 10,
          delta: ((next() % 200) - 100) / 10,
        }),
      );
    }
    yield phase(...parts);
  }

  // Users in progressive batches → live.users0, live.users1, …
  {
    let i = 0;
    let b = 0;
    while (i < c.users) {
      const parts = [">live", `>users${b}-`];
      const end = Math.min(i + batchSize, c.users);
      for (; i < end; i++) {
        parts.push(
          ...obj({
            id: `u-${pad(i)}`,
            name: `user_${i}`,
            city: pick(CITIES),
            tier: next() % 5,
            score: next() % 1000,
            active: next() % 2,
          }),
        );
      }
      yield phase(...parts);
      b++;
    }
  }

  // Orders
  {
    let i = 0;
    let b = 0;
    while (i < c.orders) {
      const parts = [">live", `>orders${b}-`];
      const end = Math.min(i + batchSize, c.orders);
      for (; i < end; i++) {
        parts.push(
          ...obj({
            id: `ord-${pad(i)}`,
            sku: `${pick(SKUS)}-${100 + (next() % 90)}`,
            qty: 1 + (next() % 8),
            amount: ((next() % 90000) + 100) / 100,
            currency: "USD",
            status: pick(["paid", "shipped", "refund", "pending"]),
            city: pick(CITIES),
          }),
        );
      }
      yield phase(...parts);
      b++;
    }
  }

  // Events
  {
    let i = 0;
    let b = 0;
    while (i < c.events) {
      const parts = [">live", `>events${b}-`];
      const end = Math.min(i + batchSize, c.events);
      for (; i < end; i++) {
        parts.push(
          ...obj({
            id: `ev-${pad(i)}`,
            type: pick(EVENT_TYPE),
            user: `u-${pad(next() % Math.max(1, c.users))}`,
            ts: t0 - (next() % 86_400_000),
            weight: (next() % 100) / 10,
          }),
        );
      }
      yield phase(...parts);
      b++;
    }
  }

  // Inventory
  {
    let i = 0;
    let b = 0;
    while (i < c.inventory) {
      const parts = [">live", `>inventory${b}-`];
      const end = Math.min(i + batchSize, c.inventory);
      for (; i < end; i++) {
        parts.push(
          ...obj({
            sku: `${pick(SKUS)}-${pad(i, 4)}`,
            warehouse: `WH-${1 + (next() % 12)}`,
            stock: next() % 500,
            reserved: next() % 40,
            cost: ((next() % 20000) + 50) / 100,
          }),
        );
      }
      yield phase(...parts);
      b++;
    }
  }

  // Time series
  {
    let i = 0;
    let b = 0;
    while (i < c.series) {
      const parts = [">live", `>series${b}-`];
      const end = Math.min(i + batchSize, c.series);
      for (; i < end; i++) {
        parts.push(
          ...obj({
            t: t0 - (c.series - i) * 60_000,
            v: 40 + (next() % 60) + (i % 17),
            ch: `ch-${next() % 8}`,
          }),
        );
      }
      yield phase(...parts);
      b++;
    }
  }

  // Logs
  {
    let i = 0;
    let b = 0;
    while (i < c.logs) {
      const parts = [">live", `>logs${b}-`];
      const end = Math.min(i + batchSize, c.logs);
      for (; i < end; i++) {
        parts.push(
          ...obj({
            id: `log-${pad(i)}`,
            level: pick(LEVELS),
            svc: `svc-${next() % 16}`,
            msg: `handled_request_${i}_ok`,
          }),
        );
      }
      yield phase(...parts);
      b++;
    }
  }

  // Devices
  {
    let i = 0;
    let b = 0;
    while (i < c.devices) {
      const parts = [">live", `>devices${b}-`];
      const end = Math.min(i + batchSize, c.devices);
      for (; i < end; i++) {
        parts.push(
          ...obj({
            id: `dev-${pad(i)}`,
            model: `X-${100 + (next() % 50)}`,
            state: pick(DEVICE_STATE),
            battery: next() % 101,
            rssi: -40 - (next() % 60),
          }),
        );
      }
      yield phase(...parts);
      b++;
    }
  }

  // Tickets
  {
    let i = 0;
    let b = 0;
    while (i < c.tickets) {
      const parts = [">live", `>tickets${b}-`];
      const end = Math.min(i + batchSize, c.tickets);
      for (; i < end; i++) {
        parts.push(
          ...obj({
            id: `tkt-${pad(i)}`,
            status: pick(TICKET_STATUS),
            priority: 1 + (next() % 4),
            assignee: `agent_${next() % 40}`,
            subject: `issue_${i}_followup`,
          }),
        );
      }
      yield phase(...parts);
      b++;
    }
  }

  // Regions
  {
    const parts = [">live", ">regions-"];
    for (let i = 0; i < c.regions; i++) {
      parts.push(
        ...obj({
          id: `rg-${pad(i, 3)}`,
          name: pick(CITIES) + "_" + i,
          load: (next() % 1000) / 10,
          errors: next() % 40,
          latencyMs: 20 + (next() % 200),
        }),
      );
    }
    yield phase(...parts);
  }

  // Alerts
  {
    const parts = [">live", ">alerts-"];
    for (let i = 0; i < c.alerts; i++) {
      parts.push(
        ...obj({
          id: `al-${pad(i, 3)}`,
          severity: pick(["low", "medium", "high", "critical"]),
          title: `alert_${i}`,
          open: next() % 2,
        }),
      );
    }
    yield phase(...parts);
  }

  // Notifications
  {
    const parts = [">live", ">notifications-"];
    for (let i = 0; i < c.notifications; i++) {
      parts.push(
        ...obj({
          id: `nt-${pad(i, 3)}`,
          channel: pick(["email", "push", "sms", "webhook"]),
          read: next() % 2,
          body: `notify_body_${i}`,
        }),
      );
    }
    yield phase(...parts);
  }

  // Final summary (no trailing `.` — EOF commits)
  yield finalPhase(
    ">live",
    ">summary",
    field("complete", 1),
    field("users", c.users),
    field("orders", c.orders),
    field("events", c.events),
    field("inventory", c.inventory),
    field("series", c.series),
    field("logs", c.logs),
    field("devices", c.devices),
    field("tickets", c.tickets),
    field("regions", c.regions),
    field("alerts", c.alerts),
    field("notifications", c.notifications),
    field("kpis", c.kpis),
    field("leaves", estimateLeaves(scale)),
    field("elapsedGenMs", Date.now() - t0),
    "<",
  );
}

/**
 * Concatenate full wire (tests / sizing). Prefer generateLiveWire for HTTP.
 * @param {{ scaleId?: string, seed?: number }} [opts]
 */
export async function buildLiveWire(opts = {}) {
  let out = "";
  for await (const part of generateLiveWire(opts)) out += part;
  return out;
}
