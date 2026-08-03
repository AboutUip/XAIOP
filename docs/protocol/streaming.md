# Streaming Semantics

[English](streaming.md) · [简体中文](streaming.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-STREAM` |
| Status | **Frozen** |
| Version | 0.4.0 |
| Last updated | 2026-08-03 |
| Normative | **Normative** |
| Depends on | `PROT-SYNTAX`, `PROT-BOUND`, `PROT-HIER`, `REQ-STREAM` |
| Informs | `CONF` |

---

## 1. Scope

When streamed data becomes valid, and what conforming streaming consumption **MUST** provide.  
Grammar: [syntax.md](syntax.md).

---

## 2. Applicability

Streaming parse is a universal protocol capability — independent of Content encoding and of which Cursor operators are used. No extra configuration required.

---

## 3. Validity

From the first complete Label (and its Content as it arrives), data **MUST** be treated as valid. End-of-stream is **not** required for already completed Blocks.

A Block is complete when the next Label line begins, or at EOF for the final Block.

---

## 4. Native mode

Implementations **MUST** support Block-by-Block parse and consumption without buffering the entire Stream.

---

## 5. JSON-facing consumption

If a JSON surface is exposed, both **MUST** exist:

1. **Snapshot** — full usable JSON of what is parsed so far.  
2. **Diff** — on each newly completed Block, push only that change’s delta; do not re-push unchanged parts.

Concrete API names are implementation details.

**Out of scope here:** network transports, Skills, and SDK method names.  
See [../practice/streaming-transport.md](../practice/streaming-transport.md) for product streaming, and [notes/streaming-attention.md](notes/streaming-attention.md) for a wire-only checklist.

