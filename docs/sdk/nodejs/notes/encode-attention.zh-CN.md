# Node.js 注意事项 — 编码（JSON → XAIOP）

[English](encode-attention.md) · [简体中文](encode-attention.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-ENCODE` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-27 |
| 规范性 | **否** |
| 完整指南 | [../API.zh-CN.md](../API.zh-CN.md) |

协议线格式仍为 Frozen **0.6.0**。Encode 是 **SDK** 能力（`xaiop` **0.6.0+**）。

---

## 1. 稳定性约定（SDK）

对接受的值：`parse(encode(v))≈v`；确定性；非空线文以恰好一个 `\n` 结尾（终止符，不是一行 Content）；命名数组 **可以**跨 `.` 拆分（再开追加；默认 Encode 仍常一相）；兼容模式不影响编码输出；**数组根**不发对象式顶层 `.` 相位（分相时忽略 `dotPolicy`）。

不保证：`encode(parse(手写线))` 字节相同；默认省略对象 `undefined`；数组空洞；文档根 null。

默认 `nullPolicy` 为 **`encode`**（`key:null` / `:null`）。`omit` 去掉对象 null 键；`error` 拒绝。

---

## 2. 危险键（SDK 校验）

拒绝：空/空白/`:`、尾部 `-`（数组进入）、含 `>` `<` `=` `!`。

Encode **不是**通用 JSON 序列化：合法 JSON 键可以是非法 Label（`a:b`、空、空白、尾 `-`）。`symbolKeys` 只逃逸行类首字符。见 [API.zh-CN.md](../API.zh-CN.md) §4.3。

---

## 2b. 字符串值危险面（SDK 校验）

字符串**值**里的物理 `U+000A` / `U+000D` 编码为两字符序列 `\n` / `\r`（协议 **0.7.0** Draft，一律生效）。`\\` 编码反斜杠。Encode **禁止**在 Content 载荷里发出物理换行。未知 `\x` 与末尾光杆 `\` 是 **parse** 语法错误。

| 值 | 拒绝原因 |
| --- | --- |
| 以 **U+0020 SPACE** 开头 | `:` 后前导空格是**强制 string** 标记（[content.zh-CN.md](../../../protocol/content.zh-CN.md) §6），不属于载荷——`encode` **必须**拒绝，而不是发出 parse 会剥掉空格的线文 |

仍接受（且可往返）：空串、前导 **Tab**、尾随空格、仅因类型令牌需要强制 string 的串（`"1"`、`"true"` 等），以及语义上含 CR/LF 的串（经 `\n` / `\r`）。

---

## 3. 点号策略 ↔ 流式

默认 `perTopLevelKey` 与 Node 流式 Diff（`.` 相位）对齐。  
`dotPolicy: string[]` 在列出的 JSON 路径节点后切相；与频率类选项互斥；下标必须为末段。

**生产：** 用 encode 选项**主动安排** `.`——大块连续字段尽量一相；只在可分离子单元处切相，保证渐进送达丝滑。详见 [API.zh-CN.md](../API.zh-CN.md) Encode 节。

见 [streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)。线规则（再开追加）：[../../../protocol/notes/wire-attention.zh-CN.md](../../../protocol/notes/wire-attention.zh-CN.md)。

---

## 4. 相关

- 指南：[../API.zh-CN.md](../API.zh-CN.md)  
- 评测方法论 ≠ 禁止 encode：[../../../performance.zh-CN.md](../../../performance.zh-CN.md) §2
