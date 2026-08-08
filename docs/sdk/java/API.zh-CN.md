# XAIOP Java SDK API 文档

[English](API.md) · [简体中文](API.zh-CN.md)

**协议版本**: v0.6.0 Frozen（已封存）  
**SDK 版本**: 0.15.1（Java）  
**运行时**: **Java 17+** · 产物 **`io.xaiop:xaiop`**（单 JAR，零 runtime 依赖）  
**代码**: [../../../xaiop-sdk/java/](../../../xaiop-sdk/java/)（`src/main/java/io/xaiop/`）  
**对等矩阵**: [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) · **产品选择目录**: [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) · **发行索引**: [../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md)  
**Node 参考 API**: [../nodejs/API.zh-CN.md](../nodejs/API.zh-CN.md)

---

## 0. 运行时范围与包

Java 仅交付 **一个 JAR**。**没有** `xaiop/browser` / `xaiop/core` 子路径拆分 — 直接按包导入即可。

| 包 | 表面 |
| --- | --- |
| `io.xaiop` | 门面 `Xaiop`、`Parse`、`Encode`、`Merge`、`XaiopEngine`、选项、错误、`DotPolicy` |
| `io.xaiop.compat` | `CompatPolicy`、`CompatFixId`（×8） |
| `io.xaiop.stream` | `DotCheckpointEngine`、`ParseHistory`、`XaiopStream`、`LineIntercept`、`AnnotationSpan`、`PhaseEncode`、`Materialize`、`Transport` |
| `io.xaiop.ws` | `XaiopWs` listen + connect、`XaiopWsHub`、`XaiopWsConnection` |
| `io.xaiop.types` | `TYPE`、`TypeRegistry`、freeze / checker、`XaiopTypeError` |
| `io.xaiop.control` | 控制根 demux / 会话 / 续传 / seq 帧 |

| 命题 | |
| --- | --- |
| 浏览器 / JS bundler 入口 | **否** — 仅 JDK |
| 服务端 `listen` | **是** — `XaiopWs.listen`（零依赖 RFC6455 `ServerSocket`） |
| 客户端 `connect` | **是** — JDK `HttpClient` WebSocket（`XaiopWs.connect`） |
| 相位 Diff（`.` / cover / 拦截 / Annotation Span / 控制根 / typeCheck） | **是** — 与 Node 可观测语义一致 |
| 线语义 | 协议包 **0.6.0**；经 **golden CI** 对照 Node（[ALIGNMENT.zh-CN.md §7](ALIGNMENT.zh-CN.md#7-一致性如何验证)） |

### Java 惯例（相对 Node）

| 主题 | Java |
| --- | --- |
| 以同步为主 | 阻塞 API 为主；`parseAsync` / `encodeAsync` → `CompletableFuture`；checkpoint 的 `pushAsync` / `finishAsync` 在守护线程上合并调度 |
| 树 | `LinkedHashMap<String,Object>` / `ArrayList<Object>`；标量 `String`、`Integer`/`Long`/`Double`、`Boolean`、`null` |
| 无 `undefined` | 仅有 `null`；Annotation Span 保留 → **`AnnotationSpan.KEEP`**；行拦截保留 → 返回当前 `raw` |
| 异步分片 | 阻塞 `ChunkPull` / `for (Object d : stream.chunks())` |
| 选项 | 不可变 / 流式 builder（`EncodeOptions.builder()`、`DotCheckpointEngine.Options` 等） |
| Compat setter | 单个 `setCompatFix(CompatFixId, boolean)`（模式关闭时返回 `false`） |
| 数值 | 整数 / 浮点分属 JVM 类型；线格式浮点仍对齐 Node `Number::toString` |

---

## 目录

0. [运行时范围与包](#0-运行时范围与包)
1. [快速开始](#1-快速开始)
2. [核心概念](#2-核心概念)
3. [解析 API](#3-解析-api)
4. [编码 API](#4-编码-api)
5. [引擎 API](#5-引擎-api)（含 [§5.5 类型检查](#55-类型检查实例)）
6. [流式 API](#6-流式-api)（含 [§6.4 行拦截](#64-行拦截-onlineintercept) · [§6.5 Annotation Span](#65-annotation-span-onannotationspan) · 相位 `meta.seq`）
7. [WebSocket API](#7-websocket-api)（含 [§7.6 无浏览器包](#76-无浏览器包) · [§7.7 控制根](#77-sdk-控制根--会话--续传)）
8. [合并与注入](#8-合并与注入)
9. [兼容模式](#9-兼容模式)
10. [类型与常量](#10-类型与常量)
11. [错误处理](#11-错误处理)

---

## 1. 快速开始

### 安装

```xml
<dependency>
  <groupId>io.xaiop</groupId>
  <artifactId>xaiop</artifactId>
  <version>0.15.1</version>
</dependency>
```

```bash
cd xaiop-sdk/java
mvn test
```

### 基础用法

```java
import io.xaiop.*;
import io.xaiop.stream.*;

// XAIOP → JSON 树（LinkedHashMap / ArrayList / 标量）
Object json = Xaiop.parse(">\na:1\n");           // → {a=1}

// JSON → XAIOP（默认：每个顶层键一相，含 `.`）
String wire = Xaiop.encode(Map.of("a", 1, "b", 2));

// 引擎存储
XaiopEngine engine = new XaiopEngine();
String id = engine.uploadJsonSync(Map.of("meta", Map.of("name", "demo")));
Object stored = engine.getSync(id);

// 流式消费（`cover` 默认 false）
XaiopStream stream = new XaiopStream(url, XaiopStream.Options.defaults().cover(false));
stream.onChunk(diff -> { /* 相位 Diff */ });
stream.send(new XaiopStream.SendOptions().transport(TransportKind.HTTP));
```

WebSocket 骨架（listen + connect 同属 `io.xaiop.ws`）：

```java
import io.xaiop.ws.*;

XaiopWsHub hub = XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1")).join();
hub.onConnection(conn -> {
  conn.pushJson("a", 1, false);
  conn.pushJson("b", Map.of("x", 2), true);
  conn.end();
});

XaiopWs.ConnectOptions opts = new XaiopWs.ConnectOptions();
opts.onPhase(diff -> { /* 可能在 join() 返回前触发 — 见 §7.5 */ });
XaiopWsConnection client = XaiopWs.connect(hub.url(), opts).join();
Object done = client.done().join();
hub.close().join();
```

主路径为 **同步**；异步镜像在 Node 使用 Promise 处返回 `CompletableFuture`。

---

## 2. 核心概念

**XAIOP 线格式**是面向流式的、按行组织的 **Cursor 构造协议**。本文档描述的是 **已封存协议包 0.6.0** 的 Java 实现（SDK **0.15.1**），在可观测语义上对齐 Node 参考实现（[ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)）。

- 完整文法：[../../protocol/syntax.zh-CN.md](../../protocol/syntax.zh-CN.md)
- 封存与发行索引：[../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md)

### 2.1 线行（Label）

| 形态 | 作用 |
| --- | --- |
| `>` / `>name` / `>name-` / `<` | 进入 / 离开结构（对象、具名对象、具名数组） |
| `-` | 进入匿名数组元素 |
| `key:value` / `:value` | Content（键值 / 数组元素） |
| `.` | 将 Cursor 重置到 Root；退出广播；界定一个 **相** |
| `=path` | 模糊定位（不创建；零命中 → 语法错误） |
| `@path` | 自 Root 的精确路径；**创建**缺失的对象段并进入 |
| `!path` | 广播：匹配所有完整路径片段；后续行在每个 Cursor 上执行 |
| `&path` | 删除最深键；**不**移动 Cursor |

路径段使用 `>`（例如 `@a>b`、`&a>b`）。禁止裸 Label、裸 `&`、Root 处裸 `<`，以及值内换行。

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

### 2.2 相（Phase）

`.` 将 Cursor 重置到 Root，并作为流式 **Diff 边界**（SDK 策略：按 `.` 分相，而非按 Block）。  
含 `=` / `!` / `&` 的相必须看见**截至当前的累积树**；官方流式实现会为这些相解析累积前缀。

### 2.3 Root 形态

| 开端 | 结果 |
| --- | --- |
| `>` | 完整匿名 **对象** 根（`LinkedHashMap`） |
| `-` | 完整匿名 **数组** 根（`ArrayList`） |
| `>name` / Root Content 等 | 严格模式 → **`XaiopFragment`**（无外层 `{}`） |

空源 → 空 `LinkedHashMap`（`{}`）。Compat `forcedRoot` 会为 fragment 开端注入对象根，且永不返回 fragment。

### 2.4 `&` 删除（协议语义）

| 规则 | 行为 |
| --- | --- |
| 最深键 | `&a>b` 只删除 `b`；父节点可残留为 `{}` |
| 单 Cursor | 路径相对 Root **绝对** |
| 缺失 | 静默 **no-op**（永不创建） |
| 文档根 | **仅对象**；数组根 / fragment 根 → 语法错误 |
| Cursor 链 | 删除当前 Cursor 或其祖先 → **语法错误** |
| 广播 | `&path` 相对每个 Cursor；该 Cursor 上缺失 → 对该 Cursor no-op；任一链冲突 → 整行失败 |
| 数组 | 可删除整个具名数组值；**无**按下标删元素 |
| Cursor | `&` **不改变** Cursor；后续 Content 仍写在原 Cursor |

### 2.5 `#` 自定义注解传输（协议）

以 `#` 开头的独立行是 **自定义注解传输**（官方名称；不是“注释”）。位置不限；协议不解释 `#` 后文本；解析器忽略它（无 Cursor / 树副作用）。`note:#x` 仍是 Content。`#` 前有前导空白的行 **不是** 该原语。

### 2.6 Cover 与非 Cover（仅流式 Diff）

`cover` 是 **SDK 流式选项**（默认 `false`）。它不改变最终键集：`finish` 后 Snapshot ≡ `Parse.parse(wire)`。

| `cover` | Diff 行为 |
| --- | --- |
| `false`（默认） | `&` 更新 live / Commit 树；**已发出的 Diff 不会被改写** |
| `true` | 连续 `&` → 强制 `.` → 最深键 **`null` 墓碑 Diff** → 用 `>` 链恢复 Cursor → 继续 |

请勿混淆三种 `null`：

| 种类 | 含义 |
| --- | --- |
| Diff 墓碑 `null` | Cover 模式下删除相的 Diff 值（键存在，值为 `null`） |
| Content 带类型 `null` | 线格式 `key:null` / `:null`（协议 Content） |
| 空相分片 `null` | 空流式相 / 无 Diff 时的投递值 |

另加 Java 专属哨兵：**`AnnotationSpan.KEEP`**（保留线文）≠ `null`（丢弃捕获）— 见 §6.5。

---

## 3. 解析 API

### 3.1 `Parse.parse` / `Parse.parseAsync` · 门面 `Xaiop.parse`

```java
Parse.parse(source)                                          // 严格
Parse.parse(source, boolean compat)
Parse.parse(source, CompatPolicy policy)
Parse.parse(source, Map<CompatFixId, Boolean> overrides)
Parse.parse(source, ParseOptions options)                    // + symbolKeys
Parse.parseAsync(...) → CompletableFuture<Object>
```

将完整 XAIOP 文本解析为 JSON 树或 Fragment（同步 / 异步镜像）。

**参数：**

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `source` | `String` | — | 完整 XAIOP 文本（`null` → `NullPointerException`） |
| `compat` | `boolean` \| `CompatPolicy` \| `Map<CompatFixId,Boolean>` | `false` | `false` 严格；`true` 全部八项修复；map/policy 覆盖默认 |
| `ParseOptions` | builder | — | `compat` + `symbolKeys`（U+001F 标签转义） |

**返回：**

- 完整文档 → `LinkedHashMap` / `ArrayList` / 标量树
- 根 fragment（严格模式） → `XaiopFragment`（用 `getEntries()`）
- 空源 → 空 `LinkedHashMap`

```java
import io.xaiop.*;
import io.xaiop.compat.*;

Parse.parse(">\na:1\n");
Parse.parse(text, true);
Parse.parse(text, Map.of(CompatFixId.forcedRoot, false)); // 其余 fix 仍默认 true
Parse.parse(text, new CompatPolicy(Map.of(CompatFixId.popAndRetry, false)));
Parse.parse(text, ParseOptions.builder().symbolKeys(true).build());
```

**不对称：** 自由函数 `Parse.parse` 接受细粒度 `compat`；`XaiopEngine.parse` **仅接受 boolean**。

### 3.2 `Parse.LiveXaiopParser`

增量解析器：投喂行 / 文本；语义 ≡ 对拼接结果调用 `Parse.parse`。流式 checkpoint 用它避免每个 `.` 都重扫整个前缀。

```java
new Parse.LiveXaiopParser()
new Parse.LiveXaiopParser(boolean compat)
new Parse.LiveXaiopParser(boolean compat, boolean symbolKeys)
new Parse.LiveXaiopParser(ParseOptions options)
new Parse.LiveXaiopParser(CompatPolicy policy)
new Parse.LiveXaiopParser(Map<CompatFixId, Boolean> overrides)

feedLine(line): this
feedText(text): this
value(): Object              // 活引用 — 对外暴露前请 clone / Materialize
cursorRestoreLines(): List<String>  // cover 恢复用的 `>` / `>name-` 链；在 Root → []
docKind(): String            // "object" / "array" / "fragment" / null
```

| 方法 | 说明 |
| --- | --- |
| `feedLine` | 完整逻辑行（无尾随 LF/CRLF） |
| `feedText` | 切分方式同 `Parse.parse` — **跨调用无半行缓冲**；无 LF 的尾段仍视为一整行。任意网络分片请用 `DotCheckpointEngine.push` / `XaiopStream` |
| `value` | 当前文档（后续投喂会就地修改） |
| `cursorRestoreLines` | 广播激活时不可用；栈上有匿名 / 数组元素帧 → 语法错误 |

```java
Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
// OK：完整行（无 LF 的尾随不完整段仍算一行）
live.feedText(">\n>a\nx:1\n.\n>b\ny:2\n");
live.cursorRestoreLines(); // → [">b"]
live.value();              // → {a={x=1}, b={y=2}}
Object snap = Materialize.materializeSnapshot(live.value());
// 不要用于 TCP/WS 字节切片：feedText(">me") 再 feedText("ta\n") ≠ feedText(">meta\n")
```

### 3.3 `XaiopFragment`

严格模式下，无匿名根且文档以 `>name` / Root Content 开端时返回。

| 成员 | 含义 |
| --- | --- |
| `getEntries()` | Root 处的具名绑定（`LinkedHashMap`） |
| `isFragment()` | 恒为 `true` |
| `notation()` | 调试字符串，例如 `"a":{}` |

流式 / WS JSON 表面会走 `Materialize.materializeSnapshot`：fragment → entries 的克隆。Engine `getSync` 保留 fragment。

---

## 4. 编码 API

### 4.1 `Encode.encode` / `Encode.encodeAsync` · 门面 `Xaiop.encode`

```java
Encode.encode(value): String
Encode.encode(value, EncodeOptions options): String
Encode.encodeAsync(value[, options]): CompletableFuture<String>
```

将 **普通 JSON 树** 编码为 **严格** XAIOP（兼容模式 **永不** 改变 encode 输出）。  
自由函数 / `XaiopEngine` 静态 / 实例对同一 `(value, options)` 产生相同线文。

**保证：** 对可接受的值，`Parse.parse(Encode.encode(value, opt))` 深相等 `value`；线文恰以一个 `\n` 结尾。  
**不保证：** `encode(parse(手写线文))` 逐字节相同。

**被拒绝的字符串值（抛 `XaiopEncodeError`）：** 含 CR/LF；**以 U+0020 SPACE 开头**（`:` 后的强制 string 标记不是载荷 — 若发出此类值，解析时会静默剥掉前导空格）。Tab（`U+0009`）与尾随空格仍可编码。

```java
import io.xaiop.*;

Encode.encode(Map.of("a", 1, "b", 2)); // 默认 perTopLevelKey
Encode.encode(Map.of("a", 1, "b", 2), EncodeOptions.singlePhase()); // dotPolicy: none
Encode.encode(obj, EncodeOptions.builder()
    .dotPolicy(DotPolicy.PER_N_KEYS)
    .phaseEvery(2)
    .build());
Encode.encode(obj, EncodeOptions.builder()
    .dotPolicyPaths(List.of("meta", "items[0]"))
    .build());
```

### 4.2 `EncodeOptions`

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `root` | `AUTO` | `OBJECT` \| `ARRAY` \| `AUTO`（`ARRAY` 要求 `List`，`OBJECT` 要求 `Map`） |
| `style` | `RESET` | `RELATIVE` 仅在 `dotPolicy: none` 时可用 |
| `dotPolicy` | `PER_TOP_LEVEL_KEY` | `DotPolicy.NONE` \| `PER_TOP_LEVEL_KEY` \| `PER_N_KEYS` \| `CUSTOM`，或 `dotPolicyPaths(...)` |
| `phaseEvery` | `1`（设置时） | `PER_N_KEYS` 时每相的键数 |
| `maxPhases` | — | 限制相数（尾部合并） |
| `finalDot` | `false` | 追加末尾 `.` |
| `keyOrder` | `INSERTION` | 或 `SORTED` |
| `nullPolicy` | `ENCODE` | `ENCODE` 带类型 null；`OMIT` 丢弃对象 null 键（数组仍编码）；`ERROR` 遇 null 抛错 |
| `undefinedPolicy` | `OMIT` | **在 Java 中无效**（无 `undefined`）；仅为选项表对齐保留 |
| `shouldPhase` | — | `dotPolicy: CUSTOM` 时必需；`Predicate<PhaseContext>` |
| `symbolKeys` | `false` | 可选 U+001F 标签转义方言，使键可以以 `#` `@` `>` `<` `=` `!` `&` 或 U+001F 开头；**encode 与 parse 都必须启用**；见 [label-escape](../../protocol/notes/label-escape.md) |

路径数组重载（`dotPolicyPaths`）与 `phaseEvery` / `maxPhases` / `shouldPhase` **互斥**；要求 `style: RESET`；数组下标必须是路径的 **最后一段**。辅助：`Encode.parseJsonPath` / `Encode.formatJsonPath`。

`PhaseContext` record：`key`、`index`、`total`、`keysInPhase`、`phaseIndex`。

### 4.3 被拒绝的键

这些键会抛出 `XaiopEncodeError`（不会静默改形）：

| 形态 | 原因 |
| --- | --- |
| 空 / 空白 / 含 `:` | 非法 Label 名 |
| 以 `-` 结尾 | 与 `>name-` 数组进入冲突 |
| 键体含 `>` `<` `=` `!` **`&`** | Cursor / 定位 / 删除算子歧义 |
| **以** `#` `@` `>` `<` `=` `!` `&` 或 **U+001F** **开头** | 行类 / 保留转义引入符 — 除非 `symbolKeys: true` |

常量：`DotPolicy.*` · `LabelEscape.INTRODUCER`（`"\u001f"`，包 `io.xaiop.internal`）。

`XaiopEncodeError` 的 `getPath()` 返回值/键失败的 JSON 路径（例如 `$.meta.name`）；选项级失败（非法 `phaseEvery` 等）为 `null`。

---

## 5. 引擎 API

`XaiopEngine`：内存存储（运行时 data id）外加 parse / encode / merge-inject。兼容模式默认 **关闭**。Java **以同步为主**（`*Sync`）；并非每个 store 方法都有 Promise-first 双生。

```java
import io.xaiop.XaiopEngine;

XaiopEngine engine = new XaiopEngine();
XaiopEngine engineCompat = new XaiopEngine(true);
```

### 5.1 存储

| API | 返回 | 说明 |
| --- | --- | --- |
| `uploadSync(source)` | `dataId` | 解析完整 XAIOP → 存储；遵循实例 compat |
| `uploadJsonSync(value[, encodeOptions])` | `dataId` | 严格编码 → 上传 |
| `getSync(dataId)` | JSON 或 `XaiopFragment`（克隆） | 未知 id → `IllegalArgumentException` |
| `has` / `delete` / `clear` | — | 存储管理 |

### 5.2 实例 encode / merge

| API | 说明 |
| --- | --- |
| `encodeSync` | 同自由函数 `Encode.encode`；**忽略** compat 开关 |
| `mergeToJsonSync` | 基 JSON + XAIOP → JSON（解析用实例 compat；可用 `options.compat` 覆盖） |
| `mergeToXaiopSync` | → XAIOP 线文 |
| `injectXaiopSync` | 向已有 `dataId` 注入 XAIOP（变更存储） |
| `injectJsonSync` | 向已有 `dataId` 注入 JSON |

### 5.3 静态方法

| API | 说明 |
| --- | --- |
| `XaiopEngine.parse` | 第二参 **仅 boolean** |
| `XaiopEngine.encode` | 同自由函数 |
| `XaiopEngine.mergeToJson` / `mergeToXaiop` | 同自由函数 |

### 5.4 兼容开关（实例）

| API | 说明 |
| --- | --- |
| `compatibilityMode()` / `setCompatibilityMode` | 总开关；**不**重置逐项 fix；打开 compat 会清除 `typeCheck` |
| `compatFix(id)` / `setCompatFix(id, enabled)` | 八项细粒度修复；模式关闭时 setter 返回 `false` 且不改状态 |

### 5.5 类型检查（实例）

**非协议：** registry / freeze / push 是 **SDK** 产品能力；不改写线文法。包：`io.xaiop.types`。

| API | 说明 |
| --- | --- |
| `typeCheck()` / `setTypeCheck(enabled)` | 总开关（默认 `false`）；**仅严格模式**；打开 compat 会清除它；开启时 `upload*` / `inject*` 走注册表检查 |
| `Types.TYPE` | 叶/结构常量：`INT` `FLOAT` `BOOL` `STRING` `NULL` `OBJECT` `ARRAY` `ANY`（叶对齐 `PROT-CONTENT`） |
| `Types.objectType(fields)` / `Types.arrayType(element)` | 构建器；也接受表面糖字符串（见下） |
| `registerType(path, type[, polarity])` | 绑定 JSON 路径；`TypePolarity.ALLOW`（默认）\| `DENY`；**设定后不可变**（重注册 → `false`） |
| `registerTypes(map[, polarity])` | 批量；返回 `RegisterManyResult`（`ok`、`rejected`） |
| `registerTypeDeny(path, type)` | Deny 辅助 |
| `getRegisteredType` / `typeRegistry` / `exportTypeSchema` | 查询与快照 |
| `encodeTypeSchemaFrame()` | 编码控制帧（优先在连接上用 `pushTypeConsistency`） |
| `onTypeViolation(BiConsumer\|null)` | 违规钩子（在抛出 `XaiopTypeError` **之前**调用） |

**路径风格：** `data.fork`、`items[0]`（同 encode 的 `parseJsonPath`；**不是**线格式 `data>fork`）。

**可选表面糖：** `string`、`array<int>`、`object<name:string,old:int>` → 按 **规范** 类型比较。

**服务端检查（`typeCheck` + 注册表）：**

| 规则 | |
| --- | --- |
| 范围 | **仅已注册路径**；未注册路径被注册表忽略 |
| `ALLOW` | 值必须匹配；`int` ≠ `float`（与 encode 同分裂） |
| `DENY` | 值必须 **不** 匹配该类型 |
| `any` | 显式忽略（不能组合 `DENY` + `any`） |
| 空注册表 | 开启检查为 no-op |
| 时机 | `uploadSync` / `uploadJsonSync` / `injectXaiopSync` / `injectJsonSync` |

```java
import io.xaiop.XaiopEngine;
import io.xaiop.types.*;

XaiopEngine eng = new XaiopEngine();
eng.registerType("data.fork", Types.TYPE.STRING);
eng.registerType("user", Types.objectType(Map.of(
    "name", Types.TYPE.STRING,
    "old", Types.TYPE.INT)));
eng.registerType("items", Types.arrayType(Types.TYPE.INT));
eng.registerTypeDeny("data.bad", Types.TYPE.STRING);
eng.registerType("meta.note", Types.TYPE.ANY);
eng.setTypeCheck(true);
eng.uploadSync(">\n>data\nfork:ok\n"); // OK
```

**客户端（`XaiopWs` / `XaiopStream`，`typeCheck: true`）：**

| 规则 | |
| --- | --- |
| 冻结 | 某路径首次 **非 `null`** 观测锁定类型；后续值必须兼容 |
| `null` | 客户端 **跳过**（不刷新、不报错），以免破坏删除/清空原语 |
| 数组 | 开启检查时元素类型必须 **同质** |
| 刷新 | Commit 中键缺失（删除）清除子树冻结；删除后再创建可改类型 |
| 无 schema 推送 | 首次见即冻结仍强制一致性 |
| Schema 推送 / 预载 | `ALLOW` / `DENY` / `any` 优先；**违反 schema 的观测不写入冻结**；`any` **不** 锁定冻结 |
| 选项 | `typeCheck`、`typeSchema`（快照 / 注册表 / 表面）；`compatibilityMode` 开启时 **忽略 typeCheck** |

**类型一致性推送（WS）：** `conn.pushTypeConsistency(engine|registry|snapshot)`

| 前提 | |
| --- | --- |
| 连接 | **严格**（该连接上 `compatibilityMode == false`） |
| 载荷 | 非空注册表；若传 `XaiopEngine`，其 **`typeCheck == true`** |
| 形态 | 控制帧（**非** XAIOP 线文）：前缀 `#!xaiop/types/v1\n` + JSON 快照；由控制根在 parse / Span 前 demux |
| 失败 | 前提不满足 → `IllegalArgumentException`；套接字非 OPEN → `false` |

---

## 6. 流式 API

### 6.1 `XaiopStream`

HTTP / SSE / WebSocket / RAW **消费者**。文本进入 `DotCheckpointEngine`，在 `.` 上发出 Diff，EOF 时解析最终 Snapshot。设置会话选项时，入站文本先经控制 demux，再 push 到 checkpoint。

```java
import io.xaiop.stream.*;

XaiopStream stream = new XaiopStream(url, XaiopStream.Options.defaults()
    .streamProcessing(true)    // 默认
    .compatibilityMode(false)  // 默认
    .mergeChunkWindow(true)    // 默认 — 缓冲窗口内完整 `.` 合并为一个 Diff
    .asyncParse(false)         // 默认；生产可设 true（合并的 pushAsync）
    .historySnapshot(false)
    .historyRealtime(false)
    .retainWireHistory(true)
    .cover(false)              // 默认 — 见 §2.6
    .modes(StreamMode.CALLBACK));

stream.onChunk(diff -> {});
stream.onChunkWithMeta((diff, meta) -> {});
stream.onDone(json -> {});
stream.send(new XaiopStream.SendOptions().transport(TransportKind.HTTP));
```

门面：`Xaiop.stream(url)` / `Xaiop.stream(url, options)`。

#### 构造选项（`XaiopStream.Options`）

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `streamProcessing` | `true` | 中途相位 Diff；`false` → finish 时一个分片 |
| `mergeChunkWindow` | `true` | 窗口内全部完整 `.` → **一个** Diff |
| `asyncParse` | `false` | 传输使用 `pushAsync` |
| `historySnapshot` | `false` | 只读 `.` 历史 |
| `historyRealtime` | `false` | 前向 `jumpTo` |
| `retainWireHistory` | `true` | 开启历史时保留线文切片 |
| `cover` | `false` | `&` 的 Cover Diff（§2.6） |
| `compatibilityMode` | `false` | 同 Engine |
| `symbolKeys` | `false` | U+001F 标签转义方言 |
| `typeCheck` | `false` | 客户端冻结 / schema 检查（§5.5）；兼容模式也开时忽略 |
| `typeSchema` | — | 预载类型快照 / 注册表 / 表面 |
| `lineIntercept` | — | 初始行拦截处理器（§6.4） |
| `annotationSpan` | — | 初始 Annotation Span 处理器（§6.5） |
| `session` / `autoAck` / 控制回调 | — | 可选控制根入站游标（§7.7） |
| `modes` | `CALLBACK` | 可多选（`PROMISE`、`ASYNC_ITERATOR`、`EVENTS`） |

#### Snapshot / 分片

| API | 时机 | 值 |
| --- | --- | --- |
| `onChunk` / `onChunkWithMeta` / 迭代器 | 相 / 窗口边界 | Diff JSON；空相可为 `null`；**meta** 可含 `seq` / `seqs`（相位序号，§7.7）与 `typeCheckEscapePaths`。Diff 已相对 Commit 隔离 — **按引用投递**（与 Node 对齐）；多 listener 共享同一分片时请谨慎突变 |
| `getCommittedSnapshot()` | 每次 commit 后 | 截至最近 `.` / EOF 的累积后写覆盖 |
| `bufferStats()` / `compactCommitted(...)` | 中途 | 接收缓冲大小 / 丢弃已提交线文（保留活树） |
| `getSnapshot()` / `onDone` | finish 后 | 全缓冲解析；空 → `{}` |
| 中途 `getSnapshot()` | `streaming` | 通常 `null` / 未设置 |

这些表面上的 Fragment 会物化为普通 map（`Materialize.materializeSnapshot`）。

#### 投递模式

| 模式 | 表面 |
| --- | --- |
| `CALLBACK`（底线） | `onChunk` / `onDone` / `onError`；另有行拦截 · Annotation Span |
| `PROMISE` | `send()` → 最终 Snapshot 的 `CompletableFuture` |
| `ASYNC_ITERATOR` | 阻塞 `ChunkPull` / `for (Object d : stream.chunks())` |
| `EVENTS` | `on(StreamEvent, …)` |

`disableMode` 永不留下空集合（保留 `CALLBACK`）。忙碌时再次 `send`：promise 模式 → 异常 future；否则抛错。

#### `send` 要点（`XaiopStream.SendOptions`）

| 项 | 规则 |
| --- | --- |
| 默认传输 | `HTTP`（`java.net.http.HttpClient`） |
| SSE | 设置 `Accept: text/event-stream`；多行 `data:` 用 `\n` 拼接 |
| RAW | 需要 `source`（`CharSequence`/`byte[]` 的 `Iterable`）或 `InputStream` |
| 二进制 | 跨分片流式 UTF-8 解码 |
| `timeoutMs` | 单次 send 中止截止（配合 `abort()` 的 AbortSignal 等价） |
| `abort()` | 状态 `ABORTED` |

状态机：`IDLE → CONNECTING → STREAMING → COMPLETING → COMPLETED`（或 `ABORTED` / `ERROR`）。枚举：`StreamStatus`、`TransportKind`、`StreamMode`；忙碌检查用 `StreamStatus.busy()`。

### 6.2 `DotCheckpointEngine`

底层 `.`-相解析器（用于 `XaiopStream` / WS；也可直接使用）。实现 `AutoCloseable`。

```java
DotCheckpointEngine eng = DotCheckpointEngine.Options.of(diff -> {})
    .streamProcessing(true)    // 默认
    .mergeChunkWindow(true)    // 默认
    .emitDiff(true)            // 默认；false → 仅 Commit/最终
    .cover(false)
    .historySnapshot(false)
    .historyRealtime(false)
    .retainWireHistory(true)
    .compat(false)
    .lineIntercept(/* handlers */)
    .annotationSpan(/* handlers */)
    .build();
// 或：Xaiop.checkpoint(diff -> {});

eng.push(chunk);
eng.bufferStats();       // { length, committedAt, pendingBytes, openPhase }
eng.compactCommitted();  // 丢弃已提交线文；保留活树
eng.finish();
eng.snapshot();          // 最终
eng.committedSnapshot(); // 最近 commit
eng.history();           // ParseHistory | null
eng.onLineIntercept(fn); // 见 §6.4
eng.onAnnotationSpan(fn); // 见 §6.5
```

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `streamProcessing` | `true` | 中途 `.` 相 + 行扫描路径（拦截 / Span）。裸 builder 未设该标志时为 **开**。 |
| `mergeChunkWindow` | `true` | 缓冲窗口内完整 `.` 合并为一个 Diff |
| `emitDiff` | `true` | 仅需 Commit / 最终快照时设 `false`；`onChunk` 可选（省略 → Diff no-op） |
| `cover` | `false` | `&` 的 Cover 模式 Diff |
| `phaseSeq` | `true` | 在 `ChunkMeta` 中分配单调相位 seq |
| `symbolKeys` | `false` | 解码 U+001F 标签转义 |

| 方法 | 说明 |
| --- | --- |
| `push` / `pushAsync` | 同步摄入 / 合并异步扫描（守护线程） |
| `finish` / `finishAsync` | 冲刷尾部 |
| `bufferStats()` | `{ length, committedAt, pendingBytes, openPhase }`。`pendingBytes` **必须**等于 `length - committedAt`。监控时优先于此，而非直接读 `buffer()`。 |
| `compactCommitted(dropHistory?)` | 丢弃 `buffer[0..committedAt)`；保留活树。引擎已关闭、或 `historyRealtime`+`retainWireHistory`、或历史非空时 **必须** 抛错 — 除非 `dropHistory: true`。 |
| `jumpTo(index)` | 需要 `historyRealtime`；丢弃该索引之后的节点 |
| `onLineIntercept` / `clearLineIntercepts` | 完整行切分后、解析前；见 §6.4 |
| `onAnnotationSpan` / `clearAnnotationSpans` | 相位 `#` 区间；见 §6.5 |
| `streamProcessing()` / `mergeChunkWindow()` | 解析后默认值的只读 getter |

`ChunkMeta` 字段：`typeCheckEscapePaths`、`seq`、`seqs`、`logSeq`、`logSeqs`。

### 6.3 `ParseHistory` / Snapshot 辅助

当 `historySnapshot` 和/或 `historyRealtime` 开启时，由 checkpoint 构建历史。

| API | 说明 |
| --- | --- |
| `info()` / `exportTimeRoot()` | 元数据 / 节点列表 |
| `getNode` / `getDiff` / `getBefore` / `getAfter` | 按索引读取（**deep-clone** 导出；调用方可安全突变） |
| `compare` / `viewRange` | 比较 / 区间视图（返回时防御性 clone） |
| `jumpTo` / `canJumpTo` | 实时前向跳转 |
| `setSource` / `release` | 关联源键 / 释放 |

开启 history 时，checkpoint 引擎内部可能持有已移交 / 相邻共享的树；上表**公开** API 仍为读时 clone（与 Node 对齐）。

`Materialize.materializeSnapshot(parsed)`：Fragment → 普通对象（JSON 表面）。  
`Materialize.materializeOwned(parsed)`：对普通根跳过克隆（解析器复用时不安全）。

常量：`ParseHistory.HISTORY_NODE_KIND.DOT` / `TAIL`。

### 6.4 行拦截（`onLineIntercept`）

**SDK 产品能力**（非线文法）：checkpoint **接收缓冲**切出完整逻辑行之后、**在** `LiveXaiopParser` 投喂之前，按 **注册顺序** 运行处理器。

| 对照 | 行拦截 | `onPhase` / `onChunk` |
| --- | --- | --- |
| 层级 | 缓冲行边界（切分后） | 相位 Diff（解析 + Commit 后） |
| 粒度 | 每条完整行 | `.` 相（可窗口合并） |
| 改写 / 跳过 | **是**（返回字符串或 `null`） | **否** |

```java
import io.xaiop.stream.*;

eng.onLineIntercept(ctx -> {
  if (LineKind.ANNOTATION.equals(ctx.view().kind())) return null; // 跳过该行
  if (LineKind.CONTENT.equals(ctx.view().kind()) && "x".equals(ctx.view().key()))
    return "x:42"; // 改写
  return ctx.raw(); // 保留
});
```

| 返回 | 含义 |
| --- | --- |
| `String` | 下游投喂文本；下一处理器看到它 |
| `null` | **跳过该行**（短路；后续处理器不调用） |
| `ctx.raw()`（相同文本） | 保留当前文本（Java 无 `undefined`） |

**三种 `null`（勿混同）：** 拦截跳过 ≠ Content `key:null` ≠ 空相 Diff `null`。

**固定模板 `LineView`：** `kind` · `raw` · `name` · `path` · `key` · `valueText` · `annotationText`（未用槽位为 `null`）。另有：`LineKind` / `LineIntercept.classifyLine` / `emptyLineView` / `runLineInterceptChain`。

| 边界 | 行为 |
| --- | --- |
| `streamProcessing: false` | 整缓冲解析；拦截器 **不** 运行 |
| 跳过 `.` / 改写为 `.` | 相闭合跟随 **拦截后** 文本 |
| `mergeChunkWindow` / `cover` / `pushAsync` | 有效行之后沿用既有相位规则 |
| `jumpTo`（`historyRealtime`） | 重建时 **重跑** 拦截链 |
| 存在拦截器 → Diff 拥有解析 | 使用 **有效** 行线文（可能与传输缓冲不同） |

接线面：`DotCheckpointEngine` · `XaiopStream` · `XaiopWsConnection`（构造 `lineIntercept` 和/或 `onLineIntercept` / `clearLineIntercepts`）。

### 6.5 Annotation Span（`onAnnotationSpan`）

**SDK 产品能力**（非线文法）：线文 `#…` 仍无树副作用。在 **本相** 行就绪之后、**Diff / Commit / `typeCheck` 之前**，遇 `#` 收集 **向前同级** 兄弟（+ 子树），以 **注解文本 + 模板 JSON** 调用处理器，并 remount / 丢弃 / 保留。以 `#!` 开头的行属控制根：在 Span 前 demux；Span **硬跳过** 任何残留 `#!`。

| 对照 | 行拦截 §6.4 | Annotation Span §6.5 |
| --- | --- | --- |
| 层级 | 缓冲行切分 | 相位行（面向 JSON 的捕获） |
| 触发 | 每条完整行 | `#` + 向前同级区间 |
| 处理器输入 | 线文 `view` | `annotation` + 物化后的 `json`（无 `=`/`@`/`!` 形态） |
| 相对 typeCheck | 正交 | **在 typeCheck 之前**；已处理区间 **逃逸** 类型检查 |

```java
eng.onAnnotationSpan((annotation, view) -> {
  if (!annotation.contains("tag")) return AnnotationSpan.KEEP; // 保留线文；仍逃逸捕获键
  if (annotation.contains("drop")) return null;                // 丢弃 # + 捕获
  Map<String, Object> rewritten = new LinkedHashMap<>((Map) view.json());
  rewritten.put("rewritten", true);
  return rewritten; // remount
});
```

| 返回 | 含义 |
| --- | --- |
| `AnnotationSpan.KEEP` | 保留 `#` + 捕获线文；**仍** 为捕获键记录逃逸路径（Node `undefined`） |
| `null` | 丢弃 `#` + 捕获 |
| `Map` / `List` / JSON 文本 `String` | 编码为替换捕获的兄弟线文 |

**TypeCheck 逃逸（必须理解）：** 本相一旦 **调用** 某 `#` 的 Span 处理器链，处理器处理的区间以及该向前区间覆盖的同级键进入 `meta.typeCheckEscapePaths`；之后 `observeTree` **跳过** 这些路径（及后代）。`#` **之前** 的同级键 **不** 逃逸。

接线面：构造 `annotationSpan` · `onAnnotationSpan` · `clearAnnotationSpans`（checkpoint / Stream / WS）。

辅助：`AnnotationSpan.applyAnnotationSpans` / `encodeAsSiblingLines` / `pathEscapesTypeCheck`。

---

## 7. WebSocket API

长生命周期骨架会话（同一连接上 push + 消费）优先用 `XaiopWs`。HTTP/SSE/RAW 继续用 `XaiopStream`。  
**线格式** 不定义 `connect` / Future / 回调顺序；以下为 **锁定的 Java SDK** 行为，对齐 Node 的会话契约。

门面别名：`Xaiop.wsListen(...)` / `Xaiop.wsConnect(...)`。

### 7.1 `XaiopWs`

```java
import io.xaiop.ws.*;

XaiopWsHub hub = XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1")).join();
hub.onConnection(conn -> {
  // 同步首帧合法且常见 — 客户端 MUST 在 connect 选项中传入回调
  conn.pushJson("a", 1, false);
  conn.pushJson("b", Map.of("x", 2), true);
  conn.end();
});

XaiopWs.ConnectOptions opts = new XaiopWs.ConnectOptions();
opts.onPhase(diff -> {
  /* 可能在本 join 返回前触发 — 见 §7.5 */
});
XaiopWsConnection client = XaiopWs.connect(hub.url(), opts).join();
Object json = client.done().join(); // connect 返回时可能已 settled
hub.close().join();
```

| API | 说明 |
| --- | --- |
| `XaiopWs.listen(options?)` | → `CompletableFuture<XaiopWsHub>`；可挂接到已有 `ServerSocket` + `path` |
| `XaiopWs.connect(url, options?)` | → `CompletableFuture<XaiopWsConnection>`；语义见 §7.5 |
| `XaiopWs.encodePhaseJson` / `encodePhaseObject` | 仅编码（不发送）；委托 `PhaseEncode` |

**`ConnectOptions`：** 解析/控制选项（`streamProcessing`、`mergeChunkWindow`、`asyncParse`、`cover`、`compatibilityMode`、`typeCheck`、`typeSchema`、`symbolKeys`、`lineIntercept`、`annotationSpan`、**`session`**、**`autoSession`**、**`autoAck`**、**`retainOutbound`**）+ `protocols`、`handshakeTimeoutMs`（默认 **15000**）、`headers`、`httpClient`，以及构造时 `onPhase` / `onChunk` / `onDone` / `onError` / **`onControlError`** / **`onSession`** / **`onResume`** / **`onAck`** / **`onSnapshot`**。

**`ListenOptions`：** 上述解析/控制相关选项 + `port` / `host` / `path` / `backlog` / `serverSocket` / `protocols` / `maxPayload`。  
**未实现：** Node 的 `perMessageDeflate`。不支持挂接 JDK `HttpServer` — 请用 `serverSocket(...)` + 路径多路复用（同套接字上的 `GET /health`）。

### 7.2 `XaiopWsConnection`

| 成员 | 说明 |
| --- | --- |
| `pushJson(key, value, finalPhase\|options)` | 每相一个键；非 final 保证尾随 `.\n`；非 OPEN → `false` |
| `pushObject(object, finalPhase\|options)` | 一相多个键；同上 |
| `pushWire(text)` | 原始线文 **原样**（不自动 `\n`）；连续帧须已行安全，否则对端可能粘连；非 OPEN → `false` |
| `pushWireLn(text)` | 同 `pushWire`，但当 `text` 尚未以 LF 结尾时追加 `\n` |
| `pushTypeConsistency(engine\|registry\|snapshot)` | 推送已注册类型 schema（控制帧）；前提见 §5.5 |
| `session` / `autoSession` / `autoAck` / `retainOutbound` | 控制会话 / hello / 自动 ack / 出站日志（§7.7） |
| `sendSession` / `sendAck` / `sendResume` / `sendSnapshot` | 出站控制帧 |
| `getResumeState()` / `phaseSeq` / `outboundSeq` / `sessionId` / `ackedSeq` / `logSeq` | 续传游标（`getResumeState` 含入站/出站 seq） |
| `outboundLog` / `replayOutboundAfter` / `noteOutboundPhase` | 生产者出站相位日志 |
| `ResumeWireLog` | 应用持有的跨重连持久日志（`io.xaiop.control`） |
| `typeCheck()` | 只读；该连接是否开启客户端类型检查 |
| `onPhase` / `onChunk` | Diff 回调；有带 meta 变体；**`connect` 后锁定** — 用 connect 选项 |
| `onLineIntercept` / `clearLineIntercepts` | 缓冲行拦截（§6.4）；**`connect` 后锁定** |
| `onAnnotationSpan` / `clearAnnotationSpans` | 相位 Annotation Span（§6.5）；**`connect` 后锁定** |
| `onResume` / `onSession` / `onAck` / `onSnapshot` / `onControlError` | 控制回调；**`connect` 后锁定**；listen-accept 保持未锁定 |
| `onDone` / `onError` | 最终 / 错误；**`connect` 后锁定** |
| `handlersLocked()` | 成功 `XaiopWs.connect` 后为 `true` |
| `getCommittedSnapshot` / `getSnapshot` | 同 Stream：中途 committed；`getSnapshot()` 直至最终才设置 |
| `done()` | 对端关闭 + `finish` 后最终 Snapshot 的 `CompletableFuture` |
| `closed()` | 套接字拆除完成（在 `done` 路径之后） |
| `end` / `abort` | 排空关闭 / 中止 |

### 7.3 `XaiopWsHub`

| 成员 | 说明 |
| --- | --- |
| `url(host?)` | 连接 URL（`ws://…`） |
| `onConnection` / `onError` | 接受回调（此处可 **同步** `push*`） |
| `connections()` | 当前连接 |
| `port()` / `path()` | 绑定监听信息 |
| `close()` | 关闭 hub（`CompletableFuture`） |

### 7.4 `encodePhaseJson` / `encodePhaseObject`

```java
PhaseEncode.encodePhaseJson(key, value[, PhaseEncode.Options])
PhaseEncode.encodePhaseObject(object[, PhaseEncode.Options])
// 亦有：XaiopWs.encodePhaseJson / encodePhaseObject
```

内部使用 `Encode.encode`（强制 `dotPolicy: none`）；`final: true` 省略相位 `.`。非法键仍抛 `XaiopEncodeError`。

### 7.5 `connect` Future 与回调顺序（注意）

内部 `connect` 顺序：**创建套接字 → 立即构造 `XaiopWsConnection`（绑定消息 + 选项回调）→ 等待 open → 完成 Future**。

| 明确语义 | |
| --- | --- |
| `connect` 完成意味着 | 握手成功；返回可用连接对象 |
| `connect` 完成 **不** 意味着 | “尚无 `onPhase` / `onDone`”或“`done` 未 settled” |
| SDK **不** 在 complete 前缓冲相位 | 有意为之 — 避免 accept 侧同步首帧丢失 |

因此 **`onPhase` / `onDone` / `onError` 以及 `done` 的 settlement 都可能在 `connect(...).join()` 返回前发生**（尤其是 accept 侧在 `onConnection` 中同步 push 时）。

**要求：** 将 **`onPhase` / `onChunk` / `onDone` / `onError` / `lineIntercept` / `annotationSpan` / 控制回调（`onResume`、`onSession` 等）** 放在 **`ConnectOptions`** 中。  
connect 完成后，变更器（`onPhase`、`onLineIntercept`、`onAnnotationSpan`、`onResume`、`onSession`、`onAck`、`onSnapshot`、`onControlError`、`onDone`、`onError` 及其 `clear*`）**抛错**（`handlersLocked`）— **无** 早期帧重放。  
Listen-accept 连接保持未锁定，以便生产者/消费者仍可在 `hub.onConnection` 中挂接。  
若应用需要“仅在 connect 返回后处理”：在应用层排队；不要要求 SDK 延迟投递。

### 7.6 无浏览器包

Java **没有** `xaiop/browser` 子路径。相位客户端与服务端同属 `io.xaiop.ws`。

| 需求 | Java |
| --- | --- |
| 经 HTTP/SSE/WS 的相位 Diff 消费 | `XaiopStream` |
| 长生命周期双向会话 | `XaiopWs.listen` + `XaiopWs.connect` |
| 仅本地 checkpoint | `DotCheckpointEngine` / `Xaiop.checkpoint` |
| 浏览器 JS 客户端 | 使用 Node [`xaiop/browser`](../nodejs/API.zh-CN.md#76-浏览器-xaiopbrowser--相位客户端) |

| 相对 Node 浏览器 | |
| --- | --- |
| 套接字 | JDK `HttpClient` WebSocket（connect）· RFC6455 `ServerSocket`（listen） |
| `listen` / hub | 同一 JAR 中 **提供** |
| `connect` 早期帧语义 | 与 Node **相同**：回调在选项中；complete ≠ “尚无事件” |
| 相位 / Diff / Commit / `cover` / `typeCheck` / 行拦截 / Annotation Span / 控制根 | **相同** 可观测语义 |

### 7.7 SDK 控制根（`#!`）— 会话 / 续传

产品约定（非 Frozen 0.6.0 文法变更）：以 `#!` 开头的行是 **SDK 控制面**。在 parse / Annotation Span **之前** demux。包：`io.xaiop.control`。

| 项 | 摘要 |
| --- | --- |
| 官方帧 | `#!xaiop/types/v1`、`session/v1`、`ack/v1`、`resume/v1`、`snapshot/v1`、**`seq/v1`** |
| 未知 `#!` | 丢弃 + `XaiopControlError`（`onControlError`）；永不进入线管线 |
| **两个 seq 空间** | `meta.seq` = **连接本地**（每套接字重置）；`meta.logSeq` = **会话日志**，供 `fromSeq` / ack。重连后 **切勿** 赋值 `resumeCursor = meta.seq` — 用 `meta.logSeq` / `getResumeState()` |
| 戳记 | 每相前 `#!xaiop/seq/v1`；`session`/`retainOutbound` 时 `pushJson`/`pushObject` 自动戳；`ResumeWireLog.wiresAfter` 也会戳 |
| 窗口合并 | 默认 `mergeChunkWindow: true` 可能把续传追赶合并为一个分片（`meta.logSeqs` 仍列出各单元）— 非缺陷；需逐相回调时用 `false` |
| 续传 | `sendResume({ sessionId, fromSeq })` → 从 **日志** 空间的 `fromSeq+1` 继续；**无** 历史 Diff 重放；可选 `sendSnapshot` |
| Connect 选项 | `session`、`autoSession`、`autoAck`、`retainOutbound`、`onSession`、`onResume`、`onAck`、`onSnapshot`、`onControlError` |
| 生产者日志 | `session`/`retainOutbound` 时自动记录 + 戳记；持久化：应用按 `sessionId` 持有 `ResumeWireLog` |
| Stream | `onChunkWithMeta(diff, meta)` 可含 `seq`/`seqs` 与 `logSeq`/`logSeqs` |

常量 / 编解码：`ControlFrames.CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY`、`encodeSeqFrame`、`stampWireWithLogSeq`、`ControlDemux`、`ControlIngest`、`ControlPlaneHost`、`ControlSessionState`、`ResumeWireLog`、`XaiopResumeLogError`、`XaiopControlError`。

---

## 8. 合并与注入

**预/后处理**，非流式。冲突策略仅作用于 **冲突键**（深对象递归；数组 / 标量整体冲突）。

| `MergeConflict` | 行为 |
| --- | --- |
| `OVERWRITE`（默认） | 在冲突键处取 overlay |
| `KEEP` | 保留 base；非冲突键仍合并进来 |

**不是 Diff 应用器：** `Merge.mergeJson` / `mergeToJson` **不会删除** overlay 中缺失的键。例：`mergeJson({ cart: { a: 1, b: 2 } }, { cart: { a: 1 } })` 保留 `b`。`onChunk` / `onPhase` 的相位 Diff 是 **子树替换**（或累积 commit）表面 — 若要在本地应用 Diff，请按路径替换（或取 `getCommittedSnapshot()`）；**不要** 把 Diff 喂进 `mergeJson`。

| API | 返回 |
| --- | --- |
| `Merge.mergeJson(base, overlay[, conflict])` | JSON ← JSON+JSON |
| `Merge.mergeToJson(baseJson, xaiopSource[, options])` | JSON |
| `Merge.mergeToXaiop(baseJson, xaiopSource[, options])` | XAIOP（默认 `encodeOptions` = 单相 / `dotPolicy: none`） |
| 门面 | `Xaiop.mergeJson` / `mergeToJson` / `mergeToXaiop` |

`MergeOptions`：`conflict`、`compat`（解析 overlay）、`encodeOptions`、`as`（`JSON` \| `XAIOP` — 注入结果形态）。

Engine 注入（变更存储）：

| API | Overlay |
| --- | --- |
| `injectXaiopSync(dataId, xaiop[, options])` | XAIOP |
| `injectJsonSync(dataId, json[, options])` | JSON |

```java
import io.xaiop.*;

Merge.mergeToJson(Map.of("a", 1), ">\nb:2\n",
    MergeOptions.builder().conflict(MergeConflict.KEEP).build());

XaiopEngine engine = new XaiopEngine();
String id = engine.uploadJsonSync(Map.of("a", 1));
engine.injectXaiopSync(id, ">\nb:2\n");
```

---

## 9. 兼容模式

面向不完美模型输出的可选解析路径。**不** 改变已封存线协议；只改变摄入恢复。默认 **关闭**。

| 入口 | 形态 |
| --- | --- |
| 自由 `Parse.parse` / `parseAsync` | `boolean` \| `CompatPolicy` \| 覆盖 `Map` |
| `XaiopEngine.parse` | **仅 boolean** |
| Engine / Stream 实例 | `compatibilityMode` + `setCompatFix` |

无覆盖启用时：**全部八项** fix 开启。Map/policy 覆盖默认（省略的键保持 `true`）。

| `CompatFixId` | 摘要 |
| --- | --- |
| `forcedRoot` | 开端非 `>`/`-` 时注入匿名对象根 |
| `rewriteBareNameArray` | `name-` → `>name-` |
| `rewriteEnterLine` | 改写 `>` 空白 / 粘连的 `>key:value` |
| `ignoreBareLeaveAtRoot` | 忽略 Root 处裸 `<` |
| `popAndRetry` | 弹出 Cursor 并重试失败行 |
| `locatePathTrim` | 修剪路径空白后重试 `=` |
| `locatePathStripSpaces` | 剥除全部空白后重试 `=` |
| `locatePathArraySuffix` | `=` 段尾随 `-` 且值为数组时当作数组键 |

导出：`CompatPolicy`、`CompatFixId`、`CompatPolicy.DEFAULTS`。

```java
import io.xaiop.*;
import io.xaiop.compat.*;

Parse.parse(text, new CompatPolicy(Map.of(CompatFixId.forcedRoot, false)));
engine.setCompatibilityMode(true);
engine.setCompatFix(CompatFixId.forcedRoot, false); // 模式关闭时返回 false
```

恢复 **不会** 发明字段名；恢复失败或错误变化时仍抛 `XaiopSyntaxError`。

---

## 10. 类型与常量

| 导出 | 值 / 说明 |
| --- | --- |
| `Xaiop.PROTOCOL_VERSION` | `"0.6.0"` |
| `Xaiop.SDK_VERSION` | `"0.15.1"` |
| `DotPolicy` | `NONE` · `PER_TOP_LEVEL_KEY` · `PER_N_KEYS` · `CUSTOM`（字符串常量） |
| `MergeConflict` | `OVERWRITE` · `KEEP` |
| `StreamMode` | `CALLBACK` · `PROMISE` · `ASYNC_ITERATOR` · `EVENTS` |
| `StreamStatus` | `IDLE` … `ERROR` |
| `TransportKind` | `HTTP` · `SSE` · `WEBSOCKET` · `RAW` |
| `ParseHistory.HISTORY_NODE_KIND` | `DOT` · `TAIL` |
| `LineKind` / `LineIntercept.classifyLine` / `emptyLineView` / `runLineInterceptChain` | 行拦截分类 + 链辅助（§6.4） |
| `AnnotationSpan.KEEP` / `applyAnnotationSpans` / … | Annotation Span 辅助（§6.5） |
| `ControlFrames.CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY` | SDK 控制根常量（§7.7） |
| `encodeSeqFrame` / `stampWireWithLogSeq` | 会话日志 seq 戳（`#!xaiop/seq/v1`） |
| `ControlDemux` / `ControlIngest` / `ControlPlaneHost` / `ControlSessionState` | 控制 demux / 会话辅助 |
| `ResumeWireLog` / `XaiopResumeLogError` | 续传用持久出站相位日志 |
| `encodeControlFrame` / `encodeSessionFrame` / `encodeAckFrame` / `encodeResumeFrame` / `encodeSnapshotFrame` | 控制帧编解码 |
| `isSdkControlLine` / `parseControlHeader` / `dispatchControlFrame` | 控制分类 / 路由 |
| `XaiopControlError` | 软控制面错误 |
| `CompatFixId` / `CompatPolicy.DEFAULTS` | 八项 fix 列表与默认 |
| `Types.TYPE` / `objectType` / `arrayType` | 类型检查常量与构建器（§5.5） |
| `TypeRegistry` / `TypeChecker` / `TypeFreezeSession` | 注册表 / 服务端检查 / 客户端冻结 |
| `Types.TYPE_SCHEMA_FRAME_PREFIX` / `encodeTypeSchemaFrame` / `tryParseTypeSchemaFrame` | 类型一致性控制帧 |
| `canonicalizeType` / `parseTypeSurface` / `classifyValue` / `valueMatchesType` | 规范化与匹配辅助 |
| `PhaseEncode` | WS 相位编码辅助 |
| `Materialize` | Fragment → 普通 JSON 快照 |

`io.xaiop*` 下公开类型的 Javadoc 是本页在 IDE 内的配套说明。

---

## 11. 错误处理

| 错误 | 时机 |
| --- | --- |
| `XaiopSyntaxError` | 非法线文；可选 `getLine()`。严格：立即失败。Compat：恢复失败或错误变化时仍抛 |
| `XaiopEncodeError` | 非法编码输入 / 选项 / 被拒键；可选 `getPath()`（如 `$.meta.name`）；选项级失败 path 为 `null` |
| `XaiopTypeError` | 类型注册表 / 冻结 / schema 检查失败；可选 path / expected / actual / polarity |
| `XaiopControlError` | 未知 / 畸形控制帧（默认软错误；见 §7.7） |
| `XaiopResumeLogError` | 持久续传日志失败 |
| `IllegalArgumentException` | 未知 `dataId`；参数形态错误；`pushTypeConsistency` 前提不满足等 |
| `NullPointerException` | 需要字符串处传入非字符串 / null |
| `IllegalStateException` | `finish` 后 push；connect 后处理器已锁定；流忙碌等 |

上述协议 / SDK 产品错误均为 **非受检**（`RuntimeException`），调用点写法对齐 JavaScript 的随处抛出行为。

```java
import io.xaiop.*;

try {
  Parse.parse(">\n&\n"); // 裸 & → XaiopSyntaxError
} catch (XaiopSyntaxError e) {
  System.err.println(e.getLine() + " " + e.getMessage());
}

try {
  Encode.encode(Map.of("a&b", 1));
} catch (XaiopEncodeError e) {
  System.err.println(e.getPath() + " " + e.getMessage());
}
```

---

## 相关文档

| 文档 | 用途 |
| --- | --- |
| [README.zh-CN.md](README.zh-CN.md) | 包落地页 / 快速开始 |
| [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) | Java ↔ Node 对等矩阵（权威） |
| [../nodejs/API.zh-CN.md](../nodejs/API.zh-CN.md) | Node 参考 API |
| [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) | Node 产品选择目录（可选指南） |
| [../../protocol/syntax.zh-CN.md](../../protocol/syntax.zh-CN.md) | 协议文法 |
| [../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md) | 封存 / 发行 |
| [../../../xaiop-sdk/conformance/](../../../xaiop-sdk/conformance/) | Node↔Java golden dumps（`npm run golden`） |
| [../nodejs/notes/](../nodejs/notes/) | 深度笔记（流式解析、历史、WS、类型检查、行拦截、Annotation Span、控制根、调整策略）— 共享产品语义 |
