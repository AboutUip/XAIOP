# 实践 — WebSocket 骨架流

[English](skeleton-stream.md) · [简体中文](skeleton-stream.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `PRACTICE-SKELETON-WS` |
| 状态 | 参考性 |
| 更新日期 | 2026-08-03 |
| 规范性 | **否** |

**不是协议。** 在一条长连接 WebSocket 上按固定键（骨架 + 模块）交付：每块就绪就 `JSON→XAIOP` 推送并丢弃缓冲。  
运行时 API：Node `XaiopWs` — [../sdk/nodejs/notes/ws-session.zh-CN.md](../sdk/nodejs/notes/ws-session.zh-CN.md)。

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

---

## 4. 为何此路径以 WS 为主

骨架/模块长会话需要面向帧的长连接。HTTP/SSE 仍可用于其它场景；**本实践路径以 WS 为一等公民**。同一 SDK 包覆盖 listen/push 与 connect/consume——不拆 client/server 包。

---

## 5. 相关

- 传输分帧：[streaming-transport.zh-CN.md](streaming-transport.zh-CN.md)  
- 模型写出：[model-output.zh-CN.md](model-output.zh-CN.md)  
- Node WS API：[../sdk/nodejs/notes/ws-session.zh-CN.md](../sdk/nodejs/notes/ws-session.zh-CN.md)  
- 分层：[../SEPARATION.md](../SEPARATION.md)
