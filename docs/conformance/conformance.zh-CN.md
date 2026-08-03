# 一致性

[English](conformance.md) · [简体中文](conformance.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `CONF` |
| 状态 | **Frozen（已冻结）** |
| 版本 | 0.4.0 |
| 最近更新 | 2026-08-03 |
| 规范性 | **规范性** |
| 依赖 | `REQ-FUNC`, `REQ-STREAM`, `META-VER`, `TERM-GLOSS`, `PROT-SYNTAX`, `PROT-BOUND`, `PROT-HIER`, `PROT-CONTENT`, `PROT-STREAM` |
| 影响 | `protocol/*`、实现 |

---

## 1. 范围

本文档定义主张 XAIOP 符合性的含义，以及一致性级别如何绑定到包 **0.3.0（Frozen）** 中的结构与内容文档。

---

## 2. 通则

1. 符合性主张**必须**标明规范包版本（如 `0.2.0`）。
2. 符合性主张**必须**标明第 3 节中的一个或多个一致性级别。
3. 实现**禁止**对 `Reserved` 文档主张符合性。
4. 实现**可以**依据本包中的 Frozen 文档主张 `Structure`、`Streaming` 与 `Core`。
5. 仅满足信息性指导**禁止**被描述为符合性。

---

## 3. 一致性级别

### 3.1 级别 `Foundation`

当实现或文档集满足以下条件时，可主张 **Foundation**：

| ID | 要求 |
| --- | --- |
| CF-F-001 | 撰写关于 XAIOP 的规范性材料时，遵守 `META-CONV` 的语言与关键词约定。 |
| CF-F-002 | 在面向协议的公开行为描述中不与 `OV-PRIN` 冲突。 |
| CF-F-003 | 遵守 NG2 与 NG3：不要求生成器做摘要/长度；不强制静默修复。 |
| CF-F-004 | 在规范性意义上使用术语时，与 `TERM-GLOSS` 保持一致。 |

**Foundation** **并不**断言已实现结构层或正文规范层。

### 3.2 级别 `Structure`（边界与层级）

当实现满足以下条件时，可主张 **Structure**：

| ID | 要求 |
| --- | --- |
| CF-ST-001 | 符合 `PROT-BOUND` 与 `PROT-SYNTAX` 中的边界规则。 |
| CF-ST-002 | 符合 `PROT-HIER` / `PROT-SYNTAX`（`>` 创建并进入；`<` 仅回退；根上 `<` 非法；禁止裸标签；数组规则；根声明 §2）。 |
| CF-ST-003 | 按 `TERM-GLOSS` 解释术语。 |

**Structure** 本身**并不**断言完整正文定类型。正文符合性通过 **Core** 主张。

### 3.3 级别 `Core`

**Core** 要求具备 **Structure** 与正文：

| ID | 要求 |
| --- | --- |
| CF-C-001 | 符合 `PROT-SYNTAX` 与 `PROT-CONTENT`。 |
| CF-C-002 | 满足 `PROT-HIER` / `PROT-SYNTAX` 的数组/object 规则（含匿名 object 必须用 `>`）。 |
| CF-C-003 | 满足适用的 `REQ-FUNC` 义务。 |

### 3.4 级别 `Streaming`

**Streaming** 要求具备 **Structure**，并且：

| ID | 要求 |
| --- | --- |
| CF-S-001 | 符合 `PROT-STREAM`。 |
| CF-S-002 | 满足所主张角色适用的 `REQ-STREAM` 义务（生成器、解析器或二者）。 |
| CF-S-003 | 对已完成块提供部分结果，而无需等待流结束。 |
| CF-S-004 | 若对外提供 JSON 面，则按 `PROT-STREAM` 第 5 节提供快照与差异消费语义。 |

若同时主张正文符合性，Streaming **应该**与 **Core**（Structure + Content + Streaming）一并主张。

---

## 4. 角色

主张**应该**标明角色：

| 角色 | 典型义务 |
| --- | --- |
| 仅生成器 | 适用的 `FR-G-*`、`SR-G-*` |
| 仅解析器 | 适用的 `FR-P-*`、`SR-C-*`、`SR-O-*`、`SR-T-*` |
| 全栈 | 所主张级别下生成器与解析器义务的并集 |

---

## 5. 禁止的主张

**禁止**下列主张：

1. 未引用 `PROT-SYNTAX` / `PROT-CONTENT`（及版本）的「XAIOP 正文完备」/ 完整 `Core`。  
2. 在使用括号配对、缩进计数或多字符休止标记作为边界机制的同时主张结构层符合性。  
3. 将「自愈」或「尽力修复」作为符合规范的解析模式。  
4. 依赖 AI 按协议要求计算校验和或长度的符合性。  
5. 在使用相对游标操作符时，将顺序无关当作默认保证。  
6. 将裸标签视为合法，或不写 `>` 创建匿名 object。  
7. 将数组内 `>` 当成「只建空元素不进入」，或在已进入元素后写下一兄弟却省略 `<`。  
8. 用 `-` 作数组内兄弟分隔符。  
9. 在根上写 `<`。  
10. 意图根为对象或数组却不以 `>` 或 `-` 分别开头（`PROT-SYNTAX` §2）。

---

## 6. 未来配置（Profile）

编辑**可以**定义具名 Profile（如 `Structure+Streaming`）。  
Profile **必须**引用明确的一致性级别与文档 ID。

---

## 7. 与实现的关系

SDK 与工具**可以**实现 XAIOP，但 SDK API 本身不是本文档下的符合性对象（`OV-INTRO` NG5）。  
符合性依据协议需求评估，而非特定 SDK 表面。
