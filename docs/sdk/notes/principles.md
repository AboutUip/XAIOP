# SDK note — cross-stack principles

[English](principles.md) · [简体中文](principles.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NOTE-PRIN` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** |

---

## 1. Isolation rules

1. **Wire meaning** comes only from Frozen protocol docs (+ protocol notes as checklists).  
2. **Product how-to** (model emit, network streaming) lives under [../../practice/](../../practice/).  
3. **API shape** (method names, Diff boundary, store IDs, transport helpers) lives in SDK docs/notes.  
4. Compatibility / recovery modes are **SDK ingest** features — never implied by Well-Formed wire.  
5. Encode helpers (JSON→XAIOP) are SDK tooling; LLM bench dual-channel methodology stays separate ([../../performance.md](../../performance.md)).

---

## 2. When documenting Snapshot / Diff

| If the SDK… | Then document in SDK notes… |
| --- | --- |
| Diff on every completed **Block** | Aligns with `PROT-STREAM` §5 |
| Diff on another boundary (e.g. `.` phase) | Explicitly state the boundary and how it relates to Blocks |
| Exposes Snapshot only at EOF | State that progressive Snapshot is unavailable mid-stream |

Protocol baseline: [../../protocol/notes/streaming-attention.md](../../protocol/notes/streaming-attention.md).  
Product framing: [../../practice/streaming-transport.md](../../practice/streaming-transport.md).

---

## 3. Shared consumer advice (any SDK)

1. Final full-document parse (or equivalent Snapshot at EOF) is the authoritative later-wins view.  
2. Mid-stream Diffs must be interpreted with named-array **append** (re-enter) and key overwrite in mind.  
3. Transport framing ≠ Label framing — decode bytes, then line-buffer.  
4. Do not treat compatibility mode as protocol compliance.

Practice (model · transport): [../../practice/](../../practice/).  
Stack-specific: [../nodejs/notes/](../nodejs/notes/).  
Third-party parity checklist: [../behavioral-contract.md](../behavioral-contract.md) (**Node product catalog**; not a cross-language mandate).
