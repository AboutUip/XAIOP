# Introduction

[English](introduction.md) · [简体中文](introduction.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `OV-INTRO` |
| Status | Draft |
| Version | 0.2.0-draft |
| Last updated | 2026-08-03 |
| Normative | Mixed (scope and non-goals are normative; background is informative) |
| Depends on | `META-CONV`, `META-VER` |
| Informs | `OV-PRIN`, `REQ-FUNC`, `REQ-STREAM`, `CONF` |

---

## 1. Purpose

XAIOP (eXtensible AI Output Protocol) is a line-oriented **cursor construction** protocol for reliable, deterministic, streaming-friendly structured data: writers emit enter / leave / locate / reset instructions; software **materializes** JSON (including mid-stream phases).

Large Language Models are a **typical** Generator, not the only one. Tools (`encode`) and session push (e.g. skeleton WebSocket) use the same wire.

Full product stance: **[positioning.md](positioning.md)**.

---

## 2. Problem Statement (informative)

Formats designed for deterministic programs (notably JSON and XML) ask for a finished, globally correct structure in one pass. That hurts long-form, incremental, and unreliable writers:

| Challenge | Impact |
| --- | --- |
| High structural consistency requirements | Fragile long outputs |
| Deep nested state maintenance | Higher failure risk |
| Long-distance syntax dependency | Harder streaming recovery |
| Low tolerance for partial output | Poor incremental UX |
| Reduced stability in streaming generation | Unreliable pipelines |

**Rationale (informative):** XAIOP designs around **local cursor steps** and program-side materialization, rather than forcing writers to emulate brace-pairing serialization.

**Wedge (informative):** for LLMs, turn a *memory* problem into a *logic* problem. Evidence and conditional gains: **[positioning.md](positioning.md)** · [performance.md](../performance.md).

---

## 3. Architectural Position

```text
Writer (LLM · tool · session push)
 │
 ▼
XAIOP Protocol (cursor IR)
 │
 ▼
Parser / SDK (materialize · phases)
 │
 ▼
Application / Downstream Systems
```

XAIOP sits between writers and application consumption. It is not defined as a general-purpose program-to-program interchange format replacing JSON buses.

---

## 4. Goals (normative intent)

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

## 5. Non-Goals (normative)

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

## 6. Scope of This Document Set (Phase 1)

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

## 7. Actors

| Actor | Role |
| --- | --- |
| Generator | Produces XAIOP text (typically an LLM under prompting or constraints; also encode tooling and session push) |
| Parser | Deterministically interprets XAIOP text according to the protocol |
| Consumer | Application logic that uses parsed units or streams |
| Downstream system | Stores, transforms, or displays consumed data |

Precise obligations for Generator and Parser appear in `REQ-FUNC` and `REQ-STREAM`.
