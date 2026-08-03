<script setup>
import { RouterLink } from "vue-router";
import { useI18n } from "@/i18n.js";
import { meta, sdkStacks, operators } from "@/data/xaiop-catalog.js";

const { t } = useI18n();

function stackStatus(status) {
  return t(`stack.${status}`);
}
</script>

<template>
  <section class="hero">
    <div class="hero-inner">
      <p class="eyebrow">{{ t("home.eyebrow") }}</p>
      <h1>XAIOP</h1>
      <p class="thesis">{{ t("home.thesis") }}</p>
      <div class="actions">
        <RouterLink class="cta primary" to="/sdk/nodejs">{{
          t("home.browseApis")
        }}</RouterLink>
        <RouterLink class="cta" to="/protocol">{{
          t("home.protocolRef")
        }}</RouterLink>
      </div>
    </div>
  </section>

  <section class="strip">
    <div class="strip-inner">
      <article>
        <h2>{{ t("home.protocolTitle") }}</h2>
        <p>
          {{
            t("home.protocolBody", {
              version: meta.protocolVersion,
              count: operators.length,
            })
          }}
        </p>
        <RouterLink to="/protocol">{{ t("home.exploreOps") }}</RouterLink>
      </article>
      <article>
        <h2>{{ t("home.sdkTitle") }}</h2>
        <p>{{ t("home.sdkBody") }}</p>
        <RouterLink to="/sdk/nodejs">{{ t("home.openApi") }}</RouterLink>
      </article>
      <article>
        <h2>{{ t("home.tryTitle") }}</h2>
        <p>{{ t("home.tryBody") }}</p>
        <RouterLink to="/playground">{{ t("home.openPlay") }}</RouterLink>
      </article>
    </div>
  </section>

  <section class="stacks-wrap">
    <div class="stacks-inner">
      <h2 class="section-title">{{ t("home.stacks") }}</h2>
      <ul class="stack-list">
        <li v-for="s in sdkStacks" :key="s.id">
          <RouterLink :to="`/sdk/${s.id}`" class="stack-row">
            <div>
              <strong>{{ s.name }}</strong>
              <span class="path">{{ s.docs }}</span>
            </div>
            <span class="status" :data-s="s.status">{{
              stackStatus(s.status)
            }}</span>
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.hero {
  background:
    radial-gradient(900px 420px at 15% -20%, var(--hero-glow-a), transparent 60%),
    radial-gradient(700px 380px at 90% 0%, var(--hero-glow-b), transparent 55%),
    var(--bg);
  border-bottom: 1px solid var(--line-soft);
}

.hero-inner {
  width: 100%;
  margin: 0;
  padding: clamp(3.5rem, 8vw, 6.5rem) var(--shell-pad) clamp(3rem, 6vw, 5rem);
}

.eyebrow {
  margin: 0 0 1rem;
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

h1 {
  font-size: clamp(3.4rem, 9vw, 5.5rem);
  letter-spacing: -0.055em;
  margin: 0 0 1rem;
  font-weight: 800;
}

.thesis {
  max-width: 40rem;
  font-size: 1.25rem;
  line-height: 1.45;
  color: var(--ink-2);
  margin: 0 0 1.75rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.cta {
  display: inline-flex;
  align-items: center;
  padding: 0.7rem 1.2rem;
  border-radius: 980px;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
}

.cta:hover {
  text-decoration: none;
  background: var(--surface-2);
}

.cta.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

.cta.primary:hover {
  background: var(--accent-hover);
}

.strip {
  background: var(--surface);
  border-bottom: 1px solid var(--line-soft);
}

.strip-inner {
  width: 100%;
  margin: 0;
  padding: 2.5rem var(--shell-pad);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(1.5rem, 3vw, 2.5rem);
}

.strip article h2 {
  font-size: 1.15rem;
  margin-bottom: 0.5rem;
}

.strip article p {
  margin-bottom: 0.85rem;
  font-size: 0.98rem;
}

.strip a {
  font-weight: 600;
  font-size: 0.95rem;
}

.stacks-wrap {
  padding: 3rem 0 4rem;
}

.stacks-inner {
  width: 100%;
  margin: 0;
  padding: 0 var(--shell-pad);
}

.section-title {
  font-size: 1.35rem;
  margin-bottom: 1rem;
}

.stack-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.stack-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.1rem 1.25rem;
  color: inherit;
  text-decoration: none;
  border-top: 1px solid var(--line-soft);
}

.stack-list li:first-child .stack-row {
  border-top: 0;
}

.stack-row:hover {
  background: var(--accent-soft);
  text-decoration: none;
}

.stack-row strong {
  display: block;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
}

.path {
  display: block;
  margin-top: 0.2rem;
  color: var(--ink-3);
  font-size: 0.82rem;
  font-family: var(--font-mono);
}

.status {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.28rem 0.65rem;
  border-radius: 980px;
  background: var(--surface-2);
  color: var(--ink-2);
}

.status[data-s="active"] {
  background: rgba(36, 138, 61, 0.12);
  color: var(--success);
}

@media (max-width: 860px) {
  .strip-inner {
    grid-template-columns: 1fr;
    gap: 1.75rem;
  }
}
</style>
