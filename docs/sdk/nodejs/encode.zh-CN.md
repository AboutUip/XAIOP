# Node.js 编码（JSON → XAIOP）

[English](encode.md) · [简体中文](encode.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包 | `xaiop` **0.3.0+** |
| 协议线格式 | Frozen **v0.2.1**（未改） |
| 代码 | [`encode.js`](../../../xaiop-sdk/nodejs/src/encode.js) |
| 测试 | `encode.test.js` · `encode.stability.test.js` |
| 注意事项 | [notes/encode-attention.zh-CN.md](notes/encode-attention.zh-CN.md) |

上级指南：[README.zh-CN.md](README.zh-CN.md) · 隔离：[../../SEPARATION.zh-CN.md](../../SEPARATION.zh-CN.md)

---

## 1. 目的

编码器把**纯 JSON 值**变成**严格 XAIOP 线文本**。

| 场景 | 说明 |
| --- | --- |
| 工具 / 适配 / 测试 | 无需手写 Label |
| 流式演示 | 控制 `.` 相位大小，对接 `XaiopStream` / `DotCheckpointEngine` |
| `uploadJson` | 编码后写入 Engine |

**不**替代模型原生生成 XAIOP。评测方法论仍要求双通道原生输出（见 [performance.zh-CN.md](../../performance.zh-CN.md) §2）— SDK encode 用于**工具链**，不能用来声称那些指标里的「模型做了 JSON→XAIOP 转写」。

---

## 2. API

主方法均为 async，并提供 sync。实例 / 静态 / 自由函数对同一 `(value, options)` 产出**相同**线文本。

```js
import {
  encode,
  encodeSync,
  DOT_POLICY,
  XaiopEncodeError,
  XaiopEngine,
} from "xaiop";

const wire = encodeSync({ a: 1, b: { x: true } });
const id = await new XaiopEngine().uploadJson({ tags: ["a", "b"] }, { dotPolicy: "none" });
```

| API | 作用 |
| --- | --- |
| `encode` / `encodeSync` | 自由函数 |
| `XaiopEngine.encode` / `encodeSync` | 静态 |
| `engine.encode` / `encodeSync` | 实例（**忽略**兼容开关） |
| `engine.uploadJson` / `uploadJsonSync` | 编码 → `upload` |

兼容模式**永不**改变编码输出（只产严格线格式）。

---

## 3. 稳定性约定

### 保证

对编码器**接受**的值：

1. **`parseSync(encodeSync(value, opt))` 与 `value` 深度相等**（JSON 值相等；`-0` 归一为 `0`）。
2. **确定性** — 相同 `(value, options)` → 相同线字符串。
3. **双重往返** — 相同选项下 `rt(rt(value)) === value`。
4. 命名数组**不会**跨 `.` 相位拆开（`.` 后再开 `>name-` 是**替换**不是追加）。
5. 线文本以恰好一个 `\n` 结尾。

### 不保证

- `encode(parse(手写线))` 字节级相同。
- 保留对象上的 `undefined` 键（默认**省略**）。
- 数组空洞（`undefined` 元素 → **报错**）。
- 非纯对象、非有限数字、含 CR/LF 的字符串。
- 文档根为 `null` / `undefined`（根必须是对象或数组）。

### 拒绝的键（防止静默改形）

| 键形态 | 原因 |
| --- | --- |
| 空 / 空白 / 含 `:` | 非法 Label 名（与解析器一致） |
| 以 `-` 结尾 | `>name-` 表示**数组**进入 — 会把对象误编成数组 |
| 含 `>` `<` `=` `!` | Cursor / 定位运算符歧义 |

---

## 4. 类型（Content）

与 `PROT-CONTENT`（包 **0.2.1**）一致：安全整数 → int；有限非整数 → float；布尔；**null**（`key:null` / `:null`）；字符串；形似数字/布尔/**null** 的字符串 → **强制字符串**（`:` 后空格）。

---

## 5. 点号策略（`.` 相位）

`.` 将 Cursor 重置到 Root，并界定**流式相位**。默认每个**顶层对象键**一个相位。

| `dotPolicy` | 行为 |
| --- | --- |
| `perTopLevelKey`（**默认**） | 顶层键之间插入 `.` |
| `none` | 整篇一个文档；无相位 `.`（除非 `finalDot`） |
| `perNKeys` | 每 `phaseEvery` 个键一个相位 |
| `custom` | `shouldPhase(ctx)` 为 true 时切相 |

常用选项：`phaseEvery`、`maxPhases`、`finalDot`、`style`、`root`、`keyOrder`、`nullPolicy`、`undefinedPolicy`。常量见 `DOT_POLICY`。

---

## 6. 结构

对象键 → Content 或 `>name` / `>name-`；数组根 → 行首 `-`；数组元素对象/数组用 `>` / `-` 并在同相位兄弟前 `<` 回到父级。

---

## 7. 错误

`XaiopEncodeError`；可选 `.path`（如 `$.meta.name`、`$[0].id`）。

---

## 8. 测试覆盖

| 套件 | 重点 |
| --- | --- |
| `encode.test.js` | API、类型、策略、流对齐、夹具 |
| `encode.stability.test.js` | 确定性、双重往返、随机语料、Unicode、危险键、分块流 |

运行：`cd xaiop-sdk/nodejs && npm test`

**坑点清单：** [notes/encode-attention.zh-CN.md](notes/encode-attention.zh-CN.md) · 流式 Diff 边界：[notes/streaming-parse.zh-CN.md](notes/streaming-parse.zh-CN.md)
