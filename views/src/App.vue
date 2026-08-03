<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { useI18n } from "./i18n.js";
import { meta } from "./data/xaiop-catalog.js";
import {
  applyResolvedTheme,
  nextThemePreference,
  persistThemePreference,
  readThemePreference,
  resolveTheme,
} from "./theme.js";

const { t, locale, toggleLocale } = useI18n();
const route = useRoute();
const protocolPill = `v${meta.protocolVersion} Frozen`;
const packagePill = `${meta.packageName}@${meta.packageVersion}`;

const links = computed(() => [
  { to: "/", label: t("nav.overview"), match: (p) => p === "/" },
  {
    to: "/protocol",
    label: t("nav.protocol"),
    match: (p) => p.startsWith("/protocol"),
  },
  {
    to: "/sdk/nodejs",
    label: t("nav.api"),
    match: (p) => p.startsWith("/sdk"),
  },
  {
    to: "/playground",
    label: t("nav.try"),
    match: (p) => p.startsWith("/playground"),
  },
]);

const path = computed(() => route.path);
const fullscreen = computed(() => Boolean(route.meta.fullscreen));
const preference = ref(readThemePreference());
const resolved = computed(() => resolveTheme(preference.value));

function syncTheme() {
  applyResolvedTheme(resolveTheme(preference.value));
}

function cycleTheme() {
  preference.value = nextThemePreference(preference.value);
  persistThemePreference(preference.value);
  syncTheme();
}

const themeLabel = computed(() => {
  if (preference.value === "system") return t("theme.system");
  if (preference.value === "light") return t("theme.light");
  return t("theme.dark");
});

const langLabel = computed(() =>
  locale.value === "zh" ? t("lang.zh") : t("lang.en"),
);

let mq;
function onSchemeChange() {
  if (preference.value === "system") syncTheme();
}

onMounted(() => {
  syncTheme();
  mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener?.("change", onSchemeChange);
});

onUnmounted(() => {
  mq?.removeEventListener?.("change", onSchemeChange);
});

watch(preference, syncTheme);
</script>

<template>
  <div class="app" :class="{ fullscreen }">
    <header v-if="!fullscreen" class="topbar">
      <div class="topbar-inner">
        <RouterLink class="brand" to="/">
          <span class="logo" aria-hidden="true"></span>
          <span class="brand-text">
            <span class="product">XAIOP</span>
            <span class="sub">{{ t("nav.docs") }}</span>
          </span>
        </RouterLink>

        <nav class="nav" :aria-label="t('nav.primary')">
          <RouterLink
            v-for="l in links"
            :key="l.to"
            :to="l.to"
            class="nav-a"
            :class="{ on: l.match(path) }"
          >
            {{ l.label }}
          </RouterLink>
        </nav>

        <div class="top-meta">
          <span class="pill">{{ protocolPill }}</span>
          <span class="pill muted">{{ packagePill }}</span>
          <button
            type="button"
            class="lang-btn"
            :title="t('lang.label')"
            :aria-label="`${t('lang.label')}: ${langLabel}`"
            @click="toggleLocale"
          >
            <span class="lang-a" :class="{ on: locale === 'en' }">EN</span>
            <span class="lang-div" aria-hidden="true">/</span>
            <span class="lang-a" :class="{ on: locale === 'zh' }">中文</span>
          </button>
          <button
            type="button"
            class="icon theme-btn"
            :title="themeLabel"
            :aria-label="themeLabel"
            @click="cycleTheme"
          >
            <svg
              v-if="resolved === 'dark'"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M12 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm0 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-3a1 1 0 1 1 0-2h1a1 1 0 1 1 0 2h-1ZM4 12a1 1 0 0 1-1-1 1 1 0 0 1 1-1h1a1 1 0 1 1 0 2H4Zm12.95 5.36a1 1 0 0 1 1.41 0l.71.7a1 1 0 0 1-1.41 1.42l-.71-.71a1 1 0 0 1 0-1.41ZM4.93 5.64a1 1 0 0 1 1.41 0l.71.71A1 1 0 0 1 5.64 7.76l-.71-.7a1 1 0 0 1 0-1.42Zm12.73-1.42.71.71a1 1 0 1 1-1.42 1.41l-.7-.71a1 1 0 0 1 1.41-1.41ZM6.34 17.66l.71.71a1 1 0 0 1-1.42 1.41l-.7-.7a1 1 0 1 1 1.41-1.42ZM12 17a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Z"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M12.1 2.3a1 1 0 0 1 1.1.16 8.5 8.5 0 1 0 8.34 8.34 1 1 0 0 1 1.26-1.26A10.5 10.5 0 1 1 11.94 1.2a1 1 0 0 1 .16 1.1Z"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <RouterView />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  height: var(--nav-h);
  background: var(--nav-bg);
  backdrop-filter: saturate(1.4) blur(16px);
  -webkit-backdrop-filter: saturate(1.4) blur(16px);
  border-bottom: 1px solid var(--line-soft);
}

.topbar-inner {
  width: 100%;
  height: 100%;
  padding: 0 var(--shell-pad);
  display: flex;
  align-items: center;
  gap: 2rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  color: var(--ink);
  text-decoration: none;
  flex-shrink: 0;
}

.brand:hover {
  text-decoration: none;
}

.logo {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--accent) 0%, #5ac8fa 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
}

.product {
  font-weight: 800;
  font-size: 1.05rem;
  letter-spacing: -0.04em;
}

.sub {
  color: var(--ink-3);
  font-size: 0.8rem;
  font-weight: 500;
}

.nav {
  display: flex;
  gap: 0.15rem;
  flex: 1;
}

.nav-a {
  color: var(--ink-2);
  text-decoration: none;
  padding: 0.4rem 0.75rem;
  border-radius: 980px;
  font-size: 0.92rem;
  font-weight: 500;
}

.nav-a:hover {
  color: var(--ink);
  background: var(--hover-fill);
  text-decoration: none;
}

.nav-a.on {
  color: var(--ink);
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--line-soft);
}

.top-meta {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.pill {
  display: inline-flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink-2);
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 980px;
  padding: 0.28rem 0.7rem;
}

.pill.muted {
  font-weight: 500;
  color: var(--ink-3, var(--ink-2));
  opacity: 0.85;
}

.lang-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  height: 2.25rem;
  padding: 0 0.75rem;
  border-radius: 980px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--ink-3);
}

.lang-a.on {
  color: var(--ink);
}

.lang-div {
  opacity: 0.45;
}

.theme-btn {
  color: var(--ink-2);
}

.theme-btn:hover {
  color: var(--ink);
}

@media (max-width: 800px) {
  .topbar-inner {
    gap: 0.75rem;
  }
  .sub {
    display: none;
  }
  .nav {
    overflow-x: auto;
    scrollbar-width: none;
  }
  .pill {
    display: none;
  }
}
</style>
