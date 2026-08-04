# SEAL — practice-llm-emit-2026-08-04

| Field | Value |
| --- | --- |
| Seal ID | `ARCHIVE-LLM-EMIT-2026-08-04` |
| Kind | Target seal (informative archive) |
| Date | 2026-08-04 |
| Protocol tip at seal | **0.6.0** Frozen |
| SDK tip at seal | Node.js `xaiop` **0.13.0** |
| Immutable intent | Do not silently rewrite sealed bodies for marketing; fix broken relative links only |

## What was sealed

1. Optional LLM / Generator emit practice (`PRACTICE-MODEL`).
2. LLM structured-output metrics recipe (`PERF-METRICS`).

## What was removed from live hubs

- Root README “Evidence (optional LLM scenario)” badge walls and screenshot galleries.
- Live practice index primary row promoting model-output as first guide.
- Top-nav Metrics badge pointing at LLM performance narrative.

## Authority after seal

| Concern | Live authority |
| --- | --- |
| Wire | `docs/protocol/` (sealed packages via `docs/meta/`) |
| SDK | `docs/sdk/nodejs/API.md` (tip **0.13.0**) |
| Live practice | streaming-transport · skeleton-stream |
| LLM emit / LLM metrics | **This archive only** |
