# 实践 — 建议使用场景

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PRACTICE-INDEX` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-04 |
| 规范性 | **否** |

**建议使用场景** — 不是协议。网络分帧、会话推送属于本树；**不**重定义线格式。  
LLM 发射 / 评测口径已**目标封存**：[../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/)。

文法：[../protocol/](../protocol/)（请引用已封存包版本）。API：[../sdk/nodejs/API.zh-CN.md](../sdk/nodejs/API.zh-CN.md)。XAIOP 是什么：[../overview/introduction.zh-CN.md](../overview/introduction.zh-CN.md)。架构：[../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)。

---

## 指南（现行）

| 指南 | 主题 |
| --- | --- |
| [streaming-transport.zh-CN.md](streaming-transport.zh-CN.md) | 经网络搬运线文 — 分帧、产品侧 Snapshot/Diff |
| [skeleton-stream.zh-CN.md](skeleton-stream.zh-CN.md) | WebSocket 固定键骨架/模块流 |

占位（指向封存）：[model-output.zh-CN.md](model-output.zh-CN.md)

---

## 速查

```text
协议      →  文本含义（游标 IR）
实践      →  建议使用场景（本树 · 现行）
封存      →  LLM 发射等目标快照（非主路径）
SDK       →  语言 API
```

| 需求 | 去向 |
| --- | --- |
| 行文法 | [../protocol/syntax.zh-CN.md](../protocol/syntax.zh-CN.md) |
| 线坑点 | [../protocol/notes/](../protocol/notes/) |
| 字节流 → JSON | [streaming-transport.zh-CN.md](streaming-transport.zh-CN.md) |
| 骨架 WS 推送 | [skeleton-stream.zh-CN.md](skeleton-stream.zh-CN.md) |
| Node.js API | [../sdk/nodejs/API.zh-CN.md](../sdk/nodejs/API.zh-CN.md)（§6.4 · §6.5） |
| Java stream | [../sdk/java/README.zh-CN.md](../sdk/java/README.zh-CN.md)（`XaiopStream`） |
| LLM 发射（封存） | [../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/) |
