# 协议注意事项 — 线格式

[English](wire-attention.md) · [简体中文](wire-attention.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PROT-NOTE-WIRE` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** — Frozen 正文上的清单 |
| 依赖 | `PROT-SYNTAX`、`PROT-HIER`、`PROT-BOUND`、`PROT-CONTENT` |

权威文本：[../](../) 下 Frozen 文档。本 note **不**改规范。

---

## 1. 范围

仅由**线语义**导出的坑点（与语言无关）。

范围外：Skill、HTTP/SSE/WS 配方、产品侧 Diff 检查点、兼容模式。  
见 [../../practice/](../../practice/) 与 [../../sdk/](../../sdk/)。

---

## 2. 根形态

| 意图 | 开启符 | 结果 |
| --- | --- | --- |
| 完整 JSON **对象**文档 | 行首独立 `>` | 匿名根对象即文档 |
| 完整 JSON **数组**文档 | 行首独立 `-` | 匿名根数组即文档 |
| 根**片段** | 省略 `>` / `-` | Root 上的具名绑定 — **不是** `{"a":{}}` |

权威：[../syntax.zh-CN.md](../syntax.zh-CN.md) §2。

---

## 3. 算子 `.`（回 Root）

1. 恰为 `.` 的 Label 行将 **Cursor** 重置到 Root。  
2. **不**清空已写入数据。  
3. `.` 之后须从 Root 用 `>` / `=` / `@` / `>name` / `>name-` 再定位；不要靠多写 `<` 猜深度。  
4. Root 上裸 `<` 为**语法错误**。  
5. `.` 后在对象根上的裸 `>` 是**再进入**该根（修改），不是再套一层匿名对象。  
6. `.` **退出** `!` 广播多光标。

权威：[../hierarchy.zh-CN.md](../hierarchy.zh-CN.md) §9 / §4.2。

---

## 4. Later-wins（后写覆盖）

1. 同键再写 → 后写生效。  
2. 具名**对象**再 `>name`（已是 object）→ 继续进入该对象。  
3. 具名**数组**再 `>name-`（已是 array）→ **再进入**该数组，后续元素 **追加**；**不是**整段替换。  
4. 多相文档**可以**在 `.` 后再发 `>name-` 以增长同一具名数组。

权威：[../hierarchy.zh-CN.md](../hierarchy.zh-CN.md) §10–11。

---

## 5. 数组 / Label / Content

见英文稿同节；规范入口：[../syntax.zh-CN.md](../syntax.zh-CN.md)、[../content.zh-CN.md](../content.zh-CN.md)、[../boundary.zh-CN.md](../boundary.zh-CN.md)。

要点：禁止裸 Label；一行一 Label；首个 `:` 切 Content；值禁止换行；类型 int→float→bool→null→string，`:` 后空格强制字符串。

---

## 6. 定位算子（`=` / `@` / `!`）

| 算子 | 作用 |
| --- | --- |
| `=path` | 在**已建整树**上模糊搜索（向前跨相）；首命中；不创建 |
| `@path` | 自 Root 精确；**创建**缺失对象（本相）；单光标 |
| `!path` | 已建整树上全部路径片段匹配（向前跨相、外层剪枝）；广播至 `.` |

广播激活时禁止再 `!`/`@`/`=`；须先 `.`。任一端失败则整行失败。  
流式 Diff：含 `=`/`!` 的相位 **必须** 累积前缀 parse。

权威：[../hierarchy.zh-CN.md](../hierarchy.zh-CN.md) §6–§8。

---

## 7. 生成端 / 解析端清单

**生成：** 刻意选择完整根 vs 片段；LF/CRLF；`.` 后从 Root 用 `=`/`@`/`>` 重进；需要追加时可跨重置再开 `>name-`；`!` 仅在需要多光标广播时使用并在结束后发 `.`；精确路径用 `@`，模糊用 `=`；值无 CR/LF；需要文本数字时强制字符串。

**解析：** 同键覆盖；`>name-` 再开=再进入/追加；实现 `@` 精确创建或进入与 `!` 广播+外层剪枝（已建整树）；Root 裸 `<` 与广播中定位拒绝；不臆造缺失离开；按行缓冲再解释 Label。

---

## 相关

- 流式（协议面）：[streaming-attention.zh-CN.md](streaming-attention.zh-CN.md)  
- 模型输出 / 网络流式（实践）：[../../practice/](../../practice/)
