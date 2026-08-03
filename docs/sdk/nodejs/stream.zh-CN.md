# Node.js 流式（`XaiopStream`）

[English](stream.md) · [简体中文](stream.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包 | `xaiop` **0.7.0+** |
| 协议线格式 | Frozen **v0.4.0** |
| 代码 | `xaiop-sdk/nodejs/src/stream/` |
| 语义说明 | [notes/streaming-parse.zh-CN.md](notes/streaming-parse.zh-CN.md) |
| 对等契约 | [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) |

上级指南：[README.zh-CN.md](README.zh-CN.md) · WS 会话：[notes/ws-session.zh-CN.md](notes/ws-session.zh-CN.md) · 实践：[../../practice/streaming-transport.zh-CN.md](../../practice/streaming-transport.zh-CN.md)

---

## 1. 角色

`XaiopStream` 是 HTTP / SSE / WebSocket / RAW **消费端**客户端。它将传输文本按行缓冲进 `DotCheckpointEngine`，发出 **`.` 相位** Diff（默认 **窗口合并**），并在 EOF 解析最终 Snapshot。

骨架长会话的 **推送 + 消费** 优先用 `XaiopWs`（[notes/ws-session.zh-CN.md](notes/ws-session.zh-CN.md)）；`XaiopStream` 仍是通用传输客户端（含 `transport: "websocket"`）。

Diff 边界是 **SDK 策略**（`.` 相位），不是按 Block 的 `PROT-STREAM` §5 — 见 [notes/streaming-parse.zh-CN.md](notes/streaming-parse.zh-CN.md)。

---

## 2. 构造

```js
import { XaiopStream, STREAM_MODES, TRANSPORT_KIND } from "xaiop";

const stream = new XaiopStream(url, {
  streamProcessing: true, // 默认开
  compatibilityMode: false, // 默认关
  mergeChunkWindow: true, // 默认开 — 缓冲窗口内完整 `.` 批处理
  asyncParse: false, // 默认关 — 生产可开，走 pushAsync 合并扫描
  historySnapshot: false, // 默认关 — 只读 `.` 历史
  historyRealtime: false, // 默认关 — 向前 jumpTo 实时回溯
  modes: [STREAM_MODES.CALLBACK], // 省略时的默认
});
```

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `streamProcessing` | `true` | 中途相位 Diff；`false` → finish 时一个 chunk |
| `mergeChunkWindow` | `true` | 当前缓冲窗口内全部完整 `.` → **一次** Diff（= 批后 committed）。`false` → 逐步每 `.` |
| `asyncParse` | `false` | 传输走 `pushAsync`（`setImmediate` 合并；让出事件循环）。大包/多 `.` 生产建议 `true` |
| `historySnapshot` | `false` | 可选只读历史（导出 / 对比 / `viewRange` / URL 释放） |
| `historyRealtime` | `false` | 可选仅向前 `jumpTo`（保留定位点、丢弃其后） |
| `retainWireHistory` | `true` | 开启历史时是否保留每 `.` 线文切片 |
| `compatibilityMode` | `false` | 与 Engine 相同的摄入策略；可用细粒度 `setCompat*` |
| `modes` | `["callback"]` | 可多选；空输入回落到 `callback` |

历史细节：[notes/history.zh-CN.md](notes/history.zh-CN.md)。

---

## 3. 状态机

```text
idle → connecting → streaming → completing → completed
                 ↘ aborted
                 ↘ error
```

| 状态 | 含义 |
| --- | --- |
| `idle` | 可 `send` |
| `connecting` | 传输打开中 |
| `streaming` | 已收到首字节 / 相位流动中 |
| `completing` | 传输结束；正在收尾 checkpoint |
| `completed` | 最终 Snapshot 可用 |
| `aborted` | busy 时调用了 `abort()` |
| `error` | 解析 / 传输失败 |

Busy = `connecting` | `streaming` | `completing`。空闲类状态允许再次 `send`。用 `getStatus()` / 事件 `status` 观察。

常量：`STREAM_STATUS`。

---

## 4. 投递模式

模式可 **多选**。未启用的模式收不到数据。检查 API（`getSnapshot`、`getCommittedSnapshot`、`getStatus`）始终可用，**不是**模式。

| 模式 | 表面 |
| --- | --- |
| `callback`（**下限**） | `onChunk` / `onDone` / `onError` |
| `promise` | `send()` 返回最终 Snapshot 的 Promise |
| `asyncIterator` | `for await` / `chunks()` |
| `events` | `on("chunk"|"done"|"error"|"status", …)` |

- 默认：仅 **callback**。
- `disableMode` 不会留下空集 — 最后保留 `callback`。
- 事件监听器：监听器内异常 **隔离**（吞掉），不拖垮流。

```js
stream.setModes(["callback", "events", "promise"]);
stream.onChunk((diff) => { /* 窗口 Diff 或相位 JSON / null */ });
stream.on("status", (info) => {});
const json = await stream.send({ transport: "http" });
```

---

## 5. Snapshot 与 chunk

| API | 时机 | 值 |
| --- | --- | --- |
| `onChunk` / `chunk` / 迭代器 | 默认：缓冲窗口内完整 `.` 一次（+ EOF 尾）；`mergeChunkWindow: false` → 每个 `.` | 窗口 Diff = 批后 committed 树；逐步 = 仅该相物化 parse，空则为 `null` |
| `getCommittedSnapshot()` | 每次提交后 | 至最近 `.` / EOF 冲刷的累积 later-wins |
| `getSnapshot()` / `onDone` / promise | finish 之后 | 全缓冲 parse；空 → `{}` |
| 流中途 `getSnapshot()` | `streaming` 期间 | 通常为 `undefined` |

这些表面上，解析器的 fragment 会 **物化** 为普通对象（`materializeSnapshot`）。算法见 [notes/streaming-parse.zh-CN.md](notes/streaming-parse.zh-CN.md)「Checkpoint 算法」。

---

## 6. `send` / `abort`

```js
stream.send({
  transport: TRANSPORT_KIND.HTTP, // 默认
  method: "GET",
  headers: {},
  body: null,
  timeoutMs: 30_000,
  signal: abortSignal,
  // SSE
  sseEvents: ["message"], // 可选过滤；默认事件名 "message"
  // WebSocket
  protocols: undefined,
  // RAW
  source: asyncIterableOrReadableStream,
  fetch: globalThis.fetch,
});
```

| 行为 | 规则 |
| --- | --- |
| 默认传输 | `http` |
| Busy `send` | 若启用 `promise` 模式 → `Promise.reject`；否则 **抛出** `Error("XaiopStream is busy; …")` |
| SSE | 设置 `Accept: text/event-stream`；多行 `data:` 用 `\n` 拼接 |
| 二进制（WS/RAW/HTTP body） | 跨 chunk 流式 UTF-8 解码；关闭时 flush |
| 空文本 | 不进入 checkpoint 缓冲 |
| 超时 | 以 `transport timeout after Nms` abort |
| `abort()` | 状态 `aborted`，错误 `"aborted"`；reject promise / 迭代器 |

RAW 需要 `source`。尽量每个 SSE/WS 文本消息携带完整 Label 行（[../../practice/streaming-transport.zh-CN.md](../../practice/streaming-transport.zh-CN.md)）。

---

## 7. 流上的兼容模式

与 Engine 相同：总开关 + 八项 `setCompat*` / `CompatPolicy`（仅在 `compatibilityMode` 开启时生效）。每个相位 parse 使用当前策略。`forcedRoot` 看的是 **该相文本的第一行**（后续相常以合成 `.` 开头）— 多相 + 根数组形状需显式测试。

见 [README.zh-CN.md](README.zh-CN.md) 兼容模式 · CompatPolicy。

---

## 8. 相关导出

| 成员 | 作用 |
| --- | --- |
| `DotCheckpointEngine` | 底层 `.` 相位解析器 |
| `materializeSnapshot` | Fragment → 普通对象（JSON 表面） |
| `openTransport` / `TRANSPORT_KIND` | 传输辅助 |
| `STREAM_MODES` / `STREAM_STATUS` | 常量 |
| `isStreamBusy` | 状态辅助 |

---

## 9. 测试

`test/stream.test.js` · `test/stream.consistency.test.js` · `test/encode.stability.test.js`（分块 RAW 过流）。
