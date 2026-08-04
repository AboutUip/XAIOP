# Release notes — 2026-08-05 (Node 0.14.3)

[English](release-notes-2026-08-05-0.14.3.md) · [简体中文](release-notes-2026-08-05-0.14.3.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-RELNOTES-2026-08-05-0143` |
| Status | Informative |
| Date | 2026-08-05 |

---

## Packages

| Package | Version | Protocol |
| --- | --- | --- |
| Node.js `xaiop` | **0.14.3** | **0.6.0** Frozen (unchanged) |

---

## Node.js SDK `0.14.3`

Patch on top of [0.14.2](release-notes-2026-08-05-0.14.2.md).

### Highlights

- **D2 — `@` cumulative Diff:** phases containing `@` use the same cumulative Diff path as `=` / `!` / `&`. Protocol **MAY** keep `@` Diff phase-local; Node product Diff does **not**, so create-vs-enter into a prior-phase named array matches live Commit. Framing split of `@orders` after `>orders-` no longer emits an object-shaped Diff or throws on a later multi-element append.
- **`onChunk` optional:** omit / non-function → Diff delivery no-ops; Commit / final still run. Fixes crash with `emitDiff: false` and no `onChunk`.
- **Docs:** [streaming-parse.md](../sdk/nodejs/notes/streaming-parse.md) — D2 + optional `onChunk`.
- **Tests:** `test/checkpoint.diff-isolation.test.js` (D1 + D2 + emitDiff).

### Suggested Git tag

`sdk-nodejs-v0.14.3`

### Tests

`npm test` — includes researcher repro for chunked `@` into named arrays.

---

## Prior

- [release-notes-2026-08-05-0.14.2.md](release-notes-2026-08-05-0.14.2.md) — Node **0.14.2** Diff isolation (D1)
- [release-notes-2026-08-05-0.14.1.md](release-notes-2026-08-05-0.14.1.md) — Node **0.14.1** `meta.logSeq`
- [release-notes-2026-08-05.md](release-notes-2026-08-05.md) — Node **0.14.0** Control Root foundation
