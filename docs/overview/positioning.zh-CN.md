# 定位说明 — XAIOP 是什么

[English](positioning.md) · [简体中文](positioning.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `OV-POS` |
| 状态 | 说明性（Informative） |
| 版本 | 0.2.0 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** — 产品定位与证据叙事 |
| 依赖 | `OV-INTRO`, `OV-PRIN`, `PERF-METRICS` |
| 相关 | [performance.zh-CN.md](../performance.zh-CN.md) · [introduction.zh-CN.md](introduction.zh-CN.md) |

---

## 1. 它是什么

XAIOP 是一套按行的**游标构造**协议。

写者发出进入 / 回退 / 定位 / 重置指令。程序把该序列**确定性物化**为 JSON —— 含中途 **`.` 相位**（SDK 表面上的 Snapshot / Diff）。

**一句话：** 写者走游标；软件持有树。

它**不是**服务间 JSON 总线，而是从*增量构造*走到*可消费 JSON*的桥。

---

## 2. 两层

| 层 | 负责 | 谁 |
| --- | --- | --- |
| **线 IR** | 游标算子、later-wins、相位重置、诚实解析（默认不静默修复） | 任何符合规范的写者 |
| **产品楔子** | 一次性完整树易失败的不可靠或增量写者 | LLM（首发证据）；亦含 `encode`、骨架 WS 推送 |

线含义属 Frozen 协议。产品 API（流式 Diff 边界、兼容摄入、WS 会话）在 SDK / 实践 — [../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)。

```text
写者（LLM · 工具 · WS 推送）
        │
        ▼
   XAIOP 线（游标 IR）
        │
        ▼
   SDK / 解析器（物化 · 相位）
        │
        ▼
   JSON Snapshot / Diff → 应用
```

---

## 3. 生成端楔子 — 已验证的 LLM 证据

一次性 JSON/XML 要求全局正确的完整结构——括号与深度的**记忆**考验。在该楔子上，XAIOP 把 **记忆 → 逻辑**（局部下一步游标）。

七场真实基准（GPT-5.6-terra / Gemini-3.6-flash / DeepSeek-v4，原生 + 兼容）显示：

**结构收益与模型自身 JSON 能力成反比。**

| 模型画像 | 观察到的规律 |
| --- | --- |
| JSON 基线较弱（如 GPT） | 结构成功率提升更大（原生 **+23.8 pp**；部分任务 **0% → 100%**），成本相对可控 |
| JSON 基线很强（如 DeepSeek） | 提升趋近 **零**；token 可多 **2–3×**，延迟 **3×+** |

这不是「XAIOP 永远碾压 JSON」，而是生成端楔子的有条件工程结论。正式指标：[performance.zh-CN.md](../performance.zh-CN.md)。截图：[`resources/`](../../resources/)。

---

## 4. 超出 LLM Skill 的产品面

同一条线也支撑非 LLM 写者与渐进交付：

| 表面 | 作用 |
| --- | --- |
| SDK `encode` | 工具 / 适配器发出严格线文本，用于测试与流式 |
| `XaiopStream` / `.` checkpoint | 中途相位 Diff + 已提交 / 最终 Snapshot |
| `XaiopWs` 骨架会话 | 固定键相位经 WebSocket 推送 |
| 实践传输 | HTTP / SSE / WS / RAW 分帧配方 |

这些是**一等产品路径**，不是「帮模型写 JSON」的副作用。第三方对等：[../sdk/behavioral-contract.zh-CN.md](../sdk/behavioral-contract.zh-CN.md)。

---

## 5. 协议设计范围外的瓶颈

在 LLM 楔子上，高压下模型还会**不想守轨**（超长输出、深嵌套）：退回 JSON/YAML 习惯，或在协议内选更脆的写法。这是指令遵循纪律问题——单靠格式设计解决不了。

---

## 6. 当前立场

| 定位范围内 | 不主张 / 不替代 |
| --- | --- |
| 渐进结构化流（游标 IR → 物化 → Snapshot/Diff） | 用 XAIOP 替代服务间 JSON |
| 生成 / 增量写者（LLM 楔子 + 已公布的有条件收益） | 「永远更省 token / 更快」 |
| 如实公开弱收益甚至倒退的 LLM 场景 | 「全面碾压 JSON」 |
| 同一条线上的工具与会话写者 | 把 XAIOP 仅当作 AI 提示词格式 |

→ [引言](introduction.zh-CN.md) · [设计原则](design-principles.zh-CN.md) · 根目录 [README.zh-CN.md](../../README.zh-CN.md)
