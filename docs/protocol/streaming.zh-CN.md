# 流式语义

[English](streaming.md) · [简体中文](streaming.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PROT-STREAM` |
| 状态 | **Frozen（已冻结）** |
| 版本 | 0.2.1 |
| 最近更新 | 2026-08-03 |
| 规范性 | **规范性** |
| 依赖 | `PROT-SYNTAX`、`PROT-BOUND`、`PROT-HIER`、`REQ-STREAM` |
| 影响 | `CONF` |

---

## 1. 范围

流式数据何时有效，以及符合规范的流式消费 **必须**提供什么。  
文法：[syntax.zh-CN.md](syntax.zh-CN.md)。

---

## 2. 适用性

流式解析是通用协议能力 — 与 Content 编码及所用光标算子无关。无需额外配置。

---

## 3. 有效性

自第一个完整 Label（及其随到随用的 Content）起，数据 **必须**视为有效。已完成的 Block **不**要求流结束。

Block 在下一 Label 行开始时完成，或末 Block 在 EOF 完成。

---

## 4. 原生模式

实现 **必须**支持按 Block 解析与消费，无需缓冲整条 Stream。

---

## 5. 面向 JSON 的消费

若暴露 JSON 表面，则 **必须**同时提供：

1. **快照（Snapshot）** — 迄今已解析的完整可用 JSON。  
2. **增量（Diff）** — 每完成一个新 Block，仅推送该变更的增量；不重推未变部分。

具体 API 名称属实现细节。

**本文范围外：** 网络传输、Skill、SDK 方法名。  
产品侧流式见 [../practice/streaming-transport.zh-CN.md](../practice/streaming-transport.zh-CN.md)；线格式清单见 [notes/streaming-attention.zh-CN.md](notes/streaming-attention.zh-CN.md)。

