# Boundary Determination

[English](boundary.md) · [简体中文](boundary.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-BOUND` |
| Status | **Frozen** |
| Version | 0.1.0 |
| Spec title | Boundary & Hierarchy Specification |
| Spec version | v0.1 |
| Last updated | 2026-08-02 |
| Normative | **Normative** |
| Depends on | `PROT-SYNTAX`, `TERM-GLOSS` |
| Informs | `PROT-HIER`, `PROT-STREAM`, `CONF` |

---

## 1. Scope

Authoritative rules for Label-line boundaries and Block extent.  
Full grammar: [syntax.md](syntax.md).

---

## 2. Sole authoritative boundary source

**A line ending is the sole authoritative criterion for the end of a Label line.**

Normative line endings:

- `LF` (`\n`)  
- `CRLF` (`\r\n`)

Both are equivalent. A lone `CR` without following `LF` is **not** a normative line ending.

1. Every Label **MUST** occupy a line by itself.  
2. End of line **MUST** complete that Label declaration.  
3. Content after that Label **MUST** belong to that Label’s Block until the next Label line.

---

## 3. Excluded boundary mechanisms

**MUST NOT** determine Block or Label boundaries:

### 3.1 Brace / bracket pairing

Including `{}`, `[]`, `()`.

### 3.2 Indentation / whitespace counting

### 3.3 Multi-character terminator markers

Examples: `-----`, `<END>`, `###`.  
These are not Cursor operators and are excluded.

---

## 4. Implicit Block termination

1. A Block **MUST NOT** require an independent end marker.  
2. The **next Label line** ends the previous Block.  
3. The final Block ends at **EOF** / stream termination. No extra marker.

---

## 5. Block position

1. A **Block** is the smallest integrated container carrier, not the smallest data atom.  
2. How much Content a Block may carry is decided by the Content Layer / application.  
3. **One line MUST NOT declare multiple Blocks.**  
4. Each Label **MUST** occupy its own line — no exceptions.
