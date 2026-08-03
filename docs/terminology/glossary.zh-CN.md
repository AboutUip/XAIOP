# 术语表

[English](glossary.md) · [简体中文](glossary.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `TERM-GLOSS` |
| 状态 | **Frozen（已冻结）** |
| 版本 | 0.2.1 |
| 最近更新 | 2026-08-03 |
| 规范性 | **规范性**（定义） |
| 依赖 | `META-CONV`, `OV-PRIN` |
| 影响 | `REQ-FUNC`, `REQ-STREAM`, `CONF`, `protocol/*` |

---

## 1. 范围

本术语表定义 XAIOP 规范中使用的术语。  
当规范性文本以下列含义使用某术语时，采用英文权威形式的大写写法（见英文版）。

第 3 节结构层术语对 `PROT-BOUND` / `PROT-HIER` 及相关文档具有规范性。

---

## 2. 核心角色

### 2.1 XAIOP

**XAIOP**（eXtensible AI Output Protocol）指由本规范文档集定义的协议。

### 2.2 Generator（生成器）

**Generator（生成器）** 是产生 XAIOP 文本的实体。生成器通常是在提示、工具或其他约束下运行的 LLM，但协议不要求特定模型。

### 2.3 Parser（解析器）

**Parser（解析器）** 是按协议解释 XAIOP 文本，并产生结构化结果或确定性错误结果的实体。

### 2.4 Consumer（消费者）

**Consumer（消费者）** 是为自身目的使用解析器输出（块、流或派生结构）的应用逻辑。

### 2.5 Downstream System（下游系统）

**Downstream System（下游系统）** 是从消费者或解析器接收数据以进行存储、转换、展示或进一步处理的任何系统。

### 2.6 Encoder（编码器，SDK）

**Encoder（编码器）**（实现用语）将 JSON 兼容值映射为良构 XAIOP 文本。Node.js SDK 编码器只产出**严格**线格式；它是工具侧 **Generator** 路径，不同于 LLM Generator。见 [sdk/nodejs/encode.zh-CN.md](../sdk/nodejs/encode.zh-CN.md)。

---

## 3. 结构层术语

### 3.1 Block（块）

**Block（块）** 是协议中**最小的整合容器载体**。  
块**不是**「最小数据单元」，而是容器，**可以**承载任意长度的正文内容。

### 3.2 Label（标签）

**Label（标签）** 是出现在独立一行、用于声明/定位一个块的字符串，**可以**携带游标操作符前缀。

### 3.3 Cursor（游标）

**Cursor（游标）** 是解析器在层级树中的当前引用位置，由已处理过的标签序列决定。

### 3.4 Root（根）

**Root（根）** 是层级树的初始/顶层引用位置，游标的默认起点，也是 `.` 操作符的目标位置。

当 Stream 以 `>` 或 `-` 开头时，该匿名容器即为完整文档根值。  
省略它们而使用 `>name` 得到**根片段**（记法 `"a":{}`），**没有**外层匿名对象 — **不是** `{"a":{}}`（`PROT-SYNTAX` §2）。

### 3.5 Content（正文）

**Content（正文）** 是标签行之后、下一个标签行之前的所有内容，归属于当前标签所指向的块。

### 3.6 Bare Label（裸标签）

**Bare Label（裸标签）** 是仅有名称、**不含**游标操作符的标签行（例如一行 `data`）。裸标签被**禁止**（`PROT-HIER`），属于语法错误。

### 3.7 Cursor Operator（游标操作符）

**Cursor Operator（游标操作符）** 指：`>` / `>name`（创建/进入 object；空 `>` 一律进入）、`<`（仅回退一层；根上非法）、`<name`（回退再进入）、`=`、`!`、`.`，以及 `-` / `>name-`（打开 array）。

### 3.8 Structure Layer（结构层）

**Structure Layer（结构层）** 涵盖边界与层级（`PROT-BOUND`、`PROT-HIER`），文法入口为 `PROT-SYNTAX`。

### 3.9 Content Layer（正文规范层）

**Content Layer（正文规范层）** 定义正文编码与最小类型（`PROT-CONTENT`），文法入口为 `PROT-SYNTAX`。

### 3.10 Anonymous Object（匿名 object）

**Anonymous Object（匿名 object）** 由空 `>`、无名称段创建。它仍**必须**由游标操作符创建；它不是裸标签。

---

## 4. 流与解析结果

### 4.1 Stream（流）

**Stream（流）** 是随时间发出的有序 XAIOP 文本序列。流可以是有限的，也可以在应用或传输终止前在概念上保持开放。

### 4.2 Well-Formed（良构）

当输入满足适用协议文档的全部规范性句法与结构规则时，称为 **Well-Formed（良构）**（在主张结构层符合性时包括结构层规则）。

### 4.3 Malformed（畸形）

非良构的输入称为 **Malformed（畸形）**。符合规范的解析器**禁止**被要求对畸形输入猜测意图（P7、NG3）。

### 4.4 Deterministic Parse（确定性解析）

**Deterministic Parse（确定性解析）** 指：在相同协议版本下，对相同良构输入，符合规范的解析器得到相同的抽象结果（或相同的错误类别）。

### 4.5 Parse Error（解析错误）

**Parse Error（解析错误）** 是输入畸形或违反规范性约束时的确定性失败结果。对畸形输入静默成功不属于符合规范的行为。

### 4.6 Partial Result（部分结果）

**Partial Result（部分结果）** 是从流前缀中已含一个或多个完整块时，消费者可见的结构，而无需流结束（`PROT-STREAM`）。

---

## 5. 一致性词汇

### 5.1 Conformance Level（一致性级别）

**Conformance Level（一致性级别）** 是实现可据以主张符合性的、具名的需求子集（见 `CONF`）。

### 5.2 Profile（配置）

**Profile（配置）** 是一致性级别或可选特性集的具名组合。

---

## 6. 文档术语

### 6.1 Normative（规范性）

**Normative（规范性）** 文本定义影响符合性主张的要求。

### 6.2 Informative（信息性）

**Informative（信息性）** 文本本身不建立符合性要求。

### 6.3 Document ID（文档 ID）

**Document ID（文档 ID）** 是文档页眉中的稳定短标识符（如 `TERM-GLOSS`）。
