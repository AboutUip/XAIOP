# Node.js 注意事项 — 编码（JSON → XAIOP）

[English](encode-attention.md) · [简体中文](encode-attention.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-ENCODE` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** |
| 完整指南 | [../encode.zh-CN.md](../encode.zh-CN.md) |

协议线格式仍为 Frozen 0.2.1。Encode 是 **SDK** 能力（`xaiop` 0.4.1+）。

---

## 1. 稳定性约定（SDK）

对接受的值：`parse(encode(v))≈v`；确定性；命名数组不跨 `.` 拆分；兼容模式不影响编码输出。

不保证：`encode(parse(手写线))` 字节相同；默认省略对象 `undefined`；数组空洞；文档根 null。

默认 `nullPolicy` 为 **`encode`**（`key:null` / `:null`）。`omit` 去掉对象 null 键；`error` 拒绝。

---

## 2. 危险键（SDK 校验）

拒绝：空/空白/`:`、尾部 `-`（数组进入）、含 `>` `<` `=` `!`。

---

## 3. 点号策略 ↔ 流式

默认 `perTopLevelKey` 与 Node 流式 Diff（`.` 相位）对齐。见 [streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)。线规则：[../../../protocol/notes/wire-attention.zh-CN.md](../../../protocol/notes/wire-attention.zh-CN.md)。

---

## 4. 相关

- 指南：[../encode.zh-CN.md](../encode.zh-CN.md)  
- 评测方法论 ≠ 禁止 encode：[../../../performance.zh-CN.md](../../../performance.zh-CN.md) §2
