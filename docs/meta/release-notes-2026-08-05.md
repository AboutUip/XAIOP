# Release notes — 2026-08-05

[English](release-notes-2026-08-05.md) · [简体中文](release-notes-2026-08-05.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-RELNOTES-2026-08-05` |
| Status | Informative |
| Date | 2026-08-05 |

---

## Packages

| Package | Version | Protocol |
| --- | --- | --- |
| Node.js `xaiop` | **0.14.0** | **0.6.0** Frozen (unchanged) |
| Java `io.xaiop:xaiop` | *(no bump)* | still **0.4.0** wire |

---

## Node.js SDK `0.14.0`

### Highlights

- **SDK Control Root (`#!`)** — product convention (not a Frozen grammar rewrite): lines whose first two characters are `#` `!` are demuxed **before** parse / Annotation Span.
- **Official capabilities** under `#!xaiop/…/v1`: `types`, `session`, `ack`, `resume`, `snapshot`.
- **Unknown `#!`:** discard + `XaiopControlError` (`onControlError`); never enter the wire pipeline; connection not aborted by default.
- **Line-interleaved demux** on WS / Stream (CRLF wire preserved); whole-message types frames without trailing LF remain compatible.
- **Phase seq** on `onPhase` / `onChunk` meta (`seq` / `seqs`); resume from `fromSeq + 1` without historical Diff replay; optional snapshot seed.
- **Producer outbound log:** `session` / `retainOutbound` auto-records `pushJson`/`pushObject`; `ResumeWireLog` for durable cross-reconnect (app-owned).
- **Annotation Span** hard-skips `#!` (defense in depth).
- **Stream** `onChunk(diff, meta)` now forwards phase seq metadata.

### Suggested Git tag

`sdk-nodejs-v0.14.0`

### Docs

- [sdk/nodejs/notes/control-plane.md](../sdk/nodejs/notes/control-plane.md)
- [sdk/nodejs/API.md](../sdk/nodejs/API.md) §7.7
- Index: [releases.md](releases.md)

### Pack

```bash
cd xaiop-sdk/nodejs
npm run pack    # → dist/xaiop-0.14.0.tgz
```

### Tests

`npm test` runs all `test/*.test.js` (control plane / resume / coverage included).

---

## Prior notes

- [release-notes-2026-08-04.md](release-notes-2026-08-04.md) — Node **0.13.0** · Java **0.5.0**
