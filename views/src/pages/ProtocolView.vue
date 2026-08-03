<script setup>
import { computed, ref } from "vue";
import DocsShell from "@/components/DocsShell.vue";
import { useI18n } from "@/i18n.js";
import { operators } from "@/data/xaiop-catalog.js";

const { t, pick } = useI18n();
const selectedId = ref(operators[0].id);
const selected = computed(
  () => operators.find((o) => o.id === selectedId.value) ?? operators[0],
);

const toc = computed(() =>
  operators.map((op) => ({
    id: op.id,
    href: `#${op.id}`,
    label: op.symbol,
    on: op.id === selectedId.value,
    onClick: (e) => {
      e.preventDefault();
      selectedId.value = op.id;
    },
  })),
);
</script>

<template>
  <DocsShell
    :title="t('protocol.title')"
    :lead="t('protocol.lead')"
    :toc="toc"
  >
    <div class="layout">
      <div class="grid">
        <button
          v-for="op in operators"
          :id="op.id"
          :key="op.id"
          type="button"
          class="op"
          :class="{ on: op.id === selectedId }"
          @click="selectedId = op.id"
        >
          <code>{{ op.symbol }}</code>
          <span class="kind">{{ op.kind }}</span>
          <strong>{{ pick(op.title, op.titleZh) }}</strong>
        </button>
      </div>

      <aside class="detail" v-if="selected">
        <p class="kicker">{{ selected.kind }}</p>
        <h2>
          <code>{{ selected.symbol }}</code>
        </h2>
        <h3>{{ pick(selected.title, selected.titleZh) }}</h3>
        <p>{{ pick(selected.summary, selected.summaryZh) }}</p>
        <div class="sample">
          <div class="sample-h">{{ t("protocol.example") }}</div>
          <pre>{{ selected.example }}</pre>
        </div>
      </aside>
    </div>
  </DocsShell>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 1.5rem;
  align-items: start;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 0.75rem;
}

.op {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  text-align: left;
  padding: 0.9rem;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow);
  scroll-margin-top: calc(var(--nav-h) + 1rem);
}

.op:hover {
  background: var(--surface-2);
}

.op.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent), var(--shadow);
}

.op code {
  font-size: 1rem;
  font-weight: 600;
  background: var(--code-bg);
}

.kind {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.op strong {
  font-size: 0.92rem;
  letter-spacing: -0.02em;
}

.detail {
  position: sticky;
  top: calc(var(--nav-h) + 1rem);
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 1.25rem 1.35rem;
}

.kicker {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.detail h2 {
  margin: 0 0 0.5rem;
  font-size: 1.6rem;
}

.detail h3 {
  font-size: 1.05rem;
  margin-bottom: 0.75rem;
}

.sample {
  margin-top: 1.25rem;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--line-soft);
}

.sample-h {
  padding: 0.45rem 0.75rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--ink-3);
  background: var(--surface-2);
  border-bottom: 1px solid var(--line-soft);
}

.sample pre {
  margin: 0;
  padding: 0.85rem 0.9rem;
  background: var(--code-bg);
  font-size: 0.86rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
  .detail {
    position: static;
  }
}
</style>
