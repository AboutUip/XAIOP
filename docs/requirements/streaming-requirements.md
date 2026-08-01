# Streaming Requirements

[English](streaming-requirements.md) · [简体中文](streaming-requirements.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `REQ-STREAM` |
| Status | Draft |
| Version | 0.1.0-draft |
| Last updated | 2026-08-01 |
| Normative | **Normative** |
| Depends on | `REQ-FUNC`, `OV-PRIN`, `TERM-GLOSS` |
| Informs | `CONF`, future `PROT-STREAM` |

---

## 1. Scope

This document defines streaming-oriented requirements that refine Local Independence (P5) and Streaming Native (P6), and bind to `PROT-BOUND` / `PROT-STREAM` / `PROT-SYNTAX`.

---

## 2. Incremental Generation

### SR-G-001 Emit Without End-of-Stream

A conforming Generator under a Streaming profile **MUST** be able to emit complete Units/Blocks before the Stream ends.

- **Trace:** P6, G3

### SR-G-002 Avoid Global Close Dependency

Protocol framing **MUST NOT** require the Generator to emit a single final closing construct that retrospectively validates all prior nested content as the only way to make earlier content consumable.

- **Trace:** P4, P5, P6  
- **Rationale (informative):** Deep “close everything at the end” structures recreate JSON-like long-range risk.

### SR-G-003 Stable Prefixes

Once a Unit/Block has been completed according to future framing rules, later Generator output **MUST NOT** be required to rewrite that completed region for the earlier region to remain Well-Formed.

- **Trace:** P5, P6

---

## 3. Incremental Consumption

### SR-C-001 Partial Results

A conforming Streaming Parser/Consumer path **MUST** expose Partial Results for each complete Unit/Block as soon as framing indicates completion, without waiting for end-of-stream.

- **Trace:** P6, G3

### SR-C-002 Independent Block Parse

Given framing that marks Block boundaries, a conforming Parser **MUST** be able to parse a Block without requiring successful parse of other Blocks in the same Stream, except where a normative dependency is explicitly defined.

- **Trace:** P5

### SR-C-003 Failure Isolation

A Parse Error in one Block **MUST NOT**, by protocol rule, force conforming implementations to discard other already successfully parsed Blocks in the same Stream.

- **Trace:** P5, G3  
- **Note:** Applications **MAY** choose stricter transactional policies; such policies are outside protocol conformance.

---

## 4. Ordering and Identity (Abstract)

### SR-O-001 Order Preservation

Within a single Stream, conforming Parsers **MUST** preserve the relative order of successfully parsed Units/Blocks when delivering Partial Results, unless a future profile explicitly defines reordering.

- **Trace:** G2, P7

### SR-O-002 Optional Identifiers

If future syntax introduces Block identifiers, they **MUST NOT** require Generator-side cryptographic or hash computation (P2). Identifiers, if any, **SHOULD** be simple semantic or ordinal tokens defined by the syntax document.

- **Trace:** P2, P3

---

## 5. Transport Independence

### SR-T-001 Framing vs Transport

Stream framing **MUST** be defined at the protocol text layer. Conformance **MUST NOT** depend on a specific network transport (HTTP, WebSocket, stdio, etc.).

- **Trace:** G5

### SR-T-002 Chunk Boundaries

Transport chunk boundaries **MUST NOT** be assumed to coincide with Block boundaries. Parsers **MUST** reassemble character data before applying Label-line framing (`PROT-BOUND`).

- **Trace:** P7, P6

---

## 6. Relationship to `PROT-BOUND` / `PROT-STREAM`

Structure Layer documents bind these requirements as follows:

1. Block completion in a prefix is defined by next Label line or end-of-stream (`PROT-BOUND`, `PROT-STREAM`).  
2. Partial Results and native Block-by-Block consumption are defined in `PROT-STREAM`.  
3. Snapshot and diff JSON-facing consumption semantics are defined in `PROT-STREAM` §5.  

Claims of Streaming conformance that depend on Structure Layer framing **MUST** cite `PROT-BOUND` and `PROT-STREAM` at the claimed package version (`CONF`).
