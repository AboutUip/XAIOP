# 实践 — WebSocket 骨架流

[English](skeleton-stream.md) · [简体中文](skeleton-stream.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PRACTICE-SKELETON-WS` |
| 状态 | 参考性 |
| 更新日期 | 2026-08-04 |
| 规范性 | **否** |

**建议场景** — 不是协议。在一条长连接 WebSocket 上按固定键（骨架 + 模块）交付：每块就绪就 `JSON→XAIOP` 推送并丢弃缓冲。  
运行时：Node 生产 `XaiopWs` · 浏览器消费 `xaiop/browser` — **[../sdk/nodejs/API.zh-CN.md](../sdk/nodejs/API.zh-CN.md)** §7 / §7.6 · 深潜 [../sdk/nodejs/notes/ws-session.zh-CN.md](../sdk/nodejs/notes/ws-session.zh-CN.md)。

---

## 1. 形态

终态由**事先约定的顶层键**组成（例如 3 段骨架 + 5 个模块）。键名稳定；值在就绪时到达。

```text
WebSocket（长连接）
  │
  ├─ 键 A 就绪 → JSON → XAIOP 相位 → 发送 → 丢弃缓冲
  ├─ 键 B 就绪 → …
  └─ 最后一键 → 相位（末相可不加 `.`）→ end / 关连接
```

不用 JSON Patch。客户端累积靠协议 **later-wins**。

---

## 2. 生产端约定

1. 优先**每相一个顶层键**（`{ [key]: value }`）。  
2. `dotPolicy: "none"` 编码；相与相之间加 `.`（末相可省略）。  
3. 命名数组 **可以**跨 `.` 再开（`>name-` 追加）。Encode 默认仍常把整数组放一相（Diff 清晰度）。  
4. `send` 后丢弃线文本；默认不要在服务端累加整文档缓冲。  
5. 帧内尽量是**完整行**；二进制帧需对端流式 UTF-8 解码。

---

## 3. 消费端约定

1. 相位 Diff = **该相 JSON**，不是 Patch。  
2. 渐进 UI 用 **committed Snapshot**；关连接后用 **final Snapshot**。  
3. 同键后写覆盖先写（later-wins）。  
4. 连接关闭即通常的流结束信号。  
5. **早帧时序（`connect`）：** 生产端常在 `connection` 里同步推送。消费端 **必须** 把 `onPhase` / `onChunk` / `onDone` / `onError` / `lineIntercept` / `annotationSpan` 放进 connect options（Node：`XaiopWs.connect`；浏览器：`XaiopBrowserWs.connect`）。`connect` resolve 后这些 mutator **抛错**（`handlersLocked`）；**不要**假设「`await connect` 返回后才第一次收到相位」。
6. **浏览器：** 从 `xaiop/browser` 导入；**支持相位 Diff**（`onPhase` / `XaiopStream.onChunk`）。**无** `listen` — 服务端仍用 Node。发原始线文用 `pushWire`（原样）或 `pushWireLn`（保证尾 `\n`）。见 [../sdk/nodejs/API.zh-CN.md](../sdk/nodejs/API.zh-CN.md) §7.6。

---

## 4. 为何此路径以 WS 为主

骨架/模块长会话需要面向帧的长连接。HTTP/SSE 仍可用于其它场景；**本实践路径以 WS 为一等公民**。Node 负责 listen/push；浏览器用 `xaiop/browser` 做 connect/consume（**相位 Diff 可用**）。

---

## 5. 相关

- 传输分帧：[streaming-transport.zh-CN.md](streaming-transport.zh-CN.md)  
- 模型写出：[封存 model-output](../archive/practice-llm-emit-2026-08-04/model-output.zh-CN.md)  
- Node WS API：[../sdk/nodejs/notes/ws-session.zh-CN.md](../sdk/nodejs/notes/ws-session.zh-CN.md)  
- 分层：[../SEPARATION.md](../SEPARATION.md)
