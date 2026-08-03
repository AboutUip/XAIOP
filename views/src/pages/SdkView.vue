<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import DocsShell from "@/components/DocsShell.vue";
import { useI18n } from "@/i18n.js";
import { nodeSdkApis, sdkStacks } from "@/data/xaiop-catalog.js";

const props = defineProps({
  stack: { type: String, default: "nodejs" },
});

const { t, pick, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const query = ref("");
const stackId = computed(() => props.stack || route.params.stack || "nodejs");
const current = computed(
  () => sdkStacks.find((s) => s.id === stackId.value) ?? sdkStacks[0],
);

watch(stackId, (id) => {
  if (!sdkStacks.some((s) => s.id === id)) {
    router.replace({ name: "sdk-stack", params: { stack: "nodejs" } });
  }
});

const toc = computed(() =>
  sdkStacks.map((s) => ({
    id: s.id,
    href: `#stack-${s.id}`,
    label: s.name,
    on: s.id === stackId.value,
    onClick: (e) => {
      e.preventDefault();
      router.push(`/sdk/${s.id}`);
    },
  })),
);

const filtered = computed(() => {
  void locale.value;
  const q = query.value.trim().toLowerCase();
  const raw = query.value.trim();
  return nodeSdkApis
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (!q) return true;
        return (
          it.name.toLowerCase().includes(q) ||
          it.signature.toLowerCase().includes(q) ||
          it.summary.toLowerCase().includes(q) ||
          it.summaryZh.includes(raw)
        );
      }),
    }))
    .filter((g) => g.items.length > 0);
});

const rail = computed(() =>
  current.value.status === "active"
    ? filtered.value.map((g) => ({
        href: `#${slug(g.group)}`,
        label: pick(g.group, g.groupZh),
      }))
    : [],
);

const pageTitle = computed(() =>
  current.value.status === "active"
    ? t("sdk.title", { name: current.value.name })
    : current.value.name,
);

const pageLead = computed(() =>
  current.value.status === "active" ? t("sdk.leadActive") : t("sdk.leadPending"),
);

function slug(s) {
  return s.toLowerCase().replace(/\s+/g, "-");
}
</script>

<template>
  <DocsShell :title="pageTitle" :lead="pageLead" :toc="toc" :rail="rail">
    <template #sidebar-extra>
      <div class="side-note">
        <p>{{ t("sdk.source") }}</p>
        <code>docs/sdk/{{ current.id }}/</code>
      </div>
    </template>

    <template v-if="current.status === 'active'">
      <div class="toolbar">
        <label class="search">
          <span class="sr-only">{{ t("sdk.search") }}</span>
          <input
            v-model="query"
            type="search"
            :placeholder="t('sdk.searchPh')"
          />
        </label>
      </div>

      <section
        v-for="g in filtered"
        :id="slug(g.group)"
        :key="g.group"
        class="group"
      >
        <div class="group-h">
          <h2>{{ pick(g.group, g.groupZh) }}</h2>
          <span>{{ locale === "zh" ? g.group : g.groupZh }}</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ t("sdk.colApi") }}</th>
                <th>{{ t("sdk.colSig") }}</th>
                <th>{{ t("sdk.colRet") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in g.items" :key="it.name">
                <td>
                  <div class="name">{{ it.name }}</div>
                  <div class="desc">
                    {{ pick(it.summary, it.summaryZh) }}
                  </div>
                  <span class="kind">{{ it.kind }}</span>
                </td>
                <td><code class="sig">{{ it.signature }}</code></td>
                <td><code>{{ it.returns }}</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <section v-else class="pending">
      <p>
        {{ t("sdk.docs") }}: <code>{{ current.docs }}</code><br />
        {{ t("sdk.code") }}: <code>{{ current.code }}</code>
      </p>
      <RouterLink to="/sdk/nodejs">{{ t("sdk.viewNode") }}</RouterLink>
    </section>
  </DocsShell>
</template>

<style scoped>
.side-note {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line-soft);
}

.side-note p {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.side-note code {
  font-size: 0.75rem;
  word-break: break-all;
}

.toolbar {
  margin-bottom: 1.75rem;
}

.search input {
  width: 100%;
  max-width: min(560px, 100%);
  padding: 0.7rem 1rem;
  border-radius: 980px;
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.group {
  margin-bottom: 2.5rem;
  scroll-margin-top: calc(var(--nav-h) + 1rem);
}

.group-h {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
  margin-bottom: 0.85rem;
}

.group-h h2 {
  font-size: 1.35rem;
  margin: 0;
}

.group-h span {
  color: var(--ink-3);
  font-size: 0.85rem;
  font-family: var(--font-mono);
}

.table-wrap {
  overflow: auto;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}

th,
td {
  text-align: left;
  padding: 0.95rem 1rem;
  vertical-align: top;
  border-top: 1px solid var(--line-soft);
}

thead th {
  border-top: 0;
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.name {
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--ink);
  margin-bottom: 0.25rem;
}

.desc {
  color: var(--ink-2);
  font-size: 0.9rem;
  margin-bottom: 0.2rem;
}

.kind {
  display: inline-flex;
  margin-top: 0.45rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 0.15rem 0.45rem;
  border-radius: 980px;
}

.sig {
  display: inline-block;
  max-width: 42vw;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--code-bg);
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  font-size: 0.78rem;
  line-height: 1.45;
}

.pending {
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  padding: 2rem;
}

.pending p {
  margin-bottom: 1rem;
}
</style>
