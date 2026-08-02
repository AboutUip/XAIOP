# XAIOP Node.js SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包名 | `xaiop` |
| 协议 | v0.1.0 Frozen |
| 运行时 | Node.js ≥ 18（ESM） |
| 代码 | [../../../xaiop-sdk/nodejs/](../../../xaiop-sdk/nodejs/) |

---

## 安装

```bash
cd xaiop-sdk/nodejs
npm install
npm test
```

```js
import { XaiopEngine, PROTOCOL_VERSION } from "xaiop";
```

---

## 三个 API

主方法均为 **async**，并提供对应 **sync**。

### 1. `new XaiopEngine()` — 创建引擎

```js
const engine = new XaiopEngine();
// 可选：开启兼容模式（默认关闭；失败时逐层上浮并重试该行）
const engineCompat = new XaiopEngine({ compatibilityMode: true });
engine.setCompatibilityMode(true);
```

内存中按运行时 **data id** 保存已上传文档。

### 2. `upload` / `get` — 实例 API

上传**完整**（非流式）XAIOP 文本，得到 data id；再用 id 取解析后的 JSON。  
实例 `upload` 使用引擎当前的 `compatibilityMode`。

```js
const dataId = await engine.upload(xaiopText);
const json = await engine.get(dataId);

const dataId2 = engine.uploadSync(xaiopText);
const json2 = engine.getSync(dataId2);
```

### 3. `XaiopEngine.parse` — 静态 API

无需引擎实例、不存 id，直接解析。

```js
const json = await XaiopEngine.parse(xaiopText);
const jsonSync = XaiopEngine.parseSync(xaiopText);
// 第二参数：兼容模式（默认 false）
const jsonCompat = XaiopEngine.parseSync(xaiopText, true);
```

---

## 兼容模式（Compatibility mode）

兼容模式是**可选**的解析路径，用于消化不完美的模型输出。  
冻结的线协议本身不变；本模式改变 **根形态强制** 以及 SDK 在「当前 Cursor 下该行非法」时的**恢复策略**。

### 默认与开启方式

| | |
| --- | --- |
| 默认 | **关闭** — 任意 `XaiopSyntaxError` 立即失败（忠实协议） |
| 实例 | `new XaiopEngine({ compatibilityMode: true })` · `engine.setCompatibilityMode(true\|false)` · 读取 `engine.compatibilityMode` |
| 静态 / 底层 | `XaiopEngine.parse(source, compatibilityMode?)` · `parseSync` / `parseAsync` — **第二参数**；省略或 `false` = 关闭 |

```js
// 严格（默认）
XaiopEngine.parseSync(text);

// 兼容
XaiopEngine.parseSync(text, true);

const engine = new XaiopEngine({ compatibilityMode: true });
await engine.upload(text); // 使用 engine.compatibilityMode
```

### 强制完整根（外层对象或数组）

兼容模式下，外层文档**必须**是完整的匿名**对象**或**数组**——不是根片段。

| 首行 | 兼容模式动作 |
| --- | --- |
| `>` | 保持对象根（按原文） |
| `-` | 保持数组根（按原文） |
| 其他（`>name`、Content、…） | **补入**空匿名对象根（等价于漏写了开头的 `>`），再解析 |

严格模式仍把开头的 `>name` / Root Content 当作**根片段**（`"a":{}`，无外层 `{}`）。兼容模式对该形态**不会**返回片段，而是 `{ "a": {} }`。

示例 — 模型漏写根开启符：

```text
>meta
name:demo
.
>characters-
>
name:alice
<
```

严格：走片段 → `>characters-` 后的裸 `>` 失败（`fragment bindings`）。  
兼容：隐含补 `>` → `{ meta:{ name:"demo" }, characters:[{ name:"alice" }] }`。

### 裸 `name-` → `>name-`

处理行之前，若整行匹配 `^[A-Za-z_][A-Za-z0-9_]*-$`（如 `aliases-`、`tags-`），则改写为 `>name-`。

- **不**改写无尾 `-` 的裸名（如单独的 `aliases` 仍报错）
- 严格模式永不改写
- 模型常漏写具名数组的 `>`；该行形在严格协议下无合法解释，改写是确定的

### `>` 空白 / `>key:value` 粘连

兼容模式在处理前还会做：

| 原文 | 改写 |
| --- | --- |
| `>  `（`>` 后仅空白） | `>` |
| `>  meta` / `>  tags-` | `>meta` / `>tags-` |
| `>shard_index:1`（`>` 后片段含 `:`） | Content：`shard_index:1` |
| 行尾多余空白 | 去掉行尾空白 |

`>` 后的 Label **不能**含 `:`，故 `>key:value` 的唯一合法意图是 Content。严格模式不做上述改写。

### Root 上多余的裸 `<`

兼容模式下，若 Cursor **已在文档 Root**（`stack.length <= 1`）且本行是裸 `<`，则**忽略**该行（no-op）。

典型：

```text
.
<
>
id:23-1
```

`.` 已回 Root，再写 `<` 严格非法且无意义；忽略后继续解析。  
**不**忽略 Root 上的 `<name`（仍按严格规则报错）。非 Root 的合法 `<` 不受影响。

### 做什么（上浮并重试）

当某行抛出 `XaiopSyntaxError` 且兼容模式开启时：

1. 将 Cursor **上浮一层**（等价于在该深度补一次缺失的 `<`）。  
2. 在新 Cursor 上**重试同一行**（若适用，已先做行改写）。  
3. 若**成功** → 继续解析后续行。  
4. 若错误**不变**（去掉 `line N:` 前缀后的信息相同）→ 再上浮、再重试。  
5. 若错误**发生变化** → **本行**停止恢复，**抛出新错误**。  
6. 若已无法上浮（已在文档 Root）→ **抛出原错误**。

恢复**不**发明新的标签**名**或字段值；可插入隐含离开（上浮）以及上述确定的行改写。

### 同一文档中的多处错误

恢复是**按行**的，成功后解析器**继续往后扫**。  
若同一 Stream 里有两处（或多处）Cursor 疏漏：

1. 在出错行上恢复错误 A（上浮并重试直到该行成功）。  
2. 继续解析后续行。  
3. 后面再出现错误 B 时，再次走同一套恢复。  

一次恢复成功**不会**结束整篇解析。「错误变化 → 抛出」只作用于**单行**恢复循环内部，不是「修好第一处就忽略后面的错误」。

示例 — 同一篇里连续两处漏离开数组：

```text
>
>tags-
:a
>features-
:x
>meta
name:demo
.
```

严格：在第一处坏行（`>features-`）失败。  
兼容：先离开 `tags` 并继续；再离开 `features`，然后接受 `>meta` → `{ tags:["a"], features:["x"], meta:{ name:"demo" } }`。

### 典型可恢复场景

本模式主要针对这些常见 LLM 疏漏：

| 严格模式失败 | 常见原因 | 兼容模式动作 |
| --- | --- | --- |
| 数组内出现 `>name` / `>name-` | 列表写完后忘记 `<` / `.` 就开下一段 | 上浮直到离开该数组，再接受 `>name-` |

线协议下：已在**对象**上的裸 `>` 会**再进入**该对象（修改；同键后写覆盖）— **不是**语法错误，兼容上浮不会介入。**数组内**裸 `>` 仍是**创建**新元素。

示例 — 具名数组结束后未离开（严格失败；兼容成功）：

```text
>
>tags-
:alpha
:beta
>users-
>
id:1
name:alice
<
```

严格：在 `>users-` 报错（仍在数组内）。  
兼容：先上浮离开 `tags`，再正常解析 `>users-`。

### `=path` 去空白 / 数组后缀重试

当 `=path` 找不到且兼容模式开启时，按序再匹配：

1. **去掉首尾空白**（如 `= siblings` → `siblings`）。  
2. 仍找不到则 **去掉全部空白**（如 `=child > inner` → `child>inner`）。  
3. 仍找不到则把段末尾 `-` 当作误用在定位上的 **`>name-` 创建后缀**：仅当去掉 `-` 后的 key 存在且值为 **array** 时才匹配（如 `=siblings-` → `siblings` 数组；`=wrap>items-` → `wrap.items` 数组）。  
4. 仍找不到 → 抛出原来的 `=path not found`（消息里仍是原始 path 文本）。

严格模式绝不去空白、也不剥创建后缀。  
`=meta-` **不会**匹配到对象字段 `meta`（后缀 `-` 只对数组生效）。

### 明确不做的事

- **不**把任意裸 Label 都变成 Structure（仅 `name-` → `>name-` 等已列确定改写）。  
- **不**发明字段名；除 `=path` 重试与已列行改写外不纠错别字。  
- **不**改变数组语义：数组内裸 `>` 仍是**创建**新元素。  
- **不**保证语义「合理」——只做根强制 + 确定行改写 + `=path` 重试 + 上浮重试。  
- 注意：严格模式下合法的**根片段**，在兼容模式下会变成完整对象（强制根）。

### 何时使用

| 宜用严格（默认） | 宜用兼容 |
| --- | --- |
| 一致性测试、协议验收、黄金夹具 | 接入经常漏写 `<` / 少弹栈的 LLM 输出 |
| 需要字节级协议忠实 | 宁可救出一棵树，也不整篇丢弃 |

**建议：** 生成端可控（Skill + 听话模型）时，校验保持**严格**；在**摄入边界**面对模型漏离开数组/元素时再开兼容。

### 兼容模式下的错误

- 恢复无效或上浮后错误变化时，仍抛出 `XaiopSyntaxError`。  
- 严格模式：**不做**任何静默修复。

---

## API 参考

| API | 说明 |
| --- | --- |
| `new XaiopEngine(options?)` | 标准引擎实例；`options.compatibilityMode` 默认 `false` |
| `compatibilityMode` / `setCompatibilityMode` | 读写兼容模式（详见上文「兼容模式」） |
| `upload(source)` / `uploadSync` | 完整文本 → data id（跟随实例兼容开关） |
| `get(dataId)` / `getSync` | data id → JSON（克隆） |
| `XaiopEngine.parse` / `parseSync` | 静态：文本 → JSON；可选第二参数开启兼容模式 |

辅助：`PROTOCOL_VERSION`、`has` / `delete` / `clear`、`XaiopSyntaxError`。

---

## 错误

- 非法线格式 → `XaiopSyntaxError`  
  - **严格（默认）：** 立即失败；**不**静默修复  
  - **兼容：** 按上文上浮重试；恢复失败或错误变化时仍抛出  
- 未知 data id → `Error`  
- 参数类型错误 → `TypeError`  

---

## 样例

见 [../../examples/complex.xaiop](../../examples/complex.xaiop)。

---

## 本版本范围外

- 流式 Snapshot / Diff（`PROT-STREAM`，后续）  
- Emitter（JSON → XAIOP）  
