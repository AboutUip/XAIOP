# Node.js notes (index)

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-INDEX` |
| Status | Informative |
| Last updated | 2026-08-04 |
| Normative | **No** |

Parent guides: **[../API.md](../API.md)** (primary) · [../README.md](../README.md)  
Protocol notes: [../../../protocol/notes/](../../../protocol/notes/) · Separation: [../../../SEPARATION.md](../../../SEPARATION.md) · Parity: [../../behavioral-contract.md](../../behavioral-contract.md)

| Note | ID | Topic |
| --- | --- | --- |
| [streaming-parse.md](streaming-parse.md) | `SDK-NODE-NOTE-STREAM` | XAIOP → JSON streaming (`XaiopStream` / `.` phases; `mergeChunkWindow` / `pushAsync`) |
| [history.md](history.md) | `SDK-NODE-NOTE-HISTORY` | Opt-in parse history — snapshot (read-only) + realtime (forward `jumpTo`) |
| [ws-session.md](ws-session.md) | `SDK-NODE-NOTE-WS` | WebSocket; **`connect`/`onPhase` ordering** (§5); **browser phases** (§9); **type push** (§10) |
| [typecheck.md](typecheck.md) | `SDK-NODE-NOTE-TYPE` | Type registry / client freeze / WS `pushTypeConsistency` |
| [line-intercept.md](line-intercept.md) | `SDK-NODE-NOTE-LINE` | Buffer line intercept (`onLineIntercept`; layered apart from `onPhase`) |
| [annotation-span.md](annotation-span.md) | `SDK-NODE-NOTE-ANNSPAN` | Phase `#` Annotation Span (**before typeCheck**; processed region escapes type check) |
| [encode-attention.md](encode-attention.md) | `SDK-NODE-NOTE-ENCODE` | JSON → XAIOP encode pitfalls (SDK; path-array `dotPolicy`) |
| [adjustment-policy.md](adjustment-policy.md) | `SDK-NODE-NOTE-ADJUST` | What is by-design vs carefully adjustable |
