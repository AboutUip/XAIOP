<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import DocsShell from "@/components/DocsShell.vue";
import { useI18n } from "@/i18n.js";
import { sdkStacks } from "@/data/xaiop-catalog.js";
import { extractToc, renderMarkdown } from "@/lib/md-docs.js";

import apiNodeEn from "@docs/sdk/nodejs/API.md?raw";
import apiNodeZh from "@docs/sdk/nodejs/API.zh-CN.md?raw";
import apiJavaEn from "@docs/sdk/java/API.md?raw";
import apiJavaZh from "@docs/sdk/java/API.zh-CN.md?raw";
import apiPythonEn from "@docs/sdk/python/API.md?raw";
import apiPythonZh from "@docs/sdk/python/API.zh-CN.md?raw";

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

const apiByStack = {
  nodejs: { en: apiNodeEn, zh: apiNodeZh },
  java: { en: apiJavaEn, zh: apiJavaZh },
  python: { en: apiPythonEn, zh: apiPythonZh },
};

watch(stackId, (id) => {
  if (!sdkStacks.some((s) => s.id === id)) {
    router.replace({ name: "sdk-stack", params: { stack: "nodejs" } });
  }
});

const hasApiDoc = computed(
  () => current.value.status === "active" && Boolean(apiByStack[current.value.id]),
);

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
  if (!hasApiDoc.value) return "";
  const pack = apiByStack[current.value.id];
  return locale.value === "zh" ? pack.zh : pack.en;
});

const filteredMd = computed(() => {
  const md = sourceMd.value;
  const q = query.value.trim();
  if (!q) return md;
  const parts = md.split(/(?=^## )/m);
  if (parts.length <= 1) return md;
  const head = parts[0];
  const kept = parts
    .slice(1)
    .filter((sec) => sec.toLowerCase().includes(q.toLowerCase()));
  if (!kept.length) return `${head}\n\n> ${t("sdk.noMatch")}\n`;
  return head + kept.join("");
});

const docsRelDir = computed(() => `sdk/${current.value.id}`);

const html = computed(() =>
  hasApiDoc.value
    ? renderMarkdown(filteredMd.value, { docsRelDir: docsRelDir.value })
    : "",
);

const rail = computed(() =>
  hasApiDoc.value
    ? extractToc(filteredMd.value).map((r) => ({
        href: r.href,
        label: r.label,
      }))
    : [],
);

const pageTitle = computed(() =>
  hasApiDoc.value
    ? t("sdk.title", { name: current.value.name })
    : current.value.name,
);

const pageLead = computed(() => {
  if (hasApiDoc.value) return t("sdk.leadActive");
  if (current.value.status === "core") return t("sdk.leadCore");
  return t("sdk.leadPending");
});

const docsifyUrl = computed(() => {
  if (!hasApiDoc.value) {
    return `/docs/#/${current.value.docs.replace(/^docs\//, "").replace(/\/$/, "")}/`;
  }
  const page =
    locale.value === "zh"
      ? `sdk/${current.value.id}/API.zh-CN`
      : `sdk/${current.value.id}/API`;
  return `/docs/#/${page}`;
});

const noteLinks = computed(() => {
  if (current.value.id !== "nodejs") return [];
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

const alignmentUrl = computed(() => {
  if (current.value.id === "java" || current.value.id === "python") {
    const page =
      locale.value === "zh"
        ? `sdk/${current.value.id}/ALIGNMENT.zh-CN`
        : `sdk/${current.value.id}/ALIGNMENT`;
    return `/docs/#/${page}`;
  }
  return null;
});
</script>

<template>
  <DocsShell :title="pageTitle" :lead="pageLead" :toc="toc" :rail="rail">
    <template #sidebar-extra>
      <div class="side-note">
        <p>{{ t("sdk.source") }}</p>
        <code>docs/sdk/{{ current.id }}/</code>
        <p v-if="current.sdkVersion" class="side-ver">
          SDK {{ current.sdkVersion }}
        </p>
        <p class="side-sub">{{ t("sdk.liveHint") }}</p>
        <a class="docsify-link" :href="docsifyUrl" target="_blank" rel="noopener">{{
          t("sdk.openDocsify")
        }}</a>
        <a
          v-if="alignmentUrl"
          class="docsify-link"
          :href="alignmentUrl"
          target="_blank"
          rel="noopener"
          >{{ t("sdk.openAlignment") }}</a
        >
      </div>
      <div v-if="noteLinks.length" class="side-notes">
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

    <template v-if="hasApiDoc">
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
        <template v-if="current.sdkVersion">
          <br />SDK: <code>{{ current.sdkVersion }}</code>
        </template>
      </p>
      <p v-if="current.status === 'core'" class="core-note">{{ t("sdk.coreNote") }}</p>
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

.side-ver {
  margin-top: 0.45rem !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
  color: var(--ink-2) !important;
  font-size: 0.82rem !important;
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

.core-note {
  color: var(--ink-2);
  font-size: 0.92rem;
  line-height: 1.5;
}
</style>
