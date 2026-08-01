# 协议文档 — XAIOP v0.1.0（已冻结）

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PROT-INDEX` |
| 状态 | **Frozen（已冻结）** |
| 版本 | 0.1.0 |
| 最近更新 | 2026-08-02 |
| 规范性 | 信息性（索引） |

---

## 冻结声明

本包为 **已封存的 XAIOP 协议 v0.1.0**。  
结构层（边界、光标、数组）与内容层（编码、类型）的规范性语法与语义已完备。后续变更须升版本号。

**样例：** [examples/complex.xaiop](../examples/complex.xaiop) → [examples/complex.expected.json](../examples/complex.expected.json)

---

## 从这里开始

| 顺序 | 文档 | 用途 |
| --- | --- | --- |
| **1** | **[syntax.zh-CN.md](syntax.zh-CN.md)** | **全部语法 / 行形式** |
| 2 | [boundary.zh-CN.md](boundary.zh-CN.md) | Label / Block 行结束 |
| 3 | [hierarchy.zh-CN.md](hierarchy.zh-CN.md) | 光标算子详解 |
| 4 | [content.zh-CN.md](content.zh-CN.md) | `:` 类型与强制字符串 |
| 5 | [streaming.zh-CN.md](streaming.zh-CN.md) | 流式有效性与 JSON API |

**核心对：** `>` 创建并进入匿名对象 · `<` 仅上浮一层（Root 非法）· 禁止裸 Label。  
**根：** 意图根对象/数组 → 以 `>` / `-` 开头；无根容器 → 省略。

---

## 文档 ID

| ID | 路径 |
| --- | --- |
| `PROT-SYNTAX` | [syntax.zh-CN.md](syntax.zh-CN.md) |
| `PROT-BOUND` | [boundary.zh-CN.md](boundary.zh-CN.md) |
| `PROT-HIER` | [hierarchy.zh-CN.md](hierarchy.zh-CN.md) |
| `PROT-CONTENT` | [content.zh-CN.md](content.zh-CN.md) |
| `PROT-STREAM` | [streaming.zh-CN.md](streaming.zh-CN.md) |
