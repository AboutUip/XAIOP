# Release notes — 2026-08-08 · Java SDK 0.15.1 (internal)

[English](release-notes-2026-08-08-java-0.15.1-internal.md) · [简体中文](release-notes-2026-08-08-java-0.15.1-internal.zh-CN.md)

| Field | Value |
| --- | --- |
| Java `io.xaiop:xaiop` | **0.15.1** (no version bump — internal maintenance) |
| Protocol | **0.6.0** Frozen |
| Reference | Node.js `xaiop` **0.15.1** |

## Summary

Internal performance and structure pass on the Java official port. **Public API and observable Node parity are unchanged.**

### Performance

- **Stream Diff delivery:** `XaiopStream` no longer deep-clones an already-isolated phase Diff before callbacks / events / `chunks()` — matches Node `_deliverChunk` (pass by reference). Snapshot / done getters still clone.
- **History (opt-in):** engine uses ownership transfer (`recordOwned`) + `peekDiff` for emit; adjacent phases may share `after[i]` ≡ `before[i+1]` storage; public getters / export still deep-clone; `viewRange` clones once on return.
- **`Json.deepClone`:** `LinkedHashMap` sized from source map capacity.
- **Parser / Encoder:** path split without `String.split`; float-token check without per-call `Matcher`; encode wire via `StringBuilder`; path-cut encode reuses a mutable path buffer.

Same-machine stage timing (see [`xaiop-sdk/timing`](../../xaiop-sdk/timing/)): main ingest / checkpoint / PROMISE stream stages improved vs pre-change baseline; micro-stages remain noisy.

### Structure

Package-private helpers under `io.xaiop.stream` (not part of the published API surface):

| Helper | Role |
| --- | --- |
| `CheckpointDiffBuild` | Diff build / owned parse / empty-phase / leading-`.` |
| `CheckpointCover` | Cover-mode tombstones / wire join |
| `CheckpointScan` | Line reader / closed-phase records |
| `CheckpointAsync` | Coalesced drain executor |

Public `DotCheckpointEngine` / `ParseHistory` / `XaiopStream` types are unchanged.

### Verification

- `mvn test` — full ported suite green  
- `npm run bench:java` — before/after vs `java/baseline-bench.json`  
- Diff isolation / history / encode robust suites cover the clone and path-cut paths  

Suggested tag (optional maintenance): `sdk-java-v0.15.1` tip commit; no new Maven coordinate.
