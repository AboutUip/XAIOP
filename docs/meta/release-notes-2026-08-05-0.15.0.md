# Release notes — 2026-08-05 (Node 0.15.0)

[English](release-notes-2026-08-05-0.15.0.md) · [简体中文](release-notes-2026-08-05-0.15.0.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-RELNOTES-2026-08-05-0150` |
| Status | Informative |
| Date | 2026-08-05 |

---

## Packages

| Package | Version | Protocol |
| --- | --- | --- |
| Node.js `xaiop` | **0.15.0** | **0.6.0** Frozen (unchanged) |

---

## Node.js SDK `0.15.0`

Minor on top of [0.14.3](release-notes-2026-08-05-0.14.3.md).

### Highlights

- **`bufferStats()`** — `{ length, committedAt, pendingBytes, openPhase }` without reading the full receive string.
- **`compactCommitted({ dropHistory? })`** — discard `buffer[0..committedAt)` while keeping the live Commit tree and any uncommitted tail. Long-session steady state without re-parse.
- **History conflict (strategy A):** `historyRealtime` + `retainWireHistory`, or any non-empty history, rejects compact unless `{ dropHistory: true }` (clears `ParseHistory` nodes).
- **Surfaces:** `DotCheckpointEngine`, `XaiopStream` (Node + browser), WS connection / browser client.
- **Docs:** [streaming-parse.md](../sdk/nodejs/notes/streaming-parse.md) — buffer compact section.
- **Docs / tests:** expanded `checkpoint.buffer-compact.test.js`; streaming-parse + history contracts use MUST language for compact / history conflicts.

### Suggested Git tag

`sdk-nodejs-v0.15.0`

### Tests

`npm test` — includes `test/checkpoint.buffer-compact.test.js`.

---

## Prior

- [release-notes-2026-08-05-0.14.3.md](release-notes-2026-08-05-0.14.3.md) — Node **0.14.3** `@` cumulative Diff (D2)
- [release-notes-2026-08-05-0.14.2.md](release-notes-2026-08-05-0.14.2.md) — Node **0.14.2** Diff isolation (D1)
