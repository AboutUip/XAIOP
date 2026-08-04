# XAIOP Node.js SDK API 文档

[English](API.md) · [简体中文](API.zh-CN.md)

**协议版本**: v0.6.0 Frozen（已封存）  
**SDK 版本**: 0.14.0（TypeScript）  
**运行时**: 默认入口 **Node.js ≥ 18（ESM）**；浏览器用子路径（见 §0）  
**代码**: [../../../xaiop-sdk/nodejs/](../../../xaiop-sdk/nodejs/)（`src/` TS → `dist/`）  
**Node 产品选择目录**: [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)（可选对照；非跨语言强制） · **封存索引**: [../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md)

---

## 0. 运行时范围与入口

| 入口 | 环境 | 内容 |
| --- | --- | --- |
| `import "xaiop"` | **Node.js ≥ 18**（官方主路径） | 全表面：parse/encode/engine/stream/`XaiopWs` listen+connect |
| `import "xaiop/browser"` | **浏览器**（客户端子集） | core + **相位流式** `XaiopStream`（fetch/SSE/原生 WS）+ `XaiopBrowserWs.connect`；**无** listen/hub |
| `import "xaiop/core"` | 同构（Node 或 bundler） | 仅线核心：parse/encode/merge/checkpoint/engine；**无**网络 I/O |

| 命题 | |
| --- | --- |
| 默认 `"xaiop"` 可在浏览器直接用 | **否**（会拉入 `ws` / `node:stream`） |
| 浏览器是否提供服务端 `listen` | **否** — 用 Node `XaiopWs.listen`，浏览器只 `connect` / `XaiopStream` |
| 浏览器是否支持 **`.` 相位 Diff** | **是** — 与 Node 共用 `DotCheckpointEngine`（`onChunk` / `onPhase`、Commit、可选 `cover` / `mergeChunkWindow` / `typeCheck` / **行拦截** / **Annotation Span** / **控制根**） |
| 线语义 | 三入口共享同一 `core`（协议包 **0.6.0**） |

本仓库 SDK **重心在 Node.js**；其它语言移植不必与 Node 全表面对齐。

---

## 目录

0. [运行时范围与入口](#0-运行时范围与入口)
1. [快速开始](#1-快速开始)
2. [核心概念](#2-核心概念)
3. [解析 API](#3-解析-api)
4. [编码 API](#4-编码-api)
5. [引擎 API](#5-引擎-api)（含 [§5.5 类型检查](#55-类型检查实例)）
6. [流式 API](#6-流式-api)（含 [§6.4 行拦截](#64-行拦截-onlineintercept) · [§6.5 Annotation Span](#65-annotation-span-onannotationspan) · 相位 `meta.seq`）
7. [WebSocket API](#7-websocket-api)（含 [§7.6 浏览器](#76-浏览器-xaiopbrowser--相位客户端) · [§7.7 控制根](#77-sdk-控制根--会话--续传)）
8. [合并与注入](#8-合并与注入)
9. [兼容模式](#9-兼容模式)
10. [类型与常量](#10-类型与常量)
11. [错误处理](#11-错误处理)

---

## 1. 快速开始

### 安装

```bash
cd xaiop-sdk/nodejs
npm install
npm test
```

### 基础用法

```js
import {
  parseSync,
  encodeSync,
  XaiopEngine,
  XaiopStream,
  PROTOCOL_VERSION,
  SDK_VERSION,
} from "xaiop";

// 解析 XAIOP → JSON
parseSync(">\na:1\n");           // → { a: 1 }

// JSON → XAIOP（默认每顶层键一相，含 `.`）
encodeSync({ a: 1, b: 2 });

// 引擎管理文档
const engine = new XaiopEngine();
const id = await engine.uploadJson({ meta: { name: "demo" } });
const json = await engine.get(id);

// 流式消费（cover 默认 false）— Node 默认入口
const stream = new XaiopStream(url, { cover: false });
stream.onChunk((diff) => {});
await stream.send({ transport: "http" });
```

浏览器（**相位 Diff 可用**；从 `xaiop/browser` 导入）：

```js
import { XaiopStream, XaiopBrowserWs, TRANSPORT_KIND } from "xaiop/browser";

const stream = new XaiopStream(url);
stream.onChunk((diff) => { /* 该相 JSON */ });
await stream.send({ transport: TRANSPORT_KIND.WEBSOCKET });

const client = await XaiopBrowserWs.connect(wsUrl, {
  onPhase: (diff) => { /* 同 onChunk；可能在 await 返回前触发 — 见 §7.5 / §7.6 */ },
});
await client.done;
```

主路径均为 **async**，并配有对应 **sync**（解析 / 编码 / Engine store / 合并注入）。

---

## 2. 核心概念

**XAIOP 线格式**是面向流式的、按行组织的 **Cursor 构造协议**。历史名 “eXtensible AI Output Protocol” **不是**定义。本文档描述的是 **已封存协议包 0.6.0** 的 Node.js 实现（SDK **0.14.0**）。

- 完整文法：[../../protocol/syntax.zh-CN.md](../../protocol/syntax.zh-CN.md)
- 封存与发行索引：[../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md)

### 2.1 线行（Label）

| 形态 | 作用 |
| --- | --- |
| `>` / `>name` / `>name-` / `<` | 进入 / 离开结构（对象、具名对象、具名数组） |
| `-` | 进入匿名数组元素 |
| `key:value` / `:value` | Content（键值 / 数组元素） |
| `.` | Cursor 回 Root；退出广播；界定**相位** |
| `=path` | 模糊定位（不创建；零命中 → 语法错误） |
| `@path` | 自 Root 精确路径；缺失对象段则**创建**并进入 |
| `!path` | 广播：匹配所有完整路径片段；后续行对每个 Cursor 执行 |
| `&path` | 删除最深键；**不**移动 Cursor |

路径段用 `>`（如 `@a>b`、`&a>b`）。禁止裸 Label、裸 `&`、Root 上裸 `<`、值内换行。

**示例：**

```text
>
>user
name:Alice
<
.
&user
>user
name:Bob
<
```

完整文法：[../../protocol/syntax.zh-CN.md](../../protocol/syntax.zh-CN.md)

### 2.2 相位（phase）

`.` 将 Cursor 重置到 Root，并作为流式 **Diff 边界**（SDK 策略：按 `.` 切相，不是按 Block）。  
含 `=` / `!` / `&` 的相位必须看见**迄今累积树**；官方流式对这类相位做累积前缀 parse。

### 2.3 根形态

| 开首 | 结果 |
| --- | --- |
| `>` | 完整匿名 **对象** 根 |
| `-` | 完整匿名 **数组** 根 |
| `>name` / Root Content 等 | 严格模式 → **`XaiopFragment`**（无外层 `{}`） |

空源 → `{}`。兼容 `forcedRoot` 对片段开首注入对象根，永不返回 fragment。

### 2.4 `&` 删除（协议语义）

| 规则 | 行为 |
| --- | --- |
| 最深键 | `&a>b` 只删 `b`；父对象可留空仍存在 |
| 单 Cursor | 路径自 Root **绝对** |
| 缺失 | 静默 **no-op**（不创建） |
| 文档根 | **仅 object**；数组根 / 片段根 → 语法错误 |
| Cursor 链 | 删到当前 Cursor 或其祖先 → **语法错误** |
| 广播 | `&path` **相对**各 Cursor；缺该 Cursor 上目标 → 该 Cursor no-op；任一链冲突 → 整行失败 |
| 数组 | 可删整个具名数组值；**无**元素下标删除 |
| Cursor | **不**因 `&` 移动；后续 Content 仍写在原 Cursor |

### 2.5 `#` 自定义注解传递（协议语义）

独立单行且以 `#` 开头 = **自定义注解传递**（官方名称；不是「注释」）。位置不限；协议不解释 `#` 后内容；解析器忽略（无 Cursor / 树副作用）。`note:#x` 仍是 Content。行首空白的 `#` **不是**本原语。

### 2.6 Cover vs 非 cover（仅流式 Diff）

`cover` 是 **SDK 流式选项**（默认 `false`），不改变终态键集合：`finish` 后 Snapshot ≡ `parseSync(wire)`。

| `cover` | Diff 行为 |
| --- | --- |
| `false`（默认） | live / Commit 树上执行 `&`；**已发出的 Diff 不回写** |
| `true` | 连续 `&` → 强制插入 `.` → 发出最深键 **`null` 墓碑 Diff** → 用 `>` 链恢复 Cursor → 再处理后续行 |

三类 `null` **不要混淆**：

| 种类 | 含义 |
| --- | --- |
| Diff 墓碑 `null` | cover 模式下删除相的 Diff 值（键仍出现，值为 `null`） |
| Content 类型化 `null` | 线文 `key:null` / `:null`（协议 Content） |
| 空相位 chunk `null` | 流式空相 / 无 Diff 时的交付值 |

---

## 3. 解析 API

### 3.1 `parseSync` / `parseAsync`

```ts
parseSync(source, compat?): unknown | XaiopFragment
parseAsync(source, compat?): Promise<unknown | XaiopFragment>
```

同步 / 异步解析完整 XAIOP 文本为 JSON 或 Fragment。

**参数：**

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `source` | `string` | — | 完整 XAIOP 文本 |
| `compat` | `boolean \| CompatPolicy \| Partial<Record<CompatFixId, boolean>>` | `false` | `false` 严格；`true` 八项 fix 全开；对象在默认上覆盖 |

**返回：**

- 完整文档 → 普通对象 / 数组
- 根片段（严格模式）→ `XaiopFragment`（访问 `.entries`）
- 空源 → `{}`

```js
import { parseSync, CompatPolicy } from "xaiop";

parseSync(">\na:1\n");
parseSync(text, true);
parseSync(text, { forcedRoot: false }); // 其余 fix 仍默认 true
parseSync(text, new CompatPolicy({ popAndRetry: false }));
```

**不对称：** 自由函数接受细粒度 `compat`；`XaiopEngine.parse` / `parseSync` **仅** `boolean`。

### 3.2 `LiveXaiopParser`

增量解析器：喂入行 / 文本，语义 ≡ 对拼接结果的 `parseSync`。流式 checkpoint 用它避免每个 `.` 重扫整前缀。

```ts
new LiveXaiopParser(compat?)
feedLine(line): this
feedText(text): this
value(): unknown | XaiopFragment   // 活引用；对外暴露前须克隆
cursorRestoreLines(): string[]     // cover 恢复用的 `>` / `>name-` 链；已在 Root → `[]`
```

| 方法 | 说明 |
| --- | --- |
| `feedLine` | 完整逻辑行（无尾 LF/CRLF） |
| `feedText` | 按与 `parseSync` 相同规则拆行 — **跨调用无半行缓冲**；无 LF 的尾段视为完整一行。任意网络分片请用 `DotCheckpointEngine.push` / `XaiopStream` |
| `value` | 当前文档（继续 feed 会就地突变） |
| `cursorRestoreLines` | 广播激活时不可用；匿名 / 数组元素帧在栈上 → 语法错误 |

```js
const live = new LiveXaiopParser();
// 可以：完整行（无 LF 的尾段仍算一行）
live.feedText(">\n>a\nx:1\n.\n>b\ny:2\n");
live.cursorRestoreLines(); // → [">b"]
live.value();              // → { a: { x: 1 }, b: { y: 2 } }
// 不要拿 TCP/WS 字节切片硬拆：feedText(">me") 再 feedText("ta\n") ≠ feedText(">meta\n")
```

### 3.3 `XaiopFragment`

严格模式下无匿名根、以 `>name` / Root Content 开首时返回。

| 成员 | 含义 |
| --- | --- |
| `entries` | Root 命名绑定 |
| `isFragment` | 恒 `true` |
| `notation()` | 调试串，如 `"a":{}` |

流式 / WS JSON 表面经 `materializeSnapshot`：fragment → `entries` 克隆。Engine `get` 保留 fragment。

---

## 4. 编码 API

### 4.1 `encodeSync` / `encode`

```ts
encodeSync(value, options?: EncodeOptions): string
encode(value, options?: EncodeOptions): Promise<string>
```

把**纯 JSON** 编成**严格** XAIOP（兼容模式**永不**改编码输出）。  
自由函数 / `XaiopEngine` 静态 / 实例对同一 `(value, options)` 产出相同线文。

**保证：** 对编码器接受的值，`parseSync(encodeSync(value, opt))` 与 `value` 深度相等；线文以恰好一个 `\n` 结尾。  
**不保证：** `encode(parse(手写线))` 字节相同。

**拒绝的字符串值（抛 `XaiopEncodeError`）：** 含 CR/LF；**以 U+0020 SPACE 开头**（`:` 后空格是强制 string 标记而非载荷——若照常发出，parse 会静默剥掉前导空格）。Tab（`U+0009`）与尾随空格仍可编码。
```js
import { encodeSync, DOT_POLICY } from "xaiop";

encodeSync({ a: 1, b: 2 }); // 默认 perTopLevelKey
encodeSync({ a: 1, b: 2 }, { dotPolicy: DOT_POLICY.NONE });
encodeSync({ a: 1, b: 2, c: 3 }, { dotPolicy: "perNKeys", phaseEvery: 2 });
encodeSync(obj, { dotPolicy: ["meta", "items[0]"] }); // 路径切相
```

### 4.2 `EncodeOptions`

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `root` | `"auto"` | `"object"` \| `"array"` \| `"auto"` |
| `style` | `"reset"` | `"reset"` 在相位间插 `.`；`"relative"` 仅当 `dotPolicy: "none"` |
| `dotPolicy` | `"perTopLevelKey"` | `"none"` \| `"perTopLevelKey"` \| `"perNKeys"` \| `"custom"` \| `string[]`（JSON 路径，节点编码后插 `.`） |
| `phaseEvery` | `1` | `perNKeys` 时每 N 键一相 |
| `maxPhases` | — | 限制相位数（合并尾部） |
| `finalDot` | `false` | 是否追加末尾 `.` |
| `keyOrder` | `"insertion"` | 或 `"sorted"` |
| `nullPolicy` | `"encode"` | `"encode"` 类型化 null；`"omit"` 省略对象 null 键（数组仍编码）；`"error"` 遇 null 抛错 |
| `undefinedPolicy` | `"omit"` | `"omit"` \| `"error"` |
| `shouldPhase` | — | `dotPolicy: "custom"` 时必填 |
| `symbolKeys` | `false` | 可选 U+001F label 转义方言，允许键以 `#` `@` `>` `<` `=` `!` `&` 或 U+001F 开头；**encode 与 parse 须同开**；见 [label-escape](../../protocol/notes/label-escape.zh-CN.md) |

路径数组重载与 `phaseEvery` / `maxPhases` / `shouldPhase` **互斥**；要求 `style: "reset"`；数组下标只能是路径**末段**。辅助：`parseJsonPath` / `formatJsonPath`。

### 4.3 拒绝的键

下列键会抛 `XaiopEncodeError`（防止静默改形）：

| 形态 | 原因 |
| --- | --- |
| 空 / 空白 / 含 `:` | 非法 Label 名 |
| 以 `-` 结尾 | 与 `>name-` 数组进入冲突 |
| 键体含 `>` `<` `=` `!` **`&`** | Cursor / 定位 / 删除算子歧义 |
| **以** `#` `@` `>` `<` `=` `!` `&` 或 **U+001F** **开头** | 行类 / 保留转义头 — 除非 `symbolKeys: true` |

常量：`DOT_POLICY` · `LABEL_ESCAPE_INTRODUCER`（`"\u001f"`）。

---

## 5. 引擎 API

`XaiopEngine`：内存 store（运行时 data id）+ 解析 / 编码 / 合并注入。兼容模式默认**关**。

```js
import { XaiopEngine } from "xaiop";

const engine = new XaiopEngine();
const engineCompat = new XaiopEngine({ compatibilityMode: true });
```

### 5.1 Store

| API | 返回 | 说明 |
| --- | --- | --- |
| `upload(source)` / `uploadSync` | `dataId` | 解析完整 XAIOP → 存入；跟实例兼容开关 |
| `uploadJson(value, encodeOptions?)` / Sync | `dataId` | 严格 encode → upload |
| `get(dataId)` / `getSync` | JSON 或 `XaiopFragment`（克隆） | 未知 id → `Error` |
| `has` / `delete` / `clear` | — | store 管理 |

### 5.2 实例编码 / 合并

| API | 说明 |
| --- | --- |
| `encode` / `encodeSync` | 同自由函数；**忽略**兼容开关 |
| `mergeToJson` / Sync | 基底 JSON + XAIOP → JSON（parse 跟实例 compat，可被 `options.compat` 覆盖） |
| `mergeToXaiop` / Sync | → XAIOP 线文 |
| `injectXaiop` / Sync | 向已有 `dataId` 注入 XAIOP（就地更新） |
| `injectJson` / Sync | 向已有 `dataId` 注入 JSON |

### 5.3 静态方法

| API | 说明 |
| --- | --- |
| `XaiopEngine.parse` / `parseSync` | 第二参 **仅 boolean** |
| `XaiopEngine.encode` / `encodeSync` | 同自由函数 |
| `XaiopEngine.mergeToJson` / `mergeToXaiop` | 同自由函数 |

### 5.4 兼容开关（实例）

| API | 说明 |
| --- | --- |
| `compatibilityMode` / `setCompatibilityMode` | 总开关；**不**重置各 fix；开启兼容时会清掉 `typeCheck` |
| `compatForcedRoot` … `setCompatLocatePathArraySuffix` | 八项细粒度；模式关或非 boolean → setter 返回 `false` 且不改状态 |

### 5.5 类型检查（实例）

**非协议**：注册表 / 冻结 / 推送均为 **SDK** 产品能力；不改写线文法。

| API | 说明 |
| --- | --- |
| `typeCheck` / `setTypeCheck(enabled)` | 总开关（默认 `false`）；**仅严格模式**可开；兼容模式开启会清掉；开启后 `upload*` / `inject*` 走注册表检查 |
| `TYPE` | 叶/结构常量：`INT` `FLOAT` `BOOL` `STRING` `NULL` `OBJECT` `ARRAY` `ANY`（叶类型对齐 `PROT-CONTENT`） |
| `objectType(fields)` / `arrayType(element)` | 组合子；亦接受表面糖字符串（见下） |
| `registerType(path, type, { polarity? })` | JSON 路径绑定；`polarity`: `"allow"`（默认白名单）\| `"deny"`（黑名单）；**注册后不可改**（再注册同路径 → `false`） |
| `registerTypes(map\|entries, { polarity? })` | 批量；返回 `{ ok, rejected }` |
| `registerTypeDeny(path, type)` | 黑名单快捷方式 |
| `getRegisteredType` / `typeRegistry` / `exportTypeSchema` | 查询与快照 |
| `encodeTypeSchemaFrame()` | 编码控制帧（一般用连接上的 `pushTypeConsistency`） |
| `onTypeViolation(fn\|null)` | 违规 hook（抛 `XaiopTypeError` **前**调用） |

**路径家风：** `data.fork`、`items[0]`（与 encode `parseJsonPath` 一致；**不是**线文 `data>fork`）。

**类型表面糖（可选）：** `string`、`array<int>`、`object<name:string,old:int>` → 内部 **canonical** 后再比较。

**服务端检查规则（`typeCheck` + 注册表）：**

| 规则 | |
| --- | --- |
| 范围 | **仅已注册路径**；未注册路径对注册表**无视** |
| `allow` | 值须匹配类型；`int` ≠ `float`（与 encode 一致） |
| `deny` | 值**不得**匹配该类型 |
| `any` | 显式无视（不可 `deny`+`any`） |
| 空注册表 | 开启检查也不报错 |
| 触发点 | `upload` / `uploadSync` / `uploadJson*` / `injectXaiop*` / `injectJson*` |

```js
import { XaiopEngine, TYPE, objectType, arrayType } from "xaiop";

const eng = new XaiopEngine();
eng.registerType("data.fork", TYPE.STRING);
eng.registerType("user", objectType({ name: TYPE.STRING, old: TYPE.INT }));
eng.registerType("items", arrayType(TYPE.INT));
eng.registerTypeDeny("data.bad", TYPE.STRING);
eng.registerType("meta.note", TYPE.ANY);
eng.setTypeCheck(true);
eng.uploadSync(`>\n>data\nfork:ok\n`); // OK
```

**客户端（`XaiopWs` / `XaiopStream` / `XaiopBrowserWs`，`typeCheck: true`）：**

| 规则 | |
| --- | --- |
| 冻结 | 路径上**首次非 `null`** 观测锁定类型；后续须兼容 |
| `null` | **不**进入客户端检查（不刷新、不报错），避免删除/清空原语误伤 |
| 数组 | 开启后元素类型须**同质** |
| 刷新 | commit 上键缺失（删除）→ 清子树冻结；整节点删后重建可换类型 |
| 未推 schema | 仍用首次冻结保证一致 |
| 已推 / 预载 schema | `allow`/`deny`/`any` 优先；**schema 违规观测不写入 freeze**；`any` **不**做 freeze 锁定 |
| 选项 | `typeCheck`、`typeSchema`（快照或 `TypeRegistry`）；与 `compatibilityMode` 同时开时 **typeCheck 无效** |

**类型一致性推送（WS）：** `conn.pushTypeConsistency(engine|registry|snapshot)`  

| 前提 | |
| --- | --- |
| 连接 | **严格**（该连接 `compatibilityMode === false`） |
| 内容 | 注册表**非空**；若传 `XaiopEngine` 则其 **`typeCheck === true`** |
| 形态 | 控制帧（**非** XAIOP 线文）：前缀 `#!xaiop/types/v1\n` + JSON 快照；由控制根在 parse / Span 前 demux（**0.14.0+**） |
| 失败 | 前提不满足 → `TypeError`；套接字非 OPEN → `false` |

深潜：[notes/typecheck.zh-CN.md](notes/typecheck.zh-CN.md)。

---

## 6. 流式 API

### 6.1 `XaiopStream`

HTTP / SSE / WebSocket / RAW **消费端**。文本进入 `DotCheckpointEngine`，按 `.` 发 Diff，EOF 解析终态 Snapshot。

```js
import { XaiopStream, STREAM_MODES, TRANSPORT_KIND } from "xaiop";

const stream = new XaiopStream(url, {
  streamProcessing: true,   // 默认
  compatibilityMode: false, // 默认
  mergeChunkWindow: true,   // 默认 — 缓冲窗口内完整 `.` 批成一次 Diff
  asyncParse: false,        // 默认；生产可 true（pushAsync 合并）
  historySnapshot: false,
  historyRealtime: false,
  retainWireHistory: true,
  cover: false,             // 默认 — 见 §2.6
  modes: [STREAM_MODES.CALLBACK],
});

stream.onChunk((diff) => {});
stream.onDone((json) => {});
const final = await stream.send({ transport: TRANSPORT_KIND.HTTP });
```

#### 构造选项

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `streamProcessing` | `true` | 中途相位 Diff；`false` → finish 时一个 chunk |
| `mergeChunkWindow` | `true` | 窗口内全部完整 `.` → **一次** Diff |
| `asyncParse` | `false` | 传输走 `pushAsync` |
| `historySnapshot` | `false` | 只读 `.` 历史 |
| `historyRealtime` | `false` | 向前 `jumpTo` |
| `retainWireHistory` | `true` | 历史开启时保留线文切片 |
| `cover` | `false` | `&` 的 cover Diff（§2.6） |
| `compatibilityMode` | `false` | 同 Engine |
| `typeCheck` | `false` | 客户端冻结 / schema 检查（§5.5）；与兼容模式同时开则**无效** |
| `typeSchema` | — | 预载类型快照或 `TypeRegistry` |
| `lineIntercept` | — | 初始行拦截 handler 或数组（§6.4） |
| `annotationSpan` | — | 初始 Annotation Span handler 或数组（§6.5） |
| `session` / 控制回调 | — | 可选控制根入站游标（§7.7）；见 [notes/control-plane.zh-CN.md](notes/control-plane.zh-CN.md) |
| `modes` | `["callback"]` | 可多选 |

#### Snapshot / chunk

| API | 时机 | 值 |
| --- | --- | --- |
| `onChunk` / 迭代器 | 相位 / 窗口边界 | Diff JSON；空相可为 `null`；**第二参 `meta`** 可含 `seq` / `seqs`（相位序号，§7.7）与 `typeCheckEscapePaths` |
| `getCommittedSnapshot()` | 每次提交后 | 至最近 `.` / EOF 的累积 later-wins |
| `getSnapshot()` / `onDone` | finish 后 | 全缓冲 parse；空 → `{}` |
| 流中途 `getSnapshot()` | `streaming` | 通常 `undefined` |

Fragment 在上述表面物化为普通对象（`materializeSnapshot`）。

#### 投递模式

| 模式 | 表面 |
| --- | --- |
| `callback`（下限） | `onChunk` / `onDone` / `onError`；另有 `onLineIntercept`（§6.4）· `onAnnotationSpan`（§6.5） |
| `promise` | `send()` → 终态 Promise |
| `asyncIterator` | `for await` / `chunks()` |
| `events` | `on("chunk"\|"done"\|"error"\|"status")` |

`disableMode` 不会留下空集（保留 `callback`）。Busy 时再次 `send`：promise 模式 → reject；否则抛错。

#### `send` 要点

| 项 | 规则 |
| --- | --- |
| 默认传输 | `http` |
| SSE | `Accept: text/event-stream`；多行 `data:` 用 `\n` 拼接 |
| RAW | 需要 `source`（AsyncIterable / ReadableStream） |
| 二进制 | 跨 chunk 流式 UTF-8 解码 |
| `abort()` | 状态 `aborted` |

状态机：`idle → connecting → streaming → completing → completed`（或 `aborted` / `error`）。常量：`STREAM_STATUS`、`TRANSPORT_KIND`、`STREAM_MODES`；`isStreamBusy(status)`。

### 6.2 `DotCheckpointEngine`

底层 `.` 相位解析器（`XaiopStream` / WS 内部使用；也可直接用）。

```js
const eng = new DotCheckpointEngine({
  streamProcessing: true,   // 默认
  mergeChunkWindow: true,   // 默认
  emitDiff: true,           // 默认
  cover: false,
  historySnapshot: false,
  historyRealtime: false,
  retainWireHistory: true,
  compat: false,
  lineIntercept: undefined, // 或 handler / handler[]
  annotationSpan: undefined, // 或 handler / handler[]
  onChunk: (diff) => {},
});
eng.push(chunk);
eng.finish();
eng.snapshot;            // 终态
eng.committedSnapshot;   // 最近提交
eng.history;             // ParseHistory | null
eng.onLineIntercept(fn); // 见 §6.4
eng.onAnnotationSpan(fn); // 见 §6.5
```

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `streamProcessing` | `true` | 流中 `.` 相位 + 行扫描路径（拦截 / Span）；与 `XaiopStream` / WS 相同。裸 `new DotCheckpointEngine({...})` 不传该标志时为 **开**。 |
| `mergeChunkWindow` | `true` | 缓冲窗口内完整 `.` 批算 → 一次 Diff |
| `emitDiff` | `true` | 仅需 Commit / 终态时可设 `false` |
| `cover` | `false` | `&` 的 cover 模式 Diff |

| 方法 | 说明 |
| --- | --- |
| `push` / `pushAsync` | 同步摄入 / `setImmediate` 合并扫描 |
| `finish` / `finishAsync` | 冲刷尾部 |
| `jumpTo(index)` | 需 `historyRealtime`；丢弃定位点之后的节点 |
| `onLineIntercept` / `clearLineIntercepts` | 完整行拆出后、解析前；见 §6.4 |
| `onAnnotationSpan` / `clearAnnotationSpans` | 相位 `#` 跨度；见 §6.5 |
| `streamProcessing` / `mergeChunkWindow` | 只读 getter（解析后的默认） |

### 6.3 `ParseHistory` / Snapshot 辅助

历史由 checkpoint 在 `historySnapshot` / `historyRealtime` 开启时构造。

| API | 说明 |
| --- | --- |
| `info()` / `exportTimeRoot()` | 元信息 / 节点列表 |
| `getNode` / `getDiff` / `getBefore` / `getAfter` | 按索引读 |
| `compare` / `viewRange` | 对比 / 区间视图 |
| `jumpTo` / `canJumpTo` | 实时向前跳 |
| `setSource` / `release` | 关联源键 / 释放 |

`materializeSnapshot(parsed)`：Fragment → 普通对象（JSON 表面）。

深度说明：[notes/streaming-parse.zh-CN.md](notes/streaming-parse.zh-CN.md) · [notes/history.zh-CN.md](notes/history.zh-CN.md)。

### 6.4 行拦截 (`onLineIntercept`)

**SDK 产品能力**（非协议线文法）：在 checkpoint **接收缓冲**拆出完整逻辑行之后、喂入 `LiveXaiopParser` **之前**，按**注册顺序**跑处理器链。

| 对比 | 行拦截 | `onPhase` / `onChunk` |
| --- | --- | --- |
| 层 | 缓冲行边界（拆行后） | 相位 Diff（解析 + Commit 后） |
| 粒度 | 每完整行 | `.` 相位（可窗口合并） |
| 改写 / 跳过 | **可以**（返回字符串或 `null`） | **不可以** |

```js
import { LINE_KIND, DotCheckpointEngine } from "xaiop";

eng.onLineIntercept(({ raw, view }) => {
  if (view.kind === LINE_KIND.ANNOTATION) return null; // 跳过本行
  if (view.kind === LINE_KIND.CONTENT && view.key === "x") return "x:42"; // 改写
  return undefined; // 保持
});
```

| 返回值 | 含义 |
| --- | --- |
| `string` | 实际喂给后续路径；下一处理器看到该串 |
| `null` | **跳过本行**（短路；后续处理器不跑） |
| `undefined` | 保持当前文本 |

**三种 `null`（勿混淆）：** 拦截跳过 ≠ Content `key:null` ≠ 空相位 Diff 的 `null`。

**固定模板 `view`：** `kind` · `raw` · `name` · `path` · `key` · `valueText` · `annotationText`（未用槽位为 `null`）。`LINE_KIND` / `classifyLine` / `emptyLineView` / `runLineInterceptChain` 可单独使用。完整 kind 表见 [notes/line-intercept.zh-CN.md](notes/line-intercept.zh-CN.md) §3。

| 边界 | 行为 |
| --- | --- |
| `streamProcessing: false` | 整缓冲一次 parse，**不**跑拦截 |
| 跳过 `.` / 改写成 `.` | 以拦截**后**文本决定是否关相 |
| `mergeChunkWindow` / `cover` / `pushAsync` | 均在行生效后走既有相位规则 |
| `jumpTo`（`historyRealtime`） | 重建前缀时**重跑**拦截链 |
| 有拦截器时 Diff owned-parse | 使用**生效行**拼线（可与传输缓冲原文不同） |

表面：`DotCheckpointEngine` · `XaiopStream` · `XaiopWsConnection` · `XaiopBrowserWsConnection`（构造选项 `lineIntercept: fn|fn[]` 与/或 `onLineIntercept` / `clearLineIntercepts`）。

深潜：[notes/line-intercept.zh-CN.md](notes/line-intercept.zh-CN.md) · 测试：`test/line.intercept.test.js`。

### 6.5 Annotation Span (`onAnnotationSpan`)

**SDK 产品能力**（非协议线文法）：协议 `#…` 仍无树副作用。本能力在**本相位**行表就绪之后、**Diff / Commit / `typeCheck` 之前**，遇 `#` 时向前收集**同层级**兄弟（含子树），以**注解文本 + 模板化 JSON** 调用处理器，并可 remount / 丢弃。以 `#!` 开头的行为控制根（**0.14.0+**）：先 demux；若漏剥，Span **硬跳过** `#!`。

| 对比 | 行拦截 §6.4 | Annotation Span §6.5 |
| --- | --- | --- |
| 层 | 缓冲拆行 | 相位行表（JSON 面向捕获） |
| 触发 | 每完整行 | `#` + 向前同级区域 |
| 处理器输入 | 线文 `view` | `annotation` + 物化 `json`（无 `=`/`@`/`!` 形态） |
| 与 typeCheck | 正交 | **在 typeCheck 前**；处理区域**逃逸**类型检查 |

```js
eng.onAnnotationSpan((annotation, view) => {
  if (!annotation.includes("tag")) return undefined; // 保持线文；仍逃逸捕获键
  if (annotation.includes("drop")) return null; // 丢弃 # + 捕获区
  return { ...view.json, rewritten: true }; // remount
});
```

| 返回值 | 含义 |
| --- | --- |
| `undefined` | 保持 `#` + 捕获区原线；**仍**把捕获键记入逃逸路径 |
| `null` | 丢弃 `#` + 捕获区 |
| 对象 / 数组 / JSON 文本 | 编码为同级线文替换捕获区 |

**类型检查逃逸（必须理解）：** 只要本相位对该 `#` **调用了** Span 处理器链，则处理器处理的区域以及该向前同层级覆盖的键路径进入 `meta.typeCheckEscapePaths`，后续 `observeTree` **跳过**这些路径（及其后代）。`#` **之前**的同层键不受逃逸。详见 [notes/annotation-span.zh-CN.md](notes/annotation-span.zh-CN.md)。

表面：构造选项 `annotationSpan: fn|fn[]` · `onAnnotationSpan` · `clearAnnotationSpans`（Engine / Stream / WS / 浏览器 WS）。

深潜：[notes/annotation-span.zh-CN.md](notes/annotation-span.zh-CN.md) · 测试：`test/annotation.span.test.js`。

---

## 7. WebSocket API

骨架长会话优先 `XaiopWs`（同连接推 + 收）。HTTP/SSE/RAW 仍用 `XaiopStream`。  
线协议**不**定义 `connect` / Promise / 回调顺序；下列为 **Node SDK** 锁定行为。深潜：[notes/ws-session.zh-CN.md](notes/ws-session.zh-CN.md)。

### 7.1 `XaiopWs`

```js
import { XaiopWs } from "xaiop";

const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
hub.onConnection(async (conn) => {
  // 同步首包合法且常见 — 客户端必须在 connect options 里挂回调
  conn.pushJson("a", 1);
  conn.pushJson("b", { x: 2 }, { final: true });
  await conn.end();
});

const client = await XaiopWs.connect(hub.url(), {
  onPhase: (diff) => {
    /* 可能在本 await 返回前已调用 — 见 §7.5 */
  },
});
const json = await client.done; // 也可能在 connect 返回时已 settled
await hub.close();
```

| API | 说明 |
| --- | --- |
| `XaiopWs.listen(options?)` | → `XaiopWsHub`；可挂已有 `server` + `path` |
| `XaiopWs.connect(url, options?)` | → `Promise<XaiopWsConnection>`；语义见 §7.5 |
| `XaiopWs.encodePhaseJson` / `encodePhaseObject` | 只编码不发送 |

**`WsConnectOptions`：** `streamProcessing`、`mergeChunkWindow`、`asyncParse`、`cover`、`compatibilityMode`、`typeCheck`、`typeSchema`、`lineIntercept`、`annotationSpan`、**`session`**、**`autoSession`**、**`autoAck`**、**`retainOutbound`**、`protocols`、`handshakeTimeoutMs`（默认 **15000**）、`headers`，以及构造期回调 `onPhase` / `onChunk` / `onDone` / `onError` / **`onControlError`** / **`onSession`** / **`onResume`** / **`onAck`** / **`onSnapshot`**。  
**`WsListenOptions`：** 上述解析/控制相关项 + `port` / `host` / `server` / `path` / `backlog` / `perMessageDeflate` / `maxPayload`。

### 7.2 `XaiopWsConnection`

| 成员 | 说明 |
| --- | --- |
| `pushJson(key, value, { final? })` | 一相一键；非 final 保证尾 `.\n`；非 OPEN → `false` |
| `pushObject(object, { final? })` | 一相多键；同上 |
| `pushWire(text)` | 原始线文**原样发送**（不自动补 `\n`）；连续帧须自行保证行边界，否则对端可能粘行；非 OPEN → `false` |
| `pushWireLn(text)` | 同 `pushWire`，但若不以 LF 结尾则追加 `\n` |
| `pushTypeConsistency(engine\|registry\|snapshot)` | 推送已注册类型 schema（控制帧）；前提见 §5.5 |
| `session` / `autoSession` / `autoAck` / `retainOutbound` | 控制会话 / hello / 自动 ack / 出站日志（§7.7） |
| `sendSession` / `sendAck` / `sendResume` / `sendSnapshot` | 出站控制帧 |
| `getResumeState()` / `phaseSeq` / `outboundSeq` / `sessionId` / `ackedSeq` | 续传游标（`getResumeState` 含 `inboundSeq` / `outboundSeq`） |
| `outboundLog` / `replayOutboundAfter` / `noteOutboundPhase` | 生产端出站相位日志 |
| `ResumeWireLog` | 应用侧跨重连持久日志 |
| `typeCheck` | 只读；本连接是否启用客户端类型检查 |
| `onPhase` / `onChunk` | Diff 回调（`onChunk` 为别名）；**`(diff, meta?)`** 可含 `seq` / `seqs`；**`connect` resolve 后锁定** — 用 connect options |
| `onLineIntercept` / `clearLineIntercepts` | 缓冲行拦截（§6.4）；**`connect` 后锁定**；优先 options 的 `lineIntercept` |
| `onAnnotationSpan` / `clearAnnotationSpans` | 相位 Annotation Span（§6.5）；**`connect` 后锁定**；优先 options 的 `annotationSpan` |
| `onResume` / `onSession` / `onAck` / `onSnapshot` / `onControlError` | 控制回调；**`connect` 后锁定**；listen-accept 侧不锁 |
| `onDone` / `onError` | 终态 / 错误；**`connect` 后锁定** |
| `handlersLocked` | 成功 `XaiopWs.connect` / `XaiopBrowserWs.connect` 后为 `true` |
| `getCommittedSnapshot` / `getSnapshot` | 同 Stream：流中用 committed；终态前 `getSnapshot()` 为 `undefined` |
| `done` | 对端关闭且 `finish` 后的终态 Promise |
| `closed` | 套接字拆完（在 `done` 路径之后） |
| `end` / `abort` | 排空关闭 / 中止 |

### 7.3 `XaiopWsHub`

| 成员 | 说明 |
| --- | --- |
| `url(host?)` | 连接 URL |
| `onConnection` / `onError` | 接受回调（可在此**同步** `push*`） |
| `connections` | 当前连接 |
| `close()` | 关闭 hub |

### 7.4 `encodePhaseJson` / `encodePhaseObject`

```ts
encodePhaseJson(key, value, { final?, encodeOptions? }): string
encodePhaseObject(object, { final?, encodeOptions? }): string
```

内部 `encodeSync`（默认 `dotPolicy: "none"`）；`final: true` 不加相位 `.`。非法键仍抛 `XaiopEncodeError`。

### 7.5 `connect` Promise 与回调时序（注意事项）

`connect` 内部顺序：**创建 socket → 立刻构造 `XaiopWsConnection`（绑定 message 与 options 回调）→ 再等待 `open` → resolve**。

| 明确语义 | |
| --- | --- |
| `connect` resolve 表示 | 握手成功，返回可用连接对象 |
| `connect` resolve **不**表示 | 「此前无 `onPhase` / `onDone`」或「`done` 未 settled」 |
| SDK **不**缓冲相位到 resolve 之后再投递 | 有意如此，避免接受端同步首包丢失 |

因此 **`onPhase` / `onDone` / `onError` 以及 `done` 的 settle 均可发生在 `await connect(...)` 返回之前**（接受端在 `connection` 里同步推送时尤其常见）。

**必须：** 需要处理早帧时，把回调放进 **`connect` 的 options**（`onPhase` / `onChunk` / `onDone` / `onError` / `lineIntercept` / `annotationSpan` / 控制回调 `onResume`、`onSession`、…）。成功 `connect` 之后连接进入 **handler 锁定**：再调 `onPhase` / `onLineIntercept` / `onResume` / … 会抛 `TypeError`（listen-accept 侧不锁，仍可晚注册）。  
**禁止依赖：** `await connect` 之后再挂回调去接同步首包——可能已晚且**不回放**。  
若业务要「等 connect 返回再处理」：应用层自行排队；不要要求 SDK 延后投递。

完整表与测试引用：[notes/ws-session.zh-CN.md](notes/ws-session.zh-CN.md) §5。

### 7.6 浏览器 `xaiop/browser` — 相位客户端

从 **`xaiop/browser`** 导入（不要用默认 `"xaiop"`）。与 Node **共用** `core` 的 `DotCheckpointEngine`：按 `.` 切相、later-wins Diff/Commit、可选 `cover` / `mergeChunkWindow` / `asyncParse` / **`typeCheck`**（§5.5）/ **行拦截**（§6.4）/ **Annotation Span**（§6.5）/ **控制根**（§7.7）。

| API | 相位 | 说明 |
| --- | --- | --- |
| `XaiopStream` | **有** | `onChunk(diff, meta?)` = 相位 Diff + 可选 `seq`；传输：`fetch` / SSE / **原生** `WebSocket` / RAW（无 `ws` / `node:stream`）；可 `typeCheck` / `typeSchema` / `lineIntercept` / `annotationSpan` / `session` / `phaseSeq` |
| `XaiopBrowserWs.connect` | **有** | 与 Node 客户端同相位 + 控制根表面（`session` / `sendResume` / …）；可选 `pushJson` / `pushObject` / `pushWire` / `pushWireLn`；**无** `listen` / hub / `pushTypeConsistency`（推送在 Node 服务端）；`connect` 后 handler 锁定 |
| `XaiopBrowserWs.encodePhaseJson` / `encodePhaseObject` | — | 同 Node 相位编码辅助 |
| `xaiop/core` | 无网络 | 可本地 `DotCheckpointEngine`，需自行喂文本 |

```js
import { XaiopBrowserWs } from "xaiop/browser";

const client = await XaiopBrowserWs.connect(url, {
  onPhase: (diff) => {
    /* 该相 JSON — 不是 patch；早帧时序同 §7.5 */
  },
  cover: false,
  mergeChunkWindow: true,
});
console.log(await client.done);
```

| 与 Node `XaiopWs` 的差异 | |
| --- | --- |
| 套接字 | 仅 `globalThis.WebSocket` |
| `listen` / `XaiopWsHub` | **不提供**（服务端仍用 `import { XaiopWs } from "xaiop"`） |
| `connect` 早帧语义 | **相同**：回调放进 options；resolve ≠ 无事件 |
| 相位 / Diff / Commit / `cover` / `typeCheck` / 行拦截 / Annotation Span / 控制根 | **相同**（同一 checkpoint / 冻结会话）；`pushTypeConsistency` 仅服务端 |

生产端（Node listen）+ 浏览器消费端是推荐骨架组合。实践：[../../practice/skeleton-stream.zh-CN.md](../../practice/skeleton-stream.zh-CN.md) · notes：[notes/ws-session.zh-CN.md](notes/ws-session.zh-CN.md) §9–§10 · [notes/typecheck.zh-CN.md](notes/typecheck.zh-CN.md) · [notes/line-intercept.zh-CN.md](notes/line-intercept.zh-CN.md) · [notes/annotation-span.zh-CN.md](notes/annotation-span.zh-CN.md) · [notes/control-plane.zh-CN.md](notes/control-plane.zh-CN.md)。

### 7.7 SDK 控制根（`#!`）— 会话 / 续传

产品约定（**不是** Frozen 0.6.0 文法改写）：以 `#!` 开头的逻辑行属于 **SDK 控制面**，在 parse / Annotation Span **之前** demux。详见 **[notes/control-plane.zh-CN.md](notes/control-plane.zh-CN.md)**。

| 项 | 摘要 |
| --- | --- |
| 官方帧 | `#!xaiop/types/v1`、`session/v1`、`ack/v1`、`resume/v1`、`snapshot/v1` |
| 未知 `#!` | 丢弃 + `XaiopControlError`（`onControlError`）；永不进线文管道 |
| Seq | 每个物理 `.` 单调递增（`onPhase` / `onChunk` 的 `meta.seq` / `meta.seqs`） |
| 续传 | `sendResume({ sessionId, fromSeq })` → 从 `fromSeq+1` 续推；**不**重放历史 Diff；可选 `sendSnapshot` |
| connect 选项 | `session`、`autoSession`、`autoAck`、`retainOutbound`、`onSession`、`onResume`、`onAck`、`onSnapshot`、`onControlError` |
| 生产端日志 | `session` 或 `retainOutbound` 时 `pushJson`/`pushObject` 自动记出站相位；`replayOutboundAfter(fromSeq)`；跨重连请用应用侧按 `sessionId` 持有的 `ResumeWireLog` |
| Stream | `onChunk(diff, meta)` 收到相位 `meta.seq` / `meta.seqs`；`getResumeState()` / `phaseSeq` 选项 |

---

## 8. 合并与注入

**预处理 / 后处理**，不是流式。冲突策略仅作用于**冲突键**（深层对象递归；数组 / 标量整体冲突）。

| `conflict` | 行为 |
| --- | --- |
| `overwrite`（默认） | **在冲突键上**采用 overlay |
| `keep` | 保留基底；非冲突键仍并入 |

**不是 Diff 应用器：** `mergeJson` / `mergeToJson` **不会删除** overlay 中缺失的键。例如 `mergeJson({ cart: { a: 1, b: 2 } }, { cart: { a: 1 } })` 仍保留 `b`。`onChunk` / `onPhase` 的相位 Diff 是**子树替换**（或累积 commit）语义——本地应用 Diff 请按路径替换（或直接取 `getCommittedSnapshot()`）；**不要**把 Diff 灌进 `mergeJson`。见 [notes/streaming-parse.zh-CN.md](notes/streaming-parse.zh-CN.md)（Commit vs chunk）。

常量：`MERGE_CONFLICT.OVERWRITE` / `KEEP`。

| API | 返回 |
| --- | --- |
| `mergeJson(base, overlay, conflict?)` | JSON ← JSON+JSON |
| `mergeToJson(baseJson, xaiopSource, options?)` | JSON |
| `mergeToXaiop(baseJson, xaiopSource, options?)` | XAIOP（默认 `encodeOptions.dotPolicy: "none"`） |

`MergeOptions`：`conflict`、`compat`（解析 overlay）。`MergeToXaiopOptions` 另加 `encodeOptions`。

Engine 注入（就地更新 store）：

| API | Overlay |
| --- | --- |
| `injectXaiop(dataId, xaiop, options?)` | XAIOP |
| `injectJson(dataId, json, options?)` | JSON |

`InjectOptions`：`conflict`、`compat`、`as: "json"|"xaiop"`（默认 `json`）、`encodeOptions`。

```js
import { mergeToJson, MERGE_CONFLICT, XaiopEngine } from "xaiop";

mergeToJson({ a: 1 }, ">\nb:2\n", { conflict: MERGE_CONFLICT.KEEP });

const engine = new XaiopEngine();
const id = engine.uploadJsonSync({ a: 1 });
engine.injectXaiopSync(id, ">\nb:2\n");
```

---

## 9. 兼容模式

可选解析路径，消化不完美模型输出。**不**改冻结线协议定义；只改摄入恢复策略。默认**关**。

| 入口 | 形式 |
| --- | --- |
| 自由 `parseSync` / `parseAsync` | `boolean \| CompatPolicy \| partial` |
| `XaiopEngine.parse*` | **仅** `boolean` |
| Engine / Stream 实例 | `compatibilityMode` + `setCompat*` |

开启且无覆盖时：**八项** fix 全开。普通对象覆盖默认（未写键仍为 `true`）。

| Fix ID | 摘要 |
| --- | --- |
| `forcedRoot` | 开首非 `>`/`-` 时注入匿名对象根 |
| `rewriteBareNameArray` | `name-` → `>name-` |
| `rewriteEnterLine` | `>` 空白 / `>key:value` 粘连改写 |
| `ignoreBareLeaveAtRoot` | Root 上裸 `<` 忽略 |
| `popAndRetry` | 上浮 Cursor 并重试失败行 |
| `locatePathTrim` | `=` 路径修剪空白重试 |
| `locatePathStripSpaces` | `=` 去掉全部空白重试 |
| `locatePathArraySuffix` | `=` 段尾 `-` 在值为数组时当作数组键 |

导出：`CompatPolicy`、`COMPAT_FIX_IDS`、`COMPAT_FIX_DEFAULTS`。

```js
import { parseSync, CompatPolicy } from "xaiop";

parseSync(text, new CompatPolicy({ forcedRoot: false }));
engine.setCompatibilityMode(true);
engine.setCompatForcedRoot(false); // 模式关时返回 false
```

恢复**不**发明字段名；错误变化或无法上浮时仍抛 `XaiopSyntaxError`。深度说明：[notes/adjustment-policy.zh-CN.md](notes/adjustment-policy.zh-CN.md)。

---

## 10. 类型与常量

| 导出 | 值 / 说明 |
| --- | --- |
| `PROTOCOL_VERSION` | `"0.6.0"` |
| `SDK_VERSION` | `"0.14.0"` |
| `DOT_POLICY` | `NONE` · `PER_TOP_LEVEL_KEY` · `PER_N_KEYS` · `CUSTOM` |
| `MERGE_CONFLICT` | `OVERWRITE` · `KEEP` |
| `STREAM_MODES` | `CALLBACK` · `PROMISE` · `ASYNC_ITERATOR` · `EVENTS` |
| `STREAM_STATUS` | `IDLE` … `ERROR` |
| `TRANSPORT_KIND` | `HTTP` · `SSE` · `WEBSOCKET` · `RAW` |
| `HISTORY_NODE_KIND` | `DOT` · `TAIL` |
| `LINE_KIND` / `classifyLine` / `emptyLineView` / `runLineInterceptChain` | 行拦截分类与链工具（§6.4） |
| `applyAnnotationSpans` / `encodeAsSiblingLines` / `pathEscapesTypeCheck` | Annotation Span 辅助（§6.5） |
| `CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY` | SDK 控制根常量（§7.7） |
| `ControlDemux` / `ControlIngest` / `ControlPlaneHost` / `ControlSessionState` | 控制 demux / 会话辅助 |
| `ResumeWireLog` / `XaiopResumeLogError` | 续传用持久出站相位日志 |
| `encodeControlFrame` / `encodeSessionFrame` / `encodeAckFrame` / `encodeResumeFrame` / `encodeSnapshotFrame` | 控制帧编解码 |
| `isSdkControlLine` / `parseControlHeader` / `dispatchControlFrame` | 控制分类 / 路由 |
| `XaiopControlError` | 软控制面错误（`code`，可选 `header` / `frame`） |
| `COMPAT_FIX_IDS` / `COMPAT_FIX_DEFAULTS` | 八项 fix 列表与默认 |
| `TYPE` / `objectType` / `arrayType` | 类型检查常量与组合子（§5.5） |
| `TypeRegistry` / `TypeChecker` / `TypeFreezeSession` | 注册表 / 服务端检查 / 客户端冻结 |
| `TYPE_SCHEMA_FRAME_PREFIX` / `encodeTypeSchemaFrame` / `tryParseTypeSchemaFrame` | 类型一致性控制帧 |
| `canonicalizeType` / `parseTypeSurface` / `classifyValue` / `valueMatchesType` | 类型规范化与匹配工具 |
| `XaiopBrowserWs` / `XaiopBrowserWsConnection` | 仅 `xaiop/browser` — 相位 WS 客户端（无 listen） |

类型声明随 `tsc` 输出在 `dist/**/*.d.ts`（默认入口 / `browser` / `core`）。

---

## 11. 错误处理

| 错误 | 何时 |
| --- | --- |
| `XaiopSyntaxError` | 非法线格式；可选 `.line`。严格：立即失败。兼容：恢复失败或错误变化时仍抛 |
| `XaiopEncodeError` | 非法编码输入 / 选项 / 拒绝的键；可选 `.path`（如 `$.meta.name`） |
| `XaiopTypeError` | 类型注册 / 冻结 / schema 检查失败；可选 `.path` / `.expected` / `.actual` / `.polarity` |
| `XaiopControlError` | 未知 / 畸形控制帧（默认软错误；见 §7.7） |
| `Error` | 未知 `dataId`；Stream busy 等 |
| `TypeError` | 参数类型非法（非 string 源、非法 `conflict` / `as`、`pushTypeConsistency` 前提不满足 等） |

```js
import { parseSync, encodeSync, XaiopSyntaxError, XaiopEncodeError } from "xaiop";

try {
  parseSync(">\n&\n"); // 裸 & → XaiopSyntaxError
} catch (e) {
  if (e instanceof XaiopSyntaxError) console.error(e.line, e.message);
}

try {
  encodeSync({ "a&b": 1 });
} catch (e) {
  if (e instanceof XaiopEncodeError) console.error(e.path, e.message);
}
```

---

## 相关

| 文档 | 用途 |
| --- | --- |
| [README.zh-CN.md](README.zh-CN.md) | 本包入口 |
| [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) | Node 产品选择目录（可选） |
| [../../protocol/syntax.zh-CN.md](../../protocol/syntax.zh-CN.md) | 协议文法 |
| [../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md) | 封存 / 发行 |
| [notes/](notes/) | 流式解析、历史、编码坑点、WS、类型检查、行拦截、Annotation Span、**控制根**、调整策略 |
