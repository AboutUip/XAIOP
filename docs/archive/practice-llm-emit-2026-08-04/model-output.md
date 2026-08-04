# Practice — model output

[English](model-output.md) · [简体中文](model-output.zh-CN.md)

> **Sealed archive** — live hubs no longer promote this path. Index: [README.md](README.md) · [SEAL.md](SEAL.md).

| Field | Value |
| --- | --- |
| Document ID | `PRACTICE-MODEL` |
| Status | Informative |
| Last updated | 2026-08-04 |
| Normative | **No** |

**Recommended scenario** — not the wire definition. Authority for wire meaning: [../../protocol/](../../protocol/).  
This page is optional guidance for **Generators that choose to emit** XAIOP (including LLMs) in product use.

---

## 1. Role split

| Actor | Job |
| --- | --- |
| **Model / Generator** | Emit Well-Formed XAIOP lines (cursor moves + Content) |
| **Parser / SDK** | Interpret lines → JSON (strict by default) |
| **App** | Consume Snapshot / Diff / done JSON |

Do **not** ask the model to invent JSON braces “and also somehow be XAIOP.” Teach one Skill; parse with a conforming implementation.

Skills in this repo: [../../../skills/xaiop/](../../../skills/xaiop/) · [../../../skills/xaiop-allowlist/](../../../skills/xaiop-allowlist/)

---

## 2. What the model must get right

Cite protocol checklists; do not redefine them here:

- Root: complete document (`>` / `-`) vs fragment — [../../protocol/notes/wire-attention.md](../../protocol/notes/wire-attention.md)  
- `.` resets Cursor only; later-wins; `>name-` reopen **re-enters** and **appends**  
- No Bare Labels; no CR/LF inside values; forced string when needed  

Practical emit pattern for progressive UI:

1. Open root with `>`.  
2. Finish a logical top-level section.  
3. Emit `.` when the **consumer** should see a mid-stream update (if using a Diff boundary tied to `.`).  
4. Re-enter from Root after `.` (`>` then next keys).  
5. Named arrays **MAY** span phases (`>name-` appends). Keeping one array in one phase is optional Diff clarity, not a protocol requirement.

---

## 3. Evaluation vs tooling

| Concern | Rule |
| --- | --- |
| LLM **metrics** benches | Native dual channel — model emits XAIOP directly; do not score JSON→XAIOP translation ([./performance.md](./performance.md)) |
| **Tools / tests / adapters** | SDK `encode` (JSON→XAIOP) is allowed and documented under SDK — not a bench substitute |

---

## 4. Compatibility mode (ingest only)

If production parsers enable SDK compatibility recovery, that is an **ingest** choice for imperfect model output — **not** permission for the model to emit illegal wire. Prefer fixing the Skill / prompt.

---

## 5. Related

- Introduction: [../../overview/introduction.md](../../overview/introduction.md)  
- Streaming in products: [streaming-transport.md](../../practice/streaming-transport.md)  
- Protocol streaming semantics: [../../protocol/streaming.md](../../protocol/streaming.md)
