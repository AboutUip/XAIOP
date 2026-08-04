# Release notes — 2026-08-05 (Node 0.14.1)

[English](release-notes-2026-08-05-0.14.1.md) · [简体中文](release-notes-2026-08-05-0.14.1.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-RELNOTES-2026-08-05-0141` |
| Status | Informative |
| Date | 2026-08-05 |

---

## Packages

| Package | Version | Protocol |
| --- | --- | --- |
| Node.js `xaiop` | **0.14.1** | **0.6.0** Frozen (unchanged) |

---

## Node.js SDK `0.14.1`

Patch on top of [0.14.0](release-notes-2026-08-05.md) Control Root.

### Highlights

- **`#!xaiop/seq/v1`** — stamps **session-log** seq for the following document phase → `meta.logSeq` / `meta.logSeqs`.
- **`pushJson` / `pushObject`** (with `session` / `retainOutbound`) auto-stamp; `ResumeWireLog.wiresAfter` stamps; helpers `encodeSeqFrame` / `stampWireWithLogSeq`.
- **`fromSeq` / ack / `getResumeState().seq` / `logSeq`** prefer log space when stamps are present; connection-local `meta.seq` still resets per socket.
- **Docs:** two-seq-space warning + `mergeChunkWindow` catch-up note (not a bug).

### Suggested Git tag

`sdk-nodejs-v0.14.1`

### Tests

`npm test` — includes cross-reconnect `logSeq` continuity and window-merge `logSeqs`.

---

## Prior

- [release-notes-2026-08-05.md](release-notes-2026-08-05.md) — Node **0.14.0** Control Root foundation
