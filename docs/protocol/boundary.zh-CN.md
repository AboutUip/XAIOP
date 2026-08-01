# 边界判定

[English](boundary.md) · [简体中文](boundary.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PROT-BOUND` |
| 状态 | **Frozen（已冻结）** |
| 版本 | 0.1.0 |
| 规范标题 | Boundary & Hierarchy Specification |
| 规范版本 | v0.1 |
| 最近更新 | 2026-08-02 |
| 规范性 | **规范性** |
| 依赖 | `PROT-SYNTAX`、`TERM-GLOSS` |
| 影响 | `PROT-HIER`、`PROT-STREAM`、`CONF` |

---

## 1. 范围

Label 行边界与 Block 范围的权威规则。  
完整文法：[syntax.zh-CN.md](syntax.zh-CN.md)。

---

## 2. 唯一权威边界来源

**行结束是 Label 行结束的唯一权威判据。**

规范性行结束：

- `LF`（`\n`）  
- `CRLF`（`\r\n`）

二者等价。无后续 `LF` 的单独 `CR` **不是**本文件下的规范性行结束。

1. 每个 Label **必须**独占一行。  
2. 行结束 **必须**视为该 Label 声明完成。  
3. 该 Label 之后的 Content **必须**归属该 Label 的 Block，直到出现下一 Label 行。

---

## 3. 排除的边界机制

**不得**用下列方式判定 Block 或 Label 边界：

### 3.1 括号配对

包括 `{}`、`[]`、`()`。

### 3.2 缩进 / 空白计数

### 3.3 多字符结束标记

例如：`-----`、`<END>`、`###`。  
这些不是光标算子，予以排除。

---

## 4. 隐式 Block 终止

1. Block **不得**要求独立结束标记。  
2. **下一 Label 行**结束上一 Block。  
3. 末 Block 在 **EOF** / 流终止处结束。无需额外标记。

---

## 5. Block 地位

1. **Block** 是最小一体化容器载体，不是最小数据原子。  
2. Block 可承载多少 Content 由内容层 / 应用决定。  
3. **一行不得声明多个 Block。**  
4. 每个 Label **必须**独占一行 — 无例外。
