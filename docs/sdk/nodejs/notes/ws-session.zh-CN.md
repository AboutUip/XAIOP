# Node.js 说明 — WebSocket 会话（`XaiopWs`）

[English](ws-session.md) · [简体中文](ws-session.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-WS` |
| 状态 | 参考性 |
| 更新日期 | 2026-08-03 |
| 规范性 | **否** — Node SDK 行为 |
| 代码 | `xaiop-sdk/nodejs/src/stream/ws/` |
| 包版本 | `xaiop` **0.4.1+**（协议线 **0.2.1**） |

实践基线：[../../../practice/skeleton-stream.zh-CN.md](../../../practice/skeleton-stream.zh-CN.md)。  
相位解析语义：[streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)。

---

## 1. 定位

同一包、同一连接类型的两面：

| 面 | API | 典型用途 |
| --- | --- | --- |
| 接受 / 推 | `XaiopWs.listen` → `pushJson` / `pushObject` / `pushWire` → `end` | 骨架流生产端 |
| 连接 / 收 | `XaiopWs.connect` → `onPhase` / `getCommittedSnapshot` / `done` | 消费端 |

依赖：Node `ws`（Node ≥ 18 无需 polyfill）。  
`XaiopStream` 的 HTTP/SSE/RAW 仍可用；**骨架长会话以 `XaiopWs` 为 WS 主路径**。

---

## 2. 最小示例

```js
import { XaiopWs } from "xaiop";

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
| `pushJson(key, value, { final? })` | `encodeSync({[key]:value}, {dotPolicy:"none"})` + 可选 `.\n` |
| `pushObject(obj, { final? })` | 普通对象同理（一相多键） |
| `pushWire(text)` | 原始 XAIOP 文本 |
| `encodePhaseJson` / `encodePhaseObject` | 只编码不发送（发送后可丢弃） |

严格 encode 规则仍生效（非法键抛 `XaiopEncodeError`，不会发出）。

---

## 4. 消费面

| 面 | 含义 |
| --- | --- |
| `onPhase` / `onChunk` | Diff = 该 `.` 相（与 `XaiopStream` 同策略） |
| `getCommittedSnapshot()` | 截至上次提交的累积 later-wins — 流中可用 |
| `getSnapshot()` | 仅对端关闭 / `done` 后为终态 |
| `done` | 终态 Snapshot 的 Promise |
| `closed` | 套接字拆完后的 Promise |

若对端可能在 `connection` 里**同步推送**，请把 `onPhase` / `onDone` 放进 **`connect` 选项**——监听器在 `open` 完成前已挂上。

---

## 5. 测试

`test/ws.phase-encode.test.js` · `test/ws.session.test.js` — 真 WS 环回（listen → 推相位 → Snapshot）、later-wins、数组替换、分片/二进制帧、挂 `http.Server`、同步推送竞态、`XaiopStream` websocket 回退到 `ws`。

---

## 6. 相关

- 实践：[../../../practice/skeleton-stream.zh-CN.md](../../../practice/skeleton-stream.zh-CN.md)  
- 流式解析：[streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)  
- Encode：[../encode.zh-CN.md](../encode.zh-CN.md)
