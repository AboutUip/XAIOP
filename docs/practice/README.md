# Practice — what you can do with XAIOP

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PRACTICE-INDEX` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** |

**Not protocol.** This tree describes **practical use** of the Frozen wire: how models emit it, how applications stream it. Grammar stays in [../protocol/](../protocol/). Runtime APIs stay in [../sdk/](../sdk/).

Architecture: [../SEPARATION.md](../SEPARATION.md)

---

## Guides

| Guide | Topic |
| --- | --- |
| [model-output.md](model-output.md) | LLM / Generator emit — Skills, phases, common mistakes |
| [streaming-transport.md](streaming-transport.md) | Streaming data over the network — framing, Snapshot/Diff in practice |
| [skeleton-stream.md](skeleton-stream.md) | Fixed-key skeleton/module delivery over WebSocket (push-and-discard) |

---

## Quick map

```text
Protocol  →  what the text means
Practice  →  model output · streaming transport (this tree)
SDK       →  parse / encode / client APIs in a language
```

| Need | Go to |
| --- | --- |
| Line grammar | [../protocol/syntax.md](../protocol/syntax.md) |
| Wire pitfalls (protocol checklist) | [../protocol/notes/](../protocol/notes/) |
| Teach a model | [model-output.md](model-output.md) · [../../skills/](../../skills/) |
| Stream bytes → JSON | [streaming-transport.md](streaming-transport.md) |
| Skeleton WS push | [skeleton-stream.md](skeleton-stream.md) |
| Node.js APIs | [../sdk/nodejs/](../sdk/nodejs/) |
