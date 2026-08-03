# 协议文档 — XAIOP v0.4.0（已冻结）

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PROT-INDEX` |
| 状态 | **Frozen（已冻结）** |
| 版本 | 0.4.0 |
| 最近更新 | 2026-08-03 |
| 规范性 | 信息性（索引） |

---

## 冻结声明

本包为 **已封存的 XAIOP 协议 v0.4.0**。  
仅规范性文法与语义 — 结构层、内容层、流式有效性。

**样例：** [../examples/complex.xaiop](../examples/complex.xaiop) → [../examples/complex.expected.json](../examples/complex.expected.json)

**隔离：** 协议只谈线格式。模型输出与网络流式 → [../practice/](../practice/)。API → [../sdk/](../sdk/)。见 [../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)。

---

## 从这里开始

| 顺序 | 文档 | 用途 |
| --- | --- | --- |
| **1** | **[syntax.zh-CN.md](syntax.zh-CN.md)** | **全部语法 / 行形式** |
| 2 | [boundary.zh-CN.md](boundary.zh-CN.md) | Label / Block 行结束 |
| 3 | [hierarchy.zh-CN.md](hierarchy.zh-CN.md) | 光标算子详解 |
| 4 | [content.zh-CN.md](content.zh-CN.md) | `:` 类型与强制字符串 |
| 5 | [streaming.zh-CN.md](streaming.zh-CN.md) | 流式线何时有效；协议面 Snapshot/Diff |

**核心对：** `>` 创建/再进入匿名对象 · `<` 仅上浮一层（Root 非法）· 禁止裸 Label。  
**根开启符：** `>` / `-` → 完整匿名根文档；省略 → **根片段** `"a":{}` — **不等于** `{"a":{}}`。  
**数组单行 `k:v`：** 数组层完整单属性元素。

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
