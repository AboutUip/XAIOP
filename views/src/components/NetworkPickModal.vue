<script setup>
import { computed, ref, watch } from "vue";
import {
  NETWORK_PROFILES,
  LIVE_SCALES,
  getProfile,
  getScale,
  estimateWireBytes,
  estimateTransferMs,
  formatBitrate,
  formatDuration,
  estimateLeaves,
} from "@/data/network-profiles.js";
import { useI18n } from "@/i18n.js";

const props = defineProps({
  open: { type: Boolean, default: false },
});

const emit = defineEmits(["close", "confirm"]);

const { t, pick } = useI18n();

const profileId = ref("4g");
const scaleId = ref("production");

watch(
  () => props.open,
  (v) => {
    if (v) {
      profileId.value = "4g";
      scaleId.value = "production";
    }
  },
);

const profile = computed(() => getProfile(profileId.value));
const scale = computed(() => getScale(scaleId.value));
const bytes = computed(() => estimateWireBytes(scale.value));
const leaves = computed(() => estimateLeaves(scale.value));
const etaMs = computed(() => estimateTransferMs(profile.value, bytes.value));
const slowWarning = computed(() => etaMs.value > 120_000);

function bars(id) {
  return { "1g": 1, "2g": 2, "3g": 3, "4g": 4, "5g": 5 }[id] || 3;
}

function confirm() {
  emit("confirm", {
    profileId: profileId.value,
    scaleId: scaleId.value,
  });
}

function onBackdrop(e) {
  if (e.target === e.currentTarget) emit("close");
}

function onKey(e) {
  if (e.key === "Escape") emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="t('live.pickTitle')"
      @click="onBackdrop"
      @keydown="onKey"
    >
      <div class="modal" tabindex="-1">
        <header class="head">
          <div class="head-mark" aria-hidden="true" />
          <div>
            <h2>{{ t("live.pickTitle") }}</h2>
            <p>{{ t("live.pickLead") }}</p>
          </div>
        </header>

        <section>
          <div class="sec-h">
            <h3>{{ t("live.network") }}</h3>
            <span>{{ pick(profile.generation, profile.generation) }}</span>
          </div>
          <div class="net-grid">
            <button
              v-for="p in NETWORK_PROFILES"
              :key="p.id"
              type="button"
              class="net"
              :class="{ on: profileId === p.id }"
              @click="profileId = p.id"
            >
              <div class="net-top">
                <strong>{{ pick(p.label, p.labelZh) }}</strong>
                <span class="signal" aria-hidden="true">
                  <i
                    v-for="n in 5"
                    :key="n"
                    :data-on="n <= bars(p.id)"
                  />
                </span>
              </div>
              <em>{{ formatBitrate(p.bitrateBps) }}</em>
              <small>RTT {{ p.rttMs }}ms · {{ p.chunkBytes }}B frames</small>
            </button>
          </div>
          <p class="hint">{{ pick(profile.desc, profile.descZh) }}</p>
        </section>

        <section>
          <div class="sec-h">
            <h3>{{ t("live.scale") }}</h3>
          </div>
          <div class="scale-row">
            <button
              v-for="s in LIVE_SCALES"
              :key="s.id"
              type="button"
              class="scale"
              :class="{ on: scaleId === s.id }"
              @click="scaleId = s.id"
            >
              <strong>{{ pick(s.label, s.labelZh) }}</strong>
              <span
                >~{{ s.targetLeaves.toLocaleString() }}
                {{ t("live.leaves") }}</span
              >
              <i class="scale-bar" aria-hidden="true">
                <b
                  :style="{
                    width:
                      Math.round((s.targetLeaves / 128000) * 100) + '%',
                  }"
                />
              </i>
            </button>
          </div>
        </section>

        <section class="eta">
          <div class="eta-grid">
            <div>
              <span>{{ t("live.eta") }}</span>
              <strong>{{ formatDuration(etaMs) }}</strong>
            </div>
            <div>
              <span>{{ t("live.payload") }}</span>
              <strong
                >~{{ leaves.toLocaleString() }} ·
                {{ (bytes / 1024).toFixed(0) }} KB</strong
              >
            </div>
          </div>
          <div class="eta-rail" aria-hidden="true">
            <i
              :style="{
                width:
                  Math.min(
                    100,
                    Math.max(8, 100 - Math.log10(etaMs / 1000 + 1) * 28),
                  ) + '%',
              }"
            />
          </div>
          <p v-if="slowWarning" class="warn">{{ t("live.slowWarn") }}</p>
        </section>

        <footer>
          <button type="button" class="ghost" @click="emit('close')">
            {{ t("live.cancel") }}
          </button>
          <button type="button" class="primary" @click="confirm">
            {{ t("live.enter") }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background:
    radial-gradient(
      80% 60% at 50% 40%,
      color-mix(in srgb, #000 28%, transparent),
      color-mix(in srgb, #000 55%, transparent)
    );
  display: grid;
  place-items: center;
  padding: 1.25rem;
  animation: fade-in 0.18s ease;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal {
  --live-teal: #0d9f8a;
  width: min(680px, 100%);
  max-height: min(92vh, 860px);
  overflow: auto;
  background: var(--surface);
  color: var(--ink);
  border-radius: 20px;
  border: 1px solid var(--line);
  box-shadow: var(--shadow), 0 24px 64px color-mix(in srgb, #000 18%, transparent);
  padding: 1.35rem 1.4rem 1.2rem;
  animation: rise 0.22s ease;
}

@keyframes rise {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}

.head {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
}

.head-mark {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  flex-shrink: 0;
  background: linear-gradient(145deg, var(--accent), var(--live-teal));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
}

.head h2 {
  margin: 0;
  font-size: 1.28rem;
  letter-spacing: -0.03em;
}

.head p {
  margin: 0.35rem 0 0;
  color: var(--ink-2);
  font-size: 0.9rem;
  line-height: 1.45;
}

section {
  margin-top: 1.2rem;
}

.sec-h {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.55rem;
}

.sec-h h3 {
  margin: 0;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ink-3);
}

.sec-h span {
  font-size: 0.72rem;
  color: var(--ink-3);
}

.net-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.45rem;
}

.net,
.scale {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: left;
  padding: 0.7rem 0.6rem;
  border-radius: 14px;
  border: 1px solid var(--line-soft);
  background: var(--code-bg);
  color: var(--ink);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.15s ease;
}

.net:hover,
.scale:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--line-soft));
}

.net.on,
.scale.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
}

.net-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.35rem;
}

.net strong,
.scale strong {
  font-size: 0.95rem;
}

.signal {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 11px;
}

.signal i {
  width: 2.5px;
  border-radius: 1px;
  background: var(--line);
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

.net.on .signal i[data-on="true"],
.signal i[data-on="true"] {
  background: var(--live-teal);
}

.net em {
  font-style: normal;
  font-size: 0.8rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.net small,
.scale span {
  font-size: 0.65rem;
  color: var(--ink-3);
  line-height: 1.3;
}

.hint {
  margin: 0.6rem 0 0;
  font-size: 0.82rem;
  color: var(--ink-2);
  line-height: 1.4;
}

.scale-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.45rem;
}

.scale-bar {
  display: block;
  height: 4px;
  margin-top: 0.35rem;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.scale-bar b {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--live-teal));
}

.eta {
  padding: 0.9rem 0.95rem;
  border-radius: 14px;
  background:
    radial-gradient(
      90% 120% at 0% 0%,
      color-mix(in srgb, var(--accent) 8%, transparent),
      transparent 55%
    ),
    var(--code-bg);
  border: 1px solid var(--line-soft);
}

.eta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.eta-grid span {
  display: block;
  font-size: 0.7rem;
  color: var(--ink-3);
  margin-bottom: 0.15rem;
}

.eta-grid strong {
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
}

.eta-rail {
  margin-top: 0.75rem;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.eta-rail i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--live-teal));
}

.warn {
  margin: 0.55rem 0 0;
  color: #c47a12;
  font-size: 0.8rem;
  line-height: 1.4;
}

footer {
  margin-top: 1.2rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
}

.ghost,
.primary {
  height: 2.45rem;
  padding: 0 1.1rem;
  border-radius: 980px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.ghost {
  background: transparent;
  border: 1px solid var(--line-soft);
  color: var(--ink-2);
}

.primary {
  background: var(--accent);
  color: var(--on-accent);
  border: none;
}

.primary:hover {
  background: var(--accent-hover);
}

@media (max-width: 720px) {
  .net-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .scale-row,
  .eta-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .backdrop,
  .modal {
    animation: none;
  }
}
</style>
