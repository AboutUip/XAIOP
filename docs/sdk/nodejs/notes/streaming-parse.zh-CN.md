# Node.js 注意事项 — 流式解析（XAIOP → JSON）

[English](streaming-parse.md) · [简体中文](streaming-parse.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-STREAM` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-04 |
| 规范性 | **否** — Node SDK 行为 |
| 代码 | `xaiop-sdk/nodejs/src/stream/` |
| 包 | `xaiop` **0.7.0+**（协议线 **0.5.0**） |

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
  → Diff = 相位局部 parse（先前已有 `.` 且相含 `=`/`!`/`&` 时与 committed 共用）
  → onChunk(diff)
  → finish()：冲刷尾段；缓冲已盖满则复用末次 commit
```

| 层 | 路径 |
| --- | --- |
| 客户端 | `src/stream/XaiopStream.js` · API [../API.zh-CN.md](../API.zh-CN.md) |
| Checkpoint | `src/stream/checkpoint.js` |
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

### `injectLeadingDot(raw)`

若 `raw` 已以 `.` 行开头（`.` / `.\n` / `.\r\n`），原样返回。  
否则若以 `\n` 开头，返回 `.` + `raw`。  
否则返回 `.\n` + `raw`。

后续相的 **Diff** 按「**已经 Root reset**」的文档解析。live Commit 路径不注入 — 上一相的 `.` 已喂入。

### 空相位 → `null` chunk

从 `raw` 去掉前导 `.` 行与尾部 `.` 行再 `trim`。剩余 body 长度为 `0` 时，chunk 为 **`null`**（即使 parse 会得到 `{}`）。连续 `.` 会产生 `null` chunk。

### `finish()` / EOF 尾

1. 将剩余 `buffer[segmentStart ..]` 喂入 live 并按同样 Diff 规则冲刷为最后一 chunk（若从未见过 `.`，Diff 与 committed 同为全文物化）。  
2. 若 `committedAt === buffer.length`，最终 snapshot **复用**末次 committed（不再第三次全量 parse）；否则再 parse 全文。  
3. 全缓冲为空 → 消费面最终 snapshot 视为 **`{}`**。  
4. `streamProcessing: false`：跳过中途相位与 live；finish 时一个 chunk = 全量 parse。

### Commit vs chunk

| 值 | 来源 |
| --- | --- |
| Chunk / Diff | **仅该相文本** 的 parse（注入后）；若先前已有 `.` 且相含 `=`/`!`/`&` → 与累积 committed 同值 |
| `committedSnapshot` | 活树喂至最近 `.` / 已冲刷尾后的物化克隆。相位提交后，getter **可在首次读取时惰性物化**（此时 `committedAt` 已推进）。 |

不要把 Diff 实现成 `deepDiff(prevCommitted, newCommitted)`，除非另文档化为不同产品面 — **不是**官方 Node 行为。

**把相位 Diff 应用到本地树：** 非 `null` 的 Diff 应按**路径级子树替换**理解（或在 Diff 为该相整树形状时从 Root 替换）。**不要**把 Diff 喂给 `mergeJson` / `mergeToJson`——它们是**深合并**，**不会删除 overlay 中缺失的键**，因此删除形相位（`&`、cover 墓碑、或省略前相兄弟的相位）不会真正删掉数据。累积真相请用 `getCommittedSnapshot()`，或自行按键/路径替换。
### Materialize

`XaiopFragment` → `entries` 的克隆（普通对象）。完整文档原样克隆。流式 JSON 表面不暴露 fragment 类。

---

## 3. 各 API 面含义

| 面 | 时机 | 值 |
| --- | --- | --- |
| `onChunk` 等 | 每个完整 `.` 相位 + EOF 尾段 | **该相位**的物化 parse（空相位可为 `null`） |
| `onDone` / 完成后 `getSnapshot()` | `finish()` 之后 | **全缓冲**物化 parse（later-wins） |
| `getCommittedSnapshot()` | 每个 `.` / EOF flush 后 | 已提交前缀的累积 parse — **可在流中使用**（首次读取惰性物化亦可） |
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
2b. **跨相位定位 / 删除：** `=` / `!` / `&` 看见**迄今整树**（向前跨相）。官方 Diff 对含 `=` / `!` / `&` 的相位做**累积前缀** parse。`@` 创建或进入属本相，可保持相位局部。  
2c. **Cover 模式（`cover`，默认关）：** 仅 SDK 的 `&` Diff 整形。开启时，连续 `&` 注入 `.`、发最深键 `null` 墓碑 Diff、再用 `>` 链恢复 Cursor。关闭时 Commit 仍在 live 树上执行 `&`；已发出的 Diff 不回写。  
2d. **`mergeJson` ≠ Diff 应用：** 深合并会保留 overlay 中缺失的键；需要删除时**不要**把 `onChunk` Diff 灌进 `mergeJson`——按路径替换或读 `getCommittedSnapshot()`。  
3. 容忍 `null` chunk。  
4. 勿用流中 `getSnapshot()` 做渐进 UI（裸引擎：`.` 后读 `committedSnapshot`；`committedAt > 0` 表示已有提交，物化可惰性到首次读取）。  
5. 兼容模式默认关；`forcedRoot` 看该相文本第一行（后续相常以合成 `.` 开头）。  
6. RAW/WS **二进制**已流式 UTF-8 解码；勿在码点中间混插 string 帧。  
7. 中途语法错不回滚已发 chunk。  
8. **代价：** 每个 `.` 喂入 live parser；首相与 `=`/`!`/`&` 的 Diff 与 Commit 共用一次 materialize；后续普通 Diff 为 owned 相位 parse（不再额外 clone）。整树 materialize 惰性。`emitDiff: false`（`XaiopStream` 无 Diff 消费面时自动）跳过 Diff parse。`cloneJson` 走 JSON 往返。**禁止**每个 `.` 对增长前缀再 `parseSync`。  
9. 优先 LF/CRLF（单独 CR 时 `.` 检测弱于全量 `parseSync`）。

---

## 6. 清单

**消费：** `done`/`getSnapshot()` 权威；中途用 `getCommittedSnapshot()`；chunk 按相位；compat 默认关。

**生成：** 要中途 Diff 就打 `.`；命名数组可跨相再开（追加）；`.` 后从 Root 重进。

---

## 相关

- 协议流式 note：[../../../protocol/notes/streaming-attention.zh-CN.md](../../../protocol/notes/streaming-attention.zh-CN.md)  
- API：[../API.zh-CN.md](../API.zh-CN.md) · [../README.zh-CN.md](../README.zh-CN.md)  
- 对等契约：[../../behavioral-contract.zh-CN.md](../../behavioral-contract.zh-CN.md)  
- 编码对齐：[../API.zh-CN.md](../API.zh-CN.md) · [encode-attention.zh-CN.md](encode-attention.zh-CN.md)  
- 隔离：[../../../SEPARATION.zh-CN.md](../../../SEPARATION.zh-CN.md)
