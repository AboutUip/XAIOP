# 文档隔离

[English](SEPARATION.md) · [简体中文](SEPARATION.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-SEP` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** — 文档架构 |

---

## 1. 三层，一条线

| 层 | 路径 | 负责 | 不负责 |
| --- | --- | --- | --- |
| **协议** | [protocol/](protocol/) | 线文法与语义（Frozen v0.4.0）— **游标 IR** | Skill、HTTP/SSE/WS 配方、包 API、LLM 评测叙事 |
| **实践** | [practice/](practice/) | 线所支撑的写者配方：**模型发射**、**流式传输**、会话 | 新的线含义；把某语言方法名写成规范 |
| **SDK** | [sdk/](sdk/) + `xaiop-sdk/` | 各语言 parse / encode / stream **API**；第三方对等见 [行为契约](sdk/behavioral-contract.zh-CN.md) | 重定义 Label / later-wins / Block 规则 |

```text
┌──────────────────────────────┐
│ 协议 — Frozen 游标 IR 线格式 │
└──────────────┬───────────────┘
               │ 使能
┌──────────────▼───────────────┐
│ 实践 — 写者 · 传输           │
└──────────────┬───────────────┘
               │ 由实现落地
┌──────────────▼───────────────┐
│ SDK — 物化 / encode / WS     │
└──────────────────────────────┘
```

产品立场（信息性）：[overview/positioning.zh-CN.md](overview/positioning.zh-CN.md)。

---

## 2. Notes 放哪里

| 树 | 范围 |
| --- | --- |
| [protocol/notes/](protocol/notes/) | 仅线格式清单（与语言无关） |
| [practice/](practice/) | 模型发射 + 网络流式（产品怎么做） |
| [sdk/notes/](sdk/notes/) · [sdk/nodejs/notes/](sdk/nodejs/notes/) | 实现 Diff 边界、encode、慎重调整 |

**规则：** 协议不写 SDK 方法名；实践不改 Frozen；SDK 不发明线算子。

---

## 3. 冲突

实践/SDK 与 Frozen 冲突 → **协议优先**。更粗的 Diff 边界写在 SDK（实践可摘要）。兼容模式 = SDK 摄入。

---

## 4. 快捷入口

| 需求 | 去向 |
| --- | --- |
| 定位 | [overview/positioning.zh-CN.md](overview/positioning.zh-CN.md) |
| 文法 | [protocol/syntax.zh-CN.md](protocol/syntax.zh-CN.md) |
| 线坑点 | [protocol/notes/](protocol/notes/) |
| 模型输出 | [practice/model-output.zh-CN.md](practice/model-output.zh-CN.md) |
| 流式传输 | [practice/streaming-transport.zh-CN.md](practice/streaming-transport.zh-CN.md) |
| Node SDK | [sdk/nodejs/](sdk/nodejs/) |
| 第三方 SDK 对等 | [sdk/behavioral-contract.zh-CN.md](sdk/behavioral-contract.zh-CN.md) |
