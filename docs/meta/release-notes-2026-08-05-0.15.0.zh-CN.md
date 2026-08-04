# 发行说明 — 2026-08-05（Node 0.15.0）

[English](release-notes-2026-08-05-0.15.0.md) · [简体中文](release-notes-2026-08-05-0.15.0.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-RELNOTES-2026-08-05-0150` |
| 状态 | 信息性 |
| 日期 | 2026-08-05 |

---

## 包

| 包 | 版本 | 协议 |
| --- | --- | --- |
| Node.js `xaiop` | **0.15.0** | **0.6.0** Frozen（不变） |

---

## Node.js SDK `0.15.0`

相对 [0.14.3](release-notes-2026-08-05-0.14.3.zh-CN.md) 的次版本。

### 要点

- **`bufferStats()`** — `{ length, committedAt, pendingBytes, openPhase }`，无需读完整接收串。
- **`compactCommitted({ dropHistory? })`** — 丢弃 `buffer[0..committedAt)`，保留 live Commit 树与未提交尾巴。长会话稳态，不重 parse。
- **与 history 冲突（策略 A）：** `historyRealtime` + `retainWireHistory`，或已有 history 节点时，除非 `{ dropHistory: true }`（清空 `ParseHistory`）否则拒绝 compact。
- **表面：** `DotCheckpointEngine`、`XaiopStream`（Node + browser）、WS connection / browser client。
- **文档：** [streaming-parse.zh-CN.md](../sdk/nodejs/notes/streaming-parse.zh-CN.md) — buffer compact 节。
- **文档 / 测试：** 扩展 `checkpoint.buffer-compact.test.js`；streaming-parse + history 对 compact / history 冲突使用 MUST 级契约表述。

### 建议 Git 标签

`sdk-nodejs-v0.15.0`

### 测试

`npm test` — 含 `test/checkpoint.buffer-compact.test.js`。

---

## 先前

- [release-notes-2026-08-05-0.14.3.zh-CN.md](release-notes-2026-08-05-0.14.3.zh-CN.md) — Node **0.14.3** `@` 累积 Diff（D2）
- [release-notes-2026-08-05-0.14.2.zh-CN.md](release-notes-2026-08-05-0.14.2.zh-CN.md) — Node **0.14.2** Diff 隔离（D1）
