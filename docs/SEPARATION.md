# Documentation separation

[English](SEPARATION.md) · [简体中文](SEPARATION.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-SEP` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** — documentation architecture |

---

## 1. Three layers, one wire

| Layer | Path | Owns | Must not own |
| --- | --- | --- | --- |
| **Protocol** | [protocol/](protocol/) | Wire grammar & semantics (Frozen v0.4.0) — **cursor IR** | Skills, HTTP/SSE/WS recipes, package APIs, LLM eval narrative |
| **Practice** | [practice/](practice/) | Writer recipes the wire enables: **model emit**, **streaming transport**, sessions | New wire meanings; language-specific method names as norms |
| **SDK** | [sdk/](sdk/) + `xaiop-sdk/` | Parse / encode / stream **APIs** per language; [behavioral contract](sdk/behavioral-contract.md) for third-party parity | Redefining Labels / later-wins / Block rules |

```text
┌──────────────────────────────────┐
│ Protocol — Frozen cursor IR wire │
└──────────────┬───────────────────┘
               │ enables
┌──────────────▼───────────────────┐
│ Practice — writers · transport   │
└──────────────┬───────────────────┘
               │ implemented by
┌──────────────▼───────────────────┐
│ SDK — materialize / encode / WS  │
└──────────────────────────────────┘
```

Product stance (informative): [overview/positioning.md](overview/positioning.md).

---

## 2. Notes placement

| Tree | Scope |
| --- | --- |
| [protocol/notes/](protocol/notes/) | Wire-only checklists (Generators & Parsers, language-agnostic) |
| [practice/](practice/) | Model emit + network streaming (product how-to) |
| [sdk/notes/](sdk/notes/) · [sdk/nodejs/notes/](sdk/nodejs/notes/) | Implementation Diff boundaries, encode, careful adjustments |

**Rules**

1. Protocol docs/notes **never** prescribe `XaiopStream.onChunk`, Skill paths, or SSE event glue.  
2. Practice cites protocol; it does not amend Frozen text.  
3. SDK notes cite protocol + practice; they do not invent wire operators.

---

## 3. Conflict policy

1. Practice or SDK vs Frozen protocol → **protocol wins**.  
2. Implementation Diff coarser than `PROT-STREAM` Block Diff → document under **SDK**, optionally summarized in **practice/streaming-transport**.  
3. Compatibility recovery = **SDK ingest**, not model license to break the wire.

---

## 4. Quick links

| Need | Go to |
| --- | --- |
| Positioning | [overview/positioning.md](overview/positioning.md) |
| Grammar | [protocol/syntax.md](protocol/syntax.md) |
| Wire pitfalls | [protocol/notes/](protocol/notes/) |
| Model output | [practice/model-output.md](practice/model-output.md) |
| Streaming transport | [practice/streaming-transport.md](practice/streaming-transport.md) |
| Node SDK | [sdk/nodejs/](sdk/nodejs/) |
| Third-party SDK parity | [sdk/behavioral-contract.md](sdk/behavioral-contract.md) |
