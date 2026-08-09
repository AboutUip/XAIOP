# Performance

[English](performance.md) · [简体中文](performance.zh-CN.md)

XAIOP documents **two different** “performance” surfaces. Do not mix them.

| Surface | What it measures | Where |
| --- | --- | --- |
| **SDK stage timing** (live) | Same-machine encode / parse / checkpoint / stream wall-clock across Node · Python · Java · Go | [`../xaiop-sdk/timing/`](../xaiop-sdk/timing/) · [release notes 2026-08-09](meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md) |
| **LLM structured-output metrics** (archived) | Model emit quality / dual-channel benches | [archive/practice-llm-emit-2026-08-04/performance.md](archive/practice-llm-emit-2026-08-04/performance.md) · [SEAL](archive/practice-llm-emit-2026-08-04/SEAL.md) |

Published LLM data snapshots (historical): [metrics/](metrics/).

---

## 1. SDK stage timing (authoritative for engine work)

**Purpose:** before/after on **one machine** after Parse / Encode / checkpoint / stream changes. Stage **names match** across runtimes.

```bash
cd xaiop-sdk/timing
npm install
npm run bench:node:save-baseline && npm run bench:node
npm run bench:python:save-baseline && npm run bench:python
npm run bench:java:save-baseline && npm run bench:java
npm run bench:go:save-baseline && npm run bench:go

# Parse ↔ JSON gates (report; hard-fail only if BENCH_FAIL_GATE=1)
npm run bench:node:json-gate
npm run bench:python:json-gate
npm run bench:java:json-gate
npm run bench:go:json-gate
```

Harness README: [`../xaiop-sdk/timing/README.md`](../xaiop-sdk/timing/README.md).

### Parse ↔ JSON gate (same nested fixture)

| Gate | Ratio | Policy |
| --- | --- | --- |
| Primary | `Parse` / Node `JSON.parse` | Target ≤ **1.2** (report; runtime floors apply) |
| Secondary | `Parse` / in-process JSON | Report; ≤ 1.2 preferred |

| Runtime | Full fixture (depth=3 · breadth=8) | Notes |
| --- | --- | --- |
| Node | Parse / `JSON.parse` **~2.21×** | Same-process V8 |
| Go | Parse / Node **~2.13×** · Parse / `encoding/json` **~0.61×** (PASS) | Beats same-process Go JSON |
| Java | Parse / Node **~1.38×** · Parse / `Json.parse` **~1.24×** | Near secondary bar |
| Python | Parse / Node **~39×** · Parse / `json.loads` **~17×** | CPython / `dict` floor |

Parity matrices §5: [sdk/go/ALIGNMENT.md](sdk/go/ALIGNMENT.md) · [sdk/java/ALIGNMENT.md](sdk/java/ALIGNMENT.md) · [sdk/python/ALIGNMENT.md](sdk/python/ALIGNMENT.md) · [sdk/nodejs/notes/performance.md](sdk/nodejs/notes/performance.md).

### Extreme-perf round (2026-08-09 · tip `0.15.1`, no version bump)

Pure same-language hot paths; **byte-identical encode**; golden **50/50** ×3 + core-wire **46/46**.

| Runtime | Stage highlights (vs same-machine baseline) |
| --- | --- |
| Node | `parseSync` ~**−28–30%**; encode ~**−9–15%**; checkpoint streamOff ~**−40%** |
| Go | encode ~**−33%**; `long/grow-buffer` ~**−58%**; `chunked-3B` ~**−98.5%** |
| Java | encode ~**−27–64%**; CALLBACK stream ~**−69%** |
| Python | long-session / D1–D2 ~**−20–32%**; encode slight win |

Full narrative: [meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md).

**Constraints for that round (still in force for follow-ups):** no new dependencies; product tree types unchanged (`Object` / `dict` / `LinkedHashMap` / `map[string]any`); Compat×8 / WS deep logic untouched.

---

## 2. LLM metrics (archived)

Root hubs no longer promote LLM structured-output optimization scoring.

**Canonical copy:** [archive/practice-llm-emit-2026-08-04/performance.md](archive/practice-llm-emit-2026-08-04/performance.md)
