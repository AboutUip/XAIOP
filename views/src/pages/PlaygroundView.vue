<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { parseSync } from "xaiop/parse";
import { materializeSnapshot } from "xaiop/materialize";
import DocsShell from "@/components/DocsShell.vue";
import ScenarioViewModal from "@/components/ScenarioViewModal.vue";
import ScenarioRender from "@/components/ScenarioRender.vue";
import NetworkPickModal from "@/components/NetworkPickModal.vue";
import { useI18n } from "@/i18n.js";
import { wireSamples } from "@/data/xaiop-catalog.js";
import { streamScenarios, wireStats } from "@/data/stream-scenarios.js";
import { StreamSimulator } from "@/lib/stream-sim.js";
import { useRouter } from "vue-router";

const { t, pick, locale } = useI18n();
const router = useRouter();
const showNetworkPick = ref(false);

function onLiveConfirm({ profileId, scaleId }) {
  showNetworkPick.value = false;
  router.push({
    name: "live",
    query: { profile: profileId, scale: scaleId },
  });
}

const mode = ref("stream");
const selectedId = ref(streamScenarios[0].id);
const viewId = ref(null);
/** Delay in seconds (supports sub-second via 0.1 steps, up to 10s). */
const delaySec = ref(1);
const chunkChars = ref(10);
const historyFocus = ref(null);
const showDebug = ref(true);
const debugTab = ref("wire"); // wire | phase | json

const delayMs = computed(() => Math.round(delaySec.value * 1000));

const sim = new StreamSimulator();
const snap = reactive({
  status: "idle",
  received: "",
  phases: [],
  latestPhase: undefined,
  cumulative: null,
  final: null,
  error: "",
  progress: 0,
  chunkCount: 0,
  elapsedMs: 0,
  lastChunk: "",
  canStep: false,
  committedAt: 0,
});

let elapsedTimer = 0;

function stopElapsedTick() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = 0;
  }
}

function startElapsedTick() {
  stopElapsedTick();
  elapsedTimer = window.setInterval(() => {
    if (sim.status === "running" || sim.status === "paused") {
      snap.elapsedMs = sim.elapsedMs;
      snap.progress = sim.progress;
    } else {
      stopElapsedTick();
      snap.elapsedMs = sim.elapsedMs;
      snap.progress = sim.progress;
    }
  }, 200);
}

/** Sync UI from simulator only on real stream events — never per-frame. */
function pullFrom(s = sim) {
  snap.status = s.status;
  snap.received = s.received;
  snap.phases = s.phases;
  snap.latestPhase = s.latestPhase;
  snap.cumulative = s.cumulative;
  snap.final = s.final;
  snap.error = s.error;
  snap.progress = s.progress;
  snap.chunkCount = s.chunkCount;
  snap.elapsedMs = s.elapsedMs;
  snap.lastChunk = s.lastChunk || "";
  snap.canStep = s.canStep;
  snap.committedAt = s.committedAt || 0;
  if (s.status === "running") startElapsedTick();
  else if (s.status !== "paused") stopElapsedTick();
}

function onSimUpdate(s) {
  pullFrom(s);
  if (s.phases.length) historyFocus.value = null;
}

const scenario = computed(
  () =>
    streamScenarios.find((s) => s.id === selectedId.value) ?? streamScenarios[0],
);
const scenarioStats = computed(() => wireStats(scenario.value.wire));
const viewScenario = computed(
  () => streamScenarios.find((s) => s.id === viewId.value) ?? null,
);

const renderData = computed(() =>
  snap.status === "completed" ? snap.final : snap.cumulative,
);

const phaseJson = computed(() => {
  void locale.value;
  if (historyFocus.value != null) {
    const hit = snap.phases.find((p) => p.index === historyFocus.value);
    if (hit) return hit.json;
  }
  if (snap.latestPhase === undefined) return t("play.waitingPhase");
  return JSON.stringify(snap.latestPhase, null, 2);
});

const liveJson = computed(() => {
  void locale.value;
  const value = renderData.value;
  if (value == null) return "—";
  return JSON.stringify(value, null, 2);
});

const finalJson = computed(() => {
  void locale.value;
  if (snap.final == null) return t("play.runToEnd");
  return JSON.stringify(snap.final, null, 2);
});

const elapsedLabel = computed(() => {
  const ms = snap.elapsedMs;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
});

const throughput = computed(() => {
  if (!snap.elapsedMs) return 0;
  return Math.round((snap.received.length / snap.elapsedMs) * 1000);
});

const toc = computed(() =>
  mode.value === "stream"
    ? [
        { href: "#scenarios", label: t("play.scenarios"), on: true },
        { href: "#transport", label: t("play.transport") },
        { href: "#preview", label: t("play.preview") },
        { href: "#history", label: t("play.history") },
      ]
    : [
        { href: "#static-samples", label: t("play.samples"), on: true },
        { href: "#static-editor", label: t("play.editor") },
      ],
);

function armCurrent() {
  stopElapsedTick();
  historyFocus.value = null;
  sim.arm(scenario.value.wire, {
    delayMs: delayMs.value,
    chunkChars: chunkChars.value,
    onUpdate: onSimUpdate,
  });
  pullFrom();
}

async function play() {
  if (
    snap.status === "idle" ||
    snap.status === "completed" ||
    snap.status === "error" ||
    snap.status === "aborted"
  ) {
    armCurrent();
  }
  sim.setDelayMs(delayMs.value);
  sim.setChunkChars(chunkChars.value);
  startElapsedTick();
  await sim.play({ delayMs: delayMs.value, chunkChars: chunkChars.value });
  pullFrom();
}

function pause() {
  sim.pause();
  pullFrom();
}

function stepOnce() {
  if (
    snap.status === "idle" ||
    snap.status === "completed" ||
    snap.status === "error" ||
    snap.status === "aborted"
  ) {
    armCurrent();
  }
  if (snap.status === "running") {
    sim.pause();
  }
  sim.setChunkChars(chunkChars.value);
  sim.step();
  pullFrom();
}

function reset() {
  sim.stop();
  stopElapsedTick();
  armCurrent();
}

watch(selectedId, () => {
  armCurrent();
});

watch([delaySec, chunkChars], () => {
  sim.setDelayMs(delayMs.value);
  sim.setChunkChars(chunkChars.value);
});

onMounted(() => {
  armCurrent();
});

onUnmounted(() => {
  sim.stop();
  stopElapsedTick();
});

/* —— static parse —— */
const source = ref(wireSamples[0].source);
const staticError = ref("");
const staticResult = ref(null);
const selectedSample = ref(wireSamples[0].id);

function runParse() {
  staticError.value = "";
  try {
    staticResult.value = materializeSnapshot(parseSync(source.value));
  } catch (e) {
    staticResult.value = null;
    staticError.value = e?.message || String(e);
  }
}

watch(
  selectedSample,
  (id) => {
    const s = wireSamples.find((w) => w.id === id);
    if (s) {
      source.value = s.source;
      runParse();
    }
  },
  { immediate: true },
);

const staticPretty = computed(() =>
  staticResult.value == null ? "" : JSON.stringify(staticResult.value, null, 2),
);

function useScenario(id) {
  selectedId.value = id;
  viewId.value = null;
  mode.value = "stream";
}

function sizeLabel(s) {
  const n = wireStats(s.wire).chars;
  if (n < 800) return "S";
  if (n < 2000) return "M";
  if (n < 4000) return "L";
  return "XL";
}

function previewLine(value) {
  try {
    const s = JSON.stringify(value);
    return s.length > 72 ? `${s.slice(0, 72)}…` : s;
  } catch {
    return String(value);
  }
}

function formatChunk(text) {
  if (!text) return "—";
  return JSON.stringify(text);
}
</script>

<template>
  <DocsShell
    :title="t('play.title')"
    :lead="t('play.lead')"
    :toc="toc"
  >
    <div class="mode-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="mode === 'stream'"
        :class="{ on: mode === 'stream' }"
        @click="mode = 'stream'"
      >
        {{ t("play.tabStream") }}
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="mode === 'static'"
        :class="{ on: mode === 'static' }"
        @click="mode = 'static'"
      >
        {{ t("play.tabStatic") }}
      </button>
    </div>

    <template v-if="mode === 'stream'">
      <section class="live-cta">
        <div>
          <h2>{{ t("play.openLive") }}</h2>
          <p>{{ t("play.openLiveLead") }}</p>
        </div>
        <button type="button" class="live-btn" @click="showNetworkPick = true">
          {{ t("play.openLive") }} →
        </button>
      </section>

      <section id="scenarios" class="scenarios">
        <header class="sec-h">
          <h2>{{ t("play.envTitle") }}</h2>
          <p>{{ t("play.envLead") }}</p>
        </header>

        <div class="scenario-grid">
          <article
            v-for="s in streamScenarios"
            :key="s.id"
            class="sc-card"
            :class="{ on: selectedId === s.id }"
            :style="{ '--accent-local': s.accent }"
          >
            <div class="sc-top">
              <span class="size">{{ sizeLabel(s) }}</span>
              <span class="env">{{ pick(s.env, s.envZh) }}</span>
            </div>
            <h3>{{ pick(s.title, s.titleZh) }}</h3>
            <p class="sc-blurb">{{ pick(s.blurb, s.blurbZh) }}</p>
            <div
              class="sc-meter"
              :title="t('play.intensity', { n: s.intensity })"
            >
              <i
                v-for="n in 5"
                :key="n"
                :class="{ on: n <= s.intensity }"
              />
            </div>
            <div class="sc-meta">
              <span>{{ wireStats(s.wire).chars }} {{ t("play.chars") }}</span>
              <span>{{ wireStats(s.wire).phases }} {{ t("play.phases") }}</span>
            </div>
            <div class="sc-actions">
              <button type="button" @click="viewId = s.id">{{
                t("play.view")
              }}</button>
              <button
                type="button"
                class="primary"
                @click="selectedId = s.id"
              >
                {{
                  selectedId === s.id ? t("play.selected") : t("play.select")
                }}
              </button>
            </div>
          </article>
        </div>
      </section>

      <section id="transport" class="transport">
        <div class="transport-main">
          <div class="transport-title">
            <h2>{{ pick(scenario.title, scenario.titleZh) }}</h2>
            <span class="pill-status" :data-s="snap.status">{{
              snap.status
            }}</span>
          </div>

          <p class="step-hint">{{ t("play.stepHint") }}</p>
          <p class="phase-gate">{{ t("play.phaseGate") }}</p>

          <div class="controls">
            <button
              type="button"
              class="primary"
              :disabled="snap.status === 'running'"
              @click="play"
            >
              {{
                snap.status === "paused" ? t("play.resume") : t("play.play")
              }}
            </button>
            <button
              type="button"
              class="step-btn"
              :disabled="snap.status === 'running'"
              @click="stepOnce"
            >
              {{ t("play.step") }}
            </button>
            <button
              type="button"
              :disabled="snap.status !== 'running'"
              @click="pause"
            >
              {{ t("play.pause") }}
            </button>
            <button type="button" @click="reset">{{ t("play.reset") }}</button>
            <button
              type="button"
              class="ghost"
              :class="{ on: showDebug }"
              @click="showDebug = !showDebug"
            >
              {{ t("play.debug") }}
            </button>
          </div>

          <div class="sliders">
            <label>
              <span
                >{{ t("play.delay") }}
                <strong
                  >{{ delaySec.toFixed(1)
                  }}{{ t("play.delayUnit") }}</strong
                ></span
              >
              <input
                v-model.number="delaySec"
                type="range"
                min="0"
                max="10"
                step="0.1"
              />
              <div class="delay-presets">
                <button
                  v-for="s in [0, 0.5, 1, 2, 3, 5]"
                  :key="s"
                  type="button"
                  :class="{ on: Math.abs(delaySec - s) < 0.05 }"
                  @click="delaySec = s"
                >
                  {{ s }}s
                </button>
              </div>
            </label>
            <label>
              <span
                >{{ t("play.chunk") }}
                <strong>{{ chunkChars }} {{ t("play.chars") }}</strong></span
              >
              <input
                v-model.number="chunkChars"
                type="range"
                min="1"
                max="64"
                step="1"
              />
            </label>
          </div>

          <div class="progress" aria-hidden="true">
            <div
              class="progress-fill"
              :style="{ width: `${snap.progress * 100}%` }"
            />
          </div>

          <div class="metrics">
            <div>
              <span class="m-l">{{ t("play.elapsed") }}</span>
              <strong>{{ elapsedLabel }}</strong>
            </div>
            <div>
              <span class="m-l">{{ t("play.chunks") }}</span>
              <strong>{{ snap.chunkCount }}</strong>
            </div>
            <div>
              <span class="m-l">{{ t("play.phases") }}</span>
              <strong>{{ snap.phases.length }}</strong>
            </div>
            <div>
              <span class="m-l">{{ t("play.bytes") }}</span>
              <strong
                >{{ snap.received.length }}/{{ scenarioStats.chars }}</strong
              >
            </div>
            <div>
              <span class="m-l">{{ t("play.throughput") }}</span>
              <strong>{{ throughput }} c/s</strong>
            </div>
          </div>
        </div>

        <div class="ribbon" aria-label="Phase timeline">
          <p class="ribbon-l">{{ t("play.ribbon") }}</p>
          <div class="ribbon-track">
            <button
              v-for="p in snap.phases"
              :key="p.index"
              type="button"
              class="rib"
              :class="{ on: historyFocus === p.index }"
              :title="`Phase ${p.index} @ ${p.atMs}ms`"
              @click="historyFocus = p.index"
            >
              <span class="rib-i">{{ p.index }}</span>
              <span class="rib-t">{{ p.atMs }}ms</span>
            </button>
            <span v-if="!snap.phases.length" class="rib-empty">{{
              t("play.ribbonEmpty")
            }}</span>
          </div>
        </div>
      </section>

      <section id="preview" class="preview-section">
        <header class="sec-h">
          <h2>{{ t("play.preview") }}</h2>
          <p>{{ pick(scenario.env, scenario.envZh) }}</p>
        </header>
        <div class="preview-split">
          <div class="preview-gui">
            <ScenarioRender
              :scenario-id="scenario.id"
              :data="renderData"
              :accent="scenario.accent"
            />
          </div>
          <article class="pane cum-pane">
            <header class="pane-h">
              <h3>
                {{
                  snap.status === "completed"
                    ? t("play.finalJson")
                    : t("play.liveCum")
                }}
              </h3>
              <span>{{
                snap.status === "completed" ? "done" : "parse(buffer)"
              }}</span>
            </header>
            <pre class="body">{{ liveJson }}</pre>
          </article>
        </div>
      </section>

      <section v-if="showDebug" id="live" class="debug-section">
        <header class="sec-h row">
          <div>
            <h2>{{ t("play.debug") }}</h2>
          </div>
          <div class="debug-tabs">
            <button
              type="button"
              :class="{ on: debugTab === 'wire' }"
              @click="debugTab = 'wire'"
            >
              {{ t("play.wire") }}
            </button>
            <button
              type="button"
              :class="{ on: debugTab === 'chunk' }"
              @click="debugTab = 'chunk'"
            >
              {{ t("play.lastChunk") }}
            </button>
            <button
              type="button"
              :class="{ on: debugTab === 'phase' }"
              @click="debugTab = 'phase'"
            >
              {{ t("play.phaseDiff") }}
            </button>
            <button
              type="button"
              :class="{ on: debugTab === 'json' }"
              @click="debugTab = 'json'"
            >
              {{ t("play.rawJson") }}
            </button>
          </div>
        </header>

        <article class="pane debug-pane">
          <header class="pane-h">
            <h3>
              {{
                debugTab === "wire"
                  ? t("play.wire")
                  : debugTab === "chunk"
                    ? t("play.lastChunk")
                    : debugTab === "phase"
                      ? t("play.phaseDiff")
                      : t("play.rawJson")
              }}
            </h3>
            <span>{{ Math.round(snap.progress * 100) }}%</span>
          </header>
          <pre v-if="debugTab === 'wire'" class="body wire">{{
            snap.received || "—"
          }}</pre>
          <pre v-else-if="debugTab === 'chunk'" class="body wire">{{
            formatChunk(snap.lastChunk)
          }}</pre>
          <pre v-else-if="debugTab === 'phase'" class="body">{{
            phaseJson
          }}</pre>
          <pre v-else class="body">{{ liveJson }}</pre>
        </article>
      </section>

      <section id="history" class="history">
        <header class="sec-h row">
          <div>
            <h2>{{ t("play.histTitle") }}</h2>
            <p>{{ t("play.histLead") }}</p>
          </div>
        </header>

        <div class="history-grid">
          <div class="hist-list">
            <button
              v-for="p in snap.phases"
              :key="p.index"
              type="button"
              class="hist-row"
              :class="{ on: historyFocus === p.index }"
              @click="historyFocus = p.index"
            >
              <span class="hi">#{{ p.index }}</span>
              <span class="ht">+{{ p.atMs }}ms</span>
              <code class="hs">{{ previewLine(p.value) }}</code>
            </button>
            <p v-if="!snap.phases.length" class="empty">
              {{ t("play.histEmpty") }}
            </p>
          </div>
          <article class="pane final-pane">
            <header class="pane-h">
              <h3>{{ t("play.finalSnap") }}</h3>
            </header>
            <pre class="body">{{ finalJson }}</pre>
            <p v-if="snap.error" class="err">{{ snap.error }}</p>
          </article>
        </div>
      </section>
    </template>

    <template v-else>
      <div id="static-samples" class="samples">
        <button
          v-for="s in wireSamples"
          :key="s.id"
          type="button"
          :class="{ on: selectedSample === s.id }"
          @click="selectedSample = s.id"
        >
          {{ pick(s.title, s.titleZh) }}
        </button>
      </div>

      <div id="static-editor" class="panes">
        <section class="pane">
          <header class="pane-h">
            <h3>{{ t("play.source") }}</h3>
            <button type="button" class="primary" @click="runParse">
              {{ t("play.parse") }}
            </button>
          </header>
          <textarea v-model="source" spellcheck="false" rows="16" />
        </section>
        <section class="pane">
          <header class="pane-h">
            <h3>{{ t("play.result") }}</h3>
          </header>
          <pre v-if="!staticError" class="body">{{ staticPretty }}</pre>
          <pre v-else class="body err">{{ staticError }}</pre>
        </section>
      </div>
    </template>

    <ScenarioViewModal
      v-if="viewScenario"
      :open="!!viewId"
      :scenario="viewScenario"
      @close="viewId = null"
      @use="useScenario"
    />
    <NetworkPickModal
      :open="showNetworkPick"
      @close="showNetworkPick = false"
      @confirm="onLiveConfirm"
    />
  </DocsShell>
</template>

<style scoped>
.live-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.75rem;
  padding: 1.2rem 1.3rem;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--line-soft));
  background:
    radial-gradient(
      90% 120% at 100% 0%,
      color-mix(in srgb, #0d9f8a 14%, transparent),
      transparent 55%
    ),
    radial-gradient(
      80% 100% at 0% 100%,
      color-mix(in srgb, var(--accent) 12%, transparent),
      transparent 50%
    ),
    var(--surface);
  box-shadow: var(--shadow);
}

.live-cta h2 {
  margin: 0 0 0.3rem;
  font-size: 1.08rem;
  letter-spacing: -0.02em;
}

.live-cta p {
  margin: 0;
  max-width: 46rem;
  color: var(--ink-2);
  font-size: 0.9rem;
  line-height: 1.45;
}

.live-btn {
  height: 2.55rem;
  padding: 0 1.2rem;
  border: none;
  border-radius: 980px;
  background: linear-gradient(
    135deg,
    var(--accent),
    color-mix(in srgb, #0d9f8a 55%, var(--accent))
  );
  color: #fff;
  font-weight: 750;
  font-size: 0.9rem;
  white-space: nowrap;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 28%, transparent);
}

.live-btn:hover {
  filter: brightness(1.05);
}

.mode-tabs {
  display: inline-flex;
  gap: 0.25rem;
  padding: 0.25rem;
  margin-bottom: 1.75rem;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  border-radius: 980px;
}

.mode-tabs button {
  border: 0;
  background: transparent;
  padding: 0.45rem 1rem;
  font-weight: 600;
  color: var(--ink-2);
}

.mode-tabs button.on {
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow);
}

.sec-h {
  margin-bottom: 1rem;
}

.sec-h h2 {
  font-size: 1.15rem;
  margin: 0 0 0.25rem;
}

.sec-h p {
  margin: 0;
  color: var(--ink-3);
  font-size: 0.92rem;
}

.sec-h.row {
  display: flex;
  justify-content: space-between;
  align-items: end;
}

.scenario-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.85rem;
  margin-bottom: 2rem;
}

.sc-card {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.sc-card.on {
  border-color: var(--accent-local, var(--accent));
  box-shadow: 0 0 0 1px var(--accent-local, var(--accent)), var(--shadow);
}

.sc-card:hover {
  transform: translateY(-1px);
}

.sc-top {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}

.size {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-local, var(--accent)) 16%, transparent);
  color: var(--accent-local, var(--accent));
}

.env {
  font-size: 0.72rem;
  color: var(--ink-3);
  font-weight: 600;
}

.sc-card h3 {
  margin: 0;
  font-size: 1.05rem;
}

.sc-blurb {
  margin: 0;
  font-size: 0.86rem;
  color: var(--ink-2);
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sc-meter {
  display: flex;
  gap: 0.28rem;
}

.sc-meter i {
  display: block;
  width: 18%;
  max-width: 28px;
  height: 3px;
  border-radius: 980px;
  background: var(--line-soft);
}

.sc-meter i.on {
  background: var(--accent-local, var(--accent));
}

.sc-meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

.sc-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.35rem;
}

.sc-actions button {
  flex: 1;
  padding: 0.4rem 0.6rem;
  font-size: 0.85rem;
}

.transport {
  margin-bottom: 1.5rem;
  padding: 1.15rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.transport-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.transport-title h2 {
  margin: 0;
  font-size: 1.2rem;
}

.pill-status {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.2rem 0.55rem;
  border-radius: 980px;
  background: var(--surface-2);
  color: var(--ink-3);
}

.pill-status[data-s="running"] {
  color: var(--accent);
  background: var(--accent-soft);
}

.pill-status[data-s="completed"] {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
}

.pill-status[data-s="error"],
.pill-status[data-s="aborted"] {
  color: var(--danger);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.step-btn {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}

.controls .ghost.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}

.step-hint {
  margin: 0 0 0.35rem;
  font-size: 0.88rem;
  color: var(--ink-3);
}

.phase-gate {
  margin: 0 0 0.85rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--accent);
}

.delay-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.35rem;
}

.delay-presets button {
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
  border-radius: 6px;
}

.delay-presets button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}

.preview-section {
  margin-bottom: 1.75rem;
}

.preview-split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 0.85rem;
  align-items: stretch;
  height: min(68vh, 720px);
}

.preview-gui {
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-gui :deep(.stage) {
  flex: 1;
  min-height: 0;
  height: 100%;
  max-height: none;
}

.cum-pane {
  min-height: 0;
  height: 100%;
  max-height: none;
  position: static;
  display: flex;
  flex-direction: column;
}

.cum-pane .body {
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.debug-section {
  margin-bottom: 1.75rem;
}

.debug-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.debug-tabs button {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
}

.debug-tabs button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.debug-pane {
  min-height: 0;
  max-height: min(42vh, 420px);
}

.debug-pane .body {
  min-height: 0;
  max-height: min(36vh, 360px);
  overflow: auto;
}

.pill-status[data-s="ready"],
.pill-status[data-s="stepping"],
.pill-status[data-s="paused"] {
  color: var(--accent);
  background: var(--accent-soft);
}

.sliders {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.sliders label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--ink-2);
}

.sliders input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
}

.progress {
  height: 6px;
  border-radius: 980px;
  background: var(--surface-2);
  overflow: hidden;
  margin-bottom: 0.85rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #5ac8fa);
  transition: width 0.08s linear;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.metrics .m-l {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin-bottom: 0.15rem;
}

.metrics strong {
  font-family: var(--font-mono);
  font-size: 0.95rem;
}

.ribbon-l {
  margin: 0 0 0.45rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.ribbon-track {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-height: 2.5rem;
  align-items: center;
}

.rib {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  padding: 0.35rem 0.55rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-soft);
  background: var(--code-bg);
  min-width: 3.5rem;
}

.rib.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.rib-i {
  font-weight: 800;
  font-size: 0.85rem;
  color: var(--ink);
}

.rib-t {
  font-size: 0.68rem;
  font-family: var(--font-mono);
  color: var(--ink-3);
}

.rib-empty {
  color: var(--ink-3);
  font-size: 0.88rem;
}

.live-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
  margin-bottom: 1.75rem;
}

.pane {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 320px;
}

.accent-pane {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line-soft));
}

.pane-h {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem;
  background: var(--surface-2);
  border-bottom: 1px solid var(--line-soft);
}

.pane-h h3 {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}

.pane-h span {
  font-size: 0.72rem;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

.body,
textarea {
  flex: 1;
  margin: 0;
  border: 0;
  padding: 0.9rem;
  background: var(--code-bg);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  min-height: 260px;
  resize: vertical;
}

.body.wire {
  color: var(--ink-2);
}

.body.err,
.err {
  color: var(--danger);
}

.history-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 0.85rem;
}

.hist-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: min(42vh, 420px);
  overflow: auto;
  padding-right: 0.25rem;
}

.hist-row {
  display: grid;
  grid-template-columns: 2.4rem 4.2rem minmax(0, 1fr);
  gap: 0.5rem;
  align-items: center;
  text-align: left;
  padding: 0.55rem 0.7rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line-soft);
  background: var(--surface);
}

.hist-row.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.hi {
  font-weight: 800;
  font-size: 0.85rem;
}

.ht {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--ink-3);
}

.hs {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  background: transparent;
  padding: 0;
}

.empty {
  color: var(--ink-3);
  margin: 0.5rem 0;
}

.final-pane {
  min-height: 320px;
}

.samples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}

.samples button.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 1100px) {
  .preview-split {
    grid-template-columns: 1fr;
    height: auto;
  }
  .preview-gui {
    height: min(55vh, 560px);
  }
  .cum-pane {
    position: static;
    max-height: min(40vh, 360px);
    height: min(40vh, 360px);
  }
  .live-grid {
    grid-template-columns: 1fr;
  }
  .metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .history-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .sliders {
    grid-template-columns: 1fr;
  }
  .panes {
    grid-template-columns: 1fr;
  }
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  .sc-card {
    transition: none;
  }
  .progress-fill {
    transition: none;
  }
}
</style>
