# Protocol note — streaming attention

[English](streaming-attention.md) · [简体中文](streaming-attention.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-NOTE-STREAM` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** — checklist over `PROT-STREAM` / `PROT-BOUND` |
| Depends on | `PROT-STREAM`, `PROT-BOUND`, `PROT-HIER`, `REQ-STREAM` |

Authority: [../streaming.md](../streaming.md), [../boundary.md](../boundary.md).

---

## 1. Scope

What the **protocol** requires of streaming consumption.  
Does **not** bind network transports, Skills, or any implementation’s Diff checkpoint granularity — see [../../practice/streaming-transport.md](../../practice/streaming-transport.md).

---

## 2. Validity without end-of-stream

1. From the first **complete Label** (and Content as it arrives), data is already valid to consume.  
2. End-of-stream is **not** required for already completed Blocks.  
3. A Block completes when the **next Label line** begins, or at **EOF** for the last Block.

Normative: `PROT-STREAM` §3, `PROT-BOUND`.

---

## 3. Native mode

Implementations **MUST** be able to parse/consume **Block-by-Block** without buffering the entire Stream (`PROT-STREAM` §4).

Line endings define Label boundaries — reassemble transport fragments until a full line exists before interpreting a Label (`REQ-STREAM` framing independence).

---

## 4. JSON-facing surfaces (protocol)

If a JSON surface is exposed, the protocol requires **both**:

| Surface | Meaning |
| --- | --- |
| **Snapshot** | Full usable JSON of what is parsed so far |
| **Diff** | On each newly completed **Block**, push only that change’s delta |

Concrete API names are implementation details.  
**Checkpoint granularity** (Block vs coarser) is an implementation choice — document it outside this protocol note ([../../practice/streaming-transport.md](../../practice/streaming-transport.md)).

---

## 5. Interaction with `.` and later-wins

| Fact | Implication for streaming readers |
| --- | --- |
| `.` resets Cursor only | Prior JSON keys remain until overwritten |
| Later-wins | Snapshot after a later Block may drop earlier same-key **object Content** |
| `>name-` reopen | Array is **re-entered**; elements **append** — Diff/Snapshot accumulate |

Wire details: [wire-attention.md](wire-attention.md).

---

## 6. Generator checklist (streaming, protocol)

- [ ] Emit complete Label lines (including terminating newline) as the unit of Block completion.  
- [ ] Do not put line endings inside Content values.  
- [ ] If Consumers need mid-stream JSON, ensure Blocks (and any agreed checkpoint) actually complete.
- [ ] After `.`, re-address from Root; reopen `>name-` when append across phases is intended.

---

## 7. Consumer checklist (streaming, protocol)

- [ ] Buffer to line boundaries before Label decisions.  
- [ ] Distinguish incomplete trailing Content (still open Block) from completed Blocks.  
- [ ] If exposing Snapshot/Diff, define Diff = completed Block (or document a deliberate narrower policy in practice/SDK docs).
- [ ] Apply later-wins for object keys; treat `>name-` reopen as array append when merging successive views.

---

## Related

- Wire pitfalls: [wire-attention.md](wire-attention.md)  
- Normative: [../streaming.md](../streaming.md)  
- Practice (transport): [../../practice/streaming-transport.md](../../practice/streaming-transport.md)
