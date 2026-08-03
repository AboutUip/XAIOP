<script setup>
/**
 * Fixed app shells — each scenario owns a stable reactive model.
 * Stream JSON is patched in-place (only changed fields), so DOM nodes
 * stay mounted and do not flash on every chunk.
 */
import { computed, reactive, watch } from "vue";
import { useI18n } from "@/i18n.js";

const props = defineProps({
  scenarioId: { type: String, required: true },
  data: { type: [Object, Array, String, Number, Boolean], default: null },
  accent: { type: String, default: "#0071e3" },
});

const { t, pick } = useI18n();

const ROOT_KEY = {
  weather: "card",
  hotspot: "board",
  news: "story",
  product: "product",
  chat: "session",
  match: "match",
};

const SLOTS = {
  weatherForecast: 7,
  hotspotRows: 12,
  newsParas: 10,
  newsTags: 8,
  productMedia: 5,
  productVariants: 6,
  chatMessages: 8,
  matchEvents: 14,
};

const weather = createModel("weather");
const hotspot = createModel("hotspot");
const news = createModel("news");
const product = createModel("product");
const chat = createModel("chat");
const match = createModel("match");

const models = { weather, hotspot, news, product, chat, match };

watch(
  () => [props.scenarioId, props.data],
  () => {
    const id = props.scenarioId;
    const model = models[id];
    if (!model) return;
    patchModel(model, unwrap(props.data, id), id);
  },
  { deep: true, immediate: true },
);

function has(v) {
  return v != null && v !== "";
}

function heatRatio(h) {
  if (!has(h)) return 0;
  const n = Number(h) || 0;
  return Math.min(1, Math.max(0, n / 200));
}

const chatFilledCount = computed(
  () => chat.messages.filter((m) => has(m.text)).length,
);

function unwrap(data, id) {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  const key = ROOT_KEY[id];
  const node = key && data[key] != null ? data[key] : data;
  return node && typeof node === "object" && !Array.isArray(node) ? node : {};
}

function set(obj, key, val) {
  if (obj[key] !== val) obj[key] = val;
}

function createModel(id) {
  switch (id) {
    case "weather":
      return reactive({
        city: null,
        unit: null,
        now: reactive({ temp: null, sky: null, humidity: null }),
        forecast: Array.from({ length: SLOTS.weatherForecast }, () =>
          reactive({ day: null, high: null, low: null }),
        ),
      });
    case "hotspot":
      return reactive({
        title: null,
        region: null,
        updated: null,
        items: Array.from({ length: SLOTS.hotspotRows }, () =>
          reactive({ rank: null, topic: null, heat: null }),
        ),
      });
    case "news":
      return reactive({
        status: null,
        headline: null,
        lead: null,
        meta: reactive({ desk: null, byline: null, published: null }),
        body: Array.from({ length: SLOTS.newsParas }, () => null),
        tags: Array.from({ length: SLOTS.newsTags }, () => null),
      });
    case "product":
      return reactive({
        id: null,
        name: null,
        brand: null,
        price: null,
        currency: null,
        media: Array.from({ length: SLOTS.productMedia }, () => null),
        variants: Array.from({ length: SLOTS.productVariants }, () =>
          reactive({ sku: null, size: null, color: null, stock: null }),
        ),
      });
    case "chat":
      return reactive({
        id: null,
        model: null,
        messages: Array.from({ length: SLOTS.chatMessages }, () =>
          reactive({
            role: null,
            text: null,
            status: null,
            citations: [],
          }),
        ),
      });
    case "match":
      return reactive({
        id: null,
        league: null,
        clock: null,
        status: null,
        home: reactive({ name: null, score: null }),
        away: reactive({ name: null, score: null }),
        events: Array.from({ length: SLOTS.matchEvents }, () =>
          reactive({
            min: null,
            type: null,
            team: null,
            player: null,
            note: null,
          }),
        ),
      });
    default:
      return reactive({});
  }
}

function patchModel(target, src, id) {
  switch (id) {
    case "weather":
      set(target, "city", src.city ?? null);
      set(target, "unit", src.unit ?? null);
      set(target.now, "temp", src.now?.temp ?? null);
      set(target.now, "sky", src.now?.sky ?? null);
      set(target.now, "humidity", src.now?.humidity ?? null);
      patchObjList(target.forecast, src.forecast, ["day", "high", "low"]);
      break;
    case "hotspot":
      set(target, "title", src.title ?? null);
      set(target, "region", src.region ?? null);
      set(target, "updated", src.updated ?? null);
      patchObjList(target.items, src.items, ["rank", "topic", "heat"]);
      break;
    case "news":
      set(target, "status", src.status ?? null);
      set(target, "headline", src.headline ?? null);
      set(target, "lead", src.lead ?? null);
      set(target.meta, "desk", src.meta?.desk ?? null);
      set(target.meta, "byline", src.meta?.byline ?? null);
      set(target.meta, "published", src.meta?.published ?? null);
      patchScalarList(target.body, src.body);
      patchScalarList(target.tags, src.tags);
      break;
    case "product":
      set(target, "id", src.id ?? null);
      set(target, "name", src.name ?? null);
      set(target, "brand", src.brand ?? null);
      set(target, "price", src.price ?? null);
      set(target, "currency", src.currency ?? null);
      patchScalarList(target.media, src.media);
      patchObjList(target.variants, src.variants, [
        "sku",
        "size",
        "color",
        "stock",
      ]);
      break;
    case "chat":
      set(target, "id", src.id ?? null);
      set(target, "model", src.model ?? null);
      patchMessages(target.messages, src.messages);
      break;
    case "match":
      set(target, "id", src.id ?? null);
      set(target, "league", src.league ?? null);
      set(target, "clock", src.clock ?? null);
      set(target, "status", src.status ?? null);
      set(target.home, "name", src.home?.name ?? null);
      set(target.home, "score", src.home?.score ?? null);
      set(target.away, "name", src.away?.name ?? null);
      set(target.away, "score", src.away?.score ?? null);
      patchObjList(target.events, src.events, [
        "min",
        "type",
        "team",
        "player",
        "note",
      ]);
      break;
    default:
      break;
  }
}

function patchScalarList(target, src) {
  const arr = Array.isArray(src) ? src : [];
  for (let i = 0; i < target.length; i++) {
    const next = arr[i] ?? null;
    if (target[i] !== next) target[i] = next;
  }
}

function patchObjList(target, src, keys) {
  const arr = Array.isArray(src) ? src : [];
  for (let i = 0; i < target.length; i++) {
    const item = arr[i];
    for (const k of keys) {
      set(target[i], k, item?.[k] ?? null);
    }
  }
}

function patchMessages(target, src) {
  const arr = Array.isArray(src) ? src : [];
  for (let i = 0; i < target.length; i++) {
    const item = arr[i];
    set(target[i], "role", item?.role ?? null);
    set(target[i], "text", item?.text ?? null);
    set(target[i], "status", item?.status ?? null);
    const cites = Array.isArray(item?.citations) ? item.citations : [];
    const prev = target[i].citations;
    if (
      prev.length !== cites.length ||
      cites.some((c, j) => prev[j] !== c)
    ) {
      target[i].citations = cites.slice();
    }
  }
}
</script>

<template>
  <div class="stage" :style="{ '--sc-accent': accent }">
    <div class="shell-banner">
      <span class="dot" aria-hidden="true" />
      <span>{{ t("render.shellBanner") }}</span>
      <code>{{ scenarioId }}</code>
    </div>

    <div v-show="scenarioId === 'weather'" class="device">
      <div class="device-bar">
        <span>{{ pick("Today", "今天") }}</span>
        <span class="device-clock">09:41</span>
      </div>
      <article class="shell weather">
        <header class="wx-head">
          <div>
            <p class="label">{{ pick("Location", "位置") }}</p>
            <h3 class="bind" :class="{ pending: !has(weather.city) }">
              {{ has(weather.city) ? weather.city : pick("City", "城市") }}
            </h3>
          </div>
          <div class="temp-block">
            <strong
              class="bind temp"
              :class="{ pending: !has(weather.now.temp) }"
              >{{ has(weather.now.temp) ? `${weather.now.temp}°` : "––" }}</strong
            >
            <span class="bind unit" :class="{ pending: !has(weather.unit) }">{{
              has(weather.unit) ? weather.unit : "C"
            }}</span>
          </div>
        </header>
        <p class="wx-sky">
          <span class="bind" :class="{ pending: !has(weather.now.sky) }">{{
            has(weather.now.sky)
              ? weather.now.sky
              : pick("Condition", "天气状况")
          }}</span>
          <span class="sep">·</span>
          <span class="bind" :class="{ pending: !has(weather.now.humidity) }">{{
            has(weather.now.humidity)
              ? `${weather.now.humidity}%`
              : `––% ${pick("humidity", "湿度")}`
          }}</span>
        </p>
        <p class="section-label">{{ pick("3-day forecast", "三日预报") }}</p>
        <ul class="forecast">
          <li
            v-for="(slot, i) in weather.forecast"
            :key="'f' + i"
            :class="{ vacant: !has(slot.day) }"
          >
            <span class="bind" :class="{ pending: !has(slot.day) }">{{
              has(slot.day) ? slot.day : `D${i + 1}`
            }}</span>
            <em class="bind" :class="{ pending: !has(slot.high) }">{{
              has(slot.high) ? `${slot.high}° / ${slot.low}°` : "––° / ––°"
            }}</em>
          </li>
        </ul>
      </article>
    </div>

    <div v-show="scenarioId === 'hotspot'" class="device wide">
      <div class="device-bar">
        <span>{{ pick("Trending", "热搜") }}</span>
        <span class="bind chip" :class="{ pending: !has(hotspot.updated) }">{{
          has(hotspot.updated) ? hotspot.updated : "--:--"
        }}</span>
      </div>
      <article class="shell hotspot">
        <header class="hs-head">
          <h3 class="bind" :class="{ pending: !has(hotspot.title) }">
            {{ has(hotspot.title) ? hotspot.title : pick("Hot board", "热榜") }}
          </h3>
          <span class="bind region" :class="{ pending: !has(hotspot.region) }">{{
            has(hotspot.region) ? hotspot.region : "—"
          }}</span>
        </header>
        <ol class="rank">
          <li
            v-for="(slot, i) in hotspot.items"
            :key="'h' + i"
            :class="{ vacant: !has(slot.topic) }"
          >
            <span class="rk">{{ i + 1 }}</span>
            <div class="rk-body">
              <strong class="bind" :class="{ pending: !has(slot.topic) }">{{
                has(slot.topic)
                  ? slot.topic
                  : pick("Topic placeholder", "话题占位")
              }}</strong>
              <div class="bar" aria-hidden="true">
                <i class="heat" :style="{ '--heat': heatRatio(slot.heat) }" />
              </div>
            </div>
            <em class="bind" :class="{ pending: !has(slot.heat) }">{{
              has(slot.heat) ? slot.heat : "––"
            }}</em>
          </li>
        </ol>
      </article>
    </div>

    <div v-show="scenarioId === 'news'" class="device wide paper">
      <div class="device-bar">
        <span>{{ pick("Metro desk", "都市版") }}</span>
        <span class="bind status chip" :class="{ pending: !has(news.status) }">{{
          has(news.status) ? news.status : "…"
        }}</span>
      </div>
      <article class="shell news">
        <h1 class="bind headline" :class="{ pending: !has(news.headline) }">
          {{
            has(news.headline)
              ? news.headline
              : pick("Headline awaits stream…", "标题等待流式数据…")
          }}
        </h1>
        <p class="byline">
          <span class="bind" :class="{ pending: !has(news.meta.desk) }">{{
            has(news.meta.desk) ? news.meta.desk : pick("Desk", "编辑台")
          }}</span>
          <span class="sep">·</span>
          <span class="bind" :class="{ pending: !has(news.meta.byline) }">{{
            has(news.meta.byline) ? news.meta.byline : pick("Byline", "作者")
          }}</span>
          <span class="sep">·</span>
          <span class="bind" :class="{ pending: !has(news.meta.published) }">{{
            has(news.meta.published) ? news.meta.published : "————"
          }}</span>
        </p>
        <p class="bind lead" :class="{ pending: !has(news.lead) }">
          {{
            has(news.lead)
              ? news.lead
              : pick(
                  "Lead paragraph slot — waiting for JSON binding.",
                  "导语槽位 — 等待 JSON 绑定。",
                )
          }}
        </p>
        <div class="paras">
          <p
            v-for="(slot, i) in news.body"
            :key="'b' + i"
            class="bind para"
            :class="{ pending: !has(slot), vacant: !has(slot) }"
          >
            {{ has(slot) ? slot : pick(`Paragraph ${i + 1}`, `正文段落 ${i + 1}`) }}
          </p>
        </div>
        <ul class="tags">
          <li
            v-for="(slot, i) in news.tags"
            :key="'t' + i"
            class="bind"
            :class="{ pending: !has(slot), vacant: !has(slot) }"
          >
            {{ has(slot) ? slot : `tag-${i + 1}` }}
          </li>
        </ul>
      </article>
    </div>

    <div v-show="scenarioId === 'product'" class="device wide">
      <div class="device-bar">
        <span>{{ pick("Storefront", "商城") }}</span>
        <span class="bind chip" :class="{ pending: !has(product.id) }">{{
          has(product.id) ? product.id : "sku-····"
        }}</span>
      </div>
      <article class="shell product">
        <div class="pdp-grid">
          <div class="gallery">
            <div
              v-for="(slot, i) in product.media"
              :key="'m' + i"
              class="thumb bind"
              :class="{ pending: !has(slot), vacant: !has(slot) }"
            >
              {{ has(slot) ? slot : pick("Image", "图片") + ` ${i + 1}` }}
            </div>
          </div>
          <div class="pdp-info">
            <p class="bind brand" :class="{ pending: !has(product.brand) }">
              {{ has(product.brand) ? product.brand : pick("Brand", "品牌") }}
            </p>
            <h3 class="bind" :class="{ pending: !has(product.name) }">
              {{
                has(product.name) ? product.name : pick("Product name", "商品名")
              }}
            </h3>
            <p class="price-row">
              <span class="bind" :class="{ pending: !has(product.currency) }">{{
                has(product.currency) ? product.currency : "USD"
              }}</span>
              <strong class="bind" :class="{ pending: !has(product.price) }">{{
                has(product.price) ? product.price : "––"
              }}</strong>
            </p>
            <table class="sku">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>{{ pick("Size", "尺码") }}</th>
                  <th>{{ pick("Color", "颜色") }}</th>
                  <th>{{ pick("Stock", "库存") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(slot, i) in product.variants"
                  :key="'v' + i"
                  :class="{
                    vacant: !has(slot.sku),
                    out: has(slot.stock) && Number(slot.stock) === 0,
                  }"
                >
                  <td class="bind" :class="{ pending: !has(slot.sku) }">
                    {{ has(slot.sku) ? slot.sku : "––––" }}
                  </td>
                  <td class="bind" :class="{ pending: !has(slot.size) }">
                    {{ has(slot.size) ? slot.size : "–" }}
                  </td>
                  <td class="bind" :class="{ pending: !has(slot.color) }">
                    {{ has(slot.color) ? slot.color : "–" }}
                  </td>
                  <td class="bind" :class="{ pending: !has(slot.stock) }">
                    {{ has(slot.stock) ? slot.stock : "–" }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </article>
    </div>

    <div v-show="scenarioId === 'chat'" class="device chat-device">
      <div class="device-bar">
        <span class="bind" :class="{ pending: !has(chat.model) }">{{
          has(chat.model) ? chat.model : "assistant"
        }}</span>
        <span class="bind chip" :class="{ pending: !has(chat.id) }">{{
          has(chat.id) ? chat.id : "session-···"
        }}</span>
      </div>
      <article class="shell chat">
        <div class="chat-thread">
          <template v-for="(slot, i) in chat.messages" :key="'c' + i">
            <div
              v-if="has(slot.text)"
              class="bubble"
              :class="slot.role === 'user' ? 'user' : 'assistant'"
            >
              <span class="role">{{ slot.role }}</span>
              <p>{{ slot.text }}</p>
              <em v-if="has(slot.status)">{{ slot.status }}</em>
              <ul v-if="slot.citations?.length" class="cites">
                <li v-for="(c, j) in slot.citations" :key="j">{{ c }}</li>
              </ul>
            </div>
          </template>
          <div v-if="!chatFilledCount" class="bubble assistant vacant">
            <span class="role">{{ pick("assistant", "助手") }}</span>
            <p class="bind pending">{{ pick("Message slot", "消息槽位") }}</p>
          </div>
          <div
            v-else-if="chatFilledCount < chat.messages.length"
            class="typing"
          >
            {{ pick("Waiting for next turn…", "等待下一轮…") }}
          </div>
        </div>
        <div class="composer" aria-hidden="true">
          <span>{{ pick("Message…", "输入消息…") }}</span>
          <button type="button" tabindex="-1" disabled>
            {{ pick("Send", "发送") }}
          </button>
        </div>
      </article>
    </div>

    <div v-show="scenarioId === 'match'" class="device wide">
      <div class="device-bar">
        <span class="bind" :class="{ pending: !has(match.league) }">{{
          has(match.league) ? match.league : pick("League", "联赛")
        }}</span>
        <span class="bind chip" :class="{ pending: !has(match.id) }">{{
          has(match.id) ? match.id : "match-···"
        }}</span>
      </div>
      <article class="shell match">
        <div class="scoreboard">
          <div class="side">
            <strong class="bind" :class="{ pending: !has(match.home.name) }">{{
              has(match.home.name) ? match.home.name : pick("Home", "主队")
            }}</strong>
            <span
              class="score bind"
              :class="{ pending: !has(match.home.score) }"
              >{{ has(match.home.score) ? match.home.score : "–" }}</span
            >
          </div>
          <div class="mid">
            <span class="bind" :class="{ pending: !has(match.clock) }">{{
              has(match.clock) ? match.clock : "--:--"
            }}</span>
            <em class="bind" :class="{ pending: !has(match.status) }">{{
              has(match.status) ? match.status : "LIVE"
            }}</em>
          </div>
          <div class="side away">
            <strong class="bind" :class="{ pending: !has(match.away.name) }">{{
              has(match.away.name) ? match.away.name : pick("Away", "客队")
            }}</strong>
            <span
              class="score bind"
              :class="{ pending: !has(match.away.score) }"
              >{{ has(match.away.score) ? match.away.score : "–" }}</span
            >
          </div>
        </div>
        <p class="section-label">{{ pick("Events", "事件") }}</p>
        <ul class="events">
          <li
            v-for="(slot, i) in match.events"
            :key="'e' + i"
            :class="{ vacant: !has(slot.type) }"
          >
            <span class="min bind" :class="{ pending: !has(slot.min) }">{{
              has(slot.min) ? `${slot.min}'` : "–'"
            }}</span>
            <span class="type bind" :class="{ pending: !has(slot.type) }">{{
              has(slot.type) ? slot.type : "——"
            }}</span>
            <span
              class="bind"
              :class="{ pending: !(has(slot.player) || has(slot.note)) }"
              >{{
                has(slot.player)
                  ? slot.player
                  : has(slot.note)
                    ? slot.note
                    : pick("Event slot", "事件槽位")
              }}</span
            >
          </li>
        </ul>
      </article>
    </div>
  </div>
</template>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: min(68vh, 720px);
  min-height: 320px;
}

.shell-banner {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.78rem;
  color: var(--ink-3);
  font-weight: 600;
  flex-shrink: 0;
}

.shell-banner .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 22%, transparent);
}

.shell-banner code {
  margin-left: auto;
  font-size: 0.72rem;
  background: var(--code-bg);
}

.device {
  max-width: 420px;
  margin: 0 auto;
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 22px;
  overflow: hidden;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  max-height: 100%;
  min-height: 0;
  flex: 1;
}

.device.wide {
  max-width: 720px;
}

.device.paper {
  max-width: 680px;
}

.device.chat-device {
  max-width: 440px;
}

.device-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  background: var(--surface-2);
  border-bottom: 1px solid var(--line-soft);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink-2);
  flex-shrink: 0;
}

.device-clock {
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--ink-3);
}

.chip {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 980px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
}

.shell {
  padding: 1.15rem 1.2rem 1.35rem;
  background: var(--surface);
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
}

.bind.pending {
  color: var(--ink-3);
  opacity: 0.55;
}

li.vacant,
tr.vacant,
.para.vacant,
.thumb.vacant,
.bubble.vacant {
  opacity: 0.55;
}

.label,
.section-label {
  margin: 0 0 0.35rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.section-label {
  margin-top: 1rem;
}

.sep {
  margin: 0 0.35rem;
  color: var(--ink-3);
}

.wx-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.wx-head h3 {
  margin: 0;
  font-size: 1.45rem;
}

.temp-block {
  text-align: right;
}

.temp {
  font-size: 2.5rem;
  letter-spacing: -0.05em;
  line-height: 1;
  font-weight: 800;
}

.unit {
  display: block;
  font-size: 0.8rem;
  color: var(--ink-3);
}

.wx-sky {
  margin: 0 0 0.25rem;
  color: var(--ink-2);
}

.forecast {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 0.5rem;
}

.forecast li {
  background: var(--code-bg);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
  padding: 0.65rem 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-height: 4.2rem;
}

.forecast em {
  font-style: normal;
  font-weight: 700;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.hs-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.hs-head h3 {
  margin: 0;
  font-size: 1.25rem;
}

.region {
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

.rank {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.rank li {
  display: grid;
  grid-template-columns: 1.6rem 1fr auto;
  gap: 0.65rem;
  align-items: center;
  min-height: 2.4rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--line-soft);
}

.rk {
  font-weight: 800;
  color: var(--sc-accent);
}

.rk-body strong {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.92rem;
}

.bar {
  height: 4px;
  background: var(--surface-2);
  border-radius: 980px;
  overflow: hidden;
}

.bar .heat {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 980px;
  background: var(--sc-accent);
  transform: scaleX(var(--heat, 0));
  transform-origin: left center;
  transition: transform 0.28s ease;
}

.rank em {
  font-style: normal;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--ink-3);
  min-width: 2.5rem;
  text-align: right;
}

.headline {
  margin: 0 0 0.65rem;
  font-size: 1.65rem;
  line-height: 1.25;
  letter-spacing: -0.03em;
  min-height: 2.5em;
}

.byline {
  margin: 0 0 1rem;
  font-size: 0.85rem;
  color: var(--ink-3);
}

.lead {
  margin: 0 0 1.1rem;
  font-size: 1.05rem;
  line-height: 1.5;
  color: var(--ink-2);
  min-height: 3.2em;
}

.paras {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.para {
  margin: 0;
  min-height: 2.8em;
  line-height: 1.55;
  color: var(--ink-2);
}

.tags {
  list-style: none;
  margin: 1.25rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tags li {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.55rem;
  border-radius: 980px;
  background: var(--surface-2);
  border: 1px solid var(--line-soft);
  min-width: 3.5rem;
  text-align: center;
}

.status {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.7rem !important;
}

.pdp-grid {
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: 1rem;
}

.gallery {
  display: grid;
  gap: 0.45rem;
}

.thumb {
  min-height: 4.5rem;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px dashed var(--line);
  background: var(--code-bg);
  font-size: 0.78rem;
  font-family: var(--font-mono);
  color: var(--ink-3);
}

.thumb:not(.pending) {
  border-style: solid;
  color: var(--ink-2);
  font-weight: 600;
}

.brand {
  margin: 0 0 0.25rem;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sc-accent);
}

.pdp-info h3 {
  margin: 0 0 0.5rem;
  font-size: 1.35rem;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin: 0 0 1rem;
  font-size: 1.25rem;
}

.price-row strong {
  font-size: 1.6rem;
  letter-spacing: -0.03em;
}

.sku {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.sku th,
.sku td {
  text-align: left;
  padding: 0.5rem 0.35rem;
  border-top: 1px solid var(--line-soft);
}

.sku tr.out td {
  color: var(--danger);
}

.chat {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  overflow: hidden;
  min-height: 0;
}

.chat-thread {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 1rem 1.1rem 0.85rem;
}

.bubble {
  max-width: 92%;
  padding: 0.7rem 0.85rem;
  border-radius: 14px;
  background: var(--code-bg);
  border: 1px solid var(--line-soft);
}

.bubble.user {
  align-self: flex-end;
  background: color-mix(in srgb, var(--sc-accent) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--sc-accent) 30%, var(--line-soft));
}

.bubble.assistant {
  align-self: flex-start;
}

.role {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
}

.bubble p {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble em {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.72rem;
  color: var(--ink-3);
  font-style: normal;
}

.cites {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.cites li {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  padding: 0.12rem 0.35rem;
  border-radius: 6px;
  background: var(--surface-2);
}

.typing {
  align-self: flex-start;
  font-size: 0.75rem;
  color: var(--ink-3);
  padding: 0.15rem 0.35rem;
}

.composer {
  flex-shrink: 0;
  margin-top: 0;
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1.1rem 1rem;
  border-top: 1px solid var(--line-soft);
  background: var(--surface);
}

.composer span {
  flex: 1;
  padding: 0.55rem 0.75rem;
  border-radius: 980px;
  border: 1px solid var(--line-soft);
  background: var(--code-bg);
  color: var(--ink-3);
  font-size: 0.85rem;
}

.composer button {
  opacity: 0.7;
}

.scoreboard {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.75rem;
  align-items: center;
  padding: 1rem;
  border-radius: 14px;
  background: var(--code-bg);
  border: 1px solid var(--line-soft);
}

.side {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.side.away {
  text-align: right;
  align-items: flex-end;
}

.score {
  font-size: 2.3rem;
  font-weight: 800;
  font-family: var(--font-mono);
  letter-spacing: -0.04em;
  color: var(--sc-accent);
  min-width: 1.5ch;
}

.mid {
  text-align: center;
  font-family: var(--font-mono);
  color: var(--ink-2);
}

.mid em {
  display: block;
  font-style: normal;
  font-size: 0.72rem;
  font-weight: 700;
  margin-top: 0.25rem;
}

.events {
  list-style: none;
  margin: 0;
  padding: 0;
}

.events li {
  display: grid;
  grid-template-columns: 2.6rem 3.6rem 1fr;
  gap: 0.5rem;
  font-size: 0.88rem;
  padding: 0.45rem 0;
  border-top: 1px solid var(--line-soft);
  min-height: 2rem;
  align-items: center;
}

.min {
  font-family: var(--font-mono);
  color: var(--ink-3);
}

.type {
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  color: var(--sc-accent);
}

@media (max-width: 700px) {
  .pdp-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar .heat {
    transition: none;
  }
}
</style>
