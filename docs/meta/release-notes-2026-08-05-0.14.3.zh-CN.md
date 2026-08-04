# 发行说明 — 2026-08-05（Node 0.14.3）

[English](release-notes-2026-08-05-0.14.3.md) · [简体中文](release-notes-2026-08-05-0.14.3.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-RELNOTES-2026-08-05-0143` |
| 状态 | 信息性 |
| 日期 | 2026-08-05 |

---

## 包

| 包 | 版本 | 协议 |
| --- | --- | --- |
| Node.js `xaiop` | **0.14.3** | **0.6.0** Frozen（不变） |

---

## Node.js SDK `0.14.3`

相对 [0.14.2](release-notes-2026-08-05-0.14.2.zh-CN.md) 的补丁。

### 要点

- **D2 — `@` 累积 Diff：** 含 `@` 的相位走与 `=` / `!` / `&` 相同的累积 Diff 路径。协议 **可以** 让 `@` Diff 保持相位局部；Node 产品 Diff **不这么做**，使进入先前相具名数组的 create-vs-enter 与 live Commit 一致。`>orders-` 后分块 `@orders` 不再吐出对象形 Diff，也不再在后续多元素追加时抛错。
- **`onChunk` 可选：** 省略 / 非函数 → Diff 投递为空操作；Commit / 终态仍执行。修复 `emitDiff: false` 且无 `onChunk` 时崩溃。
- **文档：** [streaming-parse.zh-CN.md](../sdk/nodejs/notes/streaming-parse.zh-CN.md) — D2 + 可选 `onChunk`。
- **测试：** `test/checkpoint.diff-isolation.test.js`（D1 + D2 + emitDiff）。

### 建议 Git 标签

`sdk-nodejs-v0.14.3`

### 测试

`npm test` — 含分块 `@` 进入具名数组的调研复现。

---

## 先前

- [release-notes-2026-08-05-0.14.2.zh-CN.md](release-notes-2026-08-05-0.14.2.zh-CN.md) — Node **0.14.2** Diff 隔离（D1）
- [release-notes-2026-08-05-0.14.1.zh-CN.md](release-notes-2026-08-05-0.14.1.zh-CN.md) — Node **0.14.1** `meta.logSeq`
- [release-notes-2026-08-05.zh-CN.md](release-notes-2026-08-05.zh-CN.md) — Node **0.14.0** 控制根基础
