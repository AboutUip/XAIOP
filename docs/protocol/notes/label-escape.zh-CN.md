# Label 转义头（符号键模式）

[English](label-escape.md) · [简体中文](label-escape.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PROT-NOTE-LABEL-ESC` |
| 状态 | **Draft**（面向协议包 **0.7.0**；SDK 可先行实现） |
| 最近更新 | 2026-08-27 |
| 规范性 | 启用 `symbolKeys` / 符号键模式时为 **规范** |
| 依赖 | `PROT-SYNTAX`、`PROT-HIER`、`PROT-CONTENT` |

---

## 1. 问题

JSON 键若以 **行类字符**（`#` `@` `>` `<` `=` `!` `&` `?`）开头，不能写成裸 Content / `>name` label：首字符会改变行分类（例如 `#k:1` 是自定义注解传递，不是 Content）。

默认生成器 **必须** 拒绝此类键（SDK 抛 `XaiopEncodeError`）。禁止「编得出、解成空」的静默蒸发。

---

## 2. 保留转义头

**Label 转义头** = **U+001F** UNIT SEPARATOR（UTF-8 单字节 `0x1F`）。

1. U+001F 为本方言 **保留**。  
2. 默认模式（符号键模式 **关**）：对象键 **不得** 以 U+001F 或以 `#` `@` `>` `<` `=` `!` `&` `?` 开头。  
3. `#` 仅出现在非首位的键（如 `a#b`）仍是普通 Content label。  
4. 独立自定义注解行（逻辑行 **首字符** 为 `#`）**不变**，且 **不是** JSON 键。

---

## 3. 符号键模式（可选开启）

生成端与解析端均启用 **符号键模式**（当前 SDK：`symbolKeys: true`）时：

### 3.1 编码

若逻辑键首字符属于 `{ U+001F, #, @, >, <, =, !, & }`，线文 label 为：

```text
U+001F + 逻辑键
```

（双重转义：逻辑键已以 U+001F 开头则再垫一层。）

转义头之后的键体仍禁止 Cursor/运算符字符 `>` `<` `=` `!` `&`。

### 3.2 解码

从 Label 去掉 Cursor 运算符后，若剩余文本以 U+001F 开头，去掉 **恰好一层** 转义头得到逻辑 JSON 键。

### 3.3 方言耦合

只开 encode 不开 parse 会把 U+001F 留在应用键里。同一文档/会话两端 **必须** 约定一致。

---

## 4. 非目标

- 不为 string **值** 转义。  
- 不改变自定义注解传递。  
- 不宣称覆盖全部 JSON 键空间（开不开模式都一样）。含 `:` 或空白的键在符号键模式下仍是非法 Label。

---

## 5. 参见

- Hierarchy `#` 注解：[../hierarchy.zh-CN.md](../hierarchy.zh-CN.md) §11  
- SDK：[../../sdk/nodejs/API.zh-CN.md](../../sdk/nodejs/API.zh-CN.md) §4.2–4.3 · Java `EncodeOptions.symbolKeys` / `ParseOptions.symbolKeys`
