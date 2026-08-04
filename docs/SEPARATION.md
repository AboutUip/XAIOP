# Document Separation

[English](SEPARATION.md) · [简体中文](SEPARATION.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-SEP` |
| Status | Informative |
| Last updated | 2026-08-04 |
| Normative | **No** — documentation architecture |

---

## 1. Three layers, one wire

| Layer | Path | Owns | Does **not** own |
| --- | --- | --- | --- |
| **Protocol** | [protocol/](protocol/) | Sealed **streaming, line-oriented, cursor-construction wire**: Label / Block / operators / Content typing / streaming validity / later-wins | Skills, prompts, LLM eval narratives, HTTP/SSE/WS recipes, language APIs, silent-repair policies |
| **Practice** | [practice/](practice/) | **Recommended scenarios** for using the wire (transport framing, sessions). LLM emit recipes moved to [archive/](archive/) | New wire operators; treating a language method name as normative |
| **SDK** | [sdk/](sdk/) + `xaiop-sdk/` | Language parse / encode / stream **APIs**. **Focus: Node.js**; other languages are secondary ports. Optional: [sdk/behavioral-contract.md](sdk/behavioral-contract.md) (Node product-choice catalog, not a cross-language mandate) | Redefining Label / later-wins / Block; inventing wire operators |

```text
┌─────────────────────────────────────────────┐
│ Protocol — sealed streaming line wire (IR)  │
└──────────────────────┬──────────────────────┘
                       │ enables
┌──────────────────────▼──────────────────────┐
│ Practice — recommended usage scenarios      │
└──────────────────────┬──────────────────────┘
                       │ implemented by
┌──────────────────────▼──────────────────────┐
│ SDK — materialize / encode / stream / WS    │
└─────────────────────────────────────────────┘
```

**Identity:** The protocol is a **data-organization wire**, not an “AI output product.” SDK surfaces and transport sessions are **application layer**; optional LLM emit guidance is **target-sealed** under [archive/practice-llm-emit-2026-08-04/](archive/practice-llm-emit-2026-08-04/) and does not define the wire.

What XAIOP is: [overview/introduction.md](overview/introduction.md).  
Seal / release rules: [meta/status-and-versioning.md](meta/status-and-versioning.md) · [meta/releases.md](meta/releases.md).

**Node SDK human docs:** Prefer a **single API reference** — [sdk/nodejs/API.md](sdk/nodejs/API.md). Files under [sdk/nodejs/notes/](sdk/nodejs/notes/) are **implementation deep-dives**, not the primary API surface.

---

## 2. Where notes live

| Tree | Scope |
| --- | --- |
| [protocol/notes/](protocol/notes/) | Language-agnostic wire checklists only |
| [practice/](practice/) | How to *use* the wire in apps (transport, sessions) |
| [archive/](archive/) | Target seals (incl. historical LLM emit / metrics recipes) |
| [sdk/notes/](sdk/notes/) · [sdk/nodejs/notes/](sdk/nodejs/notes/) | Implementation Diff boundaries, encode, careful adjustments — deep-dives, not the Node primary API |

**Rules:**

1. Protocol documents **MUST NOT** name SDK methods as wire requirements.  
2. Practice documents **MUST NOT** change sealed wire meaning.  
3. SDK documents **MUST NOT** invent wire operators.  
4. When practice or SDK conflicts with a **cited sealed protocol package version**, that protocol package wins.

---

## 3. Conflict

Practice / SDK vs sealed protocol package → **protocol package for the cited version wins**.  
Coarser Diff delivery policy belongs in SDK (practice may summarize). Compatibility / silent repair = **SDK ingestion**, not wire permission.

---

## 4. Quick entry

| Need | Go to |
| --- | --- |
| What the wire is | [overview/introduction.md](overview/introduction.md) |
| Seal / versions | [meta/status-and-versioning.md](meta/status-and-versioning.md) · [meta/releases.md](meta/releases.md) |
| Grammar | [protocol/syntax.md](protocol/syntax.md) |
| Wire pitfalls | [protocol/notes/](protocol/notes/) |
| Transport recipes | [practice/streaming-transport.md](practice/streaming-transport.md) |
| Skeleton WS | [practice/skeleton-stream.md](practice/skeleton-stream.md) |
| LLM emit / metrics (sealed) | [archive/practice-llm-emit-2026-08-04/](archive/practice-llm-emit-2026-08-04/) |
| Node SDK (primary) | [sdk/nodejs/API.md](sdk/nodejs/API.md) |
| Node product-choice catalog (optional) | [sdk/behavioral-contract.md](sdk/behavioral-contract.md) |
