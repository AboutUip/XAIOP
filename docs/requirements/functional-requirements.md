# Functional Requirements

[English](functional-requirements.md) · [简体中文](functional-requirements.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `REQ-FUNC` |
| Status | Draft |
| Version | 0.1.0-draft |
| Last updated | 2026-08-01 |
| Normative | **Normative** |
| Depends on | `OV-INTRO`, `OV-PRIN`, `TERM-GLOSS`, `META-CONV` |
| Informs | `REQ-STREAM`, `CONF`, future `protocol/*` |

---

## 1. Scope

This document states **format-agnostic** functional requirements for Generators and Parsers.  
Concrete syntax obligations will appear in reserved protocol documents and **MUST** refine—not contradict—these requirements.

Each requirement lists **Trace** to principles (`P*`) and/or goals/non-goals (`G*` / `NG*`).

---

## 2. Generator Requirements

### FR-G-001 Textual Output

A conforming Generator **MUST** emit XAIOP as human-inspectable text suitable for transport as a character stream, once the wire format is defined.

- **Trace:** G4, P1

### FR-G-002 No Non-Semantic Computation

A conforming Generator **MUST NOT** be required by the protocol to compute hashes, checksums, CRCs, cryptographic values, or length fields as part of producing conforming output.

- **Trace:** P2, NG2

### FR-G-003 Semantic Content Responsibility

A conforming Generator **MUST** be treated as responsible only for semantic content and protocol-required framing characters defined by future syntax documents—not for program-side integrity digests.

- **Trace:** P2, P3

### FR-G-004 Local Production

Protocol design and Generator guidance **MUST** prefer Generation Units that can be produced without long-range syntactic commitments beyond what application semantics require.

- **Trace:** P4, P3

### FR-G-005 Cross-Model Neutrality

The protocol **MUST NOT** require Generator-side features that exist only for a single proprietary model family (for example, model-specific binary token protocols) as a condition of conformance.

- **Trace:** G5, P1

---

## 3. Parser Requirements

### FR-P-001 Deterministic Interpretation

For the same protocol version and the same Well-Formed input, conforming Parsers **MUST** produce equivalent abstract results (same information content for defined Data Model mappings once specified).

- **Trace:** P7, G2

### FR-P-002 No Silent Repair

A conforming Parser **MUST NOT** rewrite Malformed input into a guessed Well-Formed form as part of conforming parse behavior.

- **Trace:** P7, NG3

### FR-P-003 Explicit Failure

When input is Malformed per applicable protocol rules, a conforming Parser **MUST** signal a Parse Error (or equivalent deterministic failure outcome) rather than returning a silently “fixed” structure.

- **Trace:** P7, G2

### FR-P-004 No Inference of Intent

A conforming Parser **MUST NOT** be required to infer missing semantic fields or Generator intent beyond what Well-Formed input literally encodes under the protocol.

- **Trace:** P7, NG3, P3

### FR-P-005 Program-Side Computation

Integrity checks, length verification, hashing, and similar deterministic operations—if used by an application—**MUST** be performed by programs, not demanded of the Generator by the protocol.

- **Trace:** P2

---

## 4. Protocol Design Requirements (Editors)

These bind future `protocol/*` drafts:

### FR-D-001 Principle Compatibility

Future normative protocol text **MUST NOT** contradict `OV-PRIN`.

- **Trace:** `OV-PRIN` §1

### FR-D-002 Attribution

New `MUST` / `MUST NOT` rules in protocol drafts **SHOULD** cite principle or goal IDs.

- **Trace:** `META-CONV` §7

### FR-D-003 Non-Replacement of JSON

Protocol rationale and positioning **MUST** remain consistent with NG1: XAIOP is not a general program-to-program JSON replacement.

- **Trace:** NG1

### FR-D-004 Human Readability

The chosen wire format **MUST** remain human-readable as text under normal tooling (editors, logs).

- **Trace:** G4

---

## 5. Deferred Bindings

The following **MUST** be specified before Core conformance can be fully tested against a wire format:

| Deferred item | Planned document |
| --- | --- |
| Lexical / syntactic grammar | `PROT-SYNTAX` |
| Abstract data model mapping | `PROT-MODEL` |
| Error code / class catalog | `PROT-ERROR` |
| Extension rules | `PROT-EXT` |

Until those documents leave `Reserved` status, claims of full wire-format conformance **MUST NOT** be made (see `CONF`).
