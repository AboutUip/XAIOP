# Release notes — 2026-08-09 · SDK extreme performance (internal)

[English](release-notes-2026-08-09-sdk-extreme-perf-internal.md) · [简体中文](release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)

| Field | Value |
| --- | --- |
| Node `xaiop` · Java · Python · Go | **0.15.1** tip (no version bump — internal maintenance) |
| Protocol | **0.6.0** Frozen |
| Scope | Pure same-language hot paths; **zero new dependencies** |

## Summary

Cross-runtime extreme-performance pass on Parse · Encode · checkpoint/stream ingest. **Public APIs, wire semantics, and product tree types are unchanged.** Encode output remains **byte-identical** (golden **50/50** × Java/Python/Go + core-wire **46/46**).

Harness: [`../../xaiop-sdk/timing/`](../../xaiop-sdk/timing/) · Hub: [../performance.md](../performance.md).

---

## Constraints (hard)

- Line-wire semantics and product trees (`Object` / `dict` / `LinkedHashMap` / `map[string]any`) unchanged  
- Encode byte-identical vs Node reference  
- No new dependencies; Compat×8 / WS deep logic not rewritten  

---

## Work by area

### Parse (Node leverage + prior Go/Py/Java quick-wins)

| Runtime | Changes |
| --- | --- |
| **Node** | Content first-byte fast path; hand-rolled `isFloatToken`; no-broadcast direct calls (no per-line closures); STRICT one-shot line scan (no materializing `string[]`) |
| Python / Java / Go | (Earlier pass) no-broadcast direct calls, content fast path, hand float / capacity — retained |

### Encode — float token + hot loop

| Runtime | Changes |
| --- | --- |
| Python | `repr` shortest-decimal fast path → ES layout; `Decimal` slow path fallback; head-char `_needs_forced_string`; insertion-order key view |
| Java | `Double.toString` fast path + (k−1) round-trip probe; `BigDecimal` fallback; hand `needsForcedString` / `assertKey`; collapse early-exit |
| Go | `strconv.FormatFloat` fast path; `big.Float` fallback; hand `needsForcedString`; sized wire `strings.Builder` |
| Node | Hand `isNumberLikeToken` / `needsForcedString` / `assertKey` (native float format unchanged) |

Temporary fast/slow differential fuzz (Py/Java/Go) passed on large random sets, then removed.

### Checkpoint / stream ingest

| Runtime | Changes |
| --- | --- |
| **Go** | Engine buffer `[]byte` (no `buffer +=`); demux `carry` `[]byte`; `scanDotsMerged` no per-Push `phaseLines` copy; `XaiopStream.Buffer()` live from engine (no per-Push full-string materialize); value-return `acceptLine` / `readLineAtBytes` |
| Java | Phase-line ownership swap; skip snapshot clone when no `onChunk` |
| Node / Python | Skip snapshot / materialize clone when no chunk consumer; measure-first on `str +=` (runtime already optimizes) |

---

## Results (same machine · depth=3 · breadth=8 gates)

### Stage timing vs saved baseline (negative % = faster)

| Runtime | Highlights | Clean summary |
| --- | --- | --- |
| Node | `parseSync` ~−28–30%; encode ~−9–15%; checkpoint streamOff ~−40% | Up to **20 faster / 0 slower** |
| Go | encode ~−33%; `long/grow-buffer` ~−58%; `chunked-3B` ~−98.5% | **19 faster / 0 slower** |
| Java | encode ~−27–64%; CALLBACK stream ~−69% | **20 faster / 0 slower** (re-run) |
| Python | long-session / D1–D2 ~−20–32%; encode slight | Parse wall-clock noisy ±10% |

Tiny micro-rows (`locate`, sub-ms) may jitter; treat large stages as authoritative.

### Parse ↔ JSON gate

| Runtime | Parse / Node JSON | Secondary | Primary ≤1.2 |
| --- | ---: | ---: | :---: |
| Node | ~2.21× | (same) | No |
| Go | ~2.13× | ~0.61× `encoding/json` **PASS** | No |
| Java | ~1.38× | ~1.24× `Json.parse` | No |
| Python | ~39× | ~17× `json.loads` | No |

**Interpretation:** Primary ≤1.2× Node `JSON.parse` remains a stretch under each runtime’s object-model floor. Go’s **secondary** (beat same-process `encoding/json`) is the reproducible same-language bar and **passes**. Python cannot reach 1.2× Node without changing product tree type or adding native code (explicit non-goals for this pass).

---

## Verification

- Node **688** · Python **487** · Java full suite · `go test ./...`  
- Golden Node↔Java / Python / Go **50/50** each  
- core-wire Python↔Go **46/46**  
- Stage benches + four JSON gates recorded under `xaiop-sdk/timing/*/last-*.json` (gitignored)

---

## Docs updated with this pass

- [../performance.md](../performance.md) — SDK timing hub (LLM metrics stay archived)  
- ALIGNMENT §5: Go / Java / Python (+ Node notes)  
- [`../../xaiop-sdk/timing/README.md`](../../xaiop-sdk/timing/README.md)  

Suggested tip commit only; **no new npm / Maven / PyPI / module version**.
