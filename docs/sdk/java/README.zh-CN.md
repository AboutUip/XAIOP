# XAIOP Java SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 产物 | `io.xaiop:xaiop` **0.4.0**（JAR） |
| 协议 | v0.4.0 Frozen（`Xaiop.PROTOCOL_VERSION`） |
| 运行时 | Java 17+ |
| 代码 | [../../../xaiop-sdk/java/](../../../xaiop-sdk/java/) |

当前产物版本与协议版本恰好相同，这只是时间上的巧合，并非规则：Node 包已到 `xaiop` **0.7.0**，
而其 `PROTOCOL_VERSION` 同样是 `0.4.0`。请锁定产物版本；需要线格式版本时读取
`Xaiop.PROTOCOL_VERSION`。

**隔离：** 协议 = 仅线格式 · 实践 = 模型与流式传输 · 本包 = API — [../../SEPARATION.md](../../SEPARATION.md)。  
**一致性：** [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)（协议合规 ≠ 与本 SDK 等价）。  
**参考实现：** [Node.js](../nodejs/README.zh-CN.md) — Java 移植对齐其可观测语义。

---

## 状态

**已启用** — parse · encode · merge · checkpoint。

| 能力 | 状态 |
| --- | --- |
| `Parse` / `Parse.LiveXaiopParser` / `XaiopFragment` | 已完成 |
| `CompatPolicy`（8 项修复，可逐项开关） | 已完成 |
| `Encode`（全部 `dotPolicy` 模式，含路径数组） | 已完成 |
| `Merge` / inject（`overwrite` / `keep`） | 已完成 |
| `DotCheckpointEngine`（`.` 相 Diff、窗口批量） | 已完成 |
| `XaiopStream`（HTTP / SSE / RAW 消费端） | **尚未提供** |
| `XaiopWs` / hub / connection、单相推送辅助 | **尚未提供** |

### 一致性是如何验证的

Java 单元测试套件移植了 Node 参考套件中关于 parse、`@` / `!` / `=` 定位、八项兼容修复、编码选项
矩阵、merge / inject 以及 checkpoint 分相的场景，另加一个定长种子随机 JSON 语料库，以及对
[../../examples/complex.xaiop](../../examples/complex.xaiop) 的分片回放。浮点 token 严格遵循
ECMAScript `Number::toString` 语义 —— 即可无损回读的最短十进制表示，且不依赖 JDK 版本 ——
因此在这些共享样例上，编码输出与 Node 逐字节一致。

该一致性由 Java 侧测试断言，期望值从 Node 套件转写而来。**CI 中并没有 Node↔Java 自动黄金比对**，
因此请将其理解为"由已移植的套件验证"，而不是"持续逐字节比对"。已移植场景之外仍可能出现偏差；
如遇到请对照 [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) 反馈。

---

## Java 惯例

移植保持可观测语义，而非照搬 JavaScript 形态。

| Node.js | Java |
| --- | --- |
| 以 `async` 为主，附 `*Sync` | **以同步为主**；`Parse.parseAsync` / `Encode.encodeAsync` 返回 `CompletableFuture`，`DotCheckpointEngine` 另提供真正合并调度的 `pushAsync` / `finishAsync` |
| 普通对象 / 数组 | `LinkedHashMap<String,Object>` / `ArrayList<Object>` 树；标量为 `String`、`Integer` / `Long` / `Double`、`Boolean`、`null` |
| `undefined` 与 `null` 之分 | Java **没有 `undefined`**，只有 `null`，因此 `undefinedPolicy` 不会触发（仅为选项表对齐而保留） |
| 字符串联合类型（`root`、`style`、`keyOrder`、`nullPolicy`） | `EncodeOptions` 上的枚举 |
| `DOT_POLICY` 常量 | `DotPolicy` **字符串**常量（该选项同时可传路径数组） |
| 选项对象 | 不可变 builder（`EncodeOptions.builder()`、`MergeOptions.builder()`、`DotCheckpointEngine.Options`） |
| 八个 `setCompat*` setter | 单个 `setCompatFix(CompatFixId, boolean)` — 契约相同：兼容模式关闭时返回 `false` 且不改动标志 |
| 顶层 `LiveXaiopParser` / `materializeSnapshot` | `Parse.LiveXaiopParser` / `io.xaiop.stream.Materialize.materializeSnapshot` |
| 单一 `number` 类型 | 整数 token 为 `Integer` / `Long`（按需加宽），浮点 token 为 `Double`；当取值可能跨越两者时请用 `Number#doubleValue()` 比较 |
| `throw new TypeError(...)` | `IllegalArgumentException` / `NullPointerException`；协议错误仍为 `XaiopSyntaxError` / `XaiopEncodeError`（均为非受检异常） |

---

## 快速开始

```xml
<dependency>
  <groupId>io.xaiop</groupId>
  <artifactId>xaiop</artifactId>
  <version>0.4.0</version>
</dependency>
```

```java
import io.xaiop.*;

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

被拒绝的键（空、含空白、含 `:`、末尾 `-`、含 `>` `<` `=` `!`）、字符串中的 CR/LF、非有限数值以及
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
mvn test                  # 221 项测试
mvn -DskipTests package   # target/xaiop-0.4.0.jar
```
