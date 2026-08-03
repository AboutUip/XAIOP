# 实践 — 模型输出

[English](model-output.md) · [简体中文](model-output.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PRACTICE-MODEL` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** |

线含义权威：[../protocol/](../protocol/)。  
本文写 **生成端（多为 LLM）在产品里应如何发出** 该线格式。

---

## 1. 角色分工

| 角色 | 职责 |
| --- | --- |
| **模型 / Generator** | 发出良构 XAIOP 行（游标动作 + Content） |
| **Parser / SDK** | 行 → JSON（默认严格） |
| **应用** | 消费 Snapshot / Diff / 终态 JSON |

不要让模型「又写 JSON 括号又假装 XAIOP」。一份 Skill；用符合实现解析。

本仓库 Skill：[../../skills/xaiop/](../../skills/xaiop/) · [../../skills/xaiop-allowlist/](../../skills/xaiop-allowlist/)

---

## 2. 模型必须做对的事

清单见协议 notes（此处不重定义）：[../protocol/notes/wire-attention.zh-CN.md](../protocol/notes/wire-attention.zh-CN.md)。

渐进 UI 常用写法：开根 `>` → 写完一段顶层 → 需要中途更新时打 `.` → 从 Root 再进入 → **同一命名数组不要跨 `.` 再开**（再开是替换）。

---

## 3. 评测 vs 工具

| 场景 | 规则 |
| --- | --- |
| LLM **指标**评测 | 原生双通道；禁止用 JSON→XAIOP 转写计分（[../performance.zh-CN.md](../performance.zh-CN.md)） |
| **工具 / 测试 / 适配** | 可用 SDK `encode`；不能代替评测通道 |

---

## 4. 兼容模式

仅为**摄入**侧恢复；不是允许模型发非法线。优先改 Skill / 提示。

---

## 5. 相关

- 定位：[../overview/positioning.zh-CN.md](../overview/positioning.zh-CN.md)  
- 流式传输：[streaming-transport.zh-CN.md](streaming-transport.zh-CN.md)  
- 协议流式：[../protocol/streaming.zh-CN.md](../protocol/streaming.zh-CN.md)
