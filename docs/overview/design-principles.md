# Design Principles

[English](design-principles.md) · [简体中文](design-principles.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `OV-PRIN` |
| Status | Draft |
| Version | 0.2.0-draft |
| Last updated | 2026-08-03 |
| Normative | **Normative** |
| Depends on | `OV-INTRO`, `META-CONV` |
| Informs | `REQ-FUNC`, `REQ-STREAM`, `TERM-GLOSS`, `CONF`, future `protocol/*` |

---

## 1. Scope

This document elevates the project design philosophy into **normative design constraints**.  
Future wire-format documents **MUST NOT** contradict these principles. Requirements in `REQ-FUNC` and `REQ-STREAM` **MUST** be attributable to one or more principles below (see `META-CONV` §7).

---

## 2. Principle Index

| ID | Name |
| --- | --- |
| P1 | Generator First |
| P2 | Zero Computation |
| P3 | Semantic First |
| P4 | Stateless Generation |
| P5 | Local Independence |
| P6 | Streaming Native |
| P7 | Deterministic Parsing |

---

## 3. P1 — Generator First

When traditional, computer-centric serialization idioms conflict with reliable **incremental / local** generation, the protocol **MUST** prefer designs that keep writer obligations local (enter / leave / locate / reset), not long-range brace pairing or depth bookkeeping.

LLMs are the **primary design reference** for Generator behavior; tool and session writers **MUST** remain valid Generators on the same wire.

**Rationale (informative):** Nested bracket languages and long-range syntactic commitments raise failure rates for long or streaming writers. Historical name of this principle was “AI First”; the ID `P1` is unchanged.

---

## 4. P2 — Zero Computation

The protocol **MUST NOT** require Generators to perform deterministic non-semantic computation as a condition of conformance, including but not limited to:

- hashes  
- checksums  
- CRC  
- length calculation (as a Generator obligation)  
- cryptographic operations  

Generators **MUST** be treated as responsible for **semantic content**. Deterministic computation **MUST** remain the responsibility of programs (parsers, consumers, downstream systems).

**Rationale (informative):** Length and digest fields are frequent sources of Generator error and add no semantic value.

---

## 5. P3 — Semantic First

Protocol surface syntax **SHOULD** minimize burden on expressing meaning.  
Where a design choice trades syntactic cleverness against semantic clarity for Generators, semantic clarity **SHOULD** win.

---

## 6. P4 — Stateless Generation

The protocol **MUST** minimize global structural dependencies that require the Generator to maintain deep mutable syntactic state across distant regions of the output.

Each Generation Unit (see `TERM-GLOSS`) **SHOULD** be producible with local context only, to the extent compatible with application semantics.

---

## 7. P5 — Local Independence

Data Blocks (see `TERM-GLOSS`) **MUST** be designed so that, once the wire format is defined, a Block can be parsed without requiring successful parse of unrelated Blocks in the same Stream, except where a document explicitly defines a normative dependency.

Failure or malformation in one Block **MUST NOT**, by protocol rule, invalidate the parseability of other independently framed Blocks in the same Stream (subject to framing rules in `protocol/*`).

---

## 8. P6 — Streaming Native

The protocol **MUST** support streaming generation and incremental consumption as a first-class concern.  
Consumers **MUST** be able, in a conforming Streaming profile, to act on complete Units as they become available without waiting for end-of-stream, once framing rules are specified.

**Rationale (informative):** Phase boundaries (e.g. `.`) and SDK materialization make progressive Snapshot / Diff practical without rewriting the wire.

---

## 9. P7 — Deterministic Parsing

Parsing **MUST** be deterministic for well-formed input.  
The protocol **MUST NOT** define conforming parse behavior that repairs, infers, or guesses Generator intent for malformed input.

**Rationale (informative):** Repair heuristics create divergent implementations and hide Generator errors.

---

## 10. Conflict Resolution

If two principles appear to conflict in a future design choice:

1. **MUST NOT** violate P2 (Zero Computation) or P7 (Deterministic Parsing) to satisfy another principle.  
2. Among remaining principles, prefer P5 and P6 when the conflict concerns streaming reliability.  
3. Record the decision in the relevant protocol document’s rationale section.
