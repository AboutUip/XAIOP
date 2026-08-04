# Node.js 注意事项 — 流式解析（XAIOP → JSON）

[English](streaming-parse.md) · [简体中文](streaming-parse.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-STREAM` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-05 |
| 规范性 | **否** — Node SDK 行为 |
| 代码 | `xaiop-sdk/nodejs/src/stream/` |
| 包 | `xaiop` **0.7.0+**（协议线 **0.6.0**；buffer compact **0.15.0+**；`@` 累积 Diff / 可选 `onChunk` **0.14.3+**；Diff 隔离 **0.14.2+**；控制根 / `meta.logSeq` **0.14.1+**） |

**协议基线（先读）：**  
[../../../protocol/notes/wire-attention.zh-CN.md](../../../protocol/notes/wire-attention.zh-CN.md) ·  
[../../../protocol/notes/streaming-attention.zh-CN.md](../../../protocol/notes/streaming-attention.zh-CN.md)

本文**只**描述 Node.js 面向 JSON 的流路径，不改变 Frozen 线含义。

---

## 1. 结论

| 关注点 | 判断 |
| --- | --- |
| 终态文档（`done` / 完成后 snapshot） | **稳健** — 与一次性 `parseSync` 在已测分帧下对齐 |
| 中途 JSON Diff | **按 `.` 相位**，不是 `PROT-STREAM` §5 字面的按 Block |
| 主要风险 | 语义误用（相位 Diff ≠ 累积 Snapshot）— 不是 LF/CRLF 下行扫描随机丢字节 |

---

## 2. 流水线（实现）

```text
传输文本 → DotCheckpointEngine.push
  → 扫描完整 "." 行
  → 将相位线文喂入 LiveXaiopParser（只喂一次；保活累积树）
  → materialize 活树 → committedSnapshot
  → Diff = 相位局部 parse（先前已有 `.` 且相含 `=`/`!`/`&`/`@` 时与 committed 共用）
  → onChunk(diff, meta?)   # phaseSeq 开启时含 meta.seq / meta.seqs（0.14.0+）；有戳时含 meta.logSeq（0.14.1+）
  → finish()：冲刷尾段；缓冲已盖满则复用末次 commit
```

| 层 | 路径 |
| --- | --- |
| 客户端 | `src/stream/XaiopStream.js` · API [../API.zh-CN.md](../API.zh-CN.md) |
| Checkpoint | `src/stream/checkpoint.js` |
| 控制 demux | `src/core/control.ts`（parse 前剥 `#!`；[control-plane.zh-CN.md](control-plane.zh-CN.md)） |
| Live parse | `src/parse.js` 中的 `LiveXaiopParser` |
| Materialize | `src/stream/materialize.js` |
| Parse | `src/parse.js` |
| Transport | `src/stream/transport.js` |

---

## 2b. Checkpoint 算法（可移植）

`DotCheckpointEngine` 实现 later-wins 的 **相位 Diff**，不是累积 Snapshot 的 JSON 树 diff。移植若在 **Diff** 切片上省略 leading-`.` 注入、跳过 live Commit 树，或混淆 commit 与 chunk，将与官方 SDK 分叉。

### 每遇到完整 `.` 行（`streamProcessing` 开）

**默认 `mergeChunkWindow: true`：** 收集当前缓冲窗口内全部已完整的 `.`，相位线 **一次** 喂入 live 树，一次 Commit，**一次** `onChunk`。多相 Diff = 批处理后的累积 committed 树（不是 N 次相位局部 Diff）。不按真实网络块作为交付单元。

**`mergeChunkWindow: false`：** 逐步 — 每个 `.` 各自 Diff（旧细粒度面）。checkpoint **接收缓冲**跨 `push` 拼完整行；活 Commit 再喂入**完整**相位行（不是原始网络切片）：

```text
# DotCheckpointEngine（跨 push 缓冲）— 可移植算法
closedPhases = takeCompleteDotPhases(buffer)   # 可跨多次 push()
将完整相位行喂入 LiveXaiopParser               # feedLine / 等价
… emit onChunk(phaseDiff)
```

`LiveXaiopParser.feedText` **本身没有**半行缓冲：只适合已按行组织的文本。任意字节/分片边界 → `engine.push` / `XaiopStream`，不要裸用 `feedText`。

**异步摄入：** `pushAsync` / `finishAsync` 立即追加，在 `setImmediate` 上合并扫描（让出事件循环；多次快速 `pushAsync` 共享一次 drain）。与窗口合并一起用可减少计算次数。同步 `push` / `finish` 仍可用。

**解析历史（可选，SDK 0.7.0+）：** `historySnapshot` / `historyRealtime` 默认**关**。开启后按每个物理 `.` 记账（before/after/diff），即使 Diff 仍窗口合并交付。见 [history.zh-CN.md](history.zh-CN.md)。

### `injectLeadingDot(raw)` / Diff 文档根（0.14.2+）

若 `raw` 已以 `.` 行开头（`.` / `.\n` / `.\r\n`），原样返回。  
否则若以 `\n` 开头，返回 `.` + `raw`。  
否则返回 `.\n` + `raw`。

后续相的 **Diff** 按「**已经 Root reset**」的文档解析，与线文在真实 `.` 之后的 Cursor 规则一致。live Commit 路径不注入 — 上一相的 `.` 已喂入。

**D1 修复（0.14.2）：** 先前 `.` 之后，以具名进入（`>rules-`）或 Content 续写在活树 object Root 上是合法的，但单独 `parseSync(".\n>rules-…")` 会当成 **fragment** 并抛错（`bare > after fragment bindings`）。Diff 隔离在活文档为 object、且该相不以裸 `>` / `-` 开头时，会前缀合成 object 根（`>\n`）。同一完整相位序列在一次 `push` 与按相 `push`、以及 `mergeChunkWindow` 开/关下**必须**一致。若 Diff 隔离仍失败，保留 Commit，Diff 回退为累积已提交树（不得仅因 Diff 中止流）。

**D2 修复（0.14.3）：** 含 `@` 的相位走与 `=` / `!` / `&` **相同的累积 Diff 路径**。协议 **可以** 让 `@` 的 Diff 保持相位局部；Node 产品 Diff **不这么做**——create-vs-enter（尤其进入先前相的具名数组）必须与 live Commit 一致。将 `@orders` 在 `>orders-` 之后分块推入时，不得吐出对象形 Diff，也不得在后续多元素追加时抛错。

测试：`test/checkpoint.diff-isolation.test.js`。

### 接收缓冲 compact（0.15.0+）

**产品契约（Node SDK）：** 长生命周期摄入**禁止**依赖无界增长的接收串。提交后调用方**应当**调用 `compactCommitted()`（或未来等价自动策略），使已丢弃线文不会无限膨胀。

#### `bufferStats()`

返回普通对象（无副作用）：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `length` | `number` | `buffer.length`（UTF-16 码元；同 JS 字符串 length） |
| `committedAt` | `number` | 提交前沿下标（`0 .. length`） |
| `pendingBytes` | `number` | **必须**等于 `length - committedAt` |
| `openPhase` | `boolean` | 前沿之后仍有未完成相位 / 半行时为 `true` |

热路径**禁止**仅为监控去读完整 `engine.buffer` — 请用 `bufferStats()`。

#### `compactCommitted(options?)`

```js
/** @returns {{ discardedBytes: number, length: number }} */
eng.compactCommitted();
eng.compactCommitted({ dropHistory: true });
```

| 规则 | 要求 |
| --- | --- |
| 效果 | **必须**丢弃 `buffer[0 .. committedAt)` 并将前沿归零 |
| Live 树 | **禁止**重 parse；**必须**保留 live Commit / `committedSnapshot` |
| 未提交尾巴 | **必须**留在新 `buffer` 开头（下标已调整） |
| 返回 | `discardedBytes` = 删除字节数；`length` = compact 后 `buffer.length` |
| `committedAt === 0` | **必须**空操作（`discardedBytes: 0`） |
| 已关闭引擎 | **必须**抛错 |
| `historyRealtime` **且** `retainWireHistory` | **必须**抛错，除非 `dropHistory: true` |
| 非空 parse history | **必须**抛错，除非 `dropHistory: true`（节点上的 buffer 下标会失效） |
| `dropHistory: true` | **必须**清空 history 节点（`ParseHistory.clear`）；模式开关保持 |
| 幂等 | 已提交前缀为空时再次调用 **必须**返回 `discardedBytes: 0` |

**compact 之后的 `finish()`：** 当 `committedAt === buffer.length` 时，终态 snapshot **必须**复用 live/committed——**禁止**要求已丢弃的会话线文。compact 之后 **禁止**把 `buffer` 当成整段会话实录。

**表面：** `XaiopStream` 与 WS 客户端连接上同名方法（委托引擎）。**范围外：** `ResumeWireLog` / 控制根会话日志——compact 接收缓冲 **不得**隐含截断续传日志。

**尚未提供：** `autoCompact` 水位（延后）。

测试：`test/checkpoint.buffer-compact.test.js`。

### 空相位 → `null` chunk

从 `raw` 去掉前导 `.` 行与尾部 `.` 行再 `trim`。剩余 body 长度为 `0` 时，chunk 为 **`null`**（即使 parse 会得到 `{}`）。连续 `.` 会产生 `null` chunk。

### `finish()` / EOF 尾

1. 将剩余 `buffer[segmentStart ..]` 喂入 live 并按同样 Diff 规则冲刷为最后一 chunk（若从未见过 `.`，Diff 与 committed 同为全文物化）。  
2. 若 `committedAt === buffer.length`，最终 snapshot **复用**末次 committed（不再第三次全量 parse）。含 `compactCommitted` 之后两者均为 `0`、但仍有 live/缓存 commit 的情形。  
3. 否则只 parse **当前** buffer（compact 前已丢弃的线文不可再得）。  
4. 从未提交且缓冲为空 → 消费面终态视为 **`{}`**。  
5. `streamProcessing: false`：跳过中途相位与 live；finish 时一个 chunk = 对**当前** buffer 的全量 parse。

### Commit vs chunk

| 值 | 来源 |
| --- | --- |
| Chunk / Diff | **仅该相文本** 的 parse（注入后）；若先前已有 `.` 且相含 `=`/`!`/`&`/`@` → 与累积 committed 同值 |
| `committedSnapshot` | 活树喂至最近 `.` / 已冲刷尾后的物化克隆。相位提交后，getter **可在首次读取时惰性物化**（此时 `committedAt` 已推进）。 |

不要把 Diff 实现成 `deepDiff(prevCommitted, newCommitted)`，除非另文档化为不同产品面 — **不是**官方 Node 行为。

**把相位 Diff 应用到本地树：** 非 `null` 的 Diff 应按**路径级子树替换**理解（或在 Diff 为该相整树形状时从 Root 替换）。**不要**把 Diff 喂给 `mergeJson` / `mergeToJson`——它们是**深合并**，**不会删除 overlay 中缺失的键**，因此删除形相位（`&`、cover 墓碑、或省略前相兄弟的相位）不会真正删掉数据。累积真相请用 `getCommittedSnapshot()`，或自行按键/路径替换。
### Materialize

`XaiopFragment` → `entries` 的克隆（普通对象）。完整文档原样克隆。流式 JSON 表面不暴露 fragment 类。

---

## 3. 各 API 面含义

| 面 | 时机 | 值 |
| --- | --- | --- |
| `onChunk` 等 | 每个完整 `.` 相位 + EOF 尾段 | **该相位**的物化 parse（空相位可为 `null`）；可选 **`meta.seq` / `meta.seqs`**（控制根相位游标，**0.14.0+**）；有戳时 **`meta.logSeq`**（**0.14.1+**） |
| `onDone` / 完成后 `getSnapshot()` | `finish()` 之后 | 终态物化值（缓冲已覆盖时复用 live/committed；**不保证**能重放 compact 前已丢弃线文） |
| `getCommittedSnapshot()` | 每个 `.` / EOF flush 后 | 已提交前缀的累积 parse — **可在流中使用**；**可在** `compactCommitted` 之后继续使用 |
| `bufferStats()` / `compactCommitted` | 关闭前任意时刻（**0.15.0+**） | 观测 / 丢弃已提交接收线文；见 § 接收缓冲 compact |
| `DotCheckpointEngine.committedSnapshot` | 每个 `.` / EOF flush | 与上相同；裸用引擎时：在 `.` 之后读 getter（`committedAt > 0`），不要用中途的 `getSnapshot()` / `snapshot` |
| 流中途 `getSnapshot()` | STREAMING 期间 | 通常 **`undefined`**（不变；用 `getCommittedSnapshot`） |

`streamProcessing: false`：结束时一次全量 parse → 一个 chunk + done。

---

## 4. 相对 PROT-STREAM Diff 的刻意差异

协议要求「每完成 Block 推 Diff」。本 SDK Diff = 每个 **`.` 相位**的物化 parse。属 **SDK 策略**。  
**慎重：** 默认不改为 Block Diff；若未来提供，必须 **opt-in**。见 [adjustment-policy.zh-CN.md](adjustment-policy.zh-CN.md)。

---

## 5. SDK 坑点（叠加在线规则之上）

1. `onChunk` = 相位 JSON，不是 Patch，也不是累积 Snapshot。  
2. 中途累积 JSON 用 `getCommittedSnapshot()`；自合并须按命名数组 **追加**理解。  
2b. **跨相位定位 / 删除 / 精确进入：** 官方 Node Diff 对 `=` / `!` / `&` / `@` 看见**迄今整树**（向前跨相）。协议包正文 **可以** 让 `@` 的 Diff 保持相位局部；本 SDK 对 `@` 使用**累积** Diff，使 create-vs-enter 与 Commit 一致（尤其重入先前相的具名数组）。  
2b′. **`onChunk` 可选：** 省略或传入非函数 — Diff 投递为空操作；Commit / 终态仍执行。与 `emitDiff: false`（仅快照）兼容。  
2c. **Cover 模式（`cover`，默认关）：** 仅 SDK 的 `&` Diff 整形。开启时，连续 `&` 注入 `.`、发最深键 `null` 墓碑 Diff、再用 `>` 链恢复 Cursor。关闭时 Commit 仍在 live 树上执行 `&`；已发出的 Diff 不回写。  
2d. **`mergeJson` ≠ Diff 应用：** 深合并会保留 overlay 中缺失的键；需要删除时**不要**把 `onChunk` Diff 灌进 `mergeJson`——按路径替换或读 `getCommittedSnapshot()`。  
3. 容忍 `null` chunk。  
4. 勿用流中 `getSnapshot()` 做渐进 UI（裸引擎：`.` 后读 `committedSnapshot`；`committedAt > 0` 表示已有提交，物化可惰性到首次读取）。  
5. 兼容模式默认关；`forcedRoot` 看该相文本第一行（后续相常以合成 `.` 开头）。  
6. RAW/WS **二进制**已流式 UTF-8 解码；勿在码点中间混插 string 帧。  
7. 中途语法错不回滚已发 chunk。  
8. **代价 / 缓冲：** 每个 `.` 喂入 live parser；首相与 `=`/`!`/`&`/`@` 的 Diff 与 Commit 共用一次 materialize；后续普通 Diff 为 owned 相位 parse。长会话**必须**调用 **`compactCommitted()`**（或等价手段），避免接收缓冲无界增长——对小时级连接**不是**可选项。`emitDiff: false` 跳过 Diff parse。**禁止**每个 `.` 对增长前缀再 `parseSync`。  
9. 优先 LF/CRLF（单独 CR 时 `.` 检测弱于全量 `parseSync`）。  
10. **History 与 compact：** 不要在同一引擎上既开 `historyRealtime`+`retainWireHistory` 又每相 compact，除非传 `dropHistory: true`（此后失去 `jumpTo`）。

---

## 6. 清单

**消费：**

- [ ] `done` / 终态 `getSnapshot()` 对已结束流权威  
- [ ] 中途累积 JSON → `getCommittedSnapshot()`  
- [ ] `onChunk` = 相位文档；处理 `null`  
- [ ] 协议忠实摄入保持 `compatibilityMode` 关闭  
- [ ] 只要终态 JSON 可用 `streamProcessing: false`  
- [ ] 长连接：提交后调用 `compactCommitted()`；用 `bufferStats()` 监控  
- [ ] compact 后不要假定 `buffer` 等于整段会话线文  
- [ ] 若使用 `historyRealtime` + 保留 wire：避免 compact，或传 `dropHistory: true`  

**生成：** 要中途 Diff 就打 `.`；命名数组可跨相再开（追加）；`.` 后从 Root 重进。

---

## 8. 支撑结论的测试

| 套件 | 焦点 |
| --- | --- |
| `test/stream.consistency.test.js` | 一次 ≡ 流式（字符/定长）、CRLF、覆盖、数组、复杂夹具 |
| `test/stream.test.js` | 相位投递、空相 `null`、模式、busy/abort |
| `test/encode.stability.test.js` | 编码线文经 RAW 字符流 + checkpoint 提交 |
| `test/checkpoint.diff-isolation.test.js` | D1 Diff 根 / D2 `@` 累积 / 分帧 |
| `test/checkpoint.buffer-compact.test.js` | `bufferStats` / `compactCommitted` 契约、history 冲突、Stream / WS |

---

## 相关

- 协议流式 note：[../../../protocol/notes/streaming-attention.zh-CN.md](../../../protocol/notes/streaming-attention.zh-CN.md)  
- 控制根 / 续传：[control-plane.zh-CN.md](control-plane.zh-CN.md)  
- API：[../API.zh-CN.md](../API.zh-CN.md) · [../README.zh-CN.md](../README.zh-CN.md)  
- 对等契约：[../../behavioral-contract.zh-CN.md](../../behavioral-contract.zh-CN.md)  
- 编码对齐：[../API.zh-CN.md](../API.zh-CN.md) · [encode-attention.zh-CN.md](encode-attention.zh-CN.md)  
- 隔离：[../../../SEPARATION.zh-CN.md](../../../SEPARATION.zh-CN.md)
