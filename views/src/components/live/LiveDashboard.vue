<script setup>
/**
 * Production ops board — dense telemetry console bound to streamed XAIOP `live`.
 */
import { computed, ref } from "vue";
import { collectBatches } from "@/lib/live-stream-client.js";
import { useI18n } from "@/i18n.js";

const props = defineProps({
  live: { type: Object, default: null },
  leafCount: { type: Number, default: 0 },
  received: { type: Number, default: 0 },
  status: { type: String, default: "idle" },
  estimatedLeaves: { type: Number, default: 0 },
  phaseCount: { type: Number, default: 0 },
});

const { pick } = useI18n();
const windowSize = 20;
const userPage = ref(0);
const orderPage = ref(0);
const eventPage = ref(0);
const logPage = ref(0);
const invPage = ref(0);
const devicePage = ref(0);
const ticketPage = ref(0);

const root = computed(() =>
  props.live && typeof props.live === "object" ? props.live : {},
);

const meta = computed(() => root.value.meta || {});
const summary = computed(() => root.value.summary || {});
const kpis = computed(() =>
  Array.isArray(root.value.kpis) ? root.value.kpis : [],
);
const regions = computed(() =>
  Array.isArray(root.value.regions) ? root.value.regions : [],
);
const alerts = computed(() =>
  Array.isArray(root.value.alerts) ? root.value.alerts : [],
);
const notifications = computed(() =>
  Array.isArray(root.value.notifications) ? root.value.notifications : [],
);

const users = computed(() => collectBatches(root.value, "users"));
const orders = computed(() => collectBatches(root.value, "orders"));
const events = computed(() => collectBatches(root.value, "events"));
const inventory = computed(() => collectBatches(root.value, "inventory"));
const series = computed(() => collectBatches(root.value, "series"));
const logs = computed(() => collectBatches(root.value, "logs"));
const devices = computed(() => collectBatches(root.value, "devices"));
const tickets = computed(() => collectBatches(root.value, "tickets"));

const bindingPct = computed(() => {
  const est = props.estimatedLeaves || 0;
  if (!est) return props.status === "completed" ? 100 : 0;
  return Math.min(100, Math.round((props.leafCount / est) * 100));
});

const openAlerts = computed(
  () => alerts.value.filter((a) => Number(a.open) === 1 || a.open === true).length,
);

const onlineDevices = computed(
  () =>
    devices.value.filter((d) => d.state === "online" || d.state === "idle")
      .length,
);

function slice(arr, page) {
  const start = page * windowSize;
  return arr.slice(start, start + windowSize);
}

function pages(n) {
  return Math.max(1, Math.ceil(Math.max(n, 1) / windowSize));
}

function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return v ?? "—";
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return String(Number(n.toFixed(2)));
}

function loadPct(load) {
  return Math.min(100, Math.max(0, Number(load) || 0));
}

function batPct(v) {
  return Math.min(100, Math.max(0, Number(v) || 0));
}

const sparkPath = computed(() => {
  const pts = series.value;
  if (pts.length < 2) return { line: "", area: "" };
  const last = pts.slice(-64);
  const vs = last.map((p) => Number(p?.v) || 0);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = Math.max(1, max - min);
  const coords = vs.map((v, i) => {
    const x = (i / (vs.length - 1)) * 100;
    const y = 38 - ((v - min) / span) * 30;
    return [x, y];
  });
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,40 ${line} 100,40`;
  return { line, area };
});

const panelStats = computed(() => [
  { key: "kpis", n: kpis.value.length, label: pick("KPIs", "指标"), tone: "blue" },
  { key: "users", n: users.value.length, label: pick("Users", "用户"), tone: "teal" },
  { key: "orders", n: orders.value.length, label: pick("Orders", "订单"), tone: "blue" },
  { key: "events", n: events.value.length, label: pick("Events", "事件"), tone: "violet" },
  { key: "inventory", n: inventory.value.length, label: pick("Stock", "库存"), tone: "amber" },
  { key: "series", n: series.value.length, label: pick("Series", "时序"), tone: "teal" },
  { key: "logs", n: logs.value.length, label: pick("Logs", "日志"), tone: "slate" },
  { key: "devices", n: devices.value.length, label: pick("Devices", "设备"), tone: "blue" },
  { key: "tickets", n: tickets.value.length, label: pick("Tickets", "工单"), tone: "amber" },
  { key: "regions", n: regions.value.length, label: pick("Regions", "区域"), tone: "teal" },
  { key: "alerts", n: alerts.value.length, label: pick("Alerts", "告警"), tone: "rose" },
  { key: "notes", n: notifications.value.length, label: pick("Inbox", "通知"), tone: "violet" },
]);

const waiting = computed(() => !props.live && props.status === "running");
</script>

<template>
  <div class="board" :data-status="status">
    <header class="hero">
      <div class="hero-main">
        <div class="live-row">
          <span class="pulse" :data-on="status === 'running'" aria-hidden="true" />
          <span class="eyebrow">{{ meta.source || "BFF · XAIOP stream" }}</span>
          <span class="env-chip" v-if="meta.env">{{ meta.env }}</span>
        </div>
        <h1>{{ meta.title || pick("Production Ops Board", "生产运维看板") }}</h1>
        <p class="sub">
          <span>{{ meta.region || pick("Region pending", "区域待绑定") }}</span>
          <span class="dot" aria-hidden="true">·</span>
          <code>{{ live?.id || "ops-pending" }}</code>
          <span class="dot" aria-hidden="true">·</span>
          <span>{{ pick("Phase", "阶段") }} {{ phaseCount }}</span>
        </p>
      </div>

      <div class="hero-side">
        <div class="metric">
          <span>{{ pick("Bound leaves", "已绑定叶子") }}</span>
          <strong>{{ leafCount.toLocaleString() }}</strong>
          <small v-if="estimatedLeaves"
            >/ {{ estimatedLeaves.toLocaleString() }}</small
          >
        </div>
        <div class="metric">
          <span>{{ pick("Wire in", "已收字符") }}</span>
          <strong>{{ received.toLocaleString() }}</strong>
        </div>
        <div class="metric">
          <span>{{ pick("Open alerts", "未关闭告警") }}</span>
          <strong :class="{ hot: openAlerts }">{{ openAlerts }}</strong>
        </div>
        <div class="metric">
          <span>{{ pick("Devices up", "在线设备") }}</span>
          <strong
            >{{ onlineDevices
            }}<small>/{{ devices.length || "—" }}</small></strong
          >
        </div>
      </div>

      <div class="bind-rail" aria-label="binding progress">
        <div class="bind-meta">
          <span>{{ pick("Schema binding", "结构绑定进度") }}</span>
          <b>{{ bindingPct }}%</b>
        </div>
        <div class="rail">
          <i :style="{ width: bindingPct + '%' }" />
        </div>
      </div>
    </header>

    <section class="stat-strip" aria-label="resource counts">
      <article
        v-for="p in panelStats"
        :key="p.key"
        class="stat"
        :data-tone="p.tone"
        :data-empty="p.n === 0"
      >
        <span>{{ p.label }}</span>
        <strong>{{ p.n.toLocaleString() }}</strong>
        <i class="bar" aria-hidden="true" />
      </article>
    </section>

    <section class="kpi-grid">
      <article
        v-for="(k, i) in kpis.slice(0, 24)"
        :key="k.id || i"
        class="kpi"
      >
        <span class="k-name">{{ k.name }}</span>
        <strong>{{ fmtNum(k.value) }}</strong>
        <em :class="Number(k.delta) >= 0 ? 'up' : 'down'">
          {{ Number(k.delta) >= 0 ? "▲" : "▼" }}
          {{ Math.abs(Number(k.delta) || 0) }}%
        </em>
      </article>
      <div v-if="!kpis.length" class="skeleton-row">
        <div v-for="n in 8" :key="n" class="skel kpi-skel" />
        <p class="empty-hint">
          {{
            waiting
              ? pick("Streaming KPI phase…", "正在流入 KPI 阶段…")
              : pick("No KPIs yet", "尚无指标")
          }}
        </p>
      </div>
    </section>

    <section class="two-col">
      <article class="panel chart-panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Traffic series", "流量时序") }}</h2>
            <p>{{ pick("Last 64 points", "最近 64 个点") }}</p>
          </div>
          <span class="count">{{ series.length.toLocaleString() }}</span>
        </header>
        <div class="chart-wrap">
          <svg viewBox="0 0 100 40" class="spark" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--live-teal)" stop-opacity="0.35" />
                <stop offset="100%" stop-color="var(--live-teal)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <polygon
              v-if="sparkPath.area"
              :points="sparkPath.area"
              fill="url(#sparkFill)"
            />
            <polyline
              v-if="sparkPath.line"
              fill="none"
              stroke="var(--live-teal)"
              stroke-width="1.4"
              stroke-linejoin="round"
              stroke-linecap="round"
              :points="sparkPath.line"
            />
          </svg>
          <p v-if="!series.length" class="chart-empty">
            {{ pick("Awaiting series batches…", "等待时序批次…") }}
          </p>
        </div>
      </article>

      <article class="panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Region load", "区域负载") }}</h2>
            <p>{{ pick("Latency & saturation", "延迟与饱和度") }}</p>
          </div>
          <span class="count">{{ regions.length }}</span>
        </header>
        <ul class="region-list">
          <li v-for="(r, i) in regions.slice(0, 10)" :key="r.id || i">
            <div class="rg-top">
              <span class="rg-name">{{ r.name }}</span>
              <em>{{ r.latencyMs }}ms</em>
            </div>
            <div class="rg-bar">
              <i :style="{ width: loadPct(r.load) + '%' }" />
            </div>
            <div class="rg-meta">
              <span>load {{ fmtNum(r.load) }}</span>
              <span>err {{ r.errors }}</span>
            </div>
          </li>
          <li v-if="!regions.length" class="empty-li">
            {{ pick("Regions arrive in a later phase", "区域数据稍后提交") }}
          </li>
        </ul>
      </article>
    </section>

    <section class="tables">
      <article class="panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Users", "用户") }}</h2>
          </div>
          <span class="count">{{ users.length.toLocaleString() }}</span>
          <div class="pager">
            <button type="button" :disabled="userPage <= 0" @click="userPage--">‹</button>
            <em>{{ userPage + 1 }}/{{ pages(users.length) }}</em>
            <button
              type="button"
              :disabled="userPage >= pages(users.length) - 1"
              @click="userPage++"
            >
              ›
            </button>
          </div>
        </header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>id</th>
                <th>name</th>
                <th>city</th>
                <th>tier</th>
                <th>score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(u, i) in slice(users, userPage)" :key="u.id || i">
                <td class="mono">{{ u.id }}</td>
                <td>{{ u.name }}</td>
                <td>{{ u.city }}</td>
                <td><span class="chip soft">T{{ u.tier }}</span></td>
                <td class="num">{{ u.score }}</td>
                <td>
                  <span
                    class="dot-state"
                    :data-on="Number(u.active) === 1"
                    :title="Number(u.active) === 1 ? 'active' : 'idle'"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!users.length" class="table-empty">
            {{ pick("User batches streaming in…", "用户批次流入中…") }}
          </p>
        </div>
      </article>

      <article class="panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Orders", "订单") }}</h2>
          </div>
          <span class="count">{{ orders.length.toLocaleString() }}</span>
          <div class="pager">
            <button type="button" :disabled="orderPage <= 0" @click="orderPage--">‹</button>
            <em>{{ orderPage + 1 }}/{{ pages(orders.length) }}</em>
            <button
              type="button"
              :disabled="orderPage >= pages(orders.length) - 1"
              @click="orderPage++"
            >
              ›
            </button>
          </div>
        </header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>id</th>
                <th>sku</th>
                <th>qty</th>
                <th>amount</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(o, i) in slice(orders, orderPage)" :key="o.id || i">
                <td class="mono">{{ o.id }}</td>
                <td class="mono">{{ o.sku }}</td>
                <td class="num">{{ o.qty }}</td>
                <td class="num">{{ fmtNum(o.amount) }}</td>
                <td>
                  <span class="chip" :data-st="o.status">{{ o.status }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!orders.length" class="table-empty">
            {{ pick("Order batches streaming in…", "订单批次流入中…") }}
          </p>
        </div>
      </article>

      <article class="panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Events", "事件") }}</h2>
          </div>
          <span class="count">{{ events.length.toLocaleString() }}</span>
          <div class="pager">
            <button type="button" :disabled="eventPage <= 0" @click="eventPage--">‹</button>
            <em>{{ eventPage + 1 }}/{{ pages(events.length) }}</em>
            <button
              type="button"
              :disabled="eventPage >= pages(events.length) - 1"
              @click="eventPage++"
            >
              ›
            </button>
          </div>
        </header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>id</th>
                <th>type</th>
                <th>user</th>
                <th>weight</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(e, i) in slice(events, eventPage)" :key="e.id || i">
                <td class="mono">{{ e.id }}</td>
                <td><span class="chip soft">{{ e.type }}</span></td>
                <td class="mono">{{ e.user }}</td>
                <td class="num">{{ e.weight }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!events.length" class="table-empty">
            {{ pick("Event batches streaming in…", "事件批次流入中…") }}
          </p>
        </div>
      </article>

      <article class="panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Inventory", "库存") }}</h2>
          </div>
          <span class="count">{{ inventory.length.toLocaleString() }}</span>
          <div class="pager">
            <button type="button" :disabled="invPage <= 0" @click="invPage--">‹</button>
            <em>{{ invPage + 1 }}/{{ pages(inventory.length) }}</em>
            <button
              type="button"
              :disabled="invPage >= pages(inventory.length) - 1"
              @click="invPage++"
            >
              ›
            </button>
          </div>
        </header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>sku</th>
                <th>warehouse</th>
                <th>stock</th>
                <th>reserved</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in slice(inventory, invPage)" :key="r.sku || i">
                <td class="mono">{{ r.sku }}</td>
                <td>{{ r.warehouse }}</td>
                <td class="num">{{ r.stock }}</td>
                <td class="num muted">{{ r.reserved }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!inventory.length" class="table-empty">
            {{ pick("Inventory batches streaming in…", "库存批次流入中…") }}
          </p>
        </div>
      </article>

      <article class="panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Devices", "设备") }}</h2>
          </div>
          <span class="count">{{ devices.length.toLocaleString() }}</span>
          <div class="pager">
            <button type="button" :disabled="devicePage <= 0" @click="devicePage--">‹</button>
            <em>{{ devicePage + 1 }}/{{ pages(devices.length) }}</em>
            <button
              type="button"
              :disabled="devicePage >= pages(devices.length) - 1"
              @click="devicePage++"
            >
              ›
            </button>
          </div>
        </header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>id</th>
                <th>model</th>
                <th>state</th>
                <th>battery</th>
                <th>rssi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(d, i) in slice(devices, devicePage)" :key="d.id || i">
                <td class="mono">{{ d.id }}</td>
                <td>{{ d.model }}</td>
                <td>
                  <span class="chip" :data-st="d.state">{{ d.state }}</span>
                </td>
                <td>
                  <div class="mini-bar" :title="d.battery + '%'">
                    <i :style="{ width: batPct(d.battery) + '%' }" />
                  </div>
                </td>
                <td class="num muted">{{ d.rssi }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!devices.length" class="table-empty">
            {{ pick("Device batches streaming in…", "设备批次流入中…") }}
          </p>
        </div>
      </article>

      <article class="panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Tickets", "工单") }}</h2>
          </div>
          <span class="count">{{ tickets.length.toLocaleString() }}</span>
          <div class="pager">
            <button type="button" :disabled="ticketPage <= 0" @click="ticketPage--">‹</button>
            <em>{{ ticketPage + 1 }}/{{ pages(tickets.length) }}</em>
            <button
              type="button"
              :disabled="ticketPage >= pages(tickets.length) - 1"
              @click="ticketPage++"
            >
              ›
            </button>
          </div>
        </header>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>id</th>
                <th>status</th>
                <th>pri</th>
                <th>assignee</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in slice(tickets, ticketPage)" :key="t.id || i">
                <td class="mono">{{ t.id }}</td>
                <td>
                  <span class="chip" :data-st="t.status">{{ t.status }}</span>
                </td>
                <td>
                  <span class="pri" :data-p="t.priority">P{{ t.priority }}</span>
                </td>
                <td>{{ t.assignee }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="!tickets.length" class="table-empty">
            {{ pick("Ticket batches streaming in…", "工单批次流入中…") }}
          </p>
        </div>
      </article>
    </section>

    <section class="three-col">
      <article class="panel log-panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Service logs", "服务日志") }}</h2>
          </div>
          <span class="count">{{ logs.length.toLocaleString() }}</span>
          <div class="pager">
            <button type="button" :disabled="logPage <= 0" @click="logPage--">‹</button>
            <em>{{ logPage + 1 }}/{{ pages(logs.length) }}</em>
            <button
              type="button"
              :disabled="logPage >= pages(logs.length) - 1"
              @click="logPage++"
            >
              ›
            </button>
          </div>
        </header>
        <ul class="log-list">
          <li v-for="(l, i) in slice(logs, logPage)" :key="l.id || i">
            <i :data-lv="l.level">{{ l.level }}</i>
            <code>{{ l.svc }}</code>
            <span>{{ l.msg }}</span>
          </li>
          <li v-if="!logs.length" class="empty-li">
            {{ pick("Log tail pending…", "日志尾部待到达…") }}
          </li>
        </ul>
      </article>

      <article class="panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Alerts", "告警") }}</h2>
          </div>
          <span class="count">{{ alerts.length }}</span>
        </header>
        <ul class="alert-list">
          <li v-for="(a, i) in alerts.slice(0, 14)" :key="a.id || i">
            <span class="sev" :data-sev="a.severity">{{ a.severity }}</span>
            <div>
              <b>{{ a.title }}</b>
              <small>{{ Number(a.open) === 1 ? "open" : "closed" }}</small>
            </div>
          </li>
          <li v-if="!alerts.length" class="empty-li">
            {{ pick("No alerts yet", "暂无告警") }}
          </li>
        </ul>
      </article>

      <article class="panel">
        <header class="ph">
          <div>
            <h2>{{ pick("Notifications", "通知") }}</h2>
          </div>
          <span class="count">{{ notifications.length }}</span>
        </header>
        <ul class="note-list">
          <li
            v-for="(n, i) in notifications.slice(0, 14)"
            :key="n.id || i"
            :data-unread="Number(n.read) !== 1"
          >
            <span class="ch">{{ n.channel }}</span>
            <b>{{ n.body }}</b>
          </li>
          <li v-if="!notifications.length" class="empty-li">
            {{ pick("Inbox empty", "收件箱为空") }}
          </li>
        </ul>
      </article>
    </section>

    <footer v-if="summary && summary.complete" class="summary">
      <span class="ok-dot" aria-hidden="true" />
      <div>
        <strong>{{ pick("Final summary committed", "终态汇总已提交") }}</strong>
        <p>
          leaves {{ summary.leaves }} · users {{ summary.users }} · orders
          {{ summary.orders }} · events {{ summary.events }} · devices
          {{ summary.devices }}
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.board {
  --live-teal: #0d9f8a;
  --live-amber: #c47a12;
  --live-rose: #d1435b;
  --live-violet: #6b5ce7;
  --live-slate: #64748b;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem clamp(1rem, 2vw, 1.5rem) 2.25rem;
  color: var(--ink);
}

.hero {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 1rem 1.5rem;
  padding: 1.2rem 1.3rem 1.05rem;
  border-radius: 18px;
  background:
    radial-gradient(
      90% 120% at 0% 0%,
      color-mix(in srgb, var(--accent) 14%, transparent),
      transparent 50%
    ),
    radial-gradient(
      70% 90% at 100% 0%,
      color-mix(in srgb, var(--live-teal) 10%, transparent),
      transparent 45%
    ),
    var(--surface);
  border: 1px solid var(--line-soft);
  box-shadow: var(--shadow);
}

.hero-main {
  min-width: 0;
}

.live-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.35rem;
}

.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ink-3);
  flex-shrink: 0;
}

.pulse[data-on="true"] {
  background: var(--live-teal);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--live-teal) 55%, transparent);
  animation: pulse 1.5s ease-out infinite;
}

@keyframes pulse {
  70% {
    box-shadow: 0 0 0 10px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.eyebrow {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.env-chip {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.12rem 0.4rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--live-teal) 14%, var(--surface));
  color: var(--live-teal);
  border: 1px solid color-mix(in srgb, var(--live-teal) 30%, var(--line-soft));
}

.hero h1 {
  margin: 0;
  font-size: clamp(1.35rem, 2.2vw, 1.75rem);
  letter-spacing: -0.035em;
}

.sub {
  margin: 0.4rem 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  color: var(--ink-3);
  font-size: 0.84rem;
}

.sub code {
  font-size: 0.78rem;
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
}

.dot {
  opacity: 0.5;
}

.hero-side {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.metric {
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--code-bg) 88%, var(--surface));
  border: 1px solid var(--line-soft);
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.metric span {
  font-size: 0.68rem;
  font-weight: 650;
  color: var(--ink-3);
}

.metric strong {
  font-size: 1.2rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.metric strong.hot {
  color: var(--live-rose);
}

.metric small {
  font-size: 0.72rem;
  color: var(--ink-3);
  font-weight: 500;
}

.bind-rail {
  grid-column: 1 / -1;
}

.bind-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--ink-3);
  margin-bottom: 0.35rem;
}

.bind-meta b {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.rail {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.rail i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--accent),
    color-mix(in srgb, var(--live-teal) 70%, var(--accent))
  );
  transition: width 0.25s ease;
}

.stat-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 0.5rem;
}

.stat {
  position: relative;
  padding: 0.7rem 0.75rem 0.8rem;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
  overflow: hidden;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.stat[data-empty="true"] {
  opacity: 0.55;
}

.stat span {
  display: block;
  font-size: 0.68rem;
  font-weight: 650;
  color: var(--ink-3);
}

.stat strong {
  display: block;
  margin-top: 0.15rem;
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.stat .bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 100%;
  opacity: 0.85;
}

.stat[data-tone="blue"] .bar {
  background: var(--accent);
}
.stat[data-tone="teal"] .bar {
  background: var(--live-teal);
}
.stat[data-tone="amber"] .bar {
  background: var(--live-amber);
}
.stat[data-tone="rose"] .bar {
  background: var(--live-rose);
}
.stat[data-tone="violet"] .bar {
  background: var(--live-violet);
}
.stat[data-tone="slate"] .bar {
  background: var(--live-slate);
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 0.5rem;
}

.kpi {
  padding: 0.75rem 0.8rem;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line-soft);
}

.k-name {
  display: block;
  font-size: 0.68rem;
  color: var(--ink-3);
  font-weight: 600;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi strong {
  font-size: 1.15rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.kpi em {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  margin-top: 0.25rem;
  font-style: normal;
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.kpi em.up {
  color: var(--success);
}
.kpi em.down {
  color: var(--danger);
}

.skeleton-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 0.5rem;
}

.skel {
  height: 74px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    var(--surface-2),
    color-mix(in srgb, var(--surface) 60%, var(--surface-2)),
    var(--surface-2)
  );
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.empty-hint {
  grid-column: 1 / -1;
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  color: var(--ink-3);
}

.two-col,
.three-col,
.tables {
  display: grid;
  gap: 0.75rem;
}

.two-col {
  grid-template-columns: 1.25fr 1fr;
}
.three-col {
  grid-template-columns: 1.35fr 1fr 1fr;
}
.tables {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.panel {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: 14px;
  padding: 0.85rem 0.9rem 0.95rem;
  min-width: 0;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--ink) 3%, transparent);
}

.ph {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}

.ph h2 {
  margin: 0;
  font-size: 0.92rem;
  letter-spacing: -0.02em;
}

.ph p {
  margin: 0.15rem 0 0;
  font-size: 0.72rem;
  color: var(--ink-3);
}

.count {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--ink-3);
  padding: 0.15rem 0.45rem;
  border-radius: 980px;
  background: var(--code-bg);
  border: 1px solid var(--line-soft);
}

.pager {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.pager button {
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 8px;
  border: 1px solid var(--line-soft);
  background: var(--code-bg);
  color: var(--ink);
  cursor: pointer;
}

.pager button:disabled {
  opacity: 0.35;
  cursor: default;
}

.pager em {
  font-style: normal;
  font-size: 0.7rem;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
  min-width: 2.6rem;
  text-align: center;
}

.chart-wrap {
  position: relative;
  height: 140px;
  border-radius: 12px;
  background:
    linear-gradient(var(--line-soft) 1px, transparent 1px) 0 0 / 100% 28px,
    var(--code-bg);
  border: 1px solid var(--line-soft);
  overflow: hidden;
}

.spark {
  width: 100%;
  height: 100%;
  display: block;
}

.chart-empty {
  position: absolute;
  inset: 0;
  margin: 0;
  display: grid;
  place-items: center;
  color: var(--ink-3);
  font-size: 0.82rem;
}

.region-list,
.log-list,
.alert-list,
.note-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.region-list li {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.rg-top,
.rg-meta {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.78rem;
}

.rg-name {
  font-weight: 650;
}

.rg-top em {
  font-style: normal;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--ink-3);
}

.rg-meta {
  font-size: 0.7rem;
  color: var(--ink-3);
}

.rg-bar {
  height: 5px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.rg-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--live-teal));
}

.table-wrap {
  overflow: auto;
  max-height: 320px;
  border-radius: 10px;
  border: 1px solid var(--line-soft);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
}

th,
td {
  text-align: left;
  padding: 0.42rem 0.55rem;
  border-bottom: 1px solid var(--line-soft);
  white-space: nowrap;
}

th {
  position: sticky;
  top: 0;
  background: var(--code-bg);
  color: var(--ink-3);
  font-weight: 650;
  font-size: 0.68rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  z-index: 1;
}

tbody tr:hover td {
  background: var(--hover-fill);
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.72rem;
}

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  color: var(--ink-3);
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 1.35rem;
  padding: 0 0.4rem;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 700;
  background: var(--code-bg);
  border: 1px solid var(--line-soft);
  text-transform: lowercase;
}

.chip.soft {
  font-weight: 600;
  color: var(--ink-2);
}

.chip[data-st="paid"],
.chip[data-st="shipped"],
.chip[data-st="online"],
.chip[data-st="solved"],
.chip[data-st="idle"] {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--success) 28%, var(--line-soft));
}

.chip[data-st="pending"],
.chip[data-st="maintenance"],
.chip[data-st="open"] {
  color: var(--live-amber);
  background: color-mix(in srgb, var(--live-amber) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--live-amber) 28%, var(--line-soft));
}

.chip[data-st="refund"],
.chip[data-st="offline"],
.chip[data-st="closed"] {
  color: var(--ink-3);
}

.chip[data-st="error"] {
  color: var(--danger);
}

.dot-state {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ink-3);
}

.dot-state[data-on="true"] {
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 18%, transparent);
}

.mini-bar {
  width: 48px;
  height: 5px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.mini-bar i {
  display: block;
  height: 100%;
  background: var(--live-teal);
}

.pri {
  font-size: 0.7rem;
  font-weight: 800;
  font-family: var(--font-mono);
}

.pri[data-p="1"],
.pri[data-p="2"] {
  color: var(--live-rose);
}
.pri[data-p="3"] {
  color: var(--live-amber);
}
.pri[data-p="4"] {
  color: var(--ink-3);
}

.table-empty,
.empty-li {
  margin: 0;
  padding: 1rem 0.75rem;
  color: var(--ink-3);
  font-size: 0.82rem;
  text-align: center;
}

.log-panel {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--code-bg) 70%, var(--surface)),
      var(--surface)
    );
}

.log-list li {
  display: grid;
  grid-template-columns: 3.4rem 4.4rem 1fr;
  gap: 0.45rem;
  align-items: baseline;
  padding: 0.35rem 0.4rem;
  border-radius: 8px;
  font-size: 0.78rem;
  font-family: var(--font-mono);
}

.log-list li:nth-child(odd) {
  background: color-mix(in srgb, var(--code-bg) 80%, transparent);
}

.log-list i {
  font-style: normal;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.log-list i[data-lv="error"] {
  color: var(--danger);
}
.log-list i[data-lv="warn"] {
  color: var(--live-amber);
}
.log-list i[data-lv="info"] {
  color: var(--accent);
}
.log-list i[data-lv="debug"] {
  color: var(--ink-3);
}

.alert-list li,
.note-list li {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: 0.55rem;
  align-items: start;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--line-soft);
  font-size: 0.8rem;
}

.alert-list b,
.note-list b {
  display: block;
  font-weight: 650;
}

.alert-list small {
  color: var(--ink-3);
  font-size: 0.7rem;
}

.sev {
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.35rem;
  border-radius: 6px;
  text-align: center;
  background: var(--code-bg);
  border: 1px solid var(--line-soft);
}

.sev[data-sev="critical"],
.sev[data-sev="high"] {
  color: var(--live-rose);
  background: color-mix(in srgb, var(--live-rose) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--live-rose) 30%, var(--line-soft));
}

.sev[data-sev="medium"] {
  color: var(--live-amber);
}

.ch {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--ink-3);
  padding-top: 0.15rem;
}

.note-list li[data-unread="true"] b {
  color: var(--ink);
}

.note-list li[data-unread="false"] {
  opacity: 0.65;
}

.summary {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.95rem 1.05rem;
  border-radius: 14px;
  background: color-mix(in srgb, var(--success) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--success) 28%, var(--line-soft));
}

.ok-dot {
  width: 10px;
  height: 10px;
  margin-top: 0.35rem;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--success) 18%, transparent);
  flex-shrink: 0;
}

.summary strong {
  display: block;
  font-size: 0.92rem;
}

.summary p {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  color: var(--ink-2);
  font-family: var(--font-mono);
}

@media (max-width: 980px) {
  .hero {
    grid-template-columns: 1fr;
  }
  .two-col,
  .three-col,
  .tables {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse,
  .skel {
    animation: none;
  }
  .rail i {
    transition: none;
  }
}
</style>
