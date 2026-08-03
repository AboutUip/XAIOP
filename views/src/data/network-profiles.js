/**
 * Mobile-network profiles for the live XAIOP stream lab.
 * Rates are goodput (application-layer), not radio peak.
 * Chunk sizes follow typical TCP/app frame behaviour under each generation.
 */

/** @typedef {{
 *   id: string,
 *   label: string,
 *   labelZh: string,
 *   generation: string,
 *   bitrateBps: number,
 *   rttMs: number,
 *   jitterMs: number,
 *   chunkBytes: number,
 *   desc: string,
 *   descZh: string,
 * }} NetworkProfile */

/** @type {NetworkProfile[]} */
export const NETWORK_PROFILES = [
  {
    id: "1g",
    label: "1G",
    labelZh: "1G",
    generation: "1G",
    // GSM CSD era ~9.6 kbps circuit data
    bitrateBps: 9_600,
    rttMs: 850,
    jitterMs: 140,
    chunkBytes: 48,
    desc: "Circuit-switched data (~9.6 kbps). Extreme latency, tiny frames.",
    descZh: "电路交换数据（约 9.6 kbps）。延迟极高，帧极小。",
  },
  {
    id: "2g",
    label: "2G",
    labelZh: "2G",
    generation: "2G / GPRS",
    // Typical GPRS goodput
    bitrateBps: 40_000,
    rttMs: 480,
    jitterMs: 90,
    chunkBytes: 160,
    desc: "GPRS-class goodput (~40 kbps). High RTT, small bursts.",
    descZh: "GPRS 级吞吐（约 40 kbps）。RTT 高，突发帧偏小。",
  },
  {
    id: "3g",
    label: "3G",
    labelZh: "3G",
    generation: "3G / HSPA",
    bitrateBps: 1_500_000,
    rttMs: 120,
    jitterMs: 28,
    chunkBytes: 1_024,
    desc: "HSPA mobile goodput (~1.5 Mbps). Moderate RTT.",
    descZh: "HSPA 移动侧吞吐（约 1.5 Mbps）。RTT 中等。",
  },
  {
    id: "4g",
    label: "4G",
    labelZh: "4G",
    generation: "4G / LTE",
    // Mid-tier LTE goodput (not peak marketing numbers)
    bitrateBps: 12_000_000,
    rttMs: 45,
    jitterMs: 12,
    chunkBytes: 8_192,
    desc: "LTE mid-tier goodput (~12 Mbps). Low RTT, KB-scale frames.",
    descZh: "LTE 中档吞吐（约 12 Mbps）。低延迟，KB 级帧。",
  },
  {
    id: "5g",
    label: "5G",
    labelZh: "5G",
    generation: "5G mid-band",
    // Mid-band goodput — not mmWave peak
    bitrateBps: 80_000_000,
    rttMs: 18,
    jitterMs: 5,
    chunkBytes: 32_768,
    desc: "5G mid-band goodput (~80 Mbps). Very low RTT, large frames.",
    descZh: "5G 中频吞吐（约 80 Mbps）。极低延迟，大帧传输。",
  },
];

/** @typedef {{
 *   id: string,
 *   label: string,
 *   labelZh: string,
 *   targetLeaves: number,
 *   counts: Record<string, number>,
 * }} LiveScale */

/** @type {LiveScale[]} */
export const LIVE_SCALES = [
  {
    id: "lab",
    label: "Lab",
    labelZh: "实验室",
    targetLeaves: 11_000,
    counts: {
      kpis: 24,
      users: 200,
      orders: 300,
      events: 500,
      inventory: 200,
      series: 400,
      logs: 250,
      devices: 150,
      tickets: 120,
      regions: 24,
      alerts: 40,
      notifications: 60,
    },
  },
  {
    id: "production",
    label: "Production",
    labelZh: "生产级",
    targetLeaves: 62_000,
    counts: {
      kpis: 48,
      users: 1_200,
      orders: 1_800,
      events: 2_800,
      inventory: 1_200,
      series: 2_400,
      logs: 1_400,
      devices: 900,
      tickets: 700,
      regions: 64,
      alerts: 100,
      notifications: 220,
    },
  },
  {
    id: "stress",
    label: "Stress",
    labelZh: "压力级",
    targetLeaves: 128_000,
    counts: {
      kpis: 64,
      users: 2_500,
      orders: 3_500,
      events: 6_000,
      inventory: 2_500,
      series: 5_000,
      logs: 3_000,
      devices: 1_800,
      tickets: 1_400,
      regions: 96,
      alerts: 180,
      notifications: 400,
    },
  },
];

export function getProfile(id) {
  return NETWORK_PROFILES.find((p) => p.id === id) ?? NETWORK_PROFILES[3];
}

export function getScale(id) {
  return LIVE_SCALES.find((s) => s.id === id) ?? LIVE_SCALES[1];
}

/** Rough leaf-field estimate from scale counts (matches generator). */
export function estimateLeaves(scale) {
  const c = scale.counts;
  return (
    c.kpis * 4 +
    c.users * 6 +
    c.orders * 7 +
    c.events * 5 +
    c.inventory * 5 +
    c.series * 3 +
    c.logs * 4 +
    c.devices * 5 +
    c.tickets * 5 +
    c.regions * 5 +
    c.alerts * 4 +
    c.notifications * 4 +
    24
  );
}

/** Bytes ≈ leaves × avg wire cost per leaf (empirical). */
export function estimateWireBytes(scale) {
  return Math.round(estimateLeaves(scale) * 28);
}

/**
 * @param {NetworkProfile} profile
 * @param {number} bytes
 */
export function estimateTransferMs(profile, bytes) {
  const ttfb = profile.rttMs;
  const transferMs = (bytes * 8 * 1000) / profile.bitrateBps;
  return Math.round(ttfb + transferMs);
}

export function formatBitrate(bps) {
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}
