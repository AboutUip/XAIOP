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
3. `.` 之后须从 Root 用 `>` / `=` / `>name` / `>name-` 再定位；不要靠多写 `<` 猜深度。  
4. Root 上裸 `<` 为**语法错误**。  
5. `.` 后在对象根上的裸 `>` 是**再进入**该根（修改），不是再套一层匿名对象。

权威：[../hierarchy.zh-CN.md](../hierarchy.zh-CN.md)。

---

## 4. Later-wins（后写覆盖）

1. 同键再写 → 后写生效。  
2. 具名**对象**再 `>name`（已是 object）→ 继续进入该对象。  
3. 具名**数组**再 `>name-` → **整段替换**为空数组，**不是**追加。  
4. 跨相位规划：若要追加，Cursor 重置后**不要**再发 `>name-`。

权威：[../hierarchy.zh-CN.md](../hierarchy.zh-CN.md)。

---

## 5. 数组 / Label / Content

见英文稿同节；规范入口：[../syntax.zh-CN.md](../syntax.zh-CN.md)、[../content.zh-CN.md](../content.zh-CN.md)、[../boundary.zh-CN.md](../boundary.zh-CN.md)。

要点：禁止裸 Label；一行一 Label；首个 `:` 切 Content；值禁止换行；类型 int→float→bool→null→string，`:` 后空格强制字符串。

---

## 6. 生成端 / 解析端清单

**生成：** 刻意选择完整根 vs 片段；LF/CRLF；`.` 后从 Root 重进；勿为追加而跨重置再开 `>name-`；值无 CR/LF；需要文本数字时强制字符串。

**解析：** 同键覆盖；`>name-` 再开=替换；Root 裸 `<` 拒绝；不臆造缺失离开；按行缓冲再解释 Label。

---

## 相关

- 流式（协议面）：[streaming-attention.zh-CN.md](streaming-attention.zh-CN.md)  
- 模型输出 / 网络流式（实践）：[../../practice/](../../practice/)
