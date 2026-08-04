# Introduction

[English](introduction.md) · [简体中文](introduction.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `OV-INTRO` |
| Status | Draft |
| Version | 0.3.0-draft |
| Last updated | 2026-08-04 |
| Normative | Mixed (scope and non-goals are normative; background is informative) |
| Depends on | `META-CONV`, `META-VER`, `META-SEP` |
| Informs | `OV-PRIN`, `REQ-FUNC`, `REQ-STREAM`, `CONF` |

---

## 1. Purpose

**XAIOP** is a **streaming, line-oriented, cursor-construction** wire protocol for organizing structured data: writers emit enter / leave / locate / reset / delete instructions; parsers **deterministically materialize** structured values (commonly JSON, including mid-stream phases).

**One line:** the writer walks a cursor; the program holds the tree.

It is **not** a service-to-service JSON bus. It is a bridge from *incremental construction* to *consumable structured snapshots*.

The historical expansion “eXtensible AI Output Protocol” is **legacy naming only**; it does not define scope, primary use case, or conformance. Normative identity is the wire described in sealed protocol packages (see `META-VER`). LLM emit, tooling `encode`, and session push are all **optional writer scenarios** (practice layer), not the wire definition.

Seal rules: [../meta/status-and-versioning.md](../meta/status-and-versioning.md) · [../meta/releases.md](../meta/releases.md). Layers: [../SEPARATION.md](../SEPARATION.md).

---

## 2. Layers

| Layer | Owns | Who |
| --- | --- | --- |
| **Wire (protocol)** | Cursor operators, later-wins, phase reset, honest parse (no silent repair by default) | Any conforming Generator / Parser |
| **Practice** | Recommended ways to *use* the wire (transport, sessions, optional model emit) | Applications |
| **SDK** | Language APIs that implement a **cited sealed** protocol package | Implementations |

```text
Generator (any conforming writer)
        │
        ▼
   XAIOP wire (cursor IR)
        │
        ▼
   Parser / SDK (materialize · phases)
        │
        ▼
   Structured Snapshot / Diff → Consumer
```

---

## 3. Problem Statement (informative)

Formats designed for deterministic programs (notably JSON and XML) often require a finished, globally correct structure in one pass. That hurts long-form and incremental writers:

| Challenge | Impact |
| --- | --- |
| High structural consistency requirements | Fragile long outputs |
| Deep nested state maintenance | Higher failure risk |
| Long-distance syntax dependency | Harder streaming recovery |
| Low tolerance for partial output | Poor incremental UX |
| Reduced stability in streaming generation | Unreliable pipelines |

**Rationale (informative):** XAIOP designs around **local cursor steps** and program-side materialization, rather than forcing writers to emulate brace-pairing serialization — turning a *memory* burden into *next-step* logic. That design goal is independent of whether the Generator is a program, a human, or a model.

---

## 4. Recommended scenarios (not protocol requirements)

These are **practice / product** suggestions. None redefine the sealed wire. Details: [../practice/](../practice/).

| Scenario | Role |
| --- | --- |
| Tooling `encode` | Programmatic Generator of strict wire |
| Streaming consumers | Mid-stream phase Diff + committed / final Snapshot |
| Session push (e.g. WebSocket skeletons) | Fixed-key phase push over a transport |
| Optional LLM emit | See sealed archive [../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/) |

### 4.1 Optional LLM scenario (sealed; not live practice)

LLM emit guidance and structured-output metrics recipes are **target-sealed** — not part of the live practice path:

→ [../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/) · stub [../performance.md](../performance.md)

Format design alone does not guarantee model compliance; that limit stays in the sealed pack so Skills / . advice are not mistaken for wire guarantees.

---

## 5. Goals (normative intent)

The protocol design **MUST** pursue the following goals:

| Goal ID | Goal | Description |
| --- | --- | --- |
| G1 | Generator-friendly | Suited to incremental / local cursor writing; avoid long-range brace commitments |
| G2 | Deterministic parsing | No guessing; no silent repair as parse semantics |
| G3 | Streaming-first | Incremental generation and consumption; phase-friendly materialization |
| G4 | Human-readable | Inspectable and debuggable as text |
| G5 | Cross-writer | Usable across writer families without writer-specific binary encodings |
| G6 | Long-context friendly | Stable under extended outputs |

---

## 6. Non-Goals (normative)

The following are **explicitly out of scope** for XAIOP as a protocol:

| Non-Goal ID | Statement |
| --- | --- |
| NG1 | XAIOP **MUST NOT** be positioned as a replacement for JSON (or similar) as the primary data exchange format between deterministic programs. |
| NG2 | The protocol **MUST NOT** require Generators to perform hashes, checksums, CRCs, length calculations, or cryptographic operations as part of conforming generation. |
| NG3 | Conforming parsers **MUST NOT** be required to repair, infer, or guess Generator intentions when input is not well-formed per the protocol. |
| NG4 | Content encoding is defined in `PROT-CONTENT` / `PROT-SYNTAX`. Structure rules are in `PROT-BOUND` / `PROT-HIER` / `PROT-SYNTAX`. |
| NG5 | This specification tree **MUST NOT** define SDK APIs as protocol requirements. |

**Informative note on NG1:** Product stacks **MAY** push phases from programs (encode, WS sessions) into materializing consumers. That is progressive construction on the wire — not a claim to replace JSON as the service-to-service bus.

---

## 7. In scope / not claimed

| In scope (wire + sealed packages) | Not claimed |
| --- | --- |
| Progressive structured streams (cursor IR → materialize → Snapshot/Diff) | Replacing inter-service JSON |
| Deterministic parse for a cited package version | “Always fewer tokens / always faster than JSON” |
| Immutable sealed package versions (`META-VER`) | “Latest Frozen” without a version number |
| Same wire for tools and sessions | Defining XAIOP as an AI-only prompt format |

---

## 8. Scope of This Document Set (Phase 1)

**In scope for Phase 1:**

- Document conventions and versioning  
- Design principles  
- Shared terminology  
- Format-agnostic functional and streaming requirements  
- Conformance framework placeholders  

**Out of scope for Phase 1:**

- Concrete token grammar / ABNF  
- Complete payload examples binding a wire format  
- Reference implementations and benchmarks  

---

## 9. Actors

| Actor | Role |
| --- | --- |
| Generator | Produces XAIOP text (any conforming source: programs, encode tooling, session push; optional LLM emit) |
| Parser | Deterministically interprets XAIOP text according to the protocol |
| Consumer | Application logic that uses parsed units or streams |
| Downstream system | Stores, transforms, or displays consumed data |

Precise obligations for Generator and Parser appear in `REQ-FUNC` and `REQ-STREAM`.

→ [Design principles](design-principles.md) · [Practice](../practice/) · Root [README.md](../../README.md)
