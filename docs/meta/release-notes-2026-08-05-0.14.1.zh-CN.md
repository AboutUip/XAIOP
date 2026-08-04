# 发行说明 — 2026-08-05（Node 0.14.1）

[English](release-notes-2026-08-05-0.14.1.md) · [简体中文](release-notes-2026-08-05-0.14.1.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-RELNOTES-2026-08-05-0141` |
| 状态 | 信息性 |
| 日期 | 2026-08-05 |

---

## 包

| 包 | 版本 | 协议 |
| --- | --- | --- |
| Node.js `xaiop` | **0.14.1** | **0.6.0** Frozen（不变） |

---

## Node.js SDK `0.14.1`

相对 [0.14.0](release-notes-2026-08-05.zh-CN.md) 控制根的补丁。

### 要点

- **`#!xaiop/seq/v1`** — 为随后的文档相位打 **会话日志** 戳 → `meta.logSeq` / `meta.logSeqs`。
- **`pushJson` / `pushObject`**（`session` / `retainOutbound`）自动打戳；`ResumeWireLog.wiresAfter` 打戳；`encodeSeqFrame` / `stampWireWithLogSeq`。
- **`fromSeq` / ack / `getResumeState().seq` / `logSeq`** 有戳时认日志空间；连接局部 `meta.seq` 仍每 socket 重计。
- **文档：** 两套序号警告 + 续传补发遇 `mergeChunkWindow` 的说明（非 bug）。

### 建议 Git 标签

`sdk-nodejs-v0.14.1`

### 测试

`npm test` — 含跨重连 `logSeq` 连续与窗口合并 `logSeqs`。

---

## 先前

- [release-notes-2026-08-05.zh-CN.md](release-notes-2026-08-05.zh-CN.md) — Node **0.14.0** 控制根基础
