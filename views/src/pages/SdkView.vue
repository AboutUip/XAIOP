<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import DocsShell from "@/components/DocsShell.vue";
import { useI18n } from "@/i18n.js";
import { sdkStacks } from "@/data/xaiop-catalog.js";
import { extractToc, renderMarkdown } from "@/lib/md-docs.js";

import apiEn from "@docs/sdk/nodejs/API.md?raw";
import apiZh from "@docs/sdk/nodejs/API.zh-CN.md?raw";

const props = defineProps({
  stack: { type: String, default: "nodejs" },
});

const { t, locale } = useI18n();
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

const sourceMd = computed(() => {
  if (current.value.status !== "active") return "";
  return locale.value === "zh" ? apiZh : apiEn;
});

const filteredMd = computed(() => {
  const md = sourceMd.value;
  const q = query.value.trim();
  if (!q) return md;
  // Keep front matter / title, filter ## sections that match
  const parts = md.split(/(?=^## )/m);
  if (parts.length <= 1) return md;
  const head = parts[0];
  const kept = parts
    .slice(1)
    .filter((sec) => sec.toLowerCase().includes(q.toLowerCase()));
  if (!kept.length) return `${head}\n\n> ${t("sdk.noMatch")}\n`;
  return head + kept.join("");
});

const html = computed(() =>
  current.value.status === "active"
    ? renderMarkdown(filteredMd.value, { docsRelDir: "sdk/nodejs" })
    : "",
);

const rail = computed(() =>
  current.value.status === "active"
    ? extractToc(filteredMd.value).map((r) => ({
        href: r.href,
        label: r.label,
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

const docsifyUrl = computed(() => {
  const page = locale.value === "zh" ? "sdk/nodejs/API.zh-CN" : "sdk/nodejs/API";
  return `/docs/#/${page}`;
});

const noteLinks = computed(() => {
  const zh = locale.value === "zh";
  const suf = zh ? ".zh-CN" : "";
  const base = "/docs/#/sdk/nodejs/notes/";
  return [
    { label: zh ? "行拦截 §6.4" : "Line intercept §6.4", href: `${base}line-intercept${suf}` },
    { label: "Annotation Span §6.5", href: `${base}annotation-span${suf}` },
    { label: zh ? "类型检查" : "Type check", href: `${base}typecheck${suf}` },
    { label: "WebSocket", href: `${base}ws-session${suf}` },
    { label: zh ? "流式解析" : "Streaming parse", href: `${base}streaming-parse${suf}` },
  ];
});
</script>

<template>
  <DocsShell :title="pageTitle" :lead="pageLead" :toc="toc" :rail="rail">
    <template #sidebar-extra>
      <div class="side-note">
        <p>{{ t("sdk.source") }}</p>
        <code>docs/sdk/{{ current.id }}/</code>
        <p class="side-sub">{{ t("sdk.liveHint") }}</p>
        <a class="docsify-link" :href="docsifyUrl" target="_blank" rel="noopener">{{
          t("sdk.openDocsify")
        }}</a>
      </div>
      <div v-if="current.status === 'active'" class="side-notes">
        <p>{{ t("sdk.notes") }}</p>
        <a
          v-for="n in noteLinks"
          :key="n.href"
          class="note-a"
          :href="n.href"
          target="_blank"
          rel="noopener"
          >{{ n.label }}</a
        >
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
        <p class="toolbar-hint">{{ t("sdk.renderHint") }}</p>
      </div>

      <article class="md-body" v-html="html" />
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
.side-note,
.side-notes {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line-soft);
}

.side-note p,
.side-notes p {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.side-sub {
  margin-top: 0.75rem !important;
  font-weight: 500 !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
  color: var(--ink-2) !important;
  font-size: 0.8rem !important;
  line-height: 1.45;
}

.side-note code {
  font-size: 0.75rem;
  word-break: break-all;
}

.docsify-link,
.note-a {
  display: block;
  margin-top: 0.45rem;
  font-size: 0.85rem;
  color: var(--accent);
  text-decoration: none;
}

.docsify-link:hover,
.note-a:hover {
  text-decoration: underline;
}

.toolbar {
  margin-bottom: 1.25rem;
}

.toolbar-hint {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  color: var(--ink-3);
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

.md-body {
  max-width: 52rem;
  color: var(--ink);
  font-size: 0.98rem;
  line-height: 1.65;
}

.md-body :deep(h1) {
  font-size: 1.85rem;
  letter-spacing: -0.03em;
  margin: 0 0 0.75rem;
  scroll-margin-top: calc(var(--nav-h) + 1rem);
}

.md-body :deep(h2) {
  font-size: 1.35rem;
  margin: 2.25rem 0 0.85rem;
  padding-top: 0.35rem;
  border-top: 1px solid var(--line-soft);
  scroll-margin-top: calc(var(--nav-h) + 1rem);
}

.md-body :deep(h3) {
  font-size: 1.1rem;
  margin: 1.5rem 0 0.55rem;
  scroll-margin-top: calc(var(--nav-h) + 1rem);
}

.md-body :deep(p),
.md-body :deep(ul),
.md-body :deep(ol) {
  margin: 0 0 0.9rem;
  color: var(--ink-2);
}

.md-body :deep(li) {
  margin: 0.25rem 0;
}

.md-body :deep(a) {
  color: var(--accent);
}

.md-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
  display: block;
  overflow-x: auto;
}

.md-body :deep(th),
.md-body :deep(td) {
  text-align: left;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line-soft);
  vertical-align: top;
}

.md-body :deep(th) {
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.md-body :deep(pre) {
  background: var(--code-bg);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  padding: 0.9rem 1rem;
  overflow: auto;
  margin: 0 0 1.1rem;
}

.md-body :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.86em;
}

.md-body :deep(:not(pre) > code) {
  background: var(--code-bg);
  padding: 0.12rem 0.35rem;
  border-radius: 6px;
}

.md-body :deep(blockquote) {
  margin: 0 0 1rem;
  padding: 0.65rem 1rem;
  border-left: 3px solid var(--accent);
  background: var(--accent-soft);
  color: var(--ink-2);
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
