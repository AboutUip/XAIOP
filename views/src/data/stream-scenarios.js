/**
 * Large stream-lab scenarios — many `.` phases, long wires.
 * Demonstrate XAIOP streaming: progressive bind only after each phase.
 */

/** @typedef {{
 *   id: string,
 *   title: string,
 *   titleZh: string,
 *   env: string,
 *   envZh: string,
 *   blurb: string,
 *   blurbZh: string,
 *   size: 'S'|'M'|'L'|'XL',
 *   intensity: number,
 *   accent: string,
 *   tags: string[],
 *   wire: string,
 * }} StreamScenario */

function lines(...rows) {
  return rows.flat().join("\n");
}

/** Anonymous object element inside an array: > …fields… < */
function arrObj(fields) {
  return [">", ...Object.entries(fields).map(([k, v]) => `${k}:${v}`), "<"];
}

function phase(...parts) {
  return [">", ...parts.flat(), "."];
}

function finalPhase(...parts) {
  return [">", ...parts.flat()];
}

const HOT_TOPICS = [
  ["City marathon finals", 120],
  ["New subway Line 14", 98],
  ["Museum night tickets", 76],
  ["Harbor fireworks plan", 71],
  ["Campus open day", 64],
  ["River cleanup drive", 58],
  ["Tech park ribbon cut", 52],
  ["Weekend rain alert", 49],
  ["Food festival stalls", 44],
  ["Bike share expansion", 41],
  ["Library 24h pilot", 37],
  ["Stadium light show", 33],
];

function hotspotItems(n, heatBoost = 0) {
  const out = [">items-"];
  for (let i = 0; i < n; i++) {
    const [topic, heat] = HOT_TOPICS[i];
    out.push(
      ...arrObj({
        rank: i + 1,
        topic,
        heat: heat + heatBoost + i * 3,
      }),
    );
  }
  return out;
}

const NEWS_PARAS = [
  "Crowds gathered before sunrise as crews finished last-minute lighting checks along the promenade.",
  "The park replaces an aging cargo pier and adds wetlands designed to absorb seasonal flood peaks.",
  "Transit planners say two new bus lines will link the site to the central station by next month.",
  "Evening concerts are scheduled on the south lawn through October, with free admission on opening weekend.",
  "Local schools will run ecology workshops using the new boardwalk classrooms starting in September.",
  "Retail kiosks along the east path open at noon with vendors selected through a city lottery.",
  "Accessibility ramps and tactile paving were audited twice after community feedback in the spring.",
  "A memorial grove for waterfront workers will be planted near Pier Gate before winter.",
  "Drone footage of the ribbon cutting will stream on the metro channel at 18:00 local time.",
  "Officials declined to comment on a second-phase extension north of the bridge until budgets clear.",
];

function newsBody(n) {
  const out = [">body-"];
  for (let i = 0; i < n; i++) out.push(`:${NEWS_PARAS[i]}`);
  return out;
}

const MATCH_EVENTS = [
  { min: 4, type: "foul", team: "away", note: "Midfield" },
  { min: 12, type: "shot", team: "home", note: "Saved" },
  { min: 18, type: "corner", team: "home", note: "Left" },
  { min: 23, type: "goal", team: "home", player: "Okada" },
  { min: 31, type: "yellow", team: "away", player: "Berg" },
  { min: 39, type: "shot", team: "away", note: "Wide" },
  { min: 45, type: "whistle", team: "ref", note: "HT" },
  { min: 51, type: "goal", team: "away", player: "Berg" },
  { min: 58, type: "sub", team: "home", note: "Nguyen on" },
  { min: 67, type: "shot", team: "home", note: "Blocked" },
  { min: 74, type: "corner", team: "away", note: "Right" },
  { min: 81, type: "yellow", team: "home", player: "Okada" },
  { min: 88, type: "goal", team: "home", player: "Nguyen" },
  { min: 90, type: "whistle", team: "ref", note: "FT" },
];

function matchEvents(n) {
  const out = [">events-"];
  for (let i = 0; i < n; i++) {
    const e = MATCH_EVENTS[i];
    const fields = { min: e.min, type: e.type, team: e.team };
    if (e.player) fields.player = e.player;
    if (e.note) fields.note = e.note;
    out.push(...arrObj(fields));
  }
  return out;
}

function matchTeams(homeScore, awayScore) {
  return [
    ">home",
    "name:East Harbor",
    `score:${homeScore}`,
    "<",
    ">away",
    "name:North Pier",
    `score:${awayScore}`,
    "<",
  ];
}

const CHAT_TURNS = [
  { role: "user", text: "Summarize today metro alerts for Line 2 and Line 7." },
  {
    role: "assistant",
    text: "Checking live desks and weather advisories…",
    status: "thinking",
  },
  {
    role: "assistant",
    text: "Line 2 delayed 8 minutes near City Hall. Line 7 normal. River ferry on wind advisory.",
    status: "done",
    citations: ["desk-metro", "desk-weather"],
  },
  { role: "user", text: "Any crowd control near the riverside park opening?" },
  {
    role: "assistant",
    text: "Yes — temporary barriers on Pier Gate from 16:00. Expect 20–30 min walks from Central Station.",
    status: "done",
    citations: ["desk-metro", "desk-parks"],
  },
  {
    role: "user",
    text: "Draft a short passenger notice in plain language.",
  },
  {
    role: "assistant",
    text: "Notice: Line 2 trains run 8 minutes behind near City Hall this evening. Line 7 is on time. If you are heading to the riverside park, use Pier Gate and allow extra walking time after 16:00.",
    status: "done",
  },
];

function chatMessages(n) {
  const out = [">messages-"];
  for (let i = 0; i < n; i++) {
    const m = CHAT_TURNS[i];
    const fields = { role: m.role, text: m.text };
    if (m.status) fields.status = m.status;
    out.push(...arrObj(fields));
    if (m.citations?.length) {
      // citations nested on last message object — still inside message after fields, before <
      // arrObj already closed with <. Rebuild manually for citations case.
    }
  }
  // Rebuild properly with citations inside message objects
  const rebuilt = [">messages-"];
  for (let i = 0; i < n; i++) {
    const m = CHAT_TURNS[i];
    rebuilt.push(">");
    rebuilt.push(`role:${m.role}`);
    rebuilt.push(`text:${m.text}`);
    if (m.status) rebuilt.push(`status:${m.status}`);
    if (m.citations?.length) {
      rebuilt.push(">citations-");
      for (const c of m.citations) rebuilt.push(`:${c}`);
      rebuilt.push("<");
    }
    rebuilt.push("<");
  }
  return rebuilt;
}

const PRODUCT_VARIANTS = [
  { sku: "TRX-8-BLK", size: 8, color: "Black", stock: 14 },
  { sku: "TRX-9-BLK", size: 9, color: "Black", stock: 3 },
  { sku: "TRX-9-OLV", size: 9, color: "Olive", stock: 7 },
  { sku: "TRX-10-BLK", size: 10, color: "Black", stock: 11 },
  { sku: "TRX-10-OLV", size: 10, color: "Olive", stock: 0 },
  { sku: "TRX-11-RED", size: 11, color: "Red", stock: 5 },
];

function productVariants(n, stockPatch = {}) {
  const out = [">variants-"];
  for (let i = 0; i < n; i++) {
    const v = { ...PRODUCT_VARIANTS[i] };
    if (stockPatch[v.sku] != null) v.stock = stockPatch[v.sku];
    out.push(...arrObj(v));
  }
  return out;
}

/** @type {StreamScenario[]} */
export const streamScenarios = [
  {
    id: "weather",
    title: "Weather card",
    titleZh: "天气卡片",
    env: "IoT / widget feed",
    envZh: "物联网小组件推送",
    blurb:
      "Many hourly phases: location → live metrics → rolling 7-day forecast with overwrites — feel cadence before `.` commits.",
    blurbZh:
      "多小时阶段：地点 → 实况指标 → 7 日预报滚动覆盖——感受 `.` 提交前的节拍。",
    size: "L",
    intensity: 4,
    accent: "#0a84ff",
    tags: ["forecast", "overwrite", "hourly"],
    wire: lines(
      phase(">card", "city:Shanghai", "unit:C", "source:metro-wx"),
      phase(
        ">card",
        ">now",
        "temp:26",
        "sky:Haze",
        "humidity:68",
        "wind:SE-3",
      ),
      phase(
        ">card",
        ">now",
        "temp:28",
        "sky:Cloudy",
        "humidity:72",
        "wind:SE-4",
        "aqi:64",
      ),
      phase(
        ">card",
        ">forecast-",
        ...arrObj({ day: "Tue", high: 30, low: 24, pop: 20 }),
        ...arrObj({ day: "Wed", high: 31, low: 25, pop: 40 }),
        ...arrObj({ day: "Thu", high: 29, low: 23, pop: 10 }),
      ),
      phase(
        ">card",
        ">forecast-",
        ...arrObj({ day: "Tue", high: 30, low: 24, pop: 20 }),
        ...arrObj({ day: "Wed", high: 31, low: 25, pop: 55 }),
        ...arrObj({ day: "Thu", high: 28, low: 22, pop: 35 }),
        ...arrObj({ day: "Fri", high: 27, low: 21, pop: 60 }),
        "<",
        ">alerts-",
        ":Heat advisory until 18:00",
        ":UV index high at noon",
      ),
      finalPhase(
        ">card",
        ">now",
        "temp:29",
        "sky:PartlyCloudy",
        "humidity:70",
        "wind:E-3",
        "aqi:58",
        ">forecast-",
        ...arrObj({ day: "Tue", high: 30, low: 24, pop: 15 }),
        ...arrObj({ day: "Wed", high: 32, low: 25, pop: 45 }),
        ...arrObj({ day: "Thu", high: 28, low: 22, pop: 30 }),
        ...arrObj({ day: "Fri", high: 27, low: 21, pop: 50 }),
        ...arrObj({ day: "Sat", high: 26, low: 20, pop: 70 }),
        ...arrObj({ day: "Sun", high: 27, low: 21, pop: 40 }),
        ...arrObj({ day: "Mon", high: 29, low: 23, pop: 20 }),
        "<",
        ">alerts-",
        ":Heat advisory until 18:00",
      ),
    ),
  },
  {
    id: "hotspot",
    title: "Trending hotspot",
    titleZh: "热点榜单",
    env: "Social / ranking feed",
    envZh: "社交热搜榜生成",
    blurb:
      "Board grows to 12 ranks across many phases, then a late heat reshuffle — later-wins pressure at scale.",
    blurbZh:
      "多阶段长到 12 名，末段热度重排——大规模 later-wins 压力。",
    size: "XL",
    intensity: 5,
    accent: "#ff9f0a",
    tags: ["ranking", "later-wins", "dense"],
    wire: lines(
      phase(">board", "title:Hot", "region:CN", "updated:12:01", "window:1h"),
      phase(">board", ...hotspotItems(2)),
      phase(">board", ...hotspotItems(4)),
      phase(">board", ...hotspotItems(6)),
      phase(">board", ...hotspotItems(8)),
      phase(">board", ...hotspotItems(10)),
      phase(">board", "updated:12:08", ...hotspotItems(12)),
      finalPhase(
        ">board",
        "updated:12:14",
        "note:heat-reshuffle",
        ">items-",
        ...arrObj({ rank: 1, topic: "City marathon finals", heat: 240 }),
        ...arrObj({ rank: 2, topic: "Museum night tickets", heat: 198 }),
        ...arrObj({ rank: 3, topic: "Harbor fireworks plan", heat: 176 }),
        ...arrObj({ rank: 4, topic: "New subway Line 14", heat: 161 }),
        ...arrObj({ rank: 5, topic: "Weekend rain alert", heat: 144 }),
        ...arrObj({ rank: 6, topic: "Food festival stalls", heat: 132 }),
        ...arrObj({ rank: 7, topic: "Campus open day", heat: 121 }),
        ...arrObj({ rank: 8, topic: "Stadium light show", heat: 110 }),
        ...arrObj({ rank: 9, topic: "River cleanup drive", heat: 98 }),
        ...arrObj({ rank: 10, topic: "Tech park ribbon cut", heat: 90 }),
        ...arrObj({ rank: 11, topic: "Bike share expansion", heat: 84 }),
        ...arrObj({ rank: 12, topic: "Library 24h pilot", heat: 77 }),
      ),
    ),
  },
  {
    id: "news",
    title: "Breaking news desk",
    titleZh: "突发新闻台",
    env: "Newsroom / article stream",
    envZh: "新闻编辑台流式成稿",
    blurb:
      "Long-form desk: headline, meta, lead, then 10 body paragraphs and tags across many phases.",
    blurbZh:
      "长稿编辑台：标题、元信息、导语，再经多阶段写出 10 段正文与标签。",
    size: "XL",
    intensity: 5,
    accent: "#ff453a",
    tags: ["longform", "narrative", "many-phases"],
    wire: lines(
      phase(
        ">story",
        "status:draft",
        "headline:Coastal city opens new riverside park",
      ),
      phase(
        ">story",
        "status:editing",
        ">meta",
        "desk:Metro",
        "byline:Li Wei",
        "editor:Chen Yu",
        "published:2026-08-03T06:10:00Z",
      ),
      phase(
        ">story",
        "lead:Local officials cut the ribbon on a 12-kilometer riverside park that reconnects downtown with the waterfront after a decade of cargo use.",
      ),
      phase(">story", ...newsBody(2)),
      phase(">story", ...newsBody(4)),
      phase(">story", ...newsBody(6)),
      phase(">story", ...newsBody(8)),
      phase(">story", ...newsBody(10)),
      finalPhase(
        ">story",
        "status:published",
        "wordCount:1280",
        ">tags-",
        ":city",
        ":parks",
        ":transit",
        ":environment",
        ":culture",
        ":waterfront",
        ":education",
      ),
    ),
  },
  {
    id: "product",
    title: "Product PDP",
    titleZh: "商品详情页",
    env: "Commerce / PDP generation",
    envZh: "电商详情页生成",
    blurb:
      "PDP shell fills media, six SKUs, then stock flips and copy blocks across phases.",
    blurbZh:
      "详情壳逐步填充媒体、六档 SKU，再经阶段翻写库存与文案。",
    size: "L",
    intensity: 4,
    accent: "#30d158",
    tags: ["commerce", "sku", "stock"],
    wire: lines(
      phase(
        ">product",
        "id:sku-2048",
        "name:Trail Runner X",
        "brand:Northline",
        "category:footwear",
      ),
      phase(">product", "price:129", "currency:USD", "rating:4.6"),
      phase(
        ">product",
        ">media-",
        ":hero-front",
        ":hero-side",
        ":detail-sole",
        ":detail-mesh",
        ":on-foot",
      ),
      phase(">product", ...productVariants(3)),
      phase(">product", ...productVariants(6)),
      phase(
        ">product",
        ...productVariants(6, { "TRX-9-BLK": 0, "TRX-10-OLV": 2 }),
      ),
      phase(
        ">product",
        ">copy",
        "tagline:Grip for wet trail miles",
        "care:Cold wash, air dry",
      ),
      finalPhase(
        ">product",
        "price:119",
        "promo:weekend",
        ...productVariants(6, {
          "TRX-9-BLK": 0,
          "TRX-10-OLV": 2,
          "TRX-11-RED": 1,
        }),
        "<",
        ">bullets-",
        ":Vibram-style outsole",
        ":Recycled upper yarn",
        ":Reflective heel tab",
        ":Wide toe box option",
      ),
    ),
  },
  {
    id: "chat",
    title: "Assistant dialogue",
    titleZh: "助手对话",
    env: "Chat / tool-aware reply",
    envZh: "对话助手流式回复",
    blurb:
      "Multi-turn session: seven messages with thinking states and citations across phases.",
    blurbZh:
      "多轮会话：七条消息，含思考态与引用，跨多个 phase。",
    size: "L",
    intensity: 4,
    accent: "#bf5af2",
    tags: ["chat", "turns", "citations"],
    wire: lines(
      phase(">session", "id:c-991", "model:demo-stream", "locale:en"),
      phase(">session", ...chatMessages(1)),
      phase(">session", ...chatMessages(2)),
      phase(">session", ...chatMessages(3)),
      phase(">session", ...chatMessages(4)),
      phase(">session", ...chatMessages(5)),
      phase(">session", ...chatMessages(6)),
      finalPhase(
        ">session",
        "status:idle",
        ...chatMessages(7),
        "<",
        ">tools-",
        ":metro-desk",
        ":weather-desk",
        ":parks-desk",
      ),
    ),
  },
  {
    id: "match",
    title: "Live match ticker",
    titleZh: "赛况直播条",
    env: "Sports / live ticker",
    envZh: "体育赛况直播推送",
    blurb:
      "Dense live ticker: scoreboard + 14 event ticks. Teams left before events so structure stays correct.",
    blurbZh:
      "高密度直播：记分板 + 14 条事件。先离开球队再写 events，结构正确。",
    size: "XL",
    intensity: 5,
    accent: "#64d2ff",
    tags: ["live", "dense", "scoreboard"],
    wire: lines(
      phase(
        ">match",
        "id:m-7781",
        "league:Premier Demo",
        "clock:00:00",
        "status:KO",
        ...matchTeams(0, 0),
      ),
      phase(
        ">match",
        "clock:04:12",
        ...matchTeams(0, 0),
        ...matchEvents(1),
      ),
      phase(
        ">match",
        "clock:12:04",
        ...matchTeams(0, 0),
        ...matchEvents(2),
      ),
      phase(
        ">match",
        "clock:18:40",
        ...matchTeams(0, 0),
        ...matchEvents(3),
      ),
      phase(
        ">match",
        "clock:23:41",
        ...matchTeams(1, 0),
        ...matchEvents(4),
      ),
      phase(
        ">match",
        "clock:31:05",
        ...matchTeams(1, 0),
        ...matchEvents(5),
      ),
      phase(
        ">match",
        "clock:39:22",
        ...matchTeams(1, 0),
        ...matchEvents(6),
      ),
      phase(
        ">match",
        "clock:45:00",
        "status:HT",
        ...matchTeams(1, 0),
        ...matchEvents(7),
      ),
      phase(
        ">match",
        "clock:51:18",
        "status:2H",
        ...matchTeams(1, 1),
        ...matchEvents(8),
      ),
      phase(
        ">match",
        "clock:58:03",
        ...matchTeams(1, 1),
        ...matchEvents(9),
      ),
      phase(
        ">match",
        "clock:67:44",
        ...matchTeams(1, 1),
        ...matchEvents(10),
      ),
      phase(
        ">match",
        "clock:74:11",
        ...matchTeams(1, 1),
        ...matchEvents(11),
      ),
      phase(
        ">match",
        "clock:81:29",
        ...matchTeams(1, 1),
        ...matchEvents(12),
      ),
      phase(
        ">match",
        "clock:88:06",
        ...matchTeams(2, 1),
        ...matchEvents(13),
      ),
      finalPhase(
        ">match",
        "clock:90:00",
        "status:FT",
        ...matchTeams(2, 1),
        ...matchEvents(14),
      ),
    ),
  },
];

export function getScenario(id) {
  return streamScenarios.find((s) => s.id === id) ?? streamScenarios[0];
}

export function wireStats(wire) {
  const chars = wire.length;
  const lines = wire.split(/\r?\n/).length;
  const phases = (wire.match(/(^|\n)\.(?=\n|$)/g) || []).length + 1;
  return { chars, lines, phases };
}
