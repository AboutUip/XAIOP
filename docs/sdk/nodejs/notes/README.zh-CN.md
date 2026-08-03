# Node.js 注意事项（索引）

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-INDEX` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** |

上级指南：[../README.zh-CN.md](../README.zh-CN.md) · [../stream.zh-CN.md](../stream.zh-CN.md) · [../encode.zh-CN.md](../encode.zh-CN.md) · [../merge.zh-CN.md](../merge.zh-CN.md)  
协议 notes：[../../../protocol/notes/](../../../protocol/notes/) · 隔离：[../../../SEPARATION.zh-CN.md](../../../SEPARATION.zh-CN.md) · 对等：[../../behavioral-contract.zh-CN.md](../../behavioral-contract.zh-CN.md)

| 文档 | ID | 主题 |
| --- | --- | --- |
| [streaming-parse.zh-CN.md](streaming-parse.zh-CN.md) | `SDK-NODE-NOTE-STREAM` | XAIOP → JSON 流式（`XaiopStream` / `.` 相位；`mergeChunkWindow` / `pushAsync`） |
| [history.zh-CN.md](history.zh-CN.md) | `SDK-NODE-NOTE-HISTORY` | 可选解析历史 — 快照（只读）+ 实时（向前 `jumpTo`） |
| [ws-session.zh-CN.md](ws-session.zh-CN.md) | `SDK-NODE-NOTE-WS` | WebSocket listen/push + connect/consume（`XaiopWs`；同窗口/异步标志） |
| [encode-attention.zh-CN.md](encode-attention.zh-CN.md) | `SDK-NODE-NOTE-ENCODE` | JSON → XAIOP 编码坑点（SDK；路径数组 `dotPolicy`） |
| [adjustment-policy.zh-CN.md](adjustment-policy.zh-CN.md) | `SDK-NODE-NOTE-ADJUST` | 按设计 vs 可慎重调整 |
