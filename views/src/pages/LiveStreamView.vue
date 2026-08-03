<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import LiveDashboard from "@/components/live/LiveDashboard.vue";
import {
  consumeLiveStream,
  estimateBoundLeaves,
  mergeLive,
} from "@/lib/live-stream-client.js";
import {
  getProfile,
  getScale,
  estimateLeaves,
  estimateWireBytes,
  formatBitrate,
  formatDuration,
} from "@/data/network-profiles.js";
import { useI18n } from "@/i18n.js";

const route = useRoute();
const router = useRouter();
const { t, pick } = useI18n();

const profileId = computed(() => String(route.query.profile || "4g"));
const scaleId = computed(() => String(route.query.scale || "production"));
const profile = computed(() => getProfile(profileId.value));
const scale = computed(() => getScale(scaleId.value));
const estimatedLeaves = computed(() => estimateLeaves(scale.value));
const estimatedBytes = computed(() => estimateWireBytes(scale.value));

const status = ref("idle");
const error = ref("");
const received = ref(0);
const leafCount = ref(0);
const phaseCount = ref(0);
const elapsedMs = ref(0);
const throughput = ref(0);
const live = shallowRef(null);
const metaHeaders = ref({});

let abort = null;
let tick = 0;
let startedAt = 0;

const signalBars = computed(() => {
  const map = { "1g": 1, "2g": 2, "3g": 3, "4g": 4, "5g": 5 };
  return map[profileId.value] || 3;
});

const wirePct = computed(() => {
  const est = estimatedBytes.value || 1;
  return Math.min(100, Math.round((received.value / est) * 100));
});

const statusLabel = computed(() => {
  const map = {
    idle: pick("Idle", "空闲"),
    running: pick("Streaming", "传输中"),
    completed: pick("Complete", "已完成"),
    error: pick("Error", "错误"),
    aborted: pick("Stopped", "已停止"),
  };
  return map[status.value] || status.value;
});

function pullLiveRoot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (snapshot.live && typeof snapshot.live === "object") return snapshot.live;
  return snapshot;
}

async function start() {
  abort?.abort();
  abort = new AbortController();
  status.value = "running";
  error.value = "";
  received.value = 0;
  leafCount.value = 0;
  phaseCount.value = 0;
  elapsedMs.value = 0;
  throughput.value = 0;
  live.value = null;
  startedAt = Date.now();

  stopTick();
  tick = window.setInterval(() => {
    elapsedMs.value = Date.now() - startedAt;
    if (elapsedMs.value > 0) {
      throughput.value = Math.round(
        (received.value / elapsedMs.value) * 1000,
      );
    }
  }, 200);

  try {
    await consumeLiveStream({
      profileId: profileId.value,
      scaleId: scaleId.value,
      signal: abort.signal,
      onMeta: (headers) => {
        metaHeaders.value = {
          api: headers.get("X-XAIOP-API") || "",
          leaves: headers.get("X-Estimated-Leaves") || "",
          bytes: headers.get("X-Estimated-Bytes") || "",
          chunk: headers.get("X-Chunk-Bytes") || "",
          requestId: headers.get("X-Request-Id") || "",
        };
      },
      onBytes: ({ received: n }) => {
        received.value = n;
      },
      onCommit: (_snapshot, info) => {
        const phaseLive = pullLiveRoot(info.phaseDiff);
        if (phaseLive) {
          live.value = mergeLive(live.value, phaseLive);
          leafCount.value = estimateBoundLeaves(live.value);
        }
        phaseCount.value += 1;
      },
      onDone: (snapshot, info) => {
        const root = pullLiveRoot(snapshot);
        if (root) {
          live.value = root;
          leafCount.value = estimateBoundLeaves(root);
        }
        received.value = info.received;
        elapsedMs.value = info.elapsedMs;
        throughput.value = info.elapsedMs
          ? Math.round((info.received / info.elapsedMs) * 1000)
          : 0;
        status.value = "completed";
        stopTick();
      },
      onError: (err) => {
        error.value = err.message;
        status.value = "error";
        stopTick();
      },
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      status.value = "aborted";
    } else {
      error.value = err?.message || String(err);
      status.value = "error";
    }
    stopTick();
  }
}

function stopTick() {
  if (tick) {
    clearInterval(tick);
    tick = 0;
  }
}

function stop() {
  abort?.abort();
  abort = null;
  stopTick();
  if (status.value === "running") status.value = "aborted";
}

function exit() {
  stop();
  router.push({ name: "playground" });
}

function restart() {
  start();
}

onMounted(start);
onUnmounted(() => {
  stop();
});

const elapsedLabel = computed(() => formatDuration(elapsedMs.value));
</script>

<template>
  <div class="live-page">
    <header class="chrome">
      <div class="left">
        <button type="button" class="back" @click="exit">
          <span aria-hidden="true">←</span>
          {{ t("live.exit") }}
        </button>
        <div class="brand-block">
          <div class="brand-row">
            <span class="mark" aria-hidden="true" />
            <strong>{{ t("live.title") }}</strong>
            <span class="status-pill" :data-s="status">
              <i aria-hidden="true" />
              {{ statusLabel }}
            </span>
          </div>
          <div class="meta-row">
            <span class="signal" :aria-label="pick(profile.label, profile.labelZh)">
              <i
                v-for="n in 5"
                :key="n"
                :data-on="n <= signalBars"
              />
            </span>
            <span
              >{{ pick(profile.label, profile.labelZh) }} ·
              {{ formatBitrate(profile.bitrateBps) }}</span
            >
            <span class="sep">/</span>
            <span>{{ pick(scale.label, scale.labelZh) }}</span>
            <span class="sep">/</span>
            <span>RTT {{ profile.rttMs }}ms · chunk {{ profile.chunkBytes }}B</span>
          </div>
        </div>
      </div>

      <div class="telemetry">
        <div class="t-cell">
          <span>{{ t("live.phases") }}</span>
          <b>{{ phaseCount }}</b>
        </div>
        <div class="t-cell">
          <span>{{ t("live.throughput") }}</span>
          <b>{{ throughput.toLocaleString() }} <small>c/s</small></b>
        </div>
        <div class="t-cell">
          <span>{{ t("play.elapsed") }}</span>
          <b>{{ elapsedLabel }}</b>
        </div>
        <div class="t-cell wide">
          <span>{{ pick("Wire progress", "线文进度") }}</span>
          <div class="mini-rail">
            <i :style="{ width: wirePct + '%' }" />
          </div>
          <b>{{ wirePct }}%</b>
        </div>
      </div>

      <div class="actions">
        <button
          type="button"
          class="ghost"
          :disabled="status !== 'running'"
          @click="stop"
        >
          {{ t("live.stop") }}
        </button>
        <button type="button" class="primary" @click="restart">
          {{ t("live.restart") }}
        </button>
      </div>
    </header>

    <div v-if="error" class="banner err" role="alert">{{ error }}</div>
    <div v-else-if="metaHeaders.requestId" class="banner meta">
      <span
        >{{ metaHeaders.api || "live-bff/v1" }} ·
        {{ metaHeaders.requestId }}</span
      >
      <span
        >est {{ Number(metaHeaders.leaves || 0).toLocaleString() }} leaves ·
        chunk {{ metaHeaders.chunk }}B</span
      >
    </div>

    <LiveDashboard
      :live="live"
      :leaf-count="leafCount"
      :received="received"
      :status="status"
      :estimated-leaves="estimatedLeaves"
      :phase-count="phaseCount"
    />
  </div>
</template>

<style scoped>
.live-page {
  --live-teal: #0d9f8a;
  min-height: 100vh;
  background:
    radial-gradient(
      1200px 480px at 10% -10%,
      color-mix(in srgb, var(--accent) 10%, transparent),
      transparent 60%
    ),
    radial-gradient(
      900px 420px at 90% 0%,
      color-mix(in srgb, var(--live-teal) 8%, transparent),
      transparent 55%
    ),
    var(--bg);
}

.chrome {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.85rem 1rem;
  padding: 0.7rem 1.1rem;
  background: color-mix(in srgb, var(--nav-bg) 92%, var(--surface));
  backdrop-filter: blur(16px) saturate(1.2);
  border-bottom: 1px solid var(--line-soft);
}

.left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  border-radius: 980px;
  height: 2.15rem;
  padding: 0 0.85rem;
  font-weight: 650;
  font-size: 0.84rem;
  cursor: pointer;
  flex-shrink: 0;
}

.back:hover {
  background: var(--hover-fill);
}

.brand-block {
  min-width: 0;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.mark {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: linear-gradient(135deg, var(--accent), var(--live-teal));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}

.brand-row strong {
  font-size: 0.95rem;
  letter-spacing: -0.02em;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  height: 1.4rem;
  padding: 0 0.5rem;
  border-radius: 980px;
  font-size: 0.68rem;
  font-weight: 750;
  border: 1px solid var(--line-soft);
  background: var(--surface);
  color: var(--ink-2);
}

.status-pill i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-pill[data-s="running"] {
  color: var(--live-teal);
  border-color: color-mix(in srgb, var(--live-teal) 35%, var(--line-soft));
  background: color-mix(in srgb, var(--live-teal) 10%, var(--surface));
}

.status-pill[data-s="running"] i {
  animation: blink 1s ease infinite;
}

.status-pill[data-s="completed"] {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 35%, var(--line-soft));
  background: color-mix(in srgb, var(--success) 10%, var(--surface));
}

.status-pill[data-s="error"],
.status-pill[data-s="aborted"] {
  color: var(--danger);
}

@keyframes blink {
  50% {
    opacity: 0.35;
  }
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.2rem;
  font-size: 0.72rem;
  color: var(--ink-3);
}

.sep {
  opacity: 0.45;
}

.signal {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
  margin-right: 0.15rem;
}

.signal i {
  width: 3px;
  border-radius: 1px;
  background: var(--line);
  display: block;
}

.signal i:nth-child(1) {
  height: 3px;
}
.signal i:nth-child(2) {
  height: 5px;
}
.signal i:nth-child(3) {
  height: 7px;
}
.signal i:nth-child(4) {
  height: 9px;
}
.signal i:nth-child(5) {
  height: 11px;
}

.signal i[data-on="true"] {
  background: var(--live-teal);
}

.telemetry {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
}

.t-cell {
  padding: 0.4rem 0.55rem;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  min-width: 0;
}

.t-cell span {
  display: block;
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--ink-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.t-cell b {
  display: block;
  margin-top: 0.1rem;
  font-size: 0.92rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.t-cell small {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--ink-3);
}

.t-cell.wide {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 0.45rem;
  align-items: center;
}

.t-cell.wide span {
  grid-column: 1 / -1;
}

.t-cell.wide b {
  margin: 0;
  font-size: 0.78rem;
}

.mini-rail {
  height: 5px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.mini-rail i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--live-teal));
  transition: width 0.2s ease;
}

.actions {
  display: flex;
  gap: 0.4rem;
}

.ghost,
.primary {
  height: 2.15rem;
  padding: 0 0.9rem;
  border-radius: 980px;
  font-weight: 650;
  font-size: 0.82rem;
  cursor: pointer;
}

.ghost {
  border: 1px solid var(--line-soft);
  background: transparent;
  color: var(--ink-2);
}

.ghost:disabled {
  opacity: 0.4;
  cursor: default;
}

.primary {
  border: none;
  background: var(--accent);
  color: var(--on-accent);
}

.primary:hover {
  background: var(--accent-hover);
}

.banner {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin: 0.65rem 1.1rem 0;
  padding: 0.55rem 0.8rem;
  border-radius: 10px;
  font-size: 0.75rem;
  font-family: var(--font-mono);
}

.banner.meta {
  color: var(--ink-3);
  background: var(--surface);
  border: 1px solid var(--line-soft);
}

.banner.err {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--danger) 28%, var(--line-soft));
}

@media (max-width: 1100px) {
  .chrome {
    grid-template-columns: 1fr;
  }
  .telemetry {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .actions {
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .status-pill[data-s="running"] i {
    animation: none;
  }
  .mini-rail i {
    transition: none;
  }
}
</style>
