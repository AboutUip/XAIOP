# Document Conventions

[English](document-conventions.md) · [简体中文](document-conventions.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-CONV` |
| Status | Draft |
| Version | 0.1.0-draft |
| Last updated | 2026-08-01 |
| Normative | **Normative** |
| Depends on | — |
| Informs | All specification documents |

---

## 1. Scope

This document defines how XAIOP specification documents are structured, labeled, cross-referenced, and interpreted.  
All documents in `docs/` **MUST** follow these conventions unless a document explicitly states a documented exception.

---

## 2. Language Policy

1. Each logical document exists as an **English** file (default) and a **Chinese** mirror named `*.zh-CN.md`.
2. The English text is **authoritative** (normative source of truth).
3. Chinese mirrors **MUST** preserve the same section numbering and document ID.
4. If English and Chinese disagree, implementations and reviews **MUST** follow the English text.
5. Translational notes that are not present in English **MUST** be marked as informative and **MUST NOT** introduce new normative requirements.

---

## 3. Document Header

Every specification document **MUST** begin with:

1. A level-1 title  
2. Language switch links (`English` · `简体中文`)  
3. A metadata table containing at least:

| Field | Required | Description |
| --- | --- | --- |
| Document ID | Yes | Stable short ID (e.g. `REQ-FUNC`) |
| Status | Yes | Per [Status and Versioning](status-and-versioning.md) |
| Version | Yes | Spec package version string |
| Last updated | Yes | ISO date `YYYY-MM-DD` |
| Normative | Yes | `Normative`, `Informative`, or mixed (stated per section) |
| Depends on | Yes | Document IDs or `—` |
| Informs | Yes | Document IDs or `—` |

---

## 4. Normative vs Informative

### 4.1 Normative

Normative text defines requirements that affect conformance.  
Keywords defined in Section 5 apply only in normative context.

### 4.2 Informative

Informative text provides rationale, examples, or guidance.  
Informative text **MUST NOT** be used alone to claim conformance.

### 4.3 Rationale Blocks

Authors **SHOULD** separate rationale from requirements using an explicit heading or callout labeled **Rationale (informative)**.

---

## 5. Requirement Keywords

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and **OPTIONAL** in this document set are to be interpreted as described in [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119) and clarified by [RFC 8174](https://datatracker.ietf.org/doc/html/rfc8174) when, and only when, they appear in all capitals.

### 5.1 Chinese Keyword Mapping (informative for readers)

| English | Chinese (in ZH mirrors) |
| --- | --- |
| MUST / SHALL / REQUIRED | 必须 |
| MUST NOT / SHALL NOT | 禁止 |
| SHOULD / RECOMMENDED | 应该 |
| SHOULD NOT | 不应 |
| MAY / OPTIONAL | 可以 |

Chinese keywords are translational equivalents. Normative force is defined by the English keywords in the authoritative text.

---

## 6. Cross-References

1. Cross-references **MUST** use relative Markdown links.
2. References to other specs **SHOULD** include the Document ID on first mention in a section (e.g. `REQ-FUNC`).
3. Forward references to reserved protocol documents **MUST** state that the target is not yet normative.

---

## 7. Requirement Attribution

Every normative `MUST` / `MUST NOT` in requirements documents **SHOULD** be traceable to:

- a design principle in `OV-PRIN`, or  
- an explicit goal or non-goal in `OV-INTRO`.

Orphan requirements without attribution **SHOULD NOT** be introduced.

---

## 8. Document Roles

| Role | Description |
| --- | --- |
| Meta | Conventions and process for the spec itself |
| Overview | Problem framing, scope, principles |
| Terminology | Defined terms |
| Requirements | Format-agnostic obligations (Phase 1) |
| Conformance | How conformity is claimed |
| Protocol | Wire format, data model, streaming semantics (later) |

---

## 9. Prohibited Content in Spec Docs

Specification documents in this tree **MUST NOT**:

1. Define SDK APIs or language bindings as protocol requirements  
2. Require AI generators to compute hashes, checksums, CRCs, byte lengths, or cryptographic values as protocol obligations  
3. Mandate silent repair, inference, or guessing of malformed input as part of conforming parse behavior  

---

## 10. Change Control

Editorial and normative changes follow [Status and Versioning](status-and-versioning.md).
