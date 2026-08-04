# 发行说明 — 2026-08-05

[English](release-notes-2026-08-05.md) · [简体中文](release-notes-2026-08-05.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Document ID | `META-RELNOTES-2026-08-05` |
| Status | Informative |
| Date | 2026-08-05 |

---

## 包

| 包 | 版本 | 协议 |
| --- | --- | --- |
| Node.js `xaiop` | **0.14.0** | **0.6.0** Frozen（未改） |
| Java `io.xaiop:xaiop` | *（未升版）* | 仍为线文 **0.4.0** |

---

## Node.js SDK `0.14.0`

### 要点

- **SDK 控制根（`#!`）** — 产品约定（**不是** Frozen 文法改写）：前两字为 `#` `!` 的行在 parse / Annotation Span **之前** demux。
- **官方能力** `#!xaiop/…/v1`：`types`、`session`、`ack`、`resume`、`snapshot`。
- **未知 `#!`：** 丢弃 + `XaiopControlError`（`onControlError`）；永不进线文管道；默认不断开连接。
- **按行交错 demux**（WS / Stream；保留 CRLF）；历史整包 types（JSON 后无 LF）仍兼容。
- **相位 seq**（`meta.seq` / `meta.seqs`）；续传从 `fromSeq + 1`，**不**重放历史 Diff；可选 snapshot。
- **生产端出站日志：** `session` / `retainOutbound` 自动记录 `pushJson`/`pushObject`；跨重连用应用侧 `ResumeWireLog`。
- **Annotation Span** 硬跳过 `#!`。
- **Stream** `onChunk(diff, meta)` 转发相位 seq。

### 建议 Git 标签

`sdk-nodejs-v0.14.0`

### 文档

- [sdk/nodejs/notes/control-plane.zh-CN.md](../sdk/nodejs/notes/control-plane.zh-CN.md)
- [sdk/nodejs/API.zh-CN.md](../sdk/nodejs/API.zh-CN.md) §7.7
- 索引：[releases.zh-CN.md](releases.zh-CN.md)

### 打包

```bash
cd xaiop-sdk/nodejs
npm run pack    # → dist/xaiop-0.14.0.tgz
```

### 测试

`npm test` 跑全部 `test/*.test.js`（含 control plane / resume / coverage）。

---

## 先前说明

- [release-notes-2026-08-04.zh-CN.md](release-notes-2026-08-04.zh-CN.md) — Node **0.13.0** · Java **0.5.0**
