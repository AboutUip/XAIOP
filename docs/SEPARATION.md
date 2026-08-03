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
| **Protocol** | [protocol/](protocol/) | Wire grammar & semantics (Frozen v0.2.1) | Skills, HTTP/SSE/WS recipes, package APIs, LLM eval narrative |
| **Practice** | [practice/](practice/) | What the protocol enables in products: **model output**, **streaming transport** | New wire meanings; language-specific method names as norms |
| **SDK** | [sdk/](sdk/) + `xaiop-sdk/` | Parse / encode / stream **APIs** per language | Redefining Labels / later-wins / Block rules |

```text
┌──────────────────────────────┐
│ Protocol — Frozen wire only  │
└──────────────┬───────────────┘
               │ enables
┌──────────────▼───────────────┐
│ Practice — model · transport │
└──────────────┬───────────────┘
               │ implemented by
┌──────────────▼───────────────┐
│ SDK — Node / Java / Python   │
└──────────────────────────────┘
```

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
| Grammar | [protocol/syntax.md](protocol/syntax.md) |
| Wire pitfalls | [protocol/notes/](protocol/notes/) |
| Model output | [practice/model-output.md](practice/model-output.md) |
| Streaming transport | [practice/streaming-transport.md](practice/streaming-transport.md) |
| Node SDK | [sdk/nodejs/](sdk/nodejs/) |
