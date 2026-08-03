# Node.js 注意事项 — 编码（JSON → XAIOP）

[English](encode-attention.md) · [简体中文](encode-attention.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-ENCODE` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** |
| 完整指南 | [../encode.zh-CN.md](../encode.zh-CN.md) |

协议线格式仍为 Frozen **0.3.0**。Encode 是 **SDK** 能力（`xaiop` **0.6.0+**）。

---

## 1. 稳定性约定（SDK）

对接受的值：`parse(encode(v))≈v`；确定性；命名数组 **可以**跨 `.` 拆分（再开追加；默认 Encode 仍常一相）；兼容模式不影响编码输出；**数组根**不发对象式顶层 `.` 相位（分相时忽略 `dotPolicy`）。

不保证：`encode(parse(手写线))` 字节相同；默认省略对象 `undefined`；数组空洞；文档根 null。

默认 `nullPolicy` 为 **`encode`**（`key:null` / `:null`）。`omit` 去掉对象 null 键；`error` 拒绝。

---

## 2. 危险键（SDK 校验）

拒绝：空/空白/`:`、尾部 `-`（数组进入）、含 `>` `<` `=` `!`。

---

## 3. 点号策略 ↔ 流式

默认 `perTopLevelKey` 与 Node 流式 Diff（`.` 相位）对齐。  
`dotPolicy: string[]` 在列出的 JSON 路径节点后切相；与频率类选项互斥；下标必须为末段。

**生产：** 用 encode 选项**主动安排** `.`——大块连续字段尽量一相；只在可分离子单元处切相，保证渐进送达丝滑。详见 [encode.zh-CN.md](../encode.zh-CN.md) §5「生产流式」。

见 [streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)。线规则（再开追加）：[../../../protocol/notes/wire-attention.zh-CN.md](../../../protocol/notes/wire-attention.zh-CN.md)。

---

## 4. 相关

- 指南：[../encode.zh-CN.md](../encode.zh-CN.md)  
- 评测方法论 ≠ 禁止 encode：[../../../performance.zh-CN.md](../../../performance.zh-CN.md) §2
