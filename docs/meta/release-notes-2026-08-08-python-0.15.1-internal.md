# Release notes — 2026-08-08 · Python SDK 0.15.1 (internal)

[English](release-notes-2026-08-08-python-0.15.1-internal.md) · [简体中文](release-notes-2026-08-08-python-0.15.1-internal.zh-CN.md)

| Field | Value |
| --- | --- |
| Python `xaiop` | **0.15.1** (no version bump — internal maintenance) |
| Protocol | **0.6.0** Frozen |
| Reference | Node.js `xaiop` **0.15.1** |

## Summary

Cautious internal performance and structure pass on the official Python port. **Public API and observable Node parity are unchanged.**

### Performance / robustness

- **`materialize_snapshot` / `materialize_owned`:** route through hand-walk `clone_json` (Node `cloneJson`) instead of `copy.deepcopy` on the Diff / snapshot hot path.
- **`XaiopEngine.get_sync`:** same `clone_json` surface (no `deepcopy`).
- **History (opt-in):** `record_owned` + `peek_diff` / `peek_after` for engine ingest/emit; adjacent phases may share `after[i]` ≡ `before[i+1]`; public getters still deep-clone; `view_range` clones once on return.

Stream Diff delivery was already by-reference (Node-aligned); left unchanged.

### Structure

- New package-private module `xaiop._checkpoint_ops` — Diff wire shaping, cover tombstones, line scan helpers (moved out of `checkpoint.py`).
- `DotCheckpointEngine` stays the public class in `xaiop.checkpoint`.

### Verification

- `pytest` — full suite green  
- `npm run bench:python` — before/after vs `python/baseline-bench.json`  

Suggested tag (optional): tip of `sdk-python-v0.15.1`; PyPI version unchanged.
