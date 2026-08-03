# 内容编码

[English](content.md) · [简体中文](content.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PROT-CONTENT` |
| 状态 | **Frozen（已冻结）** |
| 版本 | 0.4.0 |
| 最近更新 | 2026-08-03 |
| 规范性 | **规范性** |
| 依赖 | `PROT-SYNTAX`、`PROT-BOUND`、`PROT-HIER` |
| 影响 | `CONF` |

---

## 1. 范围

结构 Label 定位 Block 之后的 Content 编码。  
完整文法：先看 **[syntax.zh-CN.md](syntax.zh-CN.md)**。

范围外：键的业务语义校验；应用命名/深度策略。

---

## 2. 分隔符 `:`

Content **必须**用 `:` 作键/值分隔。  
字符串类型无双引号标记。

Content 值行 **必须**至少含一个 `:`（独立结构 `-` 不是 Content）。

### 2.1 按第一个 `:` 分割

仅按 **第一个** `:` 分割。

- 前：键（空 ⇒ 匿名 `:value`）  
- 后：原始值文本  
- 后续 `:` 留在值内  

---

## 3. 形式

### 3.1 `key:value`

对象属性：`name:xuan` → `{ "name": "xuan" }`

### 3.2 `:value`

匿名 / 标量值（典型为数组元素）：`:a` → 数组光标下为 `"a"`。

---

## 4. 值中禁止换行

值中 **不得**含 `LF` / `CRLF`。  
下一行是新的解析尝试，绝不是值续行。

---

## 5. 最小类型化

在强制字符串标记（第 6 节）之后，按**首个匹配**规则：

1. 可解析为 int → **int**  
2. 可解析为 float → **float**（JSON number；IEEE 754 **binary64**）  
3. 恰为 `true` 或 `false`（小写）→ **bool**  
4. 恰为 `null`（小写）→ **null**  
5. 其他 → **string**

### 5.1 可解析为 int

可选前导 `+` 或 `-`，其后仅为一个或多个十进制数字（`0`–`9`）。不含 `.`，不含指数。

### 5.2 可解析为 float

**不是** int 可解析，且匹配：

```text
[ "+" / "-" ] (
  1*DIGIT "." *DIGIT [ exponent ] /
  "." 1*DIGIT [ exponent ] /
  1*DIGIT exponent
)
exponent = ( "e" / "E" ) [ "+" / "-" ] 1*DIGIT
```

**必须**标为 float 的示例：`1.5`、`-2.25`、`.5`、`5.`、`1e3`、`-2.5E-2`。

### 5.3 浮点精度

浮点记号作为 JSON number 暴露时，符合实现 **必须** 将其解释为 IEEE 754 **binary64**（双精度）值——JSON number 常见面下的最高精度。宿主 API **应当** 使用对应面的原生 binary64 浮点类型（如 ECMAScript `Number`、Java `double`）。

`NaN`、`Infinity`、`-Infinity` **不是** float 可解析；除非另行强制，否则保持为 **string**。

---

## 6. 强制字符串

`:` 后、值文本前有一个或多个空格则强制为 **string**。这些空格不属于载荷。该规则同样适用于看起来像 int / float 的文本。

```text
value: 1
```

→ `{ "value": "1" }`

```text
ratio: 1.5
```

→ `{ "ratio": "1.5" }`

```text
flag: true
```

→ `{ "flag": "true" }`

```text
empty: null
```

→ `{ "empty": "null" }`

无空格时：

```text
ratio:1.5
```

→ `{ "ratio": 1.5 }`

```text
empty:null
```

→ `{ "empty": null }`

---

## 7. 空行

空的 Content 行 **必须**为 Content 语法错误。

---

## 8. 与数组 Content 的交互

见 [syntax.zh-CN.md](syntax.zh-CN.md) §6 / §6.1：

- **数组层 — 标量：** `:value` 推入一个标量元素。  
- **数组层 — 单行对象（规范性）：** 键非空的 `key:value` 推入一个完整元素 `{ "key": <类型化后的值> }`。光标**仍停留**在数组层（不进入）。  
- **数组层 — 可填充对象：** `>` 创建对象元素**并进入**；Content 累积；下一兄弟前用 **`<`** 回到数组。  
- 空对象元素 **必须**用 `>`。
