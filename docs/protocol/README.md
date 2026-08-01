# Protocol Documents — XAIOP v0.1.0 (Frozen)

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-INDEX` |
| Status | **Frozen** |
| Version | 0.1.0 |
| Last updated | 2026-08-02 |
| Normative | Informative (index) |

---

## Freeze notice

This package is the **sealed XAIOP protocol v0.1.0**.  
Normative grammar and semantics are complete for Structure (boundary, cursor, arrays) and Content (encoding, typing). Further changes require a new version number.

**Fixture:** [examples/complex.xaiop](../examples/complex.xaiop) → [examples/complex.expected.json](../examples/complex.expected.json)

---

## Start here

| Order | Document | Use for |
| --- | --- | --- |
| **1** | **[syntax.md](syntax.md)** | **All grammar / line forms** |
| 2 | [boundary.md](boundary.md) | Label/Block line endings |
| 3 | [hierarchy.md](hierarchy.md) | Cursor operators in depth |
| 4 | [content.md](content.md) | `:` typing and forced string |
| 5 | [streaming.md](streaming.md) | Streaming validity and JSON APIs |

**Core pair:** `>` create-and-enter anonymous object · `<` pop one level (illegal at Root) · never Bare Labels.  
**Root:** intended root object/array → open with `>` / `-`; no root container → omit.

---

## Document IDs

| ID | Path |
| --- | --- |
| `PROT-SYNTAX` | [syntax.md](syntax.md) |
| `PROT-BOUND` | [boundary.md](boundary.md) |
| `PROT-HIER` | [hierarchy.md](hierarchy.md) |
| `PROT-CONTENT` | [content.md](content.md) |
| `PROT-STREAM` | [streaming.md](streaming.md) |
