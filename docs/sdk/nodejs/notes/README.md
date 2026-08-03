# Node.js notes (index)

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-INDEX` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** |

Parent guides: [../README.md](../README.md) · [../stream.md](../stream.md) · [../encode.md](../encode.md) · [../merge.md](../merge.md)  
Protocol notes: [../../../protocol/notes/](../../../protocol/notes/) · Separation: [../../../SEPARATION.md](../../../SEPARATION.md) · Parity: [../../behavioral-contract.md](../../behavioral-contract.md)

| Note | ID | Topic |
| --- | --- | --- |
| [streaming-parse.md](streaming-parse.md) | `SDK-NODE-NOTE-STREAM` | XAIOP → JSON streaming (`XaiopStream` / `.` phases; `mergeChunkWindow` / `pushAsync`) |
| [history.md](history.md) | `SDK-NODE-NOTE-HISTORY` | Opt-in parse history — snapshot (read-only) + realtime (forward `jumpTo`) |
| [ws-session.md](ws-session.md) | `SDK-NODE-NOTE-WS` | WebSocket listen/push + connect/consume (`XaiopWs`; same window/async flags) |
| [encode-attention.md](encode-attention.md) | `SDK-NODE-NOTE-ENCODE` | JSON → XAIOP encode pitfalls (SDK; path-array `dotPolicy`) |
| [adjustment-policy.md](adjustment-policy.md) | `SDK-NODE-NOTE-ADJUST` | What is by-design vs carefully adjustable |
