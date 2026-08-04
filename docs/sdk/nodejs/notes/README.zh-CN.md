# Node.js 注意事项（索引）

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-INDEX` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-05 |
| 规范性 | **否** |

上级指南：**[../API.zh-CN.md](../API.zh-CN.md)**（主入口） · [../README.zh-CN.md](../README.zh-CN.md)  
协议 notes：[../../../protocol/notes/](../../../protocol/notes/) · 隔离：[../../../SEPARATION.zh-CN.md](../../../SEPARATION.zh-CN.md) · 对等：[../../behavioral-contract.zh-CN.md](../../behavioral-contract.zh-CN.md)

| 文档 | ID | 主题 |
| --- | --- | --- |
| [streaming-parse.zh-CN.md](streaming-parse.zh-CN.md) | `SDK-NODE-NOTE-STREAM` | XAIOP → JSON 流式（`XaiopStream` / `.` 相位；buffer compact **0.15.0+**；`@` 累积 Diff **0.14.3+**；Diff 隔离 **0.14.2+**；`mergeChunkWindow` / `pushAsync`） |
| [history.zh-CN.md](history.zh-CN.md) | `SDK-NODE-NOTE-HISTORY` | 可选解析历史 — 快照（只读）+ 实时（向前 `jumpTo`） |
| [ws-session.zh-CN.md](ws-session.zh-CN.md) | `SDK-NODE-NOTE-WS` | WebSocket；**`connect`/`onPhase` 时序**（§5）；**浏览器相位**（§9）；**类型推送**（§10） |
| [typecheck.zh-CN.md](typecheck.zh-CN.md) | `SDK-NODE-NOTE-TYPE` | 类型注册 / 客户端冻结 / WS `pushTypeConsistency` |
| [line-intercept.zh-CN.md](line-intercept.zh-CN.md) | `SDK-NODE-NOTE-LINE` | 缓冲行拦截（`onLineIntercept`；与 `onPhase` 分层） |
| [annotation-span.zh-CN.md](annotation-span.zh-CN.md) | `SDK-NODE-NOTE-ANNSPAN` | 相位 `#` Annotation Span（**typeCheck 前**；处理区逃逸类型检查） |
| [control-plane.zh-CN.md](control-plane.zh-CN.md) | `SDK-NODE-NOTE-CONTROL` | SDK 控制根 `#!` — demux、会话 / seq / 续传 / ack / snapshot |
| [encode-attention.zh-CN.md](encode-attention.zh-CN.md) | `SDK-NODE-NOTE-ENCODE` | JSON → XAIOP 编码坑点（SDK；路径数组 `dotPolicy`） |
| [adjustment-policy.zh-CN.md](adjustment-policy.zh-CN.md) | `SDK-NODE-NOTE-ADJUST` | 按设计 vs 可慎重调整 |
