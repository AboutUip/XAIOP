# SDK note — cross-stack principles

[English](principles.md) · [简体中文](principles.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NOTE-PRIN` |
| Status | Informative |
| Last updated | 2026-09-04 |
| Normative | **No** |

---

## 1. Isolation rules

1. **Wire meaning** comes only from Frozen protocol docs (+ protocol notes as checklists).  
2. **Product how-to** (model emit, network streaming) lives under [../../practice/](../../practice/).  
3. **API shape** (method names, Diff boundary, store IDs, transport helpers) lives in SDK docs/notes.  
4. Compatibility / recovery modes are **SDK ingest** features — never implied by Well-Formed wire.  
5. Encode helpers (JSON→XAIOP) are SDK tooling; LLM bench dual-channel methodology stays separate ([../../performance.md](../../performance.md)).  
6. **Two path notations.** Wire `@` / `=` / `!` / `&` join segments with `>` (`@items>it_1`). Host helpers `parseJsonPath` / `formatJsonPath` (encode cuts, typeCheck, Annotation Span) use JSON-path (`items[0]`, `sections[2].heading`). Do not mix.  
7. **Editor plugins** ([`../../../plugins/`](../../../plugins/)) are optional hosts, **not** wire authority; conflict order: [../../SEPARATION.md](../../SEPARATION.md) §0.

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
5. **Live vs inject.** Cursor ops (`@path`, `:value` append) run on the tree so far: `LiveXaiopParser` / stream / `parse(encode(stored) + patch)`. `injectXaiop` / `mergeToJson` parse the overlay **alone** then JSON-merge (arrays replace as a whole). Do not send `@…` + `:n` patches to inject.  
6. **Encode trailing `\n` vs `feedLine`.** Empty Content line is a syntax error. `encode` ends with `\n`; `parseSync` / `feedText` drop the trailing empty. Do not `split("\n")` encode output into `feedLine`. `feedLine` remains the per-line primitive.  
7. **Encode is not `JSON.stringify`.** Keys must be legal Labels (`:` / empty / whitespace / trailing `-` / operators in the body still fail). `symbolKeys` only escapes a **leading** line-class character. String values: physical CR/LF become `\n` / `\r`; leading U+0020 still refused. Constrain keys on **JSON → encode**; parse the other way is ordinary JSON. This is not NG6 (anonymous-array evolution).

Practice (model · transport): [../../practice/](../../practice/).  
Stack-specific: [../nodejs/notes/](../nodejs/notes/).  
Third-party parity checklist: [../behavioral-contract.md](../behavioral-contract.md) (**Node product catalog**; not a cross-language mandate).
