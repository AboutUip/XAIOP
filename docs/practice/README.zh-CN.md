# 实践 — 协议实际可做什么

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PRACTICE-INDEX` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** |

**不是协议。** 本树描述 Frozen **游标 IR** 线格式的**实际用法**：写者如何发射（模型、工具）、应用如何流式与会话推送。文法见 [../protocol/](../protocol/)；运行时 API 见 [../sdk/](../sdk/)。立场：[../overview/positioning.zh-CN.md](../overview/positioning.zh-CN.md)。

架构：[../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)


---

## 指南

| 指南 | 主题 |
| --- | --- |
| [model-output.zh-CN.md](model-output.zh-CN.md) | LLM / 生成端输出 — Skill、相位、常见错误 |
| [streaming-transport.zh-CN.md](streaming-transport.zh-CN.md) | 网上流式传数据 — 分帧、实践中的 Snapshot/Diff |
| [skeleton-stream.zh-CN.md](skeleton-stream.zh-CN.md) | WebSocket 固定键骨架/模块流（推完即丢） |

---

## 速查

```text
协议      →  文本含义（游标 IR）
实践      →  写者配方 · 流式传输（本树）
SDK       →  某语言的物化 / encode / 客户端 API
```

| 需求 | 去向 |
| --- | --- |
| 行文法 | [../protocol/syntax.zh-CN.md](../protocol/syntax.zh-CN.md) |
| 线格式清单 | [../protocol/notes/](../protocol/notes/) |
| 教写者（模型） | [model-output.zh-CN.md](model-output.zh-CN.md) · [../../skills/](../../skills/) |
| 字节流 → JSON | [streaming-transport.zh-CN.md](streaming-transport.zh-CN.md) |
| 骨架 WS 推送 | [skeleton-stream.zh-CN.md](skeleton-stream.zh-CN.md) |
| Node.js API | [../sdk/nodejs/](../sdk/nodejs/) |
