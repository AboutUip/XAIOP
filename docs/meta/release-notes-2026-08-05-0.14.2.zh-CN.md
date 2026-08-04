# 发行说明 — 2026-08-05（Node 0.14.2）

[English](release-notes-2026-08-05-0.14.2.md) · [简体中文](release-notes-2026-08-05-0.14.2.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-RELNOTES-2026-08-05-0142` |
| 状态 | 信息性 |
| 日期 | 2026-08-05 |

---

## 包

| 包 | 版本 | 协议 |
| --- | --- | --- |
| Node.js `xaiop` | **0.14.2** | **0.6.0** Frozen（不变） |

---

## Node.js SDK `0.14.2`

相对 [0.14.1](release-notes-2026-08-05-0.14.1.zh-CN.md) 的补丁。

### 要点

- **D1 — Diff 隔离：** 先前 `.` 之后，相位局部 Diff 不再把具名进入（`>rules-`）/ Content 当成裸 fragment。活文档为 object、且该相不以裸 `>` / `-` 开头时前缀合成 object 根（`>\n`）。同一完整相位序列在一次 `push` 与按相 `push`、以及 `mergeChunkWindow` 开/关下一致。Diff 失败时回退为累积已提交 Diff（保留 Commit）。
- **叙述：** 引言 NG6 + 实践 [keyed-state-modeling.zh-CN.md](../practice/keyed-state-modeling.zh-CN.md) — 键控 / 具名路径状态演化；**不是**通用 JSON 补丁层。
- **文档：** [streaming-parse.zh-CN.md](../sdk/nodejs/notes/streaming-parse.zh-CN.md) Diff 文档根说明。

### 建议 Git 标签

`sdk-nodejs-v0.14.2`

### 测试

`npm test` — 含 `test/checkpoint.diff-isolation.test.js`。

---

## 先前

- [release-notes-2026-08-05-0.14.1.zh-CN.md](release-notes-2026-08-05-0.14.1.zh-CN.md) — Node **0.14.1** `meta.logSeq`
- [release-notes-2026-08-05.zh-CN.md](release-notes-2026-08-05.zh-CN.md) — Node **0.14.0** 控制根基础
