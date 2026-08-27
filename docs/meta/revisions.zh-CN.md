# 规范修订记录

[English](revisions.md) · [简体中文](revisions.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-REV` |
| 状态 | **Frozen（已冻结）** |
| 版本 | 0.6.0 |
| 最近更新 | 2026-08-05 |
| 规范性 | 信息性（历史） |
| 依赖 | `META-VER` |

---

## 1. 范围

XAIOP **规范包**的有序修订历史。  
英文为权威文本；中文镜像与英文条目对齐。

---

## 2. 包历史

### 0.7.0 — Draft（进行中）

**类型：** 加法 / 破坏性规范（Content 字符串转义）+ 加法方言（Label 转义 / 符号键模式）。

**摘要：**

- **Content（一律生效）：** 保留 `\\` `\n` `\r` 为 Content 转义字母表。物理 `LF`/`CRLF` 仍结束一行。字符串值中的 `U+000A`/`U+000D` 只能以这两字符序列出现。未知 `\x` 与末尾光杆 `\` 为语法错误。剥强制 string 空格后、打字前解转义。相对 **0.6.0** 中字面 `\n` 的载荷为 breaking。
- **Label 转义（可选）：** 保留 **U+001F** 为 Label 转义头。默认键不得以行类首字符开头。可选符号键模式 encode 前缀一层、parse 剥一层。不改变独立 `#…`。
- **数组元素选择：** 算子 `?`（`?2` / `?id:A2` / `?*` / `?*k:v`）。裸 `&` 删除当前直接数组元素。不是 JSON Patch / RFC 6902。

| 区域 | 变更 |
| --- | --- |
| `PROT-CONTENT` §4 | 语义换行；转义字母表 |
| `PROT-SYNTAX` §1.8 / §3 | 物理 vs 语义多行 |
| `PROT-NOTE-LABEL-ESC` | Draft 笔记 [protocol/notes/label-escape.zh-CN.md](../protocol/notes/label-escape.zh-CN.md) |
| `PROT-HIER` §9 / §12.5 | `?` 选元素；裸 `&` 删元素 |
| Node.js / Java / Python / Go SDK | 产品 **0.16.0**：Content 解/转义；`symbolKeys`；`?` / 裸 `&`；`LINE_KIND.SELECT` |

---

### 0.6.0 — 2026-08-04（Frozen）

**类型：** 加法性规范变更（Hierarchy / Syntax — 自定义注解传递）。

**摘要：** 新增独立 `#…` 行，用于 **自定义注解传递**（官方名称；不是「注释」原语）。行必须以 `#` 开头；位置不限；协议不解释 `#` 之后内容；对 Cursor / 树 / Block / 广播无副作用。Content 值内的 `#` 仍是 Content。行首空白则不是本原语。

| 范围 | 变更 |
| --- | --- |
| `PROT-HIER` §11（其后章节顺延） | 定义 `#` 自定义注解传递 |
| `PROT-SYNTAX` §3 | 表：`#…` |
| 协议 notes | wire-attention — `#` |
| `TERM-GLOSS` | 自定义注解传递 |
| `META-VER` | 封存包版本 → `0.6.0` |
| Node.js SDK | **0.11.0** — 忽略 `#` 行；`PROTOCOL_VERSION` → `0.6.0`。Tip **0.12.0** — 缓冲行拦截（`onLineIntercept`）。Tip **0.13.0** — Annotation Span（`onAnnotationSpan`；typeCheck 逃逸）。Tip **0.14.0** — 控制根 `#!` demux / session / seq / resume。Tip **0.14.1** — `#!xaiop/seq/v1` → `meta.logSeq`。Tip **0.14.2** — `.` 后 Diff 隔离（D1）。Tip **0.14.3** — `@` 累积 Diff（D2）；可选 `onChunk`。Tip **0.15.0** — `bufferStats` / `compactCommitted`（仍协议 **0.6.0**） |

**兼容性：** 从不发射 `#` 行的写者仍合法。不忽略 `#…` 行的解析器 **不符合** 协议包 **0.6.0**。

### 0.5.0 — 2026-08-04（Frozen）

**类型：** 加法性 / 破坏性规范变更（Hierarchy — 删除）。

**摘要：** 新增 **`&path`** 删除（语法同 `@`；段用 `>`；禁止裸 `&`）。单光标：自 Root **绝对**；删最深键；**不**移动 Cursor。缺失目标 = 静默无操作。仅 **object** 文档根（数组根 / 片段根非法；不得删文档根）。可删整个具名数组值；**无**元素下标删除。删到 Cursor 链上节点 → 语法错误。广播（`!`）：**允许** `&`，路径相对各 Cursor；该 Cursor 上缺失 = 无操作；任一链冲突则整行失败。`.` 仍只重置 Cursor / 退出广播。同址再写 = 创建。

| 范围 | 变更 |
| --- | --- |
| `PROT-HIER` §8–§9（及相关） | 定义 `&`；澄清 `.` 与 `&` |
| `PROT-SYNTAX` §3 | 表：`&path` |
| 协议 notes | wire-attention / streaming-attention — `&` |
| `TERM-GLOSS` | 删除等相关术语 |
| `META-VER` | 封存包版本 → `0.5.0` |
| Node.js SDK | **0.8.0** — 解析 `&`；可选 `cover` Diff（仅 SDK）；**0.9.0** — TypeScript；`xaiop` / `xaiop/browser` / `xaiop/core`（浏览器相位消费）；**0.10.0** — 类型注册/冻结检查；WS 类型一致性推送 |

**兼容性：** 从未发射 `&` 的写者仍合法。未实现 `&` 的解析器 **不符合** 协议包 **0.5.0**。cover 式 Diff 整形 **不属于** 线文法。

### 0.4.0 — 2026-08-03（Frozen）

**类型：** 破坏性 / 加法性规范变更（Hierarchy — 定位与广播）。

**摘要：** 新增 **`@path`**（自 Root 精确；**创建**缺失对象段）；将 **`!path`** 升级为真广播多光标（完整路径片段 + 外层剪枝），在**已建整树**上匹配（向前跨相，含更早 `.` 相）。**`=`** 仍为同树模糊首命中。`.` 退出广播。

| 范围 | 变更 |
| --- | --- |
| `PROT-HIER` §6–§9 | `=` / `@` / `!` / `.`（退出广播） |
| `PROT-SYNTAX` §3 | 表：`@path`、`!path` |
| 协议 notes | wire-attention 定位节 |
| `META-VER` | 当前包 → `0.4.0` |
| Node.js SDK | 多光标 `!`；`@` 精确；`PROTOCOL_VERSION` → `0.4.0`；包 `0.6.0` |

**兼容性：** 旧 Node「`!` 仅首命中」在 0.4.0 下 **不符合** 协议。假定单光标 `!` 的写者 **必须** 改用 `@` 或 `=`。广播中须先 `.` 再定位。

---

### 0.3.0 — 2026-08-03（Frozen）

**类型：** 破坏性规范变更（Hierarchy — 具名数组）。

**摘要：** 再开具名数组 `>name-` 改为 **再进入并追加**，与 `>name` 对象再进入对齐。0.2.x 为整段替换。

| 范围 | 变更 |
| --- | --- |
| `PROT-HIER` §9.1 / §10 | `>name-` 创建或再进入；类型冲突仍丢弃 |
| `PROT-SYNTAX` §3 / §8 | 表与覆盖摘要 |
| 协议 notes | wire-attention / streaming-attention |
| `META-VER` | 当前包 → `0.3.0` |
| Node.js SDK | `createEnterNamedArray` 再进入；`PROTOCOL_VERSION` → `0.3.0`；包 `0.5.0` |

**兼容性：** 依赖第二次 `>name-` **清空**具名数组的流 **必须** 适配（0.3.0 无专用清空算子）。跨 `.` 追加现为默认。

---

### 0.2.1 — 2026-08-03（Frozen）

**类型：** 加法性规范变更（Content 类型化）。

**摘要：** 在最小 Content 类型化中增加 **null**，强制字符串规则与 bool/int/float 相同（`:` 后空格强制为 string）。记号 `null` 物化为 JSON `null`。

| 范围 | 变更 |
| --- | --- |
| `PROT-CONTENT` §5 | bool 之后；恰为 `null` → **null**；否则 string |
| `PROT-CONTENT` §6 | 强制字符串示例：`null` → `"null"` |
| `PROT-SYNTAX` §7 | 类型摘要包含 null |
| `META-VER` | 当前包 → `0.2.1` |
| Node.js SDK | parse/encode 识别 null；`PROTOCOL_VERSION` → `0.2.1` |

**兼容性：** 先前裸 `null` 被标为 **string** `"null"`，现为 JSON **null**。结构 / 流式文法不变。依赖「字符串 null」的应用 **必须** 适配，或在 `:` 后加空格强制为 string。

**理由（信息性）：** JSON 常用 null 表示可选字段；省略/拒绝 null 会阻断忠实 JSON ↔ XAIOP 往返。

---

### SDK 附注 — Node.js `xaiop` 0.4.0 / 0.4.1（2026-08-03，信息性）

| 范围 | 变更 |
| --- | --- |
| 0.4.0 | `XaiopWs` listen/push + connect/consume；依赖 `ws` |
| 0.4.1 | 对齐协议 **0.2.1** null；默认 `nullPolicy: "encode"` |

---

### 0.2.0 — 2026-08-03（Frozen）

**类型：** 加法性规范变更（Content 类型化）。

**摘要：** 在最小 Content 类型化中增加 **float**，强制字符串规则与整数相同（`:` 后空格强制为 string）。浮点记号物化为 IEEE 754 **binary64** JSON number。

| 范围 | 变更 |
| --- | --- |
| `PROT-CONTENT` §5 | int 可解析 → int 之后，增加 float 可解析 → float（binary64）；再 bool；否则 string |
| `PROT-CONTENT` §6 | 强制字符串示例覆盖浮点（`1.5` → `"1.5"`） |
| `PROT-SYNTAX` §7 | 类型摘要包含 float |
| `META-VER` | 当前包 → `0.2.0` |
| Node.js SDK | `parseValue` 识别浮点记号；`PROTOCOL_VERSION` → `0.2.0` |

**兼容性：** 先前被标为 **string** 的 `1.5` / `1e3` 现为 **number**。结构 / 流式文法不变。依赖「浮点字符串」的应用 **必须** 适配，或在 `:` 后加空格强制为 string。

**理由（信息性）：** 生产载荷（指标、小数、科学计数）需要数值浮点，且无需第二套标记。Binary64 与常见 JSON number 面一致，也是典型运行时（如 ECMAScript `Number`、IEEE double）对 JSON number 所能提供的最高精度。

---

### SDK 附注 — Node.js `xaiop` 0.3.0（2026-08-03，信息性）

**非协议包升版。** 在 Frozen 线格式 0.2.0 上的 SDK 加法：

| 范围 | 变更 |
| --- | --- |
| Encode | `encode` / `encodeSync`（静态、实例、自由函数）— JSON → 严格 XAIOP |
| Engine | `uploadJson` / `uploadJsonSync` |
| 选项 | 通过 `dotPolicy` / `phaseEvery` / `maxPhases` / `shouldPhase` 控制 `.` |
| 文档 | [sdk/nodejs/API.zh-CN.md](../sdk/nodejs/API.zh-CN.md) 编码章节（历史条目；原 `encode.md` 已合并） |
| 测试 | `encode.test.js` + `encode.stability.test.js` |

---

### 0.1.0 — 2026-08-02（Frozen）

首个封存协议包：结构层（`PROT-BOUND`、`PROT-HIER`、`PROT-SYNTAX`）、内容层（`PROT-CONTENT`，仅 int / bool / string）、流式（`PROT-STREAM`）。
