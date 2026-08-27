# XAIOP Java SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 产物 | `io.github.aboutuip:xaiop` **0.15.1**（Maven Central JAR；Java 包名 `io.xaiop.*`） |
| 协议 | v0.7.0 Draft（`Xaiop.PROTOCOL_VERSION`） |
| SDK 版本常量 | `Xaiop.SDK_VERSION` = `0.15.1` |
| 运行时 | Java 17+（零 runtime 依赖） |
| 代码 | [../../../xaiop-sdk/java/](../../../xaiop-sdk/java/) |

本包在**可观测语义**上对齐 Node.js 参考实现（[`@bylan280/xaiop`](https://www.npmjs.com/package/@bylan280/xaiop) **0.15.1** ↔ 协议 **0.7.0** Draft）。请锁定产物版本；需要线格式版本时读取 `Xaiop.PROTOCOL_VERSION`。Java **无** `@bylan280/xaiop/browser` 分包 — listen 与 connect 同属一个 JDK 包。

**API 参考（权威）：** **[API.zh-CN.md](API.zh-CN.md)** — 完整表面（§0–§11）：Parse · Encode · Engine · Stream · WS · Control · Compat · 类型 · 错误。  
**对等矩阵（Java ↔ Node）：** **[ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)** — 功能表 · 惯用法 · 包映射 · 测试映射 · 可接受差异 · §8 清单。  
**隔离：** 协议 = 仅线格式 · 实践 = 模型与流式传输 · 本包 = API — [../../SEPARATION.zh-CN.md](../../SEPARATION.zh-CN.md)。  
**契约：** [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)（协议合规 ≠ 官方 SDK 等价）。  
**参考实现：** [Node.js](../nodejs/README.zh-CN.md) — Java 移植追踪其可观测语义。

---

## 状态

**已启用** — 与 Node 对齐的完整产品面（协议 **0.7.0** Draft）。

| 能力 | 状态 |
| --- | --- |
| `Parse` / `Parse.LiveXaiopParser` / `XaiopFragment` | 已完成 |
| `CompatPolicy`（8 项修复，可逐项开关） | 已完成 |
| `Encode`（全部 `dotPolicy` 模式，含路径数组） | 已完成 |
| `Merge` / inject（`overwrite` / `keep`） | 已完成 |
| `&` 删除 · `#` 注释忽略 | 已完成 |
| `DotCheckpointEngine`（`.` Diff · cover · history · Diff 隔离 · `@` Diff · buffer compact） | 已完成 |
| `XaiopStream`（HTTP / SSE / RAW / WebSocket；接线 cover · history · typeCheck · intercept · annotationSpan · 控制 demux · `chunks()`） | 已完成 |
| typeCheck / TypeRegistry / TypeFreezeSession | 已完成 |
| 行拦截 · Annotation Span | 已完成 |
| 控制根（`#!` session / ack / resume / snapshot / seq） | 已完成 |
| `XaiopWs` listen + connect（零依赖 RFC6455 + JDK 客户端） | 已完成 |
| 相位编码 · `symbolKeys` | 已完成 |

完整矩阵与可接受差异：**[ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)**。

### 一致性是如何验证的

Java 单元测试套件移植了 Node 参考套件场景。浮点 token 严格遵循 ECMAScript `Number::toString`
语义 —— 即可无损回读的最短十进制表示，且不依赖 JDK 版本 —— 因此在共享样例上编码输出与 Node
逐字节一致。断言为从 Node 套件转写的 Java 侧期望值。**CI 中并没有 Node↔Java 自动黄金比对** —
声明强度为「由已移植的套件验证」。完整映射：[ALIGNMENT.zh-CN.md §5–§7](ALIGNMENT.zh-CN.md#5-测试映射node--java)。

| 领域 | 代表性测试 |
| --- | --- |
| Parse / fragment / live | `ParseTest` · `LiveParseTest` · `XaiopTest` |
| Compat ×8 | `CompatTest` |
| Encode / `symbolKeys` | `EncodeTest` · `EncodeRobustTest` · `SymbolKeysTest` |
| Merge / engine | `MergeTest` · `MergeRobustTest` · `EngineTest` |
| `@` / `!` / `&` / `#` | `BangAtTest` · `AmpDeleteTest` · `HashAnnotationTest` |
| Checkpoint（窗口 · cover · history · Diff 隔离 · `@` Diff · compact） | `CheckpointTest` · `CheckpointRobustTest` · `HistoryTest` · `CheckpointDiffIsolationTest` · `CheckpointBufferCompactTest` |
| Stream（HTTP/SSE/RAW/WS · 高级选项） | `StreamTest` · `StreamHttpTest` · `StreamConsistencyTest` · `StreamAdvancedTest` |
| typeCheck · 行拦截 · Annotation Span | `TypeCheckTest` · `LineInterceptTest` · `AnnotationSpanTest` |
| 控制根 · 续传 | `ControlPlaneTest` · `ControlResumeTest` |
| WebSocket · 相位编码 | `WsSessionTest` · `PhaseEncodeTest` |

另有：定长种子随机 JSON 语料库与 [../../examples/complex.xaiop](../../examples/complex.xaiop) 分片回放。

---

## 布局

```text
io.xaiop/                 门面 · Parse · Encode · Merge · Engine · 选项 · 错误
  compat/                 CompatPolicy · CompatFixId（×8）
  types/                  TYPE · TypeRegistry · TypeFreezeSession · XaiopTypeError
  control/                ControlDemux · ControlPlaneHost · ResumeWireLog · …
  stream/                 DotCheckpointEngine · ParseHistory · XaiopStream · LineIntercept
                          AnnotationSpan · PhaseEncode · Materialize · Transport
                          （另有 package-private：CheckpointDiffBuild / Cover / Scan / Async）
  ws/                     XaiopWs · XaiopWsConnection · XaiopWsHub · Rfc6455*
  internal/               Parser · Encoder · LabelEscape
```

---
## Java 惯例

移植保持可观测语义，而非照搬 JavaScript 形态。另见 [ALIGNMENT.zh-CN.md §3](ALIGNMENT.zh-CN.md#3-api-惯用法对照node--java)。

| Node.js | Java |
| --- | --- |
| 以 `async` 为主，附 `*Sync` | **以同步为主**；`Parse.parseAsync` / `Encode.encodeAsync` 返回 `CompletableFuture`，`DotCheckpointEngine` 另提供真正合并调度的 `pushAsync` / `finishAsync` |
| `encode` ≡ `encodeAsync`（`Promise`）；`encodeSync` → 字符串 | Java 的 `Encode.encode()` / `Xaiop.encode()` **就是字符串** |
| 普通对象 / 数组 | `LinkedHashMap<String,Object>` / `ArrayList<Object>` 树；标量为 `String`、`Integer` / `Long` / `Double`、`Boolean`、`null` |
| `undefined` 与 `null` 之分 | Java **没有 `undefined`**，只有 `null`，因此 `undefinedPolicy` 不会触发（仅为选项表对齐而保留） |
| Annotation Span 保留（`return undefined`） | 返回 **`AnnotationSpan.KEEP`**（哨兵）；`null` 表示丢弃 / 替换为 JSON null |
| `for await (... of stream.chunks())` | 阻塞式 **`ChunkPull`** / `for (Object d : stream.chunks())` |
| `AbortSignal` | `stream.abort()` · `SendOptions.timeoutMs` |
| 字符串联合类型（`root`、`style`、`keyOrder`、`nullPolicy`） | `EncodeOptions` 上的枚举 |
| `DOT_POLICY` 常量 | `DotPolicy` **字符串**常量（该选项同时可传路径数组） |
| 选项对象 | 不可变 builder（`EncodeOptions.builder()`、`MergeOptions.builder()`、`DotCheckpointEngine.Options`） |
| 八个 `setCompat*` setter | 单个 `setCompatFix(CompatFixId, boolean)` — 契约相同：兼容模式关闭时返回 `false` 且不改动标志 |
| 顶层 `LiveXaiopParser` / `materializeSnapshot` | `Parse.LiveXaiopParser` / `io.xaiop.stream.Materialize.materializeSnapshot` |
| 单一 `number` 类型 | 整数 token 为 `Integer` / `Long`（按需加宽），浮点 token 为 `Double`；当取值可能跨越两者时请用 `Number#doubleValue()` 比较 |
| `throw new TypeError(...)` | `IllegalArgumentException` / `NullPointerException`；协议错误仍为 `XaiopSyntaxError` / `XaiopEncodeError`（均为非受检异常） |

---

## 安装

Maven Central：**`io.github.aboutuip:xaiop`** **0.15.1**。Java 包名仍是 **`io.xaiop.*`**。旧文档若仍写未上架的 GAV `io.xaiop:xaiop`，消费方必须用 `io.github.aboutuip`。

```xml
<dependency>
  <groupId>io.github.aboutuip</groupId>
  <artifactId>xaiop</artifactId>
  <version>0.15.1</version>
</dependency>
```

```kotlin
implementation("io.github.aboutuip:xaiop:0.15.1")
```

检索：[Maven Central](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop)。维护者发布：[MAVEN-CENTRAL.zh-CN.md](../../../xaiop-sdk/java/MAVEN-CENTRAL.zh-CN.md)。

## 快速开始

```java
import io.xaiop.*;
import io.xaiop.stream.*;

Object json = Xaiop.parse(">\n>meta\nname:demo\n");   // LinkedHashMap 树
String wire = Xaiop.encode(json);                      // 每个顶层键一个 `.` 相

XaiopEngine engine = new XaiopEngine();
String id = engine.uploadSync(wire);
Object stored = engine.getSync(id);
```

### 编码

```java
String single = Encode.encode(value, EncodeOptions.singlePhase());          // dotPolicy: none

String phased = Encode.encode(value, EncodeOptions.builder()
    .dotPolicy(DotPolicy.PER_N_KEYS)
    .phaseEvery(2)
    .maxPhases(4)                    // 限制相数上限；多出的相并入最后一相
    .keyOrder(EncodeOptions.KeyOrder.SORTED)
    .build());

String custom = Encode.encode(value, EncodeOptions.builder()
    .dotPolicy(DotPolicy.CUSTOM)     // 必须提供 shouldPhase，否则抛 XaiopEncodeError
    .shouldPhase(ctx -> ctx.keysInPhase() >= 2)
    .build());

String cut = Encode.encode(value, EncodeOptions.builder()
    .dotPolicyPaths(List.of("meta", "items[2]"))                            // 在每个路径后切相
    .build());
```

### 流式消费（`XaiopStream`）

对齐 Node `XaiopStream` 的消费端：状态机 `idle → connecting → streaming → completing → completed`（另有 `aborted` / `error`）；默认 `mergeChunkWindow=true`、`streamProcessing=true`。选项透传到每次 `send` 的 `DotCheckpointEngine` 与 `ControlPlaneHost`：`cover`、`historySnapshot` / `historyRealtime`、`typeCheck` / `typeSchema`、`lineIntercept`、`annotationSpan`、`session` / `autoAck` 及控制回调。入站文本先经控制面 demux，再进入 checkpoint。

```java
XaiopStream stream = Xaiop.stream("https://example.com/feed.xaiop");
stream.onChunk(diff -> { /* 相位 Diff；空相为 null */ });
stream.onChunkWithMeta((diff, meta) -> { /* 可选 ChunkMeta（seq / escapes） */ });
stream.onDone(snapshot -> { /* 全缓冲 Snapshot */ });
stream.onError(err -> { /* ... */ });
stream.send(new XaiopStream.SendOptions().transport(TransportKind.HTTP));

// 测试 / 本地：RAW 分片
stream.sendRaw(List.of(">\na:1\n.\n", ">b\nc:2\n.\n"));

// Promise 模式
XaiopStream once = new XaiopStream("raw://x",
    XaiopStream.Options.defaults().modes(StreamMode.PROMISE));
Object jsonDone = once.send(new XaiopStream.SendOptions()
    .transport(TransportKind.RAW)
    .source(List.of(">\nz:9\n.\n"))).get();

// Async-iterator 拉取（阻塞 ChunkPull；无额外依赖）
XaiopStream pull = new XaiopStream("raw://x",
    XaiopStream.Options.defaults().modes(StreamMode.ASYNC_ITERATOR));
pull.sendRaw(List.of(">\na:1\n.\n"));
for (Object diff : pull.chunks()) { /* ... */ }
```

| 传输 | 说明 |
| --- | --- |
| `HTTP` | `java.net.http.HttpClient` 流式读 body（默认） |
| `SSE` | `Accept: text/event-stream`；多行 `data:` 用 `\n` 拼接，块末自动补换行以免粘连下一相 |
| `RAW` | `Iterable` 的 `CharSequence`/`byte[]`，或 `InputStream`（跨块 UTF-8） |
| `WEBSOCKET` | 经 `Transport` / `XaiopStream`；长会话优先用 `XaiopWs` |

### WebSocket 会话（`XaiopWs`）

```java
import io.xaiop.ws.*;

XaiopWsHub hub = XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1")).join();
hub.onConnection(conn -> {
  conn.pushJson("title", "hello", false);
  conn.end();
});
XaiopWs.ConnectOptions opts = new XaiopWs.ConnectOptions();
opts.onPhase(diff -> { /* 相位 Diff */ });
XaiopWsConnection client = XaiopWs.connect(hub.url(), opts).join();
hub.close().join();
```

零 runtime 依赖：listen 使用精简 RFC6455 `ServerSocket` 栈；connect 使用 JDK `HttpClient` WebSocket。处理器须在 connect 选项中注册（打开后锁定）。相位推送使用 `PhaseEncode`（强制 `dotPolicy: none`；非 `final` 追加 `.\n`）。

高级选项：`ListenOptions.protocols` / `maxPayload` / `serverSocket` / `path`（同端口 `GET /health` 多路复用）；`ConnectOptions.protocols`。不支持挂接 JDK `HttpServer`（无原始套接字升级）— 用 `serverSocket` 对应 Node 的 `listen({ server })`。

### 流式高级选项

```java
XaiopStream.Options opts = XaiopStream.Options.defaults()
    .cover(true)
    .historySnapshot(true)
    .historyRealtime(false)
    .typeCheck(true)
    .typeSchema(schema)          // CanonicalType / Map / 表面字符串
    .session(true)               // 或 Map 会话初始化
    .autoAck(true)
    .symbolKeys(false)
    .lineIntercept((line, ctx) -> line)           // 返回 null 丢弃
    .annotationSpan((cap, view) -> AnnotationSpan.KEEP);  // KEEP ↔ Node undefined

XaiopStream stream = new XaiopStream("raw://x", opts);
stream.send(new XaiopStream.SendOptions()
    .transport(TransportKind.RAW)
    .source(List.of(">\na:1\n.\n"))
    .timeoutMs(15_000L));
stream.abort();   // AbortSignal 等价
```

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| `cover` | `false` | 连续 `&` 时的 Cover Diff |
| `historySnapshot` / `historyRealtime` | `false` | 可选解析历史 |
| `typeCheck` / `typeSchema` | 关 | 冻结 / 注册表检查（兼容模式开启时强制关闭） |
| `lineIntercept` | 无 | 解析前按行改写 / 丢弃 |
| `annotationSpan` | 无 | `#` 区间捕获 → JSON / `KEEP` / `null` |
| `session` / `autoAck` | 关 | 控制根 demux + ack |
| `symbolKeys` | `false` | U+001F 标签转义方言 |
| `modes` | callback | 另有 `PROMISE` · `ASYNC_ITERATOR`（`chunks()`） |

### 类型（`io.xaiop.types`）

```java
import io.xaiop.types.*;

CanonicalType schema = Types.objectType(Map.of(
    "id", Types.TYPE.INT,
    "name", Types.TYPE.STRING));
TypeFreezeSession session = new TypeFreezeSession(schema);
session.observeTree(Map.of("id", 1, "name", "a"), true, List.of());
```

规范叶类型遵循 PROT-CONTENT（`int` · `float` · `bool` · `null` · `string`）；结构类型 `object` / `array`；元类型 `any`。Schema 帧使用 `Types.TYPE_SCHEMA_FRAME_PREFIX`（`#!xaiop/types/v1`）。

### 控制根（`io.xaiop.control`）

`ControlPlaneHost` 在 checkpoint 摄入前 demux `#!` 帧（session / ack / resume / snapshot / seq / types）。经 `XaiopStream.Options.session(...)` / 控制回调接线，或对自定义传输直接托管。续传回放使用 `ResumeWireLog`。

### 编码选项

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `root` | `AUTO` | `ARRAY` 要求 `List`，`OBJECT` 要求 `Map` |
| `style` | `RESET` | 只有在 `dotPolicy = none` 时 `RELATIVE` 才有区别（分相本身必然重置 Cursor）；路径数组要求 `RESET` |
| `dotPolicy` | `PER_TOP_LEVEL_KEY` | 或 `NONE` / `PER_N_KEYS` / `CUSTOM`，或改用 `dotPolicyPaths(...)` |
| `phaseEvery` | `1` | 仅 `PER_N_KEYS` 读取 |
| `maxPhases` | 未设置 | 限制相数上限；超出部分并入最后一相 |
| `shouldPhase` | 未设置 | `CUSTOM` 必需；入参为 `PhaseContext(key, index, total, keysInPhase, phaseIndex)`，最后一个键永远不会被询问 |
| `finalDot` | `false` | 追加末尾 `.` |
| `keyOrder` | `INSERTION` | 或 `SORTED` |
| `nullPolicy` | `ENCODE` | `OMIT` 丢弃对象中的 null 键（数组元素仍输出带类型的 null，以免下标错位）；`ERROR` 抛异常 |
| `undefinedPolicy` | `OMIT` | 在 Java 中不会触发 —— 仅为跨 SDK 选项表对齐而保留 |

`dotPolicyPaths` 与 `phaseEvery`、`maxPhases`、`shouldPhase` 互斥，会拒绝重复路径与值中不存在的
路径，也不允许切在数组元素对象内部（下标必须是路径的最后一段）。

被拒绝的键（空、含空白、含 `:`、末尾 `-`、含 `>` `<` `=` `!`）、
**以 U+0020 SPACE 开头的字符串**（`:` 后空格是强制 string 标记而非载荷；值里的 CR/LF 经 `\n`/`\r` 转义）、非有限数值以及
不支持的值类型都会抛出 `XaiopEncodeError`。对这些**值级与键级**失败，`getPath()` 返回出错节点的
JSON 路径（如 `$.ok.bad`）；对**选项级**失败（如非法的 `phaseEvery`）则为 `null`，因为它们并不
对应某个节点。

### 合并 / 注入

```java
Object merged = Merge.mergeJson(base, overlay, MergeConflict.KEEP);   // 仅按键；数组整体原子
Object json   = Merge.mergeToJson(base, xaiopSource);
String wire   = Merge.mergeToXaiop(base, xaiopSource);                // 默认单相输出

engine.injectXaiopSync(id, ">\nb:2\n");
engine.injectJsonSync(id, Map.of("a", 9), MergeOptions.builder().as(MergeOptions.As.XAIOP).build());
```

### Checkpoint 流

```java
try (DotCheckpointEngine cp = Xaiop.checkpoint(diff -> render(diff))) {
  cp.push(">\na:1\n.\n>\nb:2\n.\n");   // 只有一个 Diff：两相同处一个缓冲窗口
  cp.finish();
  Object full = cp.snapshot();          // {a=1, b=2}
}
```

`mergeChunkWindow` 默认为 **true**：一次扫描时缓冲区内所有完整的 `.` 会合并为一次投喂、一次
Commit、一次 `onChunk`。因此 Diff 的数量取决于字节是怎么到达的，而不是文档有多少相 —— 上面这次
push 只产生一个 `{a=1, b=2}` 分片，而非每相一个。若需要每个 `.` 一个 Diff，请设为 `false`：

```java
DotCheckpointEngine cp = DotCheckpointEngine.Options.of(diff -> render(diff))
    .mergeChunkWindow(false)     // 逐相：先 {a=1}，再 {b=2}
    .emitDiff(false)             // 完全跳过 Diff 解析；onChunk 恒为 null
    .streamProcessing(false)     // 一切推迟到 finish()：整篇文档只发一个分片
    .compat(true)                // 对输入线格式启用兼容修复
    .build();
```

Diff 是相文档（后写覆盖的单位）；`committedSnapshot()` 是截至 `committedAt()` 的累积树，
`snapshot()` 只在 `finish()` 时赋值。含 `=` 或 `!` 的相会向前跨相，因此它的 Diff 是累积树而非
仅本相内容。空相产生 `null` 分片。交给 `onChunk` 的 Diff 绝不与 Commit 共享引用，回调可以自由
保留或修改。`pushAsync` / `finishAsync` 立即追加并把扫描合并到单个守护线程上，因此连续多次推送
共享同一次排空。

### 不使用 checkpoint 引擎的增量解析

`Parse.LiveXaiopParser` 在多次投喂之间维持同一棵活树，其结果等价于对所有投喂文本拼接后调用
`Parse.parse` —— checkpoint 引擎正是借此避免在每个 `.` 处重复解析不断增长的前缀。

```java
Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();   // 或 (true) / (CompatPolicy) / (overrides)
live.feedLine(">");              // 一条完整逻辑行，不带结尾换行
live.feedText(">a\nx:1\n");      // 或整块文本，切分方式与 Parse.parse 完全一致
Object tree = Materialize.materializeSnapshot(live.value());
```

encode 线文以 `\n` 结尾；`feedText` / `Parse.parse` 会丢掉末尾空段。不要把 encode 结果按 `"\n"` 拆进 `feedLine` — 最后的 `""` 会报错。`feedLine` 仍是逐行原语。

`value()` 返回的是**活树**：后续投喂会就地修改它。`Materialize.materializeSnapshot` 会深拷贝成
面向 JSON 的快照，并把根部的 `XaiopFragment` 展开为其 entries —— 凡是需要留存的值都应经过它。
`Materialize.materializeOwned` 对普通根跳过拷贝，仅在确定解析器不再复用时才安全。

---

## 错误

| 情形 | 类型 |
| --- | --- |
| 非法线格式 | `XaiopSyntaxError`（`getLine()`） |
| 非法编码输入 | `XaiopEncodeError`（`getPath()` = 出错节点） |
| 非法编码选项 | `XaiopEncodeError`（`getPath()` 为 `null`） |
| 未知 data id、参数错误 | `IllegalArgumentException` / `NullPointerException` |
| `finish` 之后继续 push | `IllegalStateException` |

以上均为非受检异常，因此调用点的写法与 JavaScript 的随处抛出保持一致。

---

## 构建

```bash
cd xaiop-sdk/java
mvn test                  # 全量（含 StreamAdvancedTest）
mvn -DskipTests package   # target/xaiop-0.15.1.jar
mvn test                  # 含 StreamTest / StreamConsistencyTest / StreamHttpTest / StreamAdvancedTest
```

阶段计时：[`xaiop-sdk/timing`](../../../xaiop-sdk/timing/)（`npm run bench:java` · `bench:java:json-gate`）。枢纽：[../../performance.zh-CN.md](../../performance.zh-CN.md)。极限性能 tip（**2026-08-09**）：[../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)。此前：[../../meta/release-notes-2026-08-08-java-0.15.1-internal.zh-CN.md](../../meta/release-notes-2026-08-08-java-0.15.1-internal.zh-CN.md)。
