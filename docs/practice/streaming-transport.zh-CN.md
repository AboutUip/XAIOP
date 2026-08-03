# 实践 — 流式数据传输

[English](streaming-transport.md) · [简体中文](streaming-transport.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PRACTICE-STREAM` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** |

**协议**规定流式*文本*何时有效，以及 Block 级 Snapshot/Diff（[../protocol/streaming.zh-CN.md](../protocol/streaming.zh-CN.md)）。  
**本文**写如何经真实传输通道搬运这些文本，以及产品侧常见踩坑。

具体运行时 API：Node `XaiopStream`（[../sdk/nodejs/notes/streaming-parse.zh-CN.md](../sdk/nodejs/notes/streaming-parse.zh-CN.md)）· 骨架 WS 会话 `XaiopWs`（[../sdk/nodejs/notes/ws-session.zh-CN.md](../sdk/nodejs/notes/ws-session.zh-CN.md) · 实践 [skeleton-stream.zh-CN.md](skeleton-stream.zh-CN.md)）。

---

## 1. 两层「流式」

| 层 | 问题 | 归属 |
| --- | --- | --- |
| **线流式** | Label/Block 何时完成？JSON 何时可更新？ | 协议 |
| **网络流式** | HTTP / SSE / WS / RAW 如何交付 UTF-8 文本？ | 实践 + SDK 传输 |

切勿把传输 chunk 边界当成 Label 行边界。先拼到**完整行**再解释结构。

---

## 2. 生成端约定

1. 优先 LF/CRLF。  
2. SSE/WS 文本帧尽量带完整行（含换行）。  
3. Label 跨帧必须最终补上换行。  
4. 二进制帧跨 chunk 拆 UTF-8 时，消费端须用**流式**解码器。  
5. 打 `.` 要同时理解 Cursor 重置与（若消费端按 `.` Diff）中途 JSON 单元。  
6. 不为追加而跨 `.` 再开 `>name-`（协议是替换）。

线清单：[../protocol/notes/](../protocol/notes/)。

---

## 3. 消费端约定

1. 按行缓冲再喂 Parser / 流客户端。  
2. 区分 Diff/相位、累积 Snapshot、终态 Snapshot。  
3. 容忍空 Diff（若实现会发）。  
4. 中途错误的保留策略由应用自定。

---

## 4. Snapshot / Diff 实践

协议：每完成 **Block** 推 Diff。实现可选用更粗边界（如 `.` 相位）— 写在 **SDK** notes，不改写协议。

| 需求 | 做法 |
| --- | --- |
| 严格按 Block 更新 UI | 用按 Block Diff 的实现，或密 Label、不单靠 `.` |
| 按段落更新 | 与消费端约定 `.` 为 Diff 界；Skill 按此组织（[model-output.zh-CN.md](model-output.zh-CN.md)） |
| 只要终态 JSON | 可关中途处理；仍可流式收字节 |

---

## 5. 相关

- 协议：[../protocol/streaming.zh-CN.md](../protocol/streaming.zh-CN.md)  
- 模型输出：[model-output.zh-CN.md](model-output.zh-CN.md)  
- 骨架 WS：[skeleton-stream.zh-CN.md](skeleton-stream.zh-CN.md)  
- Node 流客户端：[../sdk/nodejs/notes/streaming-parse.zh-CN.md](../sdk/nodejs/notes/streaming-parse.zh-CN.md)  
- Node WS 会话：[../sdk/nodejs/notes/ws-session.zh-CN.md](../sdk/nodejs/notes/ws-session.zh-CN.md)  
- 隔离：[../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)
