# Practice — recommended scenarios

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PRACTICE-INDEX` |
| Status | Informative |
| Last updated | 2026-08-05 |
| Normative | **No** |

**Recommended scenarios** — not the protocol. Network framing and session push live here; they **do not** redefine wire grammar.  
LLM emit / metrics recipes are **target-sealed**: [../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/).

Grammar: [../protocol/](../protocol/) (cite a sealed package version). API: [../sdk/nodejs/API.md](../sdk/nodejs/API.md). What XAIOP is: [../overview/introduction.md](../overview/introduction.md). Architecture: [../SEPARATION.md](../SEPARATION.md).

---

## Guides (live)

| Guide | Topic |
| --- | --- |
| [streaming-transport.md](streaming-transport.md) | Carry wire over the network — framing, product Snapshot/Diff |
| [skeleton-stream.md](skeleton-stream.md) | Fixed-key WebSocket skeleton / module streams |
| [keyed-state-modeling.md](keyed-state-modeling.md) | Keyed maps / repeated names for locate·broadcast·delete (not anonymous rows) |

Stub (points to archive): [model-output.md](model-output.md)

---

## Quick map

```text
protocol  →  wire meaning (cursor IR)
practice  →  recommended scenarios (this tree · live)
archive   →  LLM emit seals (not the primary path)
SDK       →  language APIs
```

| Need | Go to |
| --- | --- |
| Line grammar | [../protocol/syntax.md](../protocol/syntax.md) |
| Wire pitfalls | [../protocol/notes/](../protocol/notes/) |
| Bytes → JSON | [streaming-transport.md](streaming-transport.md) |
| Skeleton WS push | [skeleton-stream.md](skeleton-stream.md) |
| Keyed state modeling | [keyed-state-modeling.md](keyed-state-modeling.md) |
| Node.js API | [../sdk/nodejs/API.md](../sdk/nodejs/API.md) (§6.4 · §6.5) |
| Java stream | [../sdk/java/README.md](../sdk/java/README.md) (`XaiopStream`) |
| LLM emit (sealed) | [../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/) |
