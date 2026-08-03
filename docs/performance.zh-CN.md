# 性能评测（指标说明）

[English](performance.md) · [简体中文](performance.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PERF-METRICS` |
| 状态 | 说明性（Informative） |
| 最近更新 | 2026-08-03 |
| 是否规范性 | **否** — 评测口径与已发布快照 |
| 依赖 | 协议 Frozen v0.2.0 · Node.js SDK 兼容模式 |

---

## 1. 目的

说明 **如何度量**「LLM 结构化输出」场景下 XAIOP 相对 JSON 的表现，并指向一份可供教学与外部审阅的 **指标快照**。

本文 **不** 改写线协议；文法仍以 [protocol/](../protocol/) 为准。

---

## 2. 测什么（定义）

| 指标 | 定义 |
| --- | --- |
| **结构成功** | 合格（非空补全）**且** HTTP 成功 **且**（`JSON.parse` 成功 **或** `XaiopEngine.parseSync(text, compatibilityMode)` 成功） |
| **结构成功率** | `structSuccess / (structSuccess + structFail)` — **不含** `networkSkip` |
| **networkSkip** | HTTP 成功但补全正文为空 → 视为网关/网络问题；**不计入**结构成功率分母 |
| **token / 延迟 / 体积均值** | **仅对结构成功轮**取平均 |
| **XAIOP 公平 prompt / total** | 对比用的 prompt token **剔除 Skill 正文**，只计短 emit system + 任务 user；API 原值见源 bench 的 `*_api` |
| **gains.\*_pct** | 相对 JSON：`(json_mean - xaiop_mean) / json_mean * 100` — **正值 ⇒ XAIOP 更优**（更少 token / 字符 / 耗时） |
| **speed_ratio** | `json_ms_mean / xaiop_ms_mean` — **>1 ⇒ XAIOP 更快** |

### 保证准确性的约束

1. **原生双通道** — 在 **LLM 评测指标**中，JSON 与 XAIOP 各自生成；评测**不得**在事后把 JSON 转写成 XAIOP 再计分。  
   *（Node.js SDK **提供** `encode` / `uploadJson`，供工具、测试与适配使用 — 见 [sdk/nodejs/encode.zh-CN.md](./sdk/nodejs/encode.zh-CN.md)。该 API 不计入上述双通道模型得分。）*  
2. **同一任务描述**（格式中立正文 + 分模式输出尾注）。  
3. XAIOP 的 Skill 在 **system**（非 user）；预热不计入任务轮计时。  
4. 结构校验是否开启 **兼容模式** 在快照中写明。  
5. 多轮任务 artifact 可能只保留 **最后一次成功体**；失败轮正文不一定落盘 — 失败原因以指标包中的 `structErrors` 为准。

---

## 3. 已发布快照（GPT + Gemini · 兼容模式）

| 文件 | 作用 |
| --- | --- |
| [`metrics/bench-metrics-gpt-gemini-compat-2026-08-02.json`](./metrics/bench-metrics-gpt-gemini-compat-2026-08-02.json) | 完整指标（无模型原始正文） |
| [`metrics/bench-metrics-gpt-gemini-compat-2026-08-02.md`](./metrics/bench-metrics-gpt-gemini-compat-2026-08-02.md) | 教学向字段导读 |

### 结构成功率一览

| Run | 模型 | Skill | JSON | XAIOP | 差（百分点） |
| --- | --- | --- | --- | --- | --- |
| `gpt_xaiop_compat` | GPT-5.6 Terra | `xaiop` | 86.1% | **94.4%** | +8.3 |
| `gpt_allowlist_compat` | GPT-5.6 Terra | `xaiop-allowlist` | 80.6% | **88.9%** | +8.3 |
| `gemini_xaiop_compat` | Gemini 3.6 Flash | `xaiop` | 91.7% | **97.2%** | +5.5 |
| `gemini_allowlist_compat` | Gemini 3.6 Flash | `xaiop-allowlist` | 91.7% | **100%** | +8.3 |

### 本快照中 XAIOP 最明显的增益

- **DEEPWIDE**：四场均为 JSON **0%** / XAIOP **100%**（深嵌套 JSON 未闭合括号）。  
- 长输出、脏字符串、截断类任务上 JSON 更易挂；XAIOP **按行**、无需括号配对。  
- XAIOP **不是零成本**：GPT 长输出可能尾部脏 Label；STREAM（强制低 `max_tokens`）两侧都可能失败。

### 效率（两侧都成功时）

- **字符数**：XAIOP 通常更短。  
- **补全 token**：不稳定 — **不要**宣称「总是更省 token」；请看 JSON 里分任务 `gains`。

可用指标 JSON 的 `comparison_matrix` 自行画图。

---

## 4. 截图图例

终端/套件截图在 [`resources/`](../../resources/)。本快照四场（兼容模式）对应：

| Run id | 图片 |
| --- | --- |
| `gpt_allowlist_compat` | [ChatGPT · 兼容 · 白名单 Skill](../../resources/ChatGPT模型对于XAIOP兼容模式的白名单SKILL测试.png) |
| `gpt_xaiop_compat` | [ChatGPT · 兼容 · 经典 Skill](../../resources/ChatGPT模型对于XAIOP兼容模式的非白名单SKILL测试.png) |
| `gemini_allowlist_compat` | [Gemini · 兼容 · 白名单 Skill](../../resources/Gemini模型对于XAIOP兼容模式的白名单SKILL测试.png) |
| `gemini_xaiop_compat` | [Gemini · 兼容 · 经典 Skill](../../resources/Gemini模型对于XAIOP兼容模式的非白名单SKILL测试.png) |

相关但未纳入本四场导出的截图（原生模式 / DeepSeek）见指标 JSON 的 `resources.related_screenshots_not_in_this_export`。

---

## 5. 适用性（本证据支持什么）

| 适用 | 本套件不能直接主张 |
| --- | --- |
| LLM → 应用 的结构化抽取，尤其 JSON 括号易坏的场景 | 用 XAIOP 替代服务间 JSON |
| 深/宽树、脏串、长剧本（配合 Skill + 可选兼容解析） | 「补全 token 一定比 JSON 少」 |
| 教学/演示：可复现的 **指标包** | 无相同网关模型时的字节级复现 |

**产品定位：** 收益**取决于模型能力画像**（JSON 基线越弱，结构提升往往越大；JSON 已经很强时，结构提升可能趋近于零，但成本更高）。完整叙事——问题定义、七场基准规律、协议外瓶颈、当前立场：见 **[overview/positioning.zh-CN.md](overview/positioning.zh-CN.md)**。

Skill：[`skills/xaiop/`](../../skills/xaiop/) · [`skills/xaiop-allowlist/`](../../skills/xaiop-allowlist/)。
