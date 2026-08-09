# Node.js 说明 — WebSocket 会话（`XaiopWs`）

[English](ws-session.md) · [简体中文](ws-session.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-WS` |
| 状态 | 参考性 |
| 更新日期 | 2026-08-05 |
| 规范性 | **否** — Node SDK 行为 |
| 代码 | `xaiop-sdk/nodejs/src/node/ws/` · `src/browser/ws-client.ts` |
| 包版本 | `xaiop` **0.14.0**（实现协议包 **0.6.0**） |

实践基线：[../../../practice/skeleton-stream.zh-CN.md](../../../practice/skeleton-stream.zh-CN.md)。  
相位解析语义：[streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)。

---

## 1. 定位

同一包、同一连接类型的两面：

| 面 | API | 典型用途 |
| --- | --- | --- |
| 接受 / 推 | `XaiopWs.listen` → `pushJson` / `pushObject` / `pushWire` / `pushWireLn` → `end` | 骨架流生产端 |
| 连接 / 收 | `XaiopWs.connect` → `onPhase` / `getCommittedSnapshot` / `done` | 消费端 |

依赖：Node `ws`（Node ≥ 18 无需 polyfill）。  
`XaiopStream` 的 HTTP/SSE/RAW 仍可用；**骨架长会话以 `XaiopWs` 为 WS 主路径**。

---

## 2. 最小示例

```js
import { XaiopWs } from "@bylan280/xaiop";

const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
hub.onConnection(async (conn) => {
  conn.pushJson("skeleton1", { title: "A" });
  conn.pushJson("mod1", { rows: [1, 2] }, { final: true });
  await conn.end(); // 排空后关闭 — 对端完成解析
});

const client = await XaiopWs.connect(hub.url(), {
  onPhase: (diff) => {
    /* 仅该相 JSON — 不是 patch */
  },
});
const json = await client.done; // 终态 Snapshot
await hub.close();
```

挂到已有 HTTP server：`XaiopWs.listen({ server, path: "/xaiop" })`。

---

## 3. 推送辅助

| 方法 | 行为 |
| --- | --- |
| `pushJson(key, value, { final? })` | `encodeSync({[key]:value}, {dotPolicy:"none"})`；非 `final` 时保证尾 `\n` 再追加 `.\n` |
| `pushObject(obj, { final? })` | 普通对象同理（一相多键） |
| `pushWire(text)` | 原样发送；**不**自动补 `\n`。连续帧须自行保证行边界，否则对端可能粘行。非 OPEN → `false` |
| `pushWireLn(text)` | 同 `pushWire`；若不以 LF 结尾则追加 `\n` |
| `encodePhaseJson` / `encodePhaseObject` | 只编码不发送（发送后可丢弃） |

`final: true` 不加相位分隔 `.`（最后一块）。非 final 相位总以 `.\n` 结束，以便对端发出中途 Diff。

严格 encode 规则仍生效（非法键抛 `XaiopEncodeError`，不会发出）。

---

## 4. 消费面

| 面 | 含义 |
| --- | --- |
| `onPhase` / `onChunk` | Diff 策略与 `XaiopStream` 相同（默认**窗口合并**缓冲区内完整 `.`；见 [streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)）；第二参 `meta` 可含 `seq` / `seqs` |
| `getCommittedSnapshot()` | 截至上次提交的累积 later-wins — 流中可用 |
| `getSnapshot()` | 仅对端关闭 / `done` 后为终态 |
| `done` | 终态 Snapshot 的 Promise |
| `closed` | 套接字拆完后的 Promise |
| 控制（可选） | `session` / `sendResume` / `getResumeState` / … — [control-plane.zh-CN.md](control-plane.zh-CN.md) · API [§7.7](../API.zh-CN.md#77-sdk-控制根--会话--续传) |

`connect` / `listen` 连接选项（与 `XaiopStream` 对齐）：

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `streamProcessing` | `true` | 流中 Diff |
| `mergeChunkWindow` | `true` | 缓冲窗口内完整 `.` 批算 → 一次 Diff |
| `asyncParse` | `false` | 合并式 `pushAsync` 摄入（`setImmediate`） |
| `compatibilityMode` | `false` | 可选兼容解析 |
| `session` / `autoSession` / `autoAck` / `retainOutbound` | 关 | 控制根会话 / hello / 自动 ack / 出站日志 |
| `onSession` / `onResume` / `onAck` / `onSnapshot` / `onControlError` | — | 控制回调（放进 **connect** 选项） |

若对端可能在 `connection` 里**同步推送**，请把 **`onPhase` / `onChunk` / `onDone` / `onError` / `lineIntercept` / `annotationSpan` / 控制回调** 放进 **`connect` 选项**——监听器在 `open` 完成前已挂上。`connect` resolve 后这些 mutator **抛错**（`handlersLocked`）；无回放。

---

## 5. 会话生命周期（锁定默认）

| 关注点 | 官方行为 |
| --- | --- |
| 连接握手 | `handshakeTimeoutMs` 默认 **15000**；等待 `ws` open |
| 挂接顺序 | `XaiopWsConnection` 在等待 `open` **之前**绑定 message 处理器（接受端同步推送不可丢）；**`connect` 后 `lockHandlers()`**，晚注册不能静默丢帧 |
| 二进制帧 | 跨 chunk 流式 UTF-8 `TextDecoder`；对端关闭时先 flush 再 `finish()` |
| 已关闭 / 非 OPEN 时 `push*` | 返回 **`false`**（不抛）。Encode 错误在 `send` **之前**抛出 |
| `end({ code?, reason? })` | 等到 `bufferedAmount === 0` 或满 **2s**，再 `close(code ?? 1000, reason ?? "")` |
| `abort()` | 优先 `terminate()`，并 `close(1001, "aborted")`；已关闭则返回 `false` |
| Parse / finish 失败 | `done` reject；触发 `onError`；套接字 `close(1011, message.slice(0, 120))` |
| 对端关闭 | checkpoint `finish()` → `onDone` / resolve `done`（空则 `{}`）；再 resolve `closed` |
| 流中途 `getSnapshot()` | finish / 对端关闭前保持 `undefined`（用 `getCommittedSnapshot`） |

Listen 要点：`port ?? 0`、可选已有 `http.Server` + `path`、`host`、`backlog`、`perMessageDeflate`、`maxPayload`。

相位 Diff 算法（leading `.` 注入、空 → `null`）：[streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)。

---

## 6. 测试

`test/ws.phase-encode.test.js` · `test/ws.session.test.js` — 真 WS 环回（listen → 推相位 → Snapshot）、later-wins、命名数组再进入追加、分片/二进制帧、挂 `http.Server`、同步推送竞态、`XaiopStream` websocket 回退到 `ws`。

控制面 / 续传：`test/control.plane.test.js` · `test/control.resume.test.js` · `test/control.coverage.test.js` — 见 [control-plane.zh-CN.md](control-plane.zh-CN.md)。

---

## 7. 相关

- 实践：[../../../practice/skeleton-stream.zh-CN.md](../../../practice/skeleton-stream.zh-CN.md)  
- 流式解析：[streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)  
- **控制根：** [control-plane.zh-CN.md](control-plane.zh-CN.md) · API [§7.7](../API.zh-CN.md#77-sdk-控制根--会话--续传)
- 行拦截：[line-intercept.zh-CN.md](line-intercept.zh-CN.md) · API [§6.4](../API.zh-CN.md#64-行拦截-onlineintercept)
- Annotation Span：[annotation-span.zh-CN.md](annotation-span.zh-CN.md) · API [§6.5](../API.zh-CN.md#65-annotation-span-onannotationspan)  
- 类型检查：[typecheck.zh-CN.md](typecheck.zh-CN.md)  
- 主入口：[../API.zh-CN.md](../API.zh-CN.md) §7  
- 目录：[../../behavioral-contract.zh-CN.md](../../behavioral-contract.zh-CN.md)
