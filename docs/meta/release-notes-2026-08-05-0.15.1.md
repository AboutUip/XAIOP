# Release notes — Node.js SDK 0.15.1 (2026-08-05)

[English](release-notes-2026-08-05-0.15.1.md) · [简体中文](release-notes-2026-08-05-0.15.1.zh-CN.md)

| Field | Value |
| --- | --- |
| SDK | **0.15.1** |
| Protocol | **0.6.0** Frozen (unchanged) |
| Kind | Performance patch |

## Summary

Same-machine stage timing vs **0.15.0** baseline (full fixture): **streamOn / emitDiff** paths ~**38–43%** faster; `parseSync+materialize` ~**16%** faster. Protocol semantics and Diff/Commit isolation unchanged.

## Changes

- Faster plain-tree `cloneJson` (hand-walk; no JSON round-trip on protocol trees)
- Diff≡Commit hot path: **one** materialize for Diff; Commit stays live-backed until read (no double clone)
- `LiveXaiopParser.feedLines` / `feedLineFast` for checkpoint bulk feed
- `normalizeEmptyPhase` / `readLine` without regex / extra slices
- Encode: skip collapse alloc when no redundant `<` leaves

## Verify

```bash
cd xaiop-sdk/nodejs && npm test
cd ../../xaiop-sdk/timing && npm run bench   # vs baseline-bench.json
```
