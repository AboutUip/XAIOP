import { computed, ref } from "vue";

const STORAGE_KEY = "xaiop-docs-locale";

/** @typedef {"en" | "zh"} Locale */

/** @returns {Locale} */
export function readLocale() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "zh") return v;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined") {
    const lang = (navigator.language || "").toLowerCase();
    if (lang.startsWith("zh")) return "zh";
  }
  return "en";
}

/** @param {Locale} locale */
export function persistLocale(locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

/** @param {Locale} locale */
export function applyDocumentLocale(locale) {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
}

const messages = {
  en: {
    "nav.docs": "Documentation",
    "nav.overview": "Overview",
    "nav.protocol": "Protocol",
    "nav.api": "API Reference",
    "nav.try": "Try it",
    "nav.primary": "Primary",
    "theme.system": "Theme: System",
    "theme.light": "Theme: Light",
    "theme.dark": "Theme: Dark",
    "lang.label": "Language",
    "lang.en": "English",
    "lang.zh": "中文",
    "shell.onSite": "On this site",
    "shell.onPage": "On this page",
    "shell.contents": "Contents",

    "home.eyebrow": "Developer documentation",
    "home.thesis":
      "Build structured output by walking a Cursor — not by assembling a full JSON tree in one shot.",
    "home.browseApis": "Browse APIs",
    "home.protocolRef": "Protocol reference",
    "home.protocolTitle": "Protocol",
    "home.protocolBody":
      "Frozen {version} wire grammar. {count} core line forms with browsable semantics and samples.",
    "home.exploreOps": "Explore operators →",
    "home.sdkTitle": "SDK",
    "home.sdkBody":
      "Node.js is the reference implementation; Java / Python are placeholders. Searchable, grouped API catalog.",
    "home.openApi": "Open API reference →",
    "home.tryTitle": "Try it",
    "home.tryBody":
      "Parse XAIOP wire in the browser, or simulate streaming chunk arrival against the real checkpoint engine.",
    "home.openPlay": "Open playground →",
    "home.stacks": "SDK stacks",
    "stack.active": "Active",
    "stack.pending": "Pending",

    "protocol.title": "Protocol reference",
    "protocol.lead":
      "Frozen v0.4.0 wire grammar. Select an operator for semantics and a minimal sample. Authoritative text remains in docs/protocol.",
    "protocol.example": "Example",

    "sdk.title": "{name} API reference",
    "sdk.leadActive":
      "Aligned with xaiop-sdk/nodejs and docs/sdk/nodejs. Browseable, searchable signatures — Microsoft Learn–style reference layout.",
    "sdk.leadPending":
      "Updates after the Node.js surface stabilizes. Placeholder for now.",
    "sdk.source": "Source of truth",
    "sdk.search": "Search APIs",
    "sdk.searchPh": "Filter by name, signature, or description",
    "sdk.colApi": "API",
    "sdk.colSig": "Signature",
    "sdk.colRet": "Returns",
    "sdk.viewNode": "View Node.js reference",
    "sdk.docs": "Docs",
    "sdk.code": "Code",

    "play.title": "Try it",
    "play.lead":
      "Simulate chunked network arrival with the real DotCheckpointEngine. Watch HTML preview grow, step chunks for debugging, and inspect phase diffs.",
    "play.tabStream": "Stream lab",
    "play.tabStatic": "Static parse",
    "play.scenarios": "Scenarios",
    "play.transport": "Transport",
    "play.live": "Live panes",
    "play.history": "History",
    "play.samples": "Samples",
    "play.editor": "Editor",
    "play.envTitle": "Generation environments",
    "play.envLead":
      "Each scenario mimics a different generation setting and payload size. View opens full wire / phases / final JSON.",
    "play.view": "View",
    "play.select": "Select",
    "play.selected": "Selected",
    "play.chars": "chars",
    "play.phases": "phases",
    "play.intensity": "Intensity {n}/5",
    "play.play": "Play",
    "play.resume": "Resume",
    "play.pause": "Pause",
    "play.reset": "Reset",
    "play.step": "Step",
    "play.arm": "Arm",
    "play.delay": "Chunk delay",
    "play.delayUnit": "s",
    "play.chunk": "Chunk size",
    "play.elapsed": "Elapsed",
    "play.chunks": "Chunks",
    "play.bytes": "Bytes",
    "play.throughput": "Throughput",
    "play.ribbon": "Phase ribbon",
    "play.ribbonEmpty": "Phases light up as `.` boundaries resolve",
    "play.preview": "Live preview",
    "play.debug": "Debug",
    "play.wire": "Wire (received)",
    "play.lastChunk": "Last chunk",
    "play.phaseDiff": "Phase diff JSON",
    "play.rawJson": "Raw JSON",
    "play.latest": "Latest",
    "play.historyN": "History #{n}",
    "play.finalJson": "Final JSON",
    "play.liveCum": "Committed JSON (at `.`)",
    "play.waitingPhase": "— waiting for first `.` phase —",
    "play.runToEnd": "— run to completion —",
    "play.histTitle": "History & final",
    "play.histLead":
      "Click a phase to inspect its diff; the final snapshot stays on the right.",
    "play.histEmpty": "No phases yet — press Play or Step.",
    "play.finalSnap": "Final snapshot",
    "play.source": "Source",
    "play.result": "Result",
    "play.parse": "Parse",
    "play.stepHint":
      "Step releases one network chunk. UI/JSON bind only when a `.` phase completes (or EOF).",
    "play.phaseGate": "Shell + JSON update only after `.` (or stream end)",
    "play.openLive": "Full live stream",
    "play.openLiveLead":
      "Open a fullscreen ops board fed by a real Node BFF streaming XAIOP under 1G–5G throttling (10k–100k+ leaves).",

    "live.pickTitle": "Choose network environment",
    "live.pickLead":
      "The mock BFF streams a production-scale XAIOP document. Throughput, RTT, jitter, and frame size follow the selected generation.",
    "live.network": "Network",
    "live.scale": "Payload scale",
    "live.leaves": "leaves",
    "live.eta": "Estimated transfer",
    "live.payload": "Payload",
    "live.slowWarn":
      "This combination may take several minutes. Prefer Lab scale on 1G/2G, or pick a faster network.",
    "live.cancel": "Cancel",
    "live.enter": "Enter fullscreen",
    "live.title": "XAIOP live board",
    "live.exit": "Exit",
    "live.stop": "Stop",
    "live.restart": "Restart",
    "live.phases": "Phases",
    "live.throughput": "Throughput",

    "render.empty": "No structured data yet — Arm, then Play or Step.",
    "render.building": "Structure still forming…",
    "render.shellBanner": "App shell mounted · binds only at `.` phases",
    "render.unknownShell": "No shell registered for this scenario.",

    "modal.close": "Close",
    "modal.use": "Use in simulator",
    "modal.wire": "XAIOP wire",
    "modal.final": "Final JSON",
    "modal.phaseDiffs": "Phase diffs ({n})",
    "modal.phase": "Phase {n}",
    "modal.size": "Size {s}",
    "modal.lines": "lines",
    "modal.intensityChip": "Intensity {n}/5",
  },
  zh: {
    "nav.docs": "文档",
    "nav.overview": "概览",
    "nav.protocol": "协议",
    "nav.api": "API 参考",
    "nav.try": "试用",
    "nav.primary": "主导航",
    "theme.system": "主题：跟随系统",
    "theme.light": "主题：浅色",
    "theme.dark": "主题：深色",
    "lang.label": "语言",
    "lang.en": "English",
    "lang.zh": "中文",
    "shell.onSite": "本站目录",
    "shell.onPage": "本页",
    "shell.contents": "目录",

    "home.eyebrow": "开发者文档",
    "home.thesis": "用 Cursor 走路构建结构化输出——不是一次拼完整 JSON。",
    "home.browseApis": "浏览 API",
    "home.protocolRef": "协议参考",
    "home.protocolTitle": "协议",
    "home.protocolBody":
      "Frozen {version} 线文法。{count} 个核心行形式，可浏览语义与样例。",
    "home.exploreOps": "浏览算子 →",
    "home.sdkTitle": "SDK",
    "home.sdkBody":
      "Node.js 为权威实现；Java / Python 占位待更新。API 目录可搜索、可分组预览。",
    "home.openApi": "打开 API 参考 →",
    "home.tryTitle": "试用",
    "home.tryBody":
      "浏览器内解析 XAIOP 线文，或模拟分块到达，对照真实 checkpoint 引擎的覆盖语义。",
    "home.openPlay": "打开试用台 →",
    "home.stacks": "SDK 栈",
    "stack.active": "进行中",
    "stack.pending": "待更新",

    "protocol.title": "协议参考",
    "protocol.lead":
      "Frozen v0.4.0 线文法。选择算子查看语义与最小样例。权威条文仍以 docs/protocol 为准。",
    "protocol.example": "示例",

    "sdk.title": "{name} API 参考",
    "sdk.leadActive":
      "与 xaiop-sdk/nodejs 与 docs/sdk/nodejs 对齐。签名可浏览、可搜索；结构参考 Microsoft Learn 参考页。",
    "sdk.leadPending": "对齐 Node.js 稳定后更新。当前为占位。",
    "sdk.source": "权威来源",
    "sdk.search": "搜索 API",
    "sdk.searchPh": "按名称、签名或描述过滤",
    "sdk.colApi": "API",
    "sdk.colSig": "签名",
    "sdk.colRet": "返回",
    "sdk.viewNode": "查看 Node.js 参考",
    "sdk.docs": "文档",
    "sdk.code": "代码",

    "play.title": "试用",
    "play.lead":
      "用真实 DotCheckpointEngine 模拟分块到达。观看 HTML 预览生长，单步调试数据块，并检查 phase diff。",
    "play.tabStream": "流式实验室",
    "play.tabStatic": "静态解析",
    "play.scenarios": "方案",
    "play.transport": "传输控制",
    "play.live": "实时面板",
    "play.history": "历史",
    "play.samples": "样例",
    "play.editor": "编辑器",
    "play.envTitle": "生成环境",
    "play.envLead":
      "每个方案模拟不同生成场景与体量。View 查看完整线文 / phase / 终态。",
    "play.view": "查看",
    "play.select": "选择",
    "play.selected": "已选",
    "play.chars": "字符",
    "play.phases": "阶段",
    "play.intensity": "强度 {n}/5",
    "play.play": "播放",
    "play.resume": "继续",
    "play.pause": "暂停",
    "play.reset": "重置",
    "play.step": "单步",
    "play.arm": "装载",
    "play.delay": "分块延迟",
    "play.delayUnit": "秒",
    "play.chunk": "分块大小",
    "play.elapsed": "耗时",
    "play.chunks": "块数",
    "play.bytes": "字节",
    "play.throughput": "吞吐",
    "play.ribbon": "阶段色带",
    "play.ribbonEmpty": "遇到 `.` 边界时阶段会点亮",
    "play.preview": "实时预览",
    "play.debug": "调试",
    "play.wire": "线文（已接收）",
    "play.lastChunk": "上一数据块",
    "play.phaseDiff": "阶段 Diff JSON",
    "play.rawJson": "原始 JSON",
    "play.latest": "最新",
    "play.historyN": "历史 #{n}",
    "play.finalJson": "最终 JSON",
    "play.liveCum": "已提交 JSON（遇 `.`）",
    "play.waitingPhase": "— 等待第一个 `.` 阶段 —",
    "play.runToEnd": "— 播放至结束 —",
    "play.histTitle": "历史与终态",
    "play.histLead": "点击阶段回看当时的 phase diff；右侧固定最终快照。",
    "play.histEmpty": "尚未产生 phase — 按下播放或单步。",
    "play.finalSnap": "最终快照",
    "play.source": "源文",
    "play.result": "结果",
    "play.parse": "解析",
    "play.stepHint":
      "单步每次释放一个网络数据块；UI/JSON 仅在 `.` 阶段完成（或 EOF）时绑定。",
    "play.phaseGate": "壳与 JSON 仅在 `.`（或流结束）后更新",
    "play.openLive": "全量实时流",
    "play.openLiveLead":
      "进入全屏运维看板：由 Node BFF 以真实 XAIOP 流式下发，并按 1G–5G 节流（约 1 万～10 万+ 叶子字段）。",

    "live.pickTitle": "选择网络环境",
    "live.pickLead":
      "模拟 BFF 将流式下发生产级 XAIOP 文档。吞吐、RTT、抖动与帧大小按所选移动网络代数设定。",
    "live.network": "网络",
    "live.scale": "数据规模",
    "live.leaves": "叶子字段",
    "live.eta": "预计传输",
    "live.payload": "载荷",
    "live.slowWarn":
      "此组合可能需要数分钟。1G/2G 建议选实验室规模，或换更快网络。",
    "live.cancel": "取消",
    "live.enter": "进入全屏",
    "live.title": "XAIOP 实时看板",
    "live.exit": "退出",
    "live.stop": "停止",
    "live.restart": "重新开始",
    "live.phases": "阶段",
    "live.throughput": "吞吐",

    "render.empty": "尚无结构化数据 — 先装载，再播放或单步。",
    "render.building": "结构仍在形成…",
    "render.shellBanner": "应用壳已挂载 · 仅在 `.` 阶段绑定",
    "render.unknownShell": "该方案尚未注册预览壳。",

    "modal.close": "关闭",
    "modal.use": "用于模拟",
    "modal.wire": "XAIOP 线文",
    "modal.final": "最终 JSON",
    "modal.phaseDiffs": "阶段 Diff（{n}）",
    "modal.phase": "阶段 {n}",
    "modal.size": "体量 {s}",
    "modal.lines": "行",
    "modal.intensityChip": "强度 {n}/5",
  },
};

/** @type {import('vue').Ref<Locale>} */
export const locale = ref(readLocale());

/**
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
export function t(key, vars) {
  const table = messages[locale.value] || messages.en;
  let text = table[key] ?? messages.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/** Pick bilingual catalog field by current locale. */
export function pick(en, zh) {
  return locale.value === "zh" ? zh : en;
}

/** @param {Locale} next */
export function setLocale(next) {
  if (next !== "en" && next !== "zh") return;
  locale.value = next;
  persistLocale(next);
  applyDocumentLocale(next);
}

export function toggleLocale() {
  setLocale(locale.value === "zh" ? "en" : "zh");
}

export function useI18n() {
  const isZh = computed(() => locale.value === "zh");
  return {
    locale,
    isZh,
    t,
    pick,
    setLocale,
    toggleLocale,
  };
}
