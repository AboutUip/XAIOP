# 实践 — 键控 / 具名路径状态建模

[English](keyed-state-modeling.md) · [简体中文](keyed-state-modeling.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PRACTICE-KEYED-MODEL` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-05 |
| 规范性 | **否** — 建模建议；线规则仍以 `PROT-HIER` 为准 |

协议：[../protocol/hierarchy.zh-CN.md](../protocol/hierarchy.zh-CN.md) · 引言范围：[../overview/introduction.zh-CN.md](../overview/introduction.zh-CN.md)（NG6）。

---

## 1. 结论

`=` / `!` / `&` 作用于**具名路径片段**与 Cursor。  
**匿名数组元素没有 label**——不能像 JSON Patch 用下标那样被定位 / 广播 / 删除。

若业务要事后改某一行，优先用**键控映射**或**重复具名子节点**。

---

## 2. JSON 数组习惯 vs XAIOP

| JSON 习惯 | 在 XAIOP 中的后果 |
| --- | --- |
| `orders: [{ id: "A1", … }, { id: "A2", … }]` | 元素匿名；`=A2` **不等于**「id 为 A2 的那一行」（除非换建模） |
| 按下标改「第 1 项」 | 线文**无**元素下标删除 / 定位 |
| 广播「每个 order.detail」 | 需要每个 order 下**重复出现**的路径片段名 `detail` |

### 模式 A — 键控映射（可变行推荐）

```text
>
>orders
>A1
status:pending
<
>A2
status:pending
<
.
=A2
status:shipped
.
```

物化约 `{ "orders": { "A1": { "status": "pending" }, "A2": { "status": "shipped" } } }`。

### 模式 B — 重复具名 + 广播

```text
>
>shopA
>order
id:A1
>detail
checked:false
<
<
>order
id:A2
>detail
checked:false
<
<
.
!detail
checked:true
.
```

`!detail` 命中每个完整的 `detail` 路径片段（外层剪枝）。**没有**「所有数组下标」通配符。

### 模式 C — 只追加的匿名数组

仅当**永不**需要回头定位/删除已写入元素时适用：

```text
>
>events-
>
type:open
<
.
>events-
>
type:close
<
.
```

后续相位只**追加**；改历史行超出此形状能力。

---

## 3. 何时继续用 JSON

静态整包交换、重度按下标补丁、或对成品树的吞吐敏感 parse/stringify —— 继续用 JSON（见引言 NG1）。XAIOP 的价值在**流式相位**与**声明式修正**，不是更快的 `JSON.parse`。

---

## 4. 相关

- 线文坑点：[../protocol/notes/wire-attention.zh-CN.md](../protocol/notes/wire-attention.zh-CN.md)
- 流式 Snapshot/Diff：[streaming-transport.zh-CN.md](streaming-transport.zh-CN.md)
- Node Diff 隔离（SDK）：[../sdk/nodejs/notes/streaming-parse.zh-CN.md](../sdk/nodejs/notes/streaming-parse.zh-CN.md)
