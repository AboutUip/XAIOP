# Protocol Documents — XAIOP Protocol Package v0.7.0 (Draft)

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-INDEX` |
| Status | **Draft** |
| Version | 0.7.0 |
| Last updated | 2026-08-27 |
| Normative | Informative (index) |

---

## Working package

This directory describes the **working XAIOP protocol package v0.7.0 (Draft)**: streaming, line-oriented, cursor-construction wire grammar and semantics. Package **0.6.0** remains Frozen and citable.

**Draft** means the normative text under this version number may still change until seal. Frozen **0.6.0** text is immutable. See [../meta/status-and-versioning.md](../meta/status-and-versioning.md) · [../meta/releases.md](../meta/releases.md).

**Fixture:** [../examples/complex.xaiop](../examples/complex.xaiop) → [../examples/complex.expected.json](../examples/complex.expected.json)

**Isolation:** Protocol is wire-only. Recommended scenarios (including optional LLM emit, transport) → [../practice/](../practice/). Language APIs → [../sdk/](../sdk/). See [../SEPARATION.md](../SEPARATION.md).

---

## Start here

| Order | Document | Use for |
| --- | --- | --- |
| **1** | **[syntax.md](syntax.md)** | **All grammar / line forms** |
| 2 | [boundary.md](boundary.md) | Label/Block line endings |
| 3 | [hierarchy.md](hierarchy.md) | Cursor operators in depth |
| 4 | [content.md](content.md) | `:` typing, Content `\n`/`\r`/`\\`, forced string |
| 5 | [streaming.md](streaming.md) | When streamed wire is valid; protocol-face Snapshot/Diff |

**Core pair:** `>` create/re-enter anonymous object · `<` pop one level only (illegal at Root) · never Bare Labels.  
**Root opener:** `>` / `-` → complete anonymous root document; omit → **root fragment** `"a":{}` — **not** `{"a":{}}`.  
**Array one-line `k:v`:** complete single-property element at array level.  
**`#…`:** **custom annotation transmission** (standalone line; protocol does not interpret text after `#`; no tree effect).

---

## Wire notes (informative)

| Note | Topic |
| --- | --- |
| [notes/](notes/) | Index |
| [notes/wire-attention.md](notes/wire-attention.md) | `.`, later-wins, arrays, roots |
| [notes/streaming-attention.md](notes/streaming-attention.md) | Validity, protocol Snapshot/Diff |

---

## Document IDs

| ID | Path |
| --- | --- |
| `PROT-SYNTAX` | [syntax.md](syntax.md) |
| `PROT-BOUND` | [boundary.md](boundary.md) |
| `PROT-HIER` | [hierarchy.md](hierarchy.md) |
| `PROT-CONTENT` | [content.md](content.md) |
| `PROT-STREAM` | [streaming.md](streaming.md) |
| `PROT-NOTE-INDEX` | [notes/README.md](notes/README.md) |
| `PROT-NOTE-WIRE` | [notes/wire-attention.md](notes/wire-attention.md) |
| `PROT-NOTE-STREAM` | [notes/streaming-attention.md](notes/streaming-attention.md) |
