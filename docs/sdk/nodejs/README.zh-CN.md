# XAIOP Node.js SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包名 | `xaiop` |
| 协议 | v0.4.0 Frozen |
| 运行时 | Node.js ≥ 18（ESM） |
| 代码 | [../../../xaiop-sdk/nodejs/](../../../xaiop-sdk/nodejs/) |

**隔离：** 协议=仅线格式 · 实践=模型与流式传输 · 本包=API — [../../SEPARATION.zh-CN.md](../../SEPARATION.zh-CN.md)。  
**对等：** [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)（协议符合 ≠ 本 SDK）。  
**文档：** [指南](README.zh-CN.md) · [流式](stream.zh-CN.md) · [编码](encode.zh-CN.md) · [合并](merge.zh-CN.md) · [注意事项](notes/) · [实践](../../practice/) · [协议](../../protocol/)

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

## 主要 API

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
// 第二参数：仅 boolean 兼容开关（默认 false）
const jsonCompat = XaiopEngine.parseSync(xaiopText, true);
```

**不对称：** 自由函数 `parseSync` / `parseAsync` 接受 `boolean | CompatPolicy | 部分 fix 映射`（见下文 CompatPolicy）。静态 `XaiopEngine.parse` / `parseSync` **只接受 boolean**。

### 3b. 根片段 — `XaiopFragment`

严格模式：文档无匿名根（`>` / `-`），而以 `>name` 或 Root Content 开头时，返回 **`XaiopFragment`**（不是包一层 `{ "a": … }`）。

| 属性 / 方法 | 含义 |
| --- | --- |
| `entries` | Root 上的命名绑定 |
| `isFragment` | 恒为 `true` |
| `notation()` | 调试串，如 `"a":{}` |

空源 → `{}`（不是 fragment）。兼容 `forcedRoot` 对该形状永不返回 fragment，而是完整对象。  
**流式 / WS 的 JSON 表面** 调用 `materializeSnapshot`：fragment 变为 `entries` 的克隆（普通对象）。Engine `get` 在存在时保留 fragment。

### 4. `encode` / `uploadJson` — JSON → XAIOP

编码只产出**严格**线格式（兼容模式不影响输出）。  
默认 `dotPolicy` 为 `perTopLevelKey`，每个顶层键对应一个 `.` 相位，便于 `DotCheckpointEngine` / `XaiopStream`。

```js
import { encodeSync, DOT_POLICY, XaiopEngine } from "xaiop";

const wire = encodeSync(
  { meta: { name: "demo" }, tags: ["a", "b"] },
  { dotPolicy: DOT_POLICY.NONE },
);

const phased = XaiopEngine.encodeSync(
  { a: 1, b: 2, c: 3 },
  { dotPolicy: "perNKeys", phaseEvery: 2 },
);

const engine = new XaiopEngine();
const id = await engine.uploadJson({ x: 1 });
```

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `root` | `auto` | `object` / `array` / `auto` |
| `dotPolicy` | `perTopLevelKey` | `none` · `perTopLevelKey` · `perNKeys` · `custom` |
| `phaseEvery` | `1` | `perNKeys` 使用 |
| `maxPhases` | — | 限制相位数量（合并尾部） |
| `shouldPhase` | — | `custom` 必填 |
| `finalDot` | `false` | 是否追加末尾 `.` |
| `nullPolicy` | `encode` | 默认编码；`omit` 仅省略对象 null 键；`error` 遇 null 抛错。数组除非 `error` 否则发 typed `null`。 |
| `keyOrder` | `insertion` | 或 `sorted` |

**拒绝的键**（会静默改形）：空 / 空白 / `:`、尾部 `-`、字符 `>` `<` `=` `!`。

往返保证：对编码器接受的纯 JSON，`parseSync(encodeSync(json))` 与 `json` 一致。不要求 `encode(parse(wire))` 字节级相同。

**完整编码指南：** [encode.zh-CN.md](encode.zh-CN.md)（稳定性约定、危险键、相位选项、测试）。

### 4b. `mergeToJson` / `mergeToXaiop` / `inject*` — 预处理 / 后处理合并

非流式。基底 **JSON** 与 XAIOP 合并（或注入已有 `dataId`）。冲突策略仅作用于**键**（`overwrite` | `keep`）。

```js
import { mergeToJson, mergeToXaiop, MERGE_CONFLICT, XaiopEngine } from "xaiop";

const json = mergeToJson({ a: 1 }, ">\nb:2\n", { conflict: MERGE_CONFLICT.KEEP });
const wire = mergeToXaiop({ a: 1 }, ">\na:9\n");

const engine = new XaiopEngine();
const id = engine.uploadJsonSync({ a: 1 });
engine.injectXaiopSync(id, ">\nb:2\n");
engine.injectJsonSync(id, { a: 9 }, { conflict: "keep" });
```

**指南：** [merge.zh-CN.md](merge.zh-CN.md)。

### 5. `XaiopWs` — WebSocket listen / connect（SDK 0.4.0）

骨架流一等会话（同一包：推 + 收）。见 [notes/ws-session.zh-CN.md](notes/ws-session.zh-CN.md) 与 [../../practice/skeleton-stream.zh-CN.md](../../practice/skeleton-stream.zh-CN.md)。

```js
import { XaiopWs } from "xaiop";
const hub = await XaiopWs.listen({ port: 0 });
hub.onConnection(async (c) => {
  c.pushJson("a", 1, { final: true });
  await c.end();
});
const client = await XaiopWs.connect(hub.url());
await client.done;
await hub.close();
```

HTTP/SSE/RAW 仍在 `XaiopStream` 上，供其它路径使用 — 完整 API：[stream.zh-CN.md](stream.zh-CN.md)。

### 6. `XaiopStream` — HTTP / SSE / WS / RAW 消费端

独立流式客户端。Diff = `.` 相位（非 Block Diff）。默认：`streamProcessing` 开、**`mergeChunkWindow` 开**、`compatibilityMode` 关、`asyncParse` 关、**`historySnapshot` / `historyRealtime` 关**、modes 仅 `callback`。

```js
import { XaiopStream } from "xaiop";
const stream = new XaiopStream(url, {
  mergeChunkWindow: true, // 默认 — 缓冲窗口内完整 `.` 合并一次 Diff
  asyncParse: true, // 生产：合并异步摄入
  historySnapshot: true, // 可选只读 `.` 历史
  historyRealtime: true, // 可选向前 jumpTo
});
stream.onChunk((diff) => {});
await stream.send({ transport: "http" });
// stream.history.exportTimeRoot() · stream.jumpTo(i)
```

见 [stream.zh-CN.md](stream.zh-CN.md) · 相位算法 [notes/streaming-parse.zh-CN.md](notes/streaming-parse.zh-CN.md) · 历史 [notes/history.zh-CN.md](notes/history.zh-CN.md)。

---

## 兼容模式（Compatibility mode）

兼容模式是**可选**的解析路径，用于消化不完美的模型输出。  
冻结的线协议本身不变；本模式改变 **根形态强制** 以及 SDK 在「当前 Cursor 下该行非法」时的**恢复策略**。

### 默认与开启方式

| | |
| --- | --- |
| 默认 | **关闭** — 任意 `XaiopSyntaxError` 立即失败（忠实协议） |
| 实例 | `new XaiopEngine({ compatibilityMode: true })` · `engine.setCompatibilityMode(true\|false)` · 读取 `engine.compatibilityMode` |
| 静态 Engine | `XaiopEngine.parse(source, compatibilityMode?)` — **仅 boolean**；省略或 `false` = 关闭 |
| 自由 parse | `parseSync` / `parseAsync` — 第二参：`boolean \| CompatPolicy \| Partial<Record<CompatFixId, boolean>>` |

```js
// 严格（默认）
XaiopEngine.parseSync(text);

// 兼容（八项 fix 全开）
XaiopEngine.parseSync(text, true);
parseSync(text, true);

const engine = new XaiopEngine({ compatibilityMode: true });
await engine.upload(text); // 使用 engine.compatibilityMode
```

### CompatPolicy — 细粒度修复

兼容模式开启时，八个**独立**、确定性的修复生效。无覆盖地构造 `CompatPolicy` 即**全开**。传给 `parseSync` 的普通对象视为**在默认上覆盖**（未写的键仍为 `true`）。

| Fix ID | 模式开启时默认 | 摘要 |
| --- | --- | --- |
| `forcedRoot` | `true` | 开首不是 `>` / `-` 时注入匿名对象根 |
| `rewriteBareNameArray` | `true` | `name-` → `>name-` |
| `rewriteEnterLine` | `true` | 空白 / 粘连 `>key:value` 改写 |
| `ignoreBareLeaveAtRoot` | `true` | Root 上裸 `<` 忽略 |
| `popAndRetry` | `true` | 上浮 Cursor 并重试失败行 |
| `locatePathTrim` | `true` | `=` 路径修剪重试 |
| `locatePathStripSpaces` | `true` | `=` 去掉全部空白重试 |
| `locatePathArraySuffix` | `true` | `=` 段尾 `-` 在值为数组时当作数组键 |

导出：`CompatPolicy`、`COMPAT_FIX_IDS`、`COMPAT_FIX_DEFAULTS`。

```js
import { parseSync, CompatPolicy } from "xaiop";

parseSync(text, { popAndRetry: true, forcedRoot: false }); // 其它 fix 仍默认 true
parseSync(text, new CompatPolicy({ forcedRoot: false }));

engine.setCompatibilityMode(true);
engine.setCompatForcedRoot(false); // 模式关或非 boolean 时返回 false — 不改状态
// setCompatibilityMode 不重置各 fix
```

Engine / `XaiopStream` 为每个 ID 提供 `compatForcedRoot` … `setCompatLocatePathArraySuffix`。模式**关闭**时 setter 返回 `false` 且不改标志。

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
| `setCompat*` / `compat*` | 八项细粒度 fix（仅模式开启时生效） |
| `upload(source)` / `uploadSync` | 完整文本 → data id（跟随实例兼容开关） |
| `uploadJson` / `uploadJsonSync` | JSON → 严格 XAIOP → data id |
| `encode` / `encodeSync`（静态 / 实例 / 自由函数） | JSON → XAIOP 文本；选项见上文 |
| `mergeToJson` / `mergeToXaiop` / `mergeJson` | 预处理合并 → JSON 或 XAIOP（非流式） |
| `injectXaiop` / `injectJson` (+ Sync) | 向已有 `dataId` 注入并写回 store |
| `get(dataId)` / `getSync` | data id → JSON 或 `XaiopFragment`（克隆） |
| `XaiopEngine.parse` / `parseSync` | 静态：文本 → JSON/Fragment；第二参 **仅 boolean** |
| 自由 `parseSync` / `parseAsync` | 第二参可为 `boolean \| CompatPolicy \| partial` |

辅助：`PROTOCOL_VERSION`、`SDK_VERSION`、`DOT_POLICY`、`MERGE_CONFLICT`、`HISTORY_NODE_KIND`、`ParseHistory`、`CompatPolicy` / `COMPAT_FIX_*`、`XaiopFragment`、`has` / `delete` / `clear`、`XaiopSyntaxError`、`XaiopEncodeError`、`XaiopStream`（[stream.zh-CN.md](stream.zh-CN.md)）、`XaiopWs*`、`materializeSnapshot`。

第三方对等清单：[../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)。

---

## 错误

- 非法线格式 → `XaiopSyntaxError`  
  - **严格（默认）：** 立即失败；**不**静默修复  
  - **兼容：** 按上文上浮重试；恢复失败或错误变化时仍抛出  
- 非法编码输入 / 选项 → `XaiopEncodeError`  
- 未知 data id → `Error`  
- 参数类型错误 / 非法 `conflict` / `as` → `TypeError`  

---

## 样例

见 [../../examples/complex.xaiop](../../examples/complex.xaiop)。

---

## 本包切片范围外

- Java / Python encode 对等实现  
