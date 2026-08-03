# Protocol Documents ? XAIOP v0.2.1 (Frozen)

[English](README.md) � [????](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-INDEX` |
| Status | **Frozen** |
| Version | 0.2.1 |
| Last updated | 2026-08-03 |
| Normative | Informative (index) |

---

## Freeze notice

This package is the **sealed XAIOP protocol v0.2.0**.  
Normative grammar and semantics only ? Structure (boundary, cursor, arrays), Content (encoding, typing), Streaming validity.

**Fixture:** [../examples/complex.xaiop](../examples/complex.xaiop) ? [../examples/complex.expected.json](../examples/complex.expected.json)

**Isolation:** Protocol stays wire-only. Model output and network streaming ? [../practice/](../practice/). APIs ? [../sdk/](../sdk/). See [../SEPARATION.md](../SEPARATION.md).

---

## Start here

| Order | Document | Use for |
| --- | --- | --- |
| **1** | **[syntax.md](syntax.md)** | **All grammar / line forms** |
| 2 | [boundary.md](boundary.md) | Label/Block line endings |
| 3 | [hierarchy.md](hierarchy.md) | Cursor operators in depth |
| 4 | [content.md](content.md) | `:` typing and forced string |
| 5 | [streaming.md](streaming.md) | When streamed wire is valid; JSON Snapshot/Diff *as protocol* |

**Core pair:** `>` create/re-enter anonymous object (array ? new element) � `<` pop one level (illegal at Root) � never Bare Labels.  
**Root opener:** `>` / `-` ? complete anonymous root document; omit ? **root fragment** `"a":{}` ? **not** `{"a":{}}`.  
**Array one-line `k:v`:** complete single-property element at array level ([syntax.md](syntax.md) �6.1).

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
