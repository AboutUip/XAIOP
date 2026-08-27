# 协议注意事项 — 流式

[English](streaming-attention.md) · [简体中文](streaming-attention.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PROT-NOTE-STREAM` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-04 |
| 规范性 | **否** — `PROT-STREAM` / `PROT-BOUND` 上的清单 |
| 依赖 | `PROT-STREAM`、`PROT-BOUND`、`PROT-HIER`、`REQ-STREAM` |

权威：[../streaming.zh-CN.md](../streaming.zh-CN.md)、[../boundary.zh-CN.md](../boundary.zh-CN.md)。

---

## 1. 范围

协议对流式消费的要求。  
**不**约束网络传输、Skill、或某实现的 Diff 粒度 — 见 [../../practice/streaming-transport.zh-CN.md](../../practice/streaming-transport.zh-CN.md)。

---

## 2. 无需等流结束即可有效

1. 从第一个**完整 Label**（及其陆续到达的 Content）起，数据已可消费。  
2. 已完成的 Block **不**依赖 end-of-stream。  
3. Block 在**下一 Label 行**开始时完成，或在 **EOF** 完成最后一块。

---

## 3. 原生模式与行边界

须能按 Block 解析/消费，不必先缓冲整段 Stream。  
传输分片须先拼到完整行，再解释 Label。

---

## 4. JSON 面（协议）

若暴露 JSON，协议要求同时具备：

| 面 | 含义 |
| --- | --- |
| **Snapshot** | 当前已解析内容的完整可用 JSON |
| **Diff** | 每完成一个 **Block**，只推该变更增量 |

API 名是实现细节。更粗的 Diff 边界写在实践/SDK 文档，不写进本协议 note。

---

## 5. 与 `.` / later-wins / `&`

`.` 只重置 Cursor；同键 Content 后写覆盖；`>name-` 再开=再进入并**追加**。`&path` 从**累积树**删除键；同址再写重新创建。含 `=` / `!` / `&` / `?` 的相位，按 `.` 的 Diff **必须** 累积前缀 parse。

**仅 SDK 的 cover 模式（非线文法）：** 默认 **关**。对流式 Diff 开启时，连续 `&` 可注入 `.`、发最深键 `null` 墓碑 Diff、再用 `>` 链恢复。权威 Commit 仍在 live 树上执行 `&`。协议解析器不必实现 cover。

见 [wire-attention.zh-CN.md](wire-attention.zh-CN.md)。

---

## 6. 清单

**生成：** 以完整 Label 行（含换行）为 Block 完成单元；Content 无**物理**换行（语义 `\n`/`\r`/`\\`）；`.` 后从 Root 重进；跨相追加可再开 `>name-`；`&path` 仅用于 object 根文档；缺失目标为静默无操作。

**消费：** 行缓冲；区分未完成尾 Content 与已完成 Block；Snapshot/Diff 语义写清；合并时对象键 later-wins、具名数组再开按追加理解；含 `=`/`!`/`&` 的相位 Diff 用累积前缀 parse。

---

## 相关

- 线格式坑点：[wire-attention.zh-CN.md](wire-attention.zh-CN.md)  
- 规范：[../streaming.zh-CN.md](../streaming.zh-CN.md)  
- 实践（传输）：[../../practice/streaming-transport.zh-CN.md](../../practice/streaming-transport.zh-CN.md)
