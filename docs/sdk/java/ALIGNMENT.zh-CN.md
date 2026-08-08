# Java ↔ Node SDK 对齐

[English](ALIGNMENT.md) · [简体中文](ALIGNMENT.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 | 现行对等矩阵（Java 官方移植） |
| Java 产物 | `io.xaiop:xaiop` **0.15.1** |
| Node 包 | `xaiop` **0.15.1** |
| 协议线格式 | **0.6.0** Frozen（`Xaiop.PROTOCOL_VERSION`） |
| 规范性 | **否** — 产品对等清单（非协议符合性） |
| 权威来源 | Node 参考实现 + [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) |

**隔离：** 协议 = 仅线格式 · 实践 = 传输场景 · 本文 = **Java ↔ Node 可观测语义对照**。  
**指南：** [README.zh-CN.md](README.zh-CN.md) · **契约：** [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) · **代码：** [../../../xaiop-sdk/java/](../../../xaiop-sdk/java/)

---

## 1. 目的与版本

本文是 Java 移植相对 Node.js 参考实现的**权威对等矩阵**。方法名与惯用法可以不同；**可观测语义**（Diff 边界、兼容套件、encode 默认、WS 相位推送、控制根、typeCheck、行拦截 / Annotation Span）必须一致。

| 技术栈 | 包 / 产物 | SDK | 协议 |
| --- | --- | --- | --- |
| Node.js（主实现） | `xaiop` | **0.15.1** | **0.6.0** |
| Java（官方移植） | `io.xaiop:xaiop` | **0.15.1** | **0.6.0** |

请锁定 Maven 产物版本；需要线格式版本时读取 `Xaiop.PROTOCOL_VERSION`。Java **无** `xaiop/browser` 分包 — listen 与 connect 同属 JDK 包 `io.xaiop.ws`。

---

## 2. 功能对等矩阵

| 功能 | Node | Java | 说明 |
| --- | --- | --- | --- |
| Parse（严格 / 兼容） | ✅ | ✅ | `Parse.parse` · `Xaiop.parse` |
| Fragment（`XaiopFragment`） | ✅ | ✅ | 流式表面物化为普通 Map |
| Compat ×8（`CompatPolicy`） | ✅ | ✅ | 相同八项 fix ID；总开关关闭时改 fix 为 no-op |
| Encode（全部 `dotPolicy` + 路径切相） | ✅ | ✅ | 字符串联合用枚举；浮点 = ES `Number::toString` |
| Merge / inject（`overwrite` / `keep`） | ✅ | ✅ | 仅离线 — 不是流式 Diff |
| Engine 存储（`XaiopEngine`） | ✅ | ✅ | 以同步为主（`*Sync`）；异步用 `CompletableFuture` |
| Live parse（`LiveXaiopParser`） | ✅ | ✅ | 嵌套为 `Parse.LiveXaiopParser` |
| `&` 删除 | ✅ | ✅ | 协议 **0.6.0** |
| `#` 注释忽略（parse） | ✅ | ✅ | 协议 **0.6.0** |
| Checkpoint Diff（`.` 相位 / 窗口合并） | ✅ | ✅ | 默认 `mergeChunkWindow=true` |
| Cover Diff（`cover`） | ✅ | ✅ | `&` 连续删除 → 墓碑 Diff + Cursor 恢复 |
| 解析历史（snapshot / realtime） | ✅ | ✅ | `ParseHistory` · `jumpTo` |
| Diff 隔离（D1） | ✅ | ✅ | Diff 绝不与 Commit 共享引用 |
| `@` 累积 Diff（D2） | ✅ | ✅ | 与 Node 逐步 / 选项规则一致 |
| Buffer compact（`compactCommitted`） | ✅ | ✅ | 长会话丢弃已提交线文 |
| `XaiopStream` HTTP | ✅ | ✅ | `java.net.http.HttpClient` |
| `XaiopStream` SSE | ✅ | ✅ | 多行 `data:` 用 `\n` 拼接 |
| `XaiopStream` RAW | ✅ | ✅ | `Iterable` / `InputStream` |
| `XaiopStream` WebSocket | ✅ | ✅ | 经 `Transport`；长会话优先 `XaiopWs` |
| Stream 选项（cover · history · typeCheck · intercept · annotationSpan · session / autoAck · 控制回调 · `chunks()`） | ✅ | ✅ | `XaiopStream.Options` / setter 已接线（0.15.1） |
| typeCheck / TypeRegistry / freeze | ✅ | ✅ | `io.xaiop.types` |
| 行拦截 | ✅ | ✅ | `LineIntercept` |
| Annotation Span | ✅ | ✅ | `AnnotationSpan.KEEP` ↔ Node 返回 `undefined` 表示保留 |
| 控制根（`#!` session / ack / resume / snapshot / seq） | ✅ | ✅ | `io.xaiop.control` |
| `XaiopWs` listen | ✅ | ✅ | 零依赖 RFC6455；`serverSocket` / path / `protocols` / `maxPayload` |
| `XaiopWs` connect | ✅ | ✅ | JDK `HttpClient` WebSocket |
| 相位编码（`phaseEncode`） | ✅ | ✅ | `PhaseEncode` · 强制 `dotPolicy: none` |
| `symbolKeys`（U+001F 标签转义） | ✅ | ✅ | Encode + parse / checkpoint / stream |

图例：✅ = 已提供，且在可观测语义层面对齐。

---

## 3. API 惯用法对照（Node → Java）

| Node.js | Java |
| --- | --- |
| 以 `async` 为主，附 `*Sync` | **以同步为主**；`parseAsync` / `encodeAsync` → `CompletableFuture`；checkpoint 的 `pushAsync` / `finishAsync` 合并到守护线程 |
| 普通对象 / 数组 | `LinkedHashMap<String,Object>` / `ArrayList<Object>`；标量 `String`、`Integer`/`Long`/`Double`、`Boolean`、`null` |
| `undefined` 与 `null` | 仅有 `null`；`undefinedPolicy` 不触发（仅为选项表对齐） |
| Annotation Span 保留（`return undefined`） | 返回 `AnnotationSpan.KEEP` |
| 异步迭代 `for await (const d of stream.chunks())` | 阻塞式 `ChunkPull` / `for (Object d : stream.chunks())` |
| `AbortSignal` / `signal` | `stream.abort()` · `SendOptions.timeoutMs` |
| 字符串联合（`root`、`style`、…） | `EncodeOptions` 枚举 |
| `DOT_POLICY` 常量 | `DotPolicy` **字符串**常量（或经 `dotPolicyPaths` 传路径数组） |
| 选项对象 | 不可变 / 链式 builder |
| 八个 `setCompat*` setter | `setCompatFix(CompatFixId, boolean)` |
| 顶层 `LiveXaiopParser` / `materializeSnapshot` | `Parse.LiveXaiopParser` / `Materialize.materializeSnapshot` |
| 单一 JS `number` | 整数 `Integer`/`Long` · 浮点 `Double` — 跨界比较用 `Number#doubleValue()` |
| `throw new TypeError(...)` | `IllegalArgumentException` / `NullPointerException`；协议错误 → `XaiopSyntaxError` / `XaiopEncodeError`（非受检） |
| `xaiop` · `xaiop/browser` · `xaiop/core` 桶导出 | 单一 JAR；直接 import 包（无 barrel 再导出） |
| 把 WS hub 挂到已有 `http.Server` | **`ListenOptions.serverSocket(ServerSocket)`** + 同端口 HTTP 多路复用（`GET /health`）；JDK `HttpServer` 升级不支持 |

---

## 4. 包映射（Node 模块 → Java 包）

| Node 模块 / 入口 | Java 包 / 类型 |
| --- | --- |
| `xaiop` 门面（`index.ts`） | `io.xaiop.Xaiop` |
| `core/parse.ts` | `io.xaiop.Parse` · `io.xaiop.internal.Parser` |
| `core/encode.ts` | `io.xaiop.Encode` · `io.xaiop.internal.Encoder` |
| `core/merge.ts` | `io.xaiop.Merge` |
| `core/engine.ts` | `io.xaiop.XaiopEngine` |
| `core/compat.ts` | `io.xaiop.compat` |
| `core/checkpoint.ts` | `io.xaiop.stream.DotCheckpointEngine` |
| `core/history.ts` | `io.xaiop.stream.ParseHistory` |
| `core/materialize.ts` | `io.xaiop.stream.Materialize` |
| `core/line-intercept.ts` | `io.xaiop.stream.LineIntercept` |
| `core/annotation-span.ts` | `io.xaiop.stream.AnnotationSpan` |
| `core/phase-encode.ts` | `io.xaiop.stream.PhaseEncode` |
| `core/types.ts` | `io.xaiop.types` |
| `core/control.ts` · `control-host.ts` · `resume-log.ts` | `io.xaiop.control` |
| `node/XaiopStream.ts` · `node/transport.ts` | `io.xaiop.stream.XaiopStream` · `Transport` |
| `node/ws/*` | `io.xaiop.ws` |
| `xaiop/browser` | **不适用**（无浏览器包） |
| `xaiop/core` | 直接使用 `io.xaiop` + `stream` / `types` / `control` |

---

## 5. 测试映射（Node → Java）

| Node 测试 | Java 测试类 |
| --- | --- |
| `engine.test.js` | `EngineTest` · `XaiopTest` · `CompatTest` |
| `encode.test.js` | `EncodeTest` |
| `encode.stability.test.js` | `EncodeRobustTest` |
| `merge.test.js` | `MergeTest` · `MergeRobustTest` |
| `bang.at.test.js` | `BangAtTest` |
| `amp.delete.test.js` | `AmpDeleteTest` |
| `hash.annotation.test.js` | `HashAnnotationTest` |
| `live.parse.test.js` | `LiveParseTest` |
| `checkpoint.window.test.js` | `CheckpointTest` |
| `checkpoint.opt.test.js` | `CheckpointRobustTest` |
| `checkpoint.diff-isolation.test.js` | `CheckpointDiffIsolationTest` |
| `checkpoint.buffer-compact.test.js` | `CheckpointBufferCompactTest` |
| `history.test.js` | `HistoryTest` |
| `stream.test.js` | `StreamTest` · `StreamHttpTest` · `StreamControlTest` |
| `stream.consistency.test.js` | `StreamConsistencyTest` · `StreamAdvancedTest` |
| `typecheck.test.js` | `TypeCheckTest` · `WsTypeCheckTest` |
| `line.intercept.test.js` | `LineInterceptTest` |
| `annotation.span.test.js` | `AnnotationSpanTest` |
| `control.plane.test.js` | `ControlPlaneTest` |
| `control.coverage.test.js` | `ControlCoverageTest` |
| `control.resume.test.js` | `ControlResumeTest` |
| `ws.session.test.js` | `WsSessionTest` · `WsDeepTest` |
| `ws.phase-encode.test.js` | `PhaseEncodeTest` |
| `symbol.keys.test.js` | `SymbolKeysTest` |
| *（表面冒烟）* | `SdkSurfaceTest` |

约 33 个 JUnit 测试类（`io.xaiop` 下：移植套件 + 薄鲁棒 / 表面冒烟；`mvn test` 约 **555** 个方法）。一致性由 Java 侧断言，期望值从 Node 套件转写。**Node↔Java 黄金比对已接入 CI**（[`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) 的 `golden` job — encode / parse / 流式 Diff NDJSON，见 [`xaiop-sdk/conformance/`](../../../xaiop-sdk/conformance/)）。

---

## 6. 可接受差异

以下为有意的宿主语言 / 打包差异 — **不是**对等缺口：

| 主题 | 差异 |
| --- | --- |
| 以同步为主 | Java API 默认阻塞；异步显式（`CompletableFuture`、合并调度的 `pushAsync`） |
| 无浏览器包 | 无 `xaiop/browser`；WS 客户端与服务端同在 `io.xaiop.ws` |
| `chunks()` | 阻塞 `Iterable` / `ChunkPull`，非原生异步迭代器 |
| Compat setter | 单个 `setCompatFix`，而非八个 `setCompat*` |
| 不挂接 `HttpServer` | JDK `HttpServer` 无法交出 TCP 套接字做 RFC6455 升级。请用 `ListenOptions.serverSocket(...)` 或同端口多路复用（`path` + `GET /health`）。Node 的 `listen({ server })` 可直接挂 `http.Server`。 |
| WS 高级选项 | Java 提供 `protocols` / `maxPayload` / `serverSocket` / path；未实现 `perMessageDeflate`（Node `ws` 可选） |
| 无 barrel 再导出 | 按需 import `io.xaiop.*` / `stream` / `ws` / `types` / `control` |
| Abort | `abort()` + `timeoutMs`，而非 DOM/`AbortSignal` |
| `undefined` | 不存在；Annotation Span 保留使用 `AnnotationSpan.KEEP` |
| 数值宽度 | JVM 区分整数 / 浮点；线格式浮点仍与 Node 一致 |

---

## 7. 一致性如何验证

1. 移植的 JUnit 场景覆盖 §2 矩阵（见 §5）。  
2. 共享样例（含 [../../examples/complex.xaiop](../../examples/complex.xaiop) 分片回放）与定长种子随机 JSON 语料。  
3. Encode 浮点面 = ECMAScript `Number::toString`（任意 JDK 上可无损回读的最短十进制）→ 共享样例线文逐字节一致。  
4. 对照 [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) 做人工 / PR 审查。  
5. **黄金 CI** — Node 与 Java 对同一 case id（encode 语料 · parse · 流式 Diff）转储 NDJSON；[`compare.mjs`](../../../xaiop-sdk/conformance/compare.mjs) 深相等树 / Diff，线文字节相等。见 [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) 的 `golden` job 与 [`xaiop-sdk/conformance/`](../../../xaiop-sdk/conformance/)。

**声明强度：**「由已移植套件验证，**并**在 CI 中持续与 Node 黄金比对」。

```bash
cd xaiop-sdk/java && mvn test
cd xaiop-sdk/conformance && npm run golden
cd xaiop-sdk/timing && npm run bench:java:quick   # 可选：同机阶段计时
```

---

## 8. 行为契约 §8 检查清单（Java 官方移植）

以下各项均由 `io.xaiop:xaiop` **0.15.1** **满足**（见 [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) §8）：

- [x] 默认严格；兼容可选；encode 始终严格  
- [x] 八项兼容修复与同类 rewrite / pop-and-retry / locate 重试  
- [x] Fragment vs 完整根 vs 空 `{}`；流式物化策略已说明  
- [x] Encode 默认 + 数组根无顶层 `.` + 尾 `\n` + 键危害 + 拒绝前导 U+0020 字符串  
- [x] 合并/注入：冲突键 `overwrite`/`keep`；inject 写回 store；非流式  
- [x] Diff = `.` 相位；默认 **窗口合并**（`mergeChunkWindow`）；逐步模式下空 → `null`；commit vs chunk；后续相注入 leading `.`  
- [x] 异步摄入可选（`pushAsync` / `asyncParse`）— 合并扫描，非空 Promise 壳  
- [x] 解析历史可选（`historySnapshot` / `historyRealtime`）— 按 `.`；快照只读；实时向前 `jumpTo`  
- [x] 最终 Snapshot ≡ 同兼容策略下全缓冲一次性 parse  
- [x] WS 相位 `.\n` / `final` / 关闭码（经 `XaiopWs` 骨架会话）  

宣称同等水平的第三方移植仍应**自行**勾选本清单；Java 官方移植是已满足该清单的第二个参考实现。

---

## 相关

- Java 指南：[README.zh-CN.md](README.zh-CN.md)  
- Node API：[../nodejs/API.zh-CN.md](../nodejs/API.zh-CN.md)  
- 行为契约：[../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)  
- 发行索引：[../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md)
