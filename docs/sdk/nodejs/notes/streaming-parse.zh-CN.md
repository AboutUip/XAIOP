# Node.js 注意事项 — 流式解析（XAIOP → JSON）

[English](streaming-parse.md) · [简体中文](streaming-parse.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-STREAM` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** — Node SDK 行为 |
| 代码 | `xaiop-sdk/nodejs/src/stream/` |
| 包 | `xaiop` 0.4.0+（协议线 0.2.1） |

**协议基线（先读）：**  
[../../../protocol/notes/wire-attention.zh-CN.md](../../../protocol/notes/wire-attention.zh-CN.md) ·  
[../../../protocol/notes/streaming-attention.zh-CN.md](../../../protocol/notes/streaming-attention.zh-CN.md)

本文**只**描述 Node.js 面向 JSON 的流路径，不改变 Frozen 线含义。

---

## 1. 结论

| 关注点 | 判断 |
| --- | --- |
| 终态文档（`done` / 完成后 snapshot） | **稳健** — 与一次性 `parseSync` 在已测分帧下对齐 |
| 中途 JSON Diff | **按 `.` 相位**，不是 `PROT-STREAM` §5 字面的按 Block |
| 主要风险 | 语义误用 + 生成端数组再开 — 不是 LF/CRLF 下行扫描随机丢字节 |

---

## 2. 各 API 面含义

| 面 | 时机 | 值 |
| --- | --- | --- |
| `onChunk` 等 | 每个完整 `.` 相位 + EOF 尾段 | **该相位**的物化 parse（空相位可为 `null`） |
| `onDone` / 完成后 `getSnapshot()` | `finish()` 之后 | **全缓冲**物化 parse（later-wins） |
| `getCommittedSnapshot()` | 每个 `.` / EOF flush 后 | 已提交前缀的累积 parse — **可在流中使用** |
| 流中途 `getSnapshot()` | STREAMING 期间 | 通常 **`undefined`**（不变；用 `getCommittedSnapshot`） |

`streamProcessing: false`：结束时一次全量 parse → 一个 chunk + done。

---

## 3. 相对 PROT-STREAM Diff 的刻意差异

协议要求「每完成 Block 推 Diff」。本 SDK Diff = 每个 **`.` 相位**的物化 parse。属 **SDK 策略**。  
**慎重：** 默认不改为 Block Diff；若未来提供，必须 **opt-in**。见 [adjustment-policy.zh-CN.md](adjustment-policy.zh-CN.md)。

---

## 4. SDK 坑点（叠加在线规则之上）

1. `onChunk` = 相位 JSON，不是 Patch。  
2. 中途累积 JSON 用 `getCommittedSnapshot()`；自合并须按数组替换理解。  
3. 容忍 `null` chunk。  
4. 勿用流中 `getSnapshot()` 做渐进 UI。  
5. 兼容模式默认关。  
6. RAW/WS **二进制**已流式 UTF-8 解码；勿在码点中间混插 string 帧。  
7. 中途语法错不回滚已发 chunk。  
8. 优先 LF/CRLF。

---

## 5. 清单

**消费：** `done`/`getSnapshot()` 权威；中途用 `getCommittedSnapshot()`；chunk 按相位；compat 默认关。

**生成：** 要中途 Diff 就打 `.`；命名数组不跨相再开；`.` 后从 Root 重进。

---

## 相关

- 协议流式 note：[../../../protocol/notes/streaming-attention.zh-CN.md](../../../protocol/notes/streaming-attention.zh-CN.md)  
- 编码对齐：[../encode.zh-CN.md](../encode.zh-CN.md) · [encode-attention.zh-CN.md](encode-attention.zh-CN.md)  
- 隔离：[../../../SEPARATION.zh-CN.md](../../../SEPARATION.zh-CN.md)
