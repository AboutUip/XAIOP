# Conformance

[English](conformance.md) · [简体中文](conformance.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `CONF` |
| Status | **Frozen** |
| Version | 0.2.1 |
| Last updated | 2026-08-03 |
| Normative | **Normative** |
| Depends on | `REQ-FUNC`, `REQ-STREAM`, `META-VER`, `TERM-GLOSS`, `PROT-SYNTAX`, `PROT-BOUND`, `PROT-HIER`, `PROT-CONTENT`, `PROT-STREAM` |
| Informs | `protocol/*`, implementations |

---

## 1. Scope

This document defines what it means to claim XAIOP conformance, and how Conformance Levels bind to Structure and Content documents in package **0.2.0 (Frozen)**.

---

## 2. General Rules

1. Conformance claims **MUST** name the specification package version (e.g. `0.2.0`).
2. Conformance claims **MUST** name one or more Conformance Levels from Section 3.
3. Implementations **MUST NOT** claim conformance to `Reserved` documents.
4. Implementations **MAY** claim `Structure`, `Streaming`, and `Core` against the Frozen documents in this package.
5. Meeting informative guidance alone **MUST NOT** be described as conformance.

---

## 3. Conformance Levels

### 3.1 Level `Foundation`

An implementation or document set claims **Foundation** when it:

| ID | Requirement |
| --- | --- |
| CF-F-001 | Adheres to language and keyword conventions in `META-CONV` when authoring normative material about XAIOP. |
| CF-F-002 | Does not contradict `OV-PRIN` in published protocol-facing behavior descriptions. |
| CF-F-003 | Honors NG2 and NG3: no Generator-required digests/lengths; no mandated silent repair. |
| CF-F-004 | Uses glossary terms consistently with `TERM-GLOSS` when those terms are used in a normative sense. |

**Foundation** does **not** assert Structure Layer or Content Layer implementation.

### 3.2 Level `Structure` (Boundary & Hierarchy)

An implementation claims **Structure** when it:

| ID | Requirement |
| --- | --- |
| CF-ST-001 | Conforms to `PROT-BOUND` and the boundary rules in `PROT-SYNTAX`. |
| CF-ST-002 | Conforms to `PROT-HIER` / `PROT-SYNTAX` (`>` create-and-enter; `<` pop-only; `<` illegal at Root; no Bare Labels; array rules; root declaration §2). |
| CF-ST-003 | Interprets terms per `TERM-GLOSS`. |

**Structure** does **not** by itself assert full Content typing. Content claims use **Core**.

### 3.3 Level `Core`

**Core** requires **Structure** plus Content:

| ID | Requirement |
| --- | --- |
| CF-C-001 | Conform to `PROT-SYNTAX` and `PROT-CONTENT`. |
| CF-C-002 | Satisfy array/object rules in `PROT-HIER` / `PROT-SYNTAX` (including anonymous object via `>`). |
| CF-C-003 | Satisfy applicable `REQ-FUNC` obligations. |

### 3.4 Level `Streaming`

**Streaming** requires **Structure**, plus:

| ID | Requirement |
| --- | --- |
| CF-S-001 | Conform to `PROT-STREAM`. |
| CF-S-002 | Satisfy `REQ-STREAM` obligations for the claimed role (Generator, Parser, or both). |
| CF-S-003 | Provide Partial Results for completed Blocks without requiring end-of-stream. |
| CF-S-004 | If a JSON-facing surface is exposed, provide snapshot and diff consumption semantics per `PROT-STREAM` §5. |

When Content is also claimed, Streaming **SHOULD** be claimed together with **Core** (Structure + Content + Streaming).

---

## 4. Roles

Claims **SHOULD** state the role:

| Role | Typical obligations |
| --- | --- |
| Generator-only | Applicable `FR-G-*`, `SR-G-*` |
| Parser-only | Applicable `FR-P-*`, `SR-C-*`, `SR-O-*`, `SR-T-*` |
| Full stack | Union of Generator and Parser obligations for the claimed levels |

---

## 5. Prohibited Claims

The following claims are **prohibited**:

1. “XAIOP Content-complete” / full `Core` without citing `PROT-SYNTAX` / `PROT-CONTENT` and version.  
2. Structure Layer conformance while using brace pairing, indentation counting, or multi-character terminators as boundary mechanisms.  
3. “Self-healing” or “best-effort repair” as a conforming parse mode.  
4. Conformance that depends on AI computing checksums or lengths as protocol requirements.  
5. Treating order independence as a default guarantee when relative Cursor operators are used.  
6. Treating Bare Labels as valid, or creating anonymous objects without `>`.  
7. Treating array `>` as “empty element without enter”, or omitting `<` when a next sibling is required after an entered element.  
8. Using `-` as an in-array sibling separator.  
9. Writing `<` at Root.  
10. Intending a root object or root array without opening with `>` or `-` respectively (`PROT-SYNTAX` §2).

---

## 6. Future Profiles

Editors **MAY** define named Profiles (e.g. `Structure+Streaming`).  
Profiles **MUST** reference explicit Conformance Levels and document IDs.

---

## 7. Relationship to Implementations

SDKs and tools **MAY** implement XAIOP, but SDK APIs are not themselves conformance objects under this document (`OV-INTRO` NG5).  
Conformance is assessed against protocol requirements, not against a particular SDK surface.
