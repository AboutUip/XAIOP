# Introduction

[English](introduction.md) · [简体中文](introduction.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `OV-INTRO` |
| Status | Draft |
| Version | 0.1.0-draft |
| Last updated | 2026-08-01 |
| Normative | Mixed (scope and non-goals are normative; background is informative) |
| Depends on | `META-CONV`, `META-VER` |
| Informs | `OV-PRIN`, `REQ-FUNC`, `REQ-STREAM`, `CONF` |

---

## 1. Purpose

XAIOP (eXtensible AI Output Protocol) is an AI-native output protocol for reliable, deterministic, streaming-friendly structured data generation by Large Language Models (LLMs) and consumption by software systems.

---

## 2. Problem Statement (informative)

Modern AI applications increasingly rely on LLMs to generate structured data. Formats originally designed for deterministic programs (notably JSON and XML) introduce challenges during long-form and streaming generation:

| Challenge | Impact |
| --- | --- |
| High structural consistency requirements | Fragile long outputs |
| Deep nested state maintenance | Higher failure risk |
| Long-distance syntax dependency | Harder streaming recovery |
| Low tolerance for partial output | Poor incremental UX |
| Reduced stability in streaming generation | Unreliable pipelines |

**Rationale (informative):** XAIOP approaches the problem by designing the protocol around how AI naturally generates structured information, rather than forcing AI to emulate traditional serialization formats.

---

## 3. Architectural Position

```text
LLM
 │
 ▼
XAIOP Protocol
 │
 ▼
Application / Downstream Systems
```

XAIOP sits between model output and application consumption. It is not defined as a general-purpose program-to-program interchange format.

---

## 4. Goals (normative intent)

The protocol design **MUST** pursue the following goals:

| Goal ID | Goal | Description |
| --- | --- | --- |
| G1 | AI-native | Suited to LLM generation behavior |
| G2 | Deterministic parsing | No guessing; no silent repair as parse semantics |
| G3 | Streaming-first | Incremental generation and consumption |
| G4 | Human-readable | Inspectable and debuggable as text |
| G5 | Cross-model | Usable across model families without model-specific binary encodings |
| G6 | Long-context friendly | Stable under extended outputs |

---

## 5. Non-Goals (normative)

The following are **explicitly out of scope** for XAIOP as a protocol:

| Non-Goal ID | Statement |
| --- | --- |
| NG1 | XAIOP **MUST NOT** be positioned as a replacement for JSON (or similar) as the primary data exchange format between deterministic programs. |
| NG2 | The protocol **MUST NOT** require AI generators to perform hashes, checksums, CRCs, length calculations, or cryptographic operations as part of conforming generation. |
| NG3 | Conforming parsers **MUST NOT** be required to repair, infer, or guess AI intentions when input is not well-formed per the protocol. |
| NG4 | Content encoding is defined in `PROT-CONTENT` / `PROT-SYNTAX`. Structure rules are in `PROT-BOUND` / `PROT-HIER` / `PROT-SYNTAX`. |
| NG5 | This specification tree **MUST NOT** define SDK APIs as protocol requirements. |

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
| Generator | Produces XAIOP text (typically an LLM under prompting or constraints) |
| Parser | Deterministically interprets XAIOP text according to the protocol |
| Consumer | Application logic that uses parsed units or streams |
| Downstream system | Stores, transforms, or displays consumed data |

Precise obligations for Generator and Parser appear in `REQ-FUNC` and `REQ-STREAM`.
