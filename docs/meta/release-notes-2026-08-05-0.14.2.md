# Release notes — 2026-08-05 (Node 0.14.2)

[English](release-notes-2026-08-05-0.14.2.md) · [简体中文](release-notes-2026-08-05-0.14.2.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-RELNOTES-2026-08-05-0142` |
| Status | Informative |
| Date | 2026-08-05 |

---

## Packages

| Package | Version | Protocol |
| --- | --- | --- |
| Node.js `xaiop` | **0.14.2** | **0.6.0** Frozen (unchanged) |

---

## Node.js SDK `0.14.2`

Patch on top of [0.14.1](release-notes-2026-08-05-0.14.1.md).

### Highlights

- **D1 — Diff isolation:** after a prior `.`, phase-local Diff no longer treats named enter (`>rules-`) / Content as a bare fragment. Synthetic object root (`>\n`) when the live document is an object and the phase does not already open with bare `>` / `-`. Same complete phase sequence agrees for one `push` vs per-phase `push`, and for `mergeChunkWindow` on/off. Diff failure falls back to cumulative committed Diff (Commit is kept).
- **Narrative:** intro NG6 + practice [keyed-state-modeling.md](../practice/keyed-state-modeling.md) — keyed / named-path state evolution; **not** a universal JSON patch layer.
- **Docs:** [streaming-parse.md](../sdk/nodejs/notes/streaming-parse.md) Diff document-root note.

### Suggested Git tag

`sdk-nodejs-v0.14.2`

### Tests

`npm test` — includes `test/checkpoint.diff-isolation.test.js`.

---

## Prior

- [release-notes-2026-08-05-0.14.1.md](release-notes-2026-08-05-0.14.1.md) — Node **0.14.1** `meta.logSeq`
- [release-notes-2026-08-05.md](release-notes-2026-08-05.md) — Node **0.14.0** Control Root foundation
