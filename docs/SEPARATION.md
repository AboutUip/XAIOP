# Document Separation

[English](SEPARATION.md) · [简体中文](SEPARATION.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-SEP` |
| Status | Informative |
| Last updated | 2026-09-04 |
| Normative | **No** — documentation architecture (isolation rules for this repository) |

---

## 0. Hard authority (read first)

This repository is a **protocol repository**. Wire meaning is **never** inferred from editors, demos, skills, or “what the highlighter did.”

| Rank | Source | Role |
| --- | --- | --- |
| **1** | Sealed protocol package for a **cited** version ([meta/releases.md](meta/releases.md)) | **Wins all conflicts** |
| **2** | Tip draft under [protocol/](protocol/) (only while Draft / unsealed) | Working wire text until sealed |
| **3** | Product SDK observable semantics ([sdk/](sdk/) · `xaiop-sdk/`) | How a conforming program materializes / encodes / streams |
| **4** | [practice/](practice/) | Recommended usage; **non-binding** on wire meaning |
| **5** | [`../plugins/`](../plugins/) · demos · lab UI · skills source | **Presentation / tooling only** — **never** evidence of wire meaning |

**Corollary:** If a plugin, Quick Fix, live JSON path, TextMate scope, outline fold, or inlay disagrees with the cited protocol package, the **plugin is wrong**. Fix the host; do **not** amend the wire to match the host.

---

## 1. Three normative trees + optional hosts

| Layer | Path | Owns | Does **not** own |
| --- | --- | --- | --- |
| **Protocol** | [protocol/](protocol/) | Sealed **streaming, line-oriented, cursor-construction wire**: Label / Block / operators / Content typing / streaming validity / later-wins | Skills, prompts, LLM eval, HTTP/SSE/WS recipes, language APIs, silent repair, **any editor UX** |
| **Practice** | [practice/](practice/) | **Recommended scenarios** for using the wire (transport framing, sessions). LLM emit → [archive/](archive/) | New operators; treating a language method name as normative |
| **SDK** | [sdk/](sdk/) + `xaiop-sdk/` | Language parse / encode / stream **APIs**. **Focus: Node.js**; other languages are secondary ports. Optional: [sdk/behavioral-contract.md](sdk/behavioral-contract.md) | Redefining Label / later-wins / Block; inventing operators |
| **Plugins** *(optional, outside `docs/`)* | [`../plugins/`](../plugins/) | Editor / host **presentation** of an already-defined wire (id, highlight, hover, lint UI, live inspect, encode UX). First host: [vscode-xaiop](../plugins/vscode-xaiop/) | Wire grammar; operators; Cursor semantics; sealed package contents; substituting for the product SDK |

```text
┌─────────────────────────────────────────────┐
│ Protocol — sealed streaming line wire (IR)  │  ← sole normative wire
└──────────────────────┬──────────────────────┘
                       │ enables
┌──────────────────────▼──────────────────────┐
│ Practice — recommended usage scenarios      │  ← non-binding on meaning
└──────────────────────┬──────────────────────┘
                       │ implemented by
┌──────────────────────▼──────────────────────┐
│ SDK — materialize / encode / stream / WS    │  ← product APIs
└─────────────────────────────────────────────┘

        (orthogonal; not in the docs authority chain)
┌─────────────────────────────────────────────┐
│ plugins/ — optional editor hosts (UX only)  │
└─────────────────────────────────────────────┘
```

Plugins are **not** a fourth normative tree. They sit **beside** the stack, under repository convenience, with **zero** seal power.

**Identity:** The protocol is a **data-organization wire**, not an “AI output product.” SDK surfaces and transport sessions are **application layer**. Editor plugins are **optional hosts** that may present the same wire; they **MUST NOT** redefine it. Optional LLM emit guidance is **target-sealed** under [archive/practice-llm-emit-2026-08-04/](archive/practice-llm-emit-2026-08-04/) and does not define the wire.

What XAIOP is: [overview/introduction.md](overview/introduction.md).  
Seal / release rules: [meta/status-and-versioning.md](meta/status-and-versioning.md) · [meta/releases.md](meta/releases.md).  
Plugins hub: [../plugins/README.md](../plugins/README.md).

**Node SDK human docs:** Prefer a **single API reference** — [sdk/nodejs/API.md](sdk/nodejs/API.md). Files under [sdk/nodejs/notes/](sdk/nodejs/notes/) are **implementation deep-dives**, not the primary API surface.

---

## 2. Where notes live

| Tree | Scope |
| --- | --- |
| [protocol/notes/](protocol/notes/) | Language-agnostic wire checklists only |
| [practice/](practice/) | How to *use* the wire in apps (transport, sessions) |
| [archive/](archive/) | Target seals (incl. historical LLM emit / metrics recipes) |
| [sdk/notes/](sdk/notes/) · [sdk/nodejs/notes/](sdk/nodejs/notes/) | Implementation Diff boundaries, encode, careful adjustments — deep-dives, not the Node primary API |
| [`../plugins/`](../plugins/) | Host READMEs / changelogs only — **not** protocol notes; **MUST NOT** be cited as wire authority |

### Cross-tree rules

1. Protocol documents **MUST NOT** name SDK methods or editor commands as wire requirements.  
2. Practice documents **MUST NOT** change sealed wire meaning.  
3. SDK documents **MUST NOT** invent wire operators.  
4. When practice or SDK conflicts with a **cited sealed protocol package version**, that protocol package wins.  
5. Compatibility / silent repair = **SDK ingestion**, not wire permission.

### Plugin / host isolation (strict)

Hosts under [`../plugins/`](../plugins/) **MUST** obey:

1. **MUST NOT** invent wire operators, Label rules, Content typing, streaming validity, or later-wins exceptions.  
2. **MUST NOT** change line classification relative to the cited [protocol/syntax.md](protocol/syntax.md) §3 tables and the SDK `classifyLine` for the cited SDK version. Editor-only marks (e.g. `>>` stacking, leading whitespace) are **diagnostics of illegal wire**, not new primitives.  
3. **MUST NOT** treat TextMate scopes, outline/fold structure, selection ranges, Go to Definition, Rename, status-bar paths, or live-inspect JSON paths as Cursor / tree semantics. Those surfaces are **best-effort UX**; authoritative materialization is only a full parse (product SDK or a **verbatim** bundle of that SDK’s parse/encode core).  
4. **MUST NOT** present Quick Fixes, snippets, completions, or “wrap fragment with `>`” as protocol permissions. They are editor aids that rewrite text toward already-legal wire.  
5. **MUST NOT** enable SDK compatibility / silent repair as the default lint path. If a host exposes compat, it **MUST** label it as **non-strict / non-wire**.  
6. **MUST NOT** ship a live npm dependency that can silently drift from the cited SDK tip without an explicit host version bump and changelog. A bundled parse/encode core is allowed only as a **pinned snapshot** of the cited SDK; regenerating it is a host release concern, not a protocol change.  
7. **MUST NOT** place normative wire tables, seal announcements, or META documents under `plugins/`. Normative text stays under [protocol/](protocol/) / [meta/](meta/).  
8. **MUST NOT** use plugin behavior (screenshots, Problems panel wording, hover copy) as evidence when arguing wire meaning in protocol reviews.  
9. `#` lines remain **custom annotation transmission** on the wire. Mapping them to editor “comment” scopes / Toggle Line Comment is **UX only** and does **not** make `#` a comment primitive.

---

## 3. Conflict

| Conflict | Winner |
| --- | --- |
| Practice vs sealed protocol package | **Sealed protocol package** (cited version) |
| SDK vs sealed protocol package | **Sealed protocol package** |
| Plugin / demo / lab vs sealed protocol package | **Sealed protocol package** |
| Plugin vs tip draft protocol docs | **Protocol tip docs** (until sealed; then the sealed package) |
| Plugin UX path / fold / highlight vs SDK parse of the same buffer | **SDK parse** (or the host’s verbatim bundle of that parse) |
| Coarser Diff delivery | SDK (practice may summarize) |
| Compatibility / silent repair | SDK ingestion only — **not** wire permission |

Editor Quick Fixes and live JSON inspect are **host aids**, not wire rules.

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
| Editor hosts (non-authoritative) | [../plugins/README.md](../plugins/README.md) · [vscode-xaiop](../plugins/vscode-xaiop/) |
