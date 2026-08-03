<script setup>
import { useI18n } from "@/i18n.js";

defineProps({
  title: { type: String, default: "" },
  lead: { type: String, default: "" },
  toc: {
    type: Array,
    default: () => [],
  },
  rail: {
    type: Array,
    default: () => [],
  },
});

const { t } = useI18n();
</script>

<template>
  <div class="docs" :class="{ 'has-rail': rail.length }">
    <aside v-if="toc.length" class="sidebar" :aria-label="t('shell.contents')">
      <p class="side-label">{{ t("shell.onSite") }}</p>
      <nav>
        <a
          v-for="item in toc"
          :key="item.id || item.href"
          :href="item.href"
          class="side-a"
          :class="{ on: item.on }"
          @click="item.onClick?.($event)"
        >
          {{ item.label }}
        </a>
      </nav>
      <slot name="sidebar-extra" />
    </aside>

    <div class="body">
      <header v-if="title" class="page-head">
        <h1>{{ title }}</h1>
        <p v-if="lead" class="lead">{{ lead }}</p>
      </header>
      <slot />
    </div>

    <aside v-if="rail.length" class="rail" :aria-label="t('shell.onPage')">
      <p class="side-label">{{ t("shell.onPage") }}</p>
      <nav>
        <a v-for="r in rail" :key="r.href" class="rail-a" :href="r.href">{{
          r.label
        }}</a>
      </nav>
    </aside>
  </div>
</template>

<style scoped>
.docs {
  width: 100%;
  margin: 0;
  padding: 1.75rem var(--shell-pad) 4rem;
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  gap: clamp(1.5rem, 3vw, 3rem);
  align-items: start;
}

.docs.has-rail {
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr) var(--rail-w);
}

.sidebar,
.rail {
  position: sticky;
  top: calc(var(--nav-h) + 1rem);
  max-height: calc(100vh - var(--nav-h) - 2rem);
  overflow: auto;
  padding-right: 0.25rem;
}

.side-label {
  margin: 0 0 0.75rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.side-a,
.rail-a {
  display: block;
  color: var(--ink-2);
  text-decoration: none;
  padding: 0.38rem 0.65rem;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 500;
  border-left: 2px solid transparent;
  margin-left: 0;
}

.side-a:hover,
.rail-a:hover {
  background: var(--hover-fill);
  color: var(--ink);
  text-decoration: none;
}

.side-a.on {
  color: var(--accent);
  background: var(--accent-soft);
  border-left-color: var(--accent);
}

.rail-a {
  font-size: 0.82rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--line-soft);
  border-radius: 0;
}

.body {
  min-width: 0;
  width: 100%;
}

.page-head {
  margin-bottom: 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--line-soft);
}

.page-head h1 {
  font-size: clamp(2rem, 3.2vw, 2.75rem);
  margin-bottom: 0.75rem;
}

.lead {
  font-size: 1.125rem;
  color: var(--ink-2);
  max-width: 54rem;
  margin: 0;
  line-height: 1.55;
}

@media (max-width: 1200px) {
  .docs.has-rail {
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  }
  .rail {
    display: none;
  }
}

@media (max-width: 860px) {
  .docs,
  .docs.has-rail {
    grid-template-columns: 1fr;
    padding: 1.25rem var(--shell-pad) 3rem;
    gap: 1.25rem;
  }
  .sidebar {
    position: static;
    max-height: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--line-soft);
  }
  .side-label {
    width: 100%;
  }
  .side-a {
    border: 1px solid var(--line-soft);
    background: var(--surface);
  }
}
</style>
