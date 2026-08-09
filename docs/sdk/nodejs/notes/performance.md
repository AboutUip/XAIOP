# Node.js — performance (stage timing)

[English](performance.md) · [简体中文](performance.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-PERF` |
| Status | Informative |
| Last updated | 2026-08-09 |
| Normative | **No** |

Hub: [../../../performance.md](../../../performance.md) · Harness: [`../../../../xaiop-sdk/timing/`](../../../../xaiop-sdk/timing/) · Internal notes: [../../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md)

---

## 1. How to measure

```bash
cd xaiop-sdk/timing
npm run bench:node:save-baseline
npm run bench:node
npm run bench:node:json-gate          # same-process parseSync vs JSON.parse
npm run bench:node:json-gate:quick
```

Artifacts (gitignored): `timing/node/last-bench.json` · `timing/node/last-json-gate.json` · `timing/node/baseline-bench.json`.

---

## 2. Parse ↔ JSON gate (reference runtime)

Same nested fixture as other SDKs (`Encode(dotPolicy:"none")` wire vs `JSON.stringify` text).

| Gate | Full (depth=3 · breadth=8) | Target |
| --- | ---: | --- |
| `parseSync` / `JSON.parse` | **~2.21×** | ≤ 1.2 (report; V8 object-model floor) |

Primary ≤1.2× remains a stretch: XAIOP builds a Cursor/product tree from line wire; `JSON.parse` is a native C++ path into plain objects.

---

## 3. Extreme-perf round (2026-08-09 · tip 0.15.1)

### Parse (`src/core/parse.ts`)

- Content first-byte fast path (operator-head reject)  
- Hand-rolled `isFloatToken` (no per-token RegExp)  
- `broadcastStacks == null` → direct `writeContent` / enter / pop (no per-line closures)  
- STRICT `parse()` one-shot line scan (lazy `lines`; no full `string[]` on hot path)  

### Encode (`src/core/encode.ts`)

- Hand `isNumberLikeToken` / `needsForcedString` / whitespace·operator key scans (float formatting still native `String(n)`)  

### Checkpoint

- Skip snapshot / materialize clone when no `onChunk` consumer  

### Stage timing (vs same-machine baseline)

| Stage family | Δ% (approx.) |
| --- | --- |
| `parseSync/*` | **−28–30%** |
| `encodeSync/*` | **−9–15%** |
| `checkpoint/streamOff/phased` | **~−40%** |
| Clean re-run | up to **20 faster / 0 slower** |

Correctness: Node suite **688** · product golden **50/50** vs Java/Python/Go.

---

## Related

- Cross-runtime summary: [../../../performance.md](../../../performance.md)  
- Encode pitfalls: [encode-attention.md](encode-attention.md)  
- Streaming parse: [streaming-parse.md](streaming-parse.md)
