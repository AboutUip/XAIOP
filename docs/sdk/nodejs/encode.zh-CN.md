# Node.js 编码（JSON → XAIOP）

[English](encode.md) · [简体中文](encode.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包 | `xaiop` **0.6.0+** |
| 协议线格式 | Frozen **v0.4.0** |
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
4. 命名数组 **可以**跨 `.` 相位拆开（`.` 后再开 `>name-` 为**追加**）。Encode 默认仍把每个命名数组放在一相（Diff 清晰度）。
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
| `perTopLevelKey`（**默认**） | 每个顶层**对象**键之间插入 `.` |
| `none` | 整篇一个文档；无相位 `.`（除非 `finalDot`） |
| `perNKeys` | 每 `phaseEvery` 个键一个相位 |
| `custom` | `shouldPhase(ctx)` 为 true 时切相 |
| **`string[]`**（路径重载） | 列出的每个 JSON 路径节点**编码完成后**插入 `.` |

**路径数组重载**（`dotPolicy: string[]`）：

- 路径为 **JSON 风格**：`a.b[2]`（`.` 与 `[i]`），不是 XAIOP 的 `>`。
- 在该节点（及其文档序中此前内容）编码完后插入 `.`。
- 路径不存在 → `XaiopEncodeError`（严格）。
- 与 `phaseEvery` / `maxPhases` / `shouldPhase` **互斥**。
- 需要 `style: "reset"`（默认）。
- 数组下标只能是**最后一段**（`data.childs[2]` 可以；`data.childs[2].name` 拒绝——`.` 之后 `>name-` 只能**追加**新元素，无法继续同一元素对象）。
- 辅助：`parseJsonPath` / `formatJsonPath`。

**数组文档根：** 编码值为数组（或 `root: "array"`）时，线以 `-` 开头，**不适用**对象式命名 `dotPolicy` 分相。路径模式仍会遍历值；需要给 `XaiopStream` / `DotCheckpointEngine` 中途 `.` 时请优先用对象根。

常用选项：`phaseEvery`、`maxPhases`、`finalDot`、`style`、`root`、`keyOrder`、`nullPolicy`、`undefinedPolicy`。常量见 `DOT_POLICY`。

### 生产流式 — 主动安排 `.` 位置

面向 **生产流管道**（`XaiopStream` / `DotCheckpointEngine` / WS 相位推送）时，把 `.` 出现位置当作产品设计的一部分，**不要**默认依赖 `perTopLevelKey`，除非它刚好符合你的交付形态。

| 目标 | 建议 |
| --- | --- |
| 大块连续数据（长文本、blob、稠密表）尽量 **一相传完** | 该子树内部 **不要** 插 `.`。用 `none`、更粗的 `perNKeys` / `custom`，或 **路径数组只切在重区域之外** |
| 可分离的子结果尽早、丝滑送达 | 用 `dotPolicy: string[]`（或 `custom`）在每个可消费子单元**编码完成后**切相——如先 meta，再每个列表元素 / 可渲染区块 |
| 避免消费端意外的 O(相位 × 体积) | 少而准的 `.` 优于「每个顶层键一相」（文档很宽时尤其） |

**经验法则：** 一个 `.` = 消费端一次 Diff/Commit 边界。边界放在 **接收方有收益** 处（渐进 UI / 部分提交）；**大块连续数据**留在同一传递单元，避免被切成多次重解析。

JSON 形状已知时，路径数组通常最合适：只列出需要的切点（如 `["meta", "items[0]", "items[1]"]`），大字段不列入路径，则它会完整落在包含它的那一相里。

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
