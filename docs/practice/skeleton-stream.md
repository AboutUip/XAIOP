# Practice — skeleton stream over WebSocket

[English](skeleton-stream.md) · [简体中文](skeleton-stream.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PRACTICE-SKELETON-WS` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** |

**Not protocol.** Long-lived delivery of fixed keys (skeleton + modules) over one WebSocket: encode each completed piece, push, discard.  
Runtime API: Node `XaiopWs` — [../sdk/nodejs/notes/ws-session.md](../sdk/nodejs/notes/ws-session.md).

---

## 1. Shape

Assume a final document made of **agreed top-level keys** (e.g. 3 skeleton sections + 5 modules). Keys are stable; values arrive when ready.

```text
WebSocket (long-lived)
  │
  ├─ key A ready → JSON → XAIOP phase → send → discard buffer
  ├─ key B ready → …
  └─ last key   → phase (optional final without `.`) → end / close
```

No JSON Patch. Accumulation is **protocol later-wins** on the consumer.

---

## 2. Producer rules

1. Prefer **one top-level key per phase** (`{ [key]: value }`).  
2. Encode with `dotPolicy: "none"`; append `.` between phases (last phase may omit).  
3. Named arrays **MAY** reopen across `.` (`>name-` appends). Default encode still often keeps one array per phase for Diff clarity.  
4. After `send`, discard the wire string; do not keep a growing full-document buffer by default.  
5. Prefer **complete lines** per frame; binary frames need a streaming UTF-8 decoder on the peer.

---

## 3. Consumer rules

1. Treat each phase Diff as **that phase’s JSON**, not a patch.  
2. Use **committed Snapshot** for progressive UI; **final Snapshot** at close.  
3. Same key later overwrites earlier (later-wins).  
4. Connection close is the usual end-of-stream signal.

---

## 4. Why WebSocket-only for this path

Skeleton / module long sessions need bidirectional-capable, frame-oriented delivery. HTTP/SSE remain useful elsewhere; **this practice path is WS-primary**. One SDK package covers listen/push and connect/consume — not separate client/server packages.

---

## 5. Related

- Transport framing: [streaming-transport.md](streaming-transport.md)  
- Model emit: [model-output.md](model-output.md)  
- Node WS API: [../sdk/nodejs/notes/ws-session.md](../sdk/nodejs/notes/ws-session.md)  
- Separation: [../SEPARATION.md](../SEPARATION.md)
