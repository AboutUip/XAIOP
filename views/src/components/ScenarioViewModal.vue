<script setup>
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "@/i18n.js";
import { collectPhases, previewFinal } from "@/lib/stream-sim.js";
import { wireStats } from "@/data/stream-scenarios.js";

const props = defineProps({
  scenario: { type: Object, required: true },
  open: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "use"]);
const { t, pick } = useI18n();

const stats = computed(() => wireStats(props.scenario.wire));
const preview = computed(() => previewFinal(props.scenario.wire));
const phasePreview = computed(() => {
  try {
    return collectPhases(props.scenario.wire);
  } catch {
    return { phases: [], final: null };
  }
});

function onKey(e) {
  if (e.key === "Escape") emit("close");
}

watch(
  () => props.open,
  (v) => {
    document.body.style.overflow = v ? "hidden" : "";
  },
);

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  document.body.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="pick(scenario.title, scenario.titleZh)"
      >
        <header class="sheet-h">
          <div>
            <p class="env">
              {{ pick(scenario.env, scenario.envZh) }}
            </p>
            <h2>{{ pick(scenario.title, scenario.titleZh) }}</h2>
          </div>
          <button
            type="button"
            class="icon"
            :aria-label="t('modal.close')"
            @click="emit('close')"
          >
            ✕
          </button>
        </header>

        <div class="sheet-b">
          <p class="blurb">{{ pick(scenario.blurb, scenario.blurbZh) }}</p>

          <div class="meta-row">
            <span class="chip" :style="{ '--c': scenario.accent }">{{
              t("modal.size", { s: scenario.size })
            }}</span>
            <span class="chip"
              >{{ stats.chars }} {{ t("play.chars") }}</span
            >
            <span class="chip"
              >{{ stats.lines }} {{ t("modal.lines") }}</span
            >
            <span class="chip"
              >{{ phasePreview.phases.length }} {{ t("play.phases") }}</span
            >
            <span class="chip">{{
              t("modal.intensityChip", { n: scenario.intensity })
            }}</span>
          </div>

          <div class="intensity" aria-hidden="true">
            <span
              v-for="n in 5"
              :key="n"
              class="bar"
              :class="{ on: n <= scenario.intensity }"
              :style="{
                background:
                  n <= scenario.intensity ? scenario.accent : undefined,
              }"
            />
          </div>

          <div class="cols">
            <section>
              <h3>{{ t("modal.wire") }}</h3>
              <pre class="code">{{ scenario.wire }}</pre>
            </section>
            <section>
              <h3>{{ t("modal.final") }}</h3>
              <pre v-if="preview.ok" class="code">{{
                JSON.stringify(preview.value, null, 2)
              }}</pre>
              <pre v-else class="code err">{{ preview.error }}</pre>
            </section>
          </div>

          <section class="phase-strip">
            <h3>
              {{
                t("modal.phaseDiffs", { n: phasePreview.phases.length })
              }}
            </h3>
            <div class="phase-grid">
              <article v-for="(p, i) in phasePreview.phases" :key="i">
                <header>{{ t("modal.phase", { n: i + 1 }) }}</header>
                <pre>{{ JSON.stringify(p, null, 2) }}</pre>
              </article>
            </div>
          </section>
        </div>

        <footer class="sheet-f">
          <button type="button" @click="emit('close')">
            {{ t("modal.close") }}
          </button>
          <button
            type="button"
            class="primary"
            @click="emit('use', scenario.id)"
          >
            {{ t("modal.use") }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  padding: 1.25rem;
}

.sheet {
  width: min(1100px, 100%);
  max-height: min(92vh, 920px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 16px;
  box-shadow: var(--shadow);
  overflow: hidden;
}

.sheet-h,
.sheet-f {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--line-soft);
  background: var(--surface-2);
}

.sheet-f {
  border-bottom: 0;
  border-top: 1px solid var(--line-soft);
}

.sheet-h h2 {
  margin: 0;
  font-size: 1.35rem;
}

.env {
  margin: 0 0 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.sheet-b {
  padding: 1.25rem;
  overflow: auto;
}

.blurb {
  margin: 0 0 1rem;
  color: var(--ink-2);
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.chip {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.6rem;
  border-radius: 980px;
  background: var(--code-bg);
  border: 1px solid var(--line-soft);
  color: var(--ink-2);
}

.chip:first-child {
  color: var(--c, var(--accent));
  border-color: color-mix(
    in srgb,
    var(--c, var(--accent)) 35%,
    var(--line-soft)
  );
  background: color-mix(in srgb, var(--c, var(--accent)) 12%, transparent);
}

.intensity {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 1.25rem;
}

.bar {
  height: 4px;
  flex: 1;
  max-width: 48px;
  border-radius: 980px;
  background: var(--line-soft);
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.cols h3,
.phase-strip h3 {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.code,
.phase-grid pre {
  margin: 0;
  padding: 0.85rem;
  border-radius: var(--radius-sm);
  background: var(--code-bg);
  border: 1px solid var(--line-soft);
  font-family: var(--font-mono);
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow: auto;
}

.code.err {
  color: var(--danger);
}

.phase-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.65rem;
}

.phase-grid article {
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg);
}

.phase-grid header {
  padding: 0.4rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-3);
  background: var(--surface-2);
  border-bottom: 1px solid var(--line-soft);
}

.phase-grid pre {
  max-height: 160px;
  border: 0;
  border-radius: 0;
}

@media (max-width: 800px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
</style>
