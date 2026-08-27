# 协议文档 — XAIOP 协议包 v0.7.0（Draft）

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PROT-INDEX` |
| 状态 | **Draft** |
| 版本 | 0.7.0 |
| 最近更新 | 2026-08-27 |
| 规范性 | 信息性（索引） |

---

## 工作包

本目录描述 **工作中的 XAIOP 协议包 v0.7.0（Draft）**：流式、按行、游标构造的线文法与语义。已封存 **0.6.0** 仍可引用。

**Draft** 表示该版本号下的规范性文本在封存前仍可能改。已封存 **0.6.0** 文本不可变。见 [../meta/status-and-versioning.zh-CN.md](../meta/status-and-versioning.zh-CN.md) · [../meta/releases.zh-CN.md](../meta/releases.zh-CN.md)。

**样例：** [../examples/complex.xaiop](../examples/complex.xaiop) → [../examples/complex.expected.json](../examples/complex.expected.json)

**隔离：** 协议只谈线格式。建议使用场景（含可选 LLM 发射、传输）→ [../practice/](../practice/)。语言 API → [../sdk/](../sdk/)。见 [../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)。

---

## 从这里开始

| 顺序 | 文档 | 用途 |
| --- | --- | --- |
| **1** | **[syntax.zh-CN.md](syntax.zh-CN.md)** | **全部语法 / 行形式** |
| 2 | [boundary.zh-CN.md](boundary.zh-CN.md) | Label / Block 行结束 |
| 3 | [hierarchy.zh-CN.md](hierarchy.zh-CN.md) | 光标算子详解 |
| 4 | [content.zh-CN.md](content.zh-CN.md) | `:` 类型、Content `\n`/`\r`/`\\`、强制字符串 |
| 5 | [streaming.zh-CN.md](streaming.zh-CN.md) | 流式线何时有效；协议面 Snapshot/Diff |

**核心对：** `>` 创建/再进入匿名对象 · `<` 仅上浮一层（Root 非法）· 禁止裸 Label。  
**根开启符：** `>` / `-` → 完整匿名根文档；省略 → **根片段** `"a":{}` — **不等于** `{"a":{}}`。  
**数组单行 `k:v`：** 数组层完整单属性元素。  
**`#…`：** **自定义注解传递**（独立单行；协议不解释 `#` 后内容；无树副作用）。

---

## 线格式注意事项（信息性）

| 文档 | 主题 |
| --- | --- |
| [notes/](notes/) | 索引 |
| [notes/wire-attention.zh-CN.md](notes/wire-attention.zh-CN.md) | `.`、later-wins、数组、根 |
| [notes/streaming-attention.zh-CN.md](notes/streaming-attention.zh-CN.md) | 有效性、协议 Snapshot/Diff |

---

## 文档 ID

| ID | 路径 |
| --- | --- |
| `PROT-SYNTAX` | [syntax.zh-CN.md](syntax.zh-CN.md) |
| `PROT-BOUND` | [boundary.zh-CN.md](boundary.zh-CN.md) |
| `PROT-HIER` | [hierarchy.zh-CN.md](hierarchy.zh-CN.md) |
| `PROT-CONTENT` | [content.zh-CN.md](content.zh-CN.md) |
| `PROT-STREAM` | [streaming.zh-CN.md](streaming.zh-CN.md) |
| `PROT-NOTE-INDEX` | [notes/README.zh-CN.md](notes/README.zh-CN.md) |
| `PROT-NOTE-WIRE` | [notes/wire-attention.zh-CN.md](notes/wire-attention.zh-CN.md) |
| `PROT-NOTE-STREAM` | [notes/streaming-attention.zh-CN.md](notes/streaming-attention.zh-CN.md) |
