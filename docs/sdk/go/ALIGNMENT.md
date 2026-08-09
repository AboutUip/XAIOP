# Go ↔ Node SDK alignment

[English](ALIGNMENT.md) · Simplified Chinese: [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)

| Field | Value |
| --- | --- |
| Document | Living parity matrix (Go official port) |
| Go module | `github.com/AboutUip/XAIOP/xaiop-sdk/go` · SDK **0.15.1** |
| Node package | `@bylan280/xaiop` **0.15.1** (npm) |
| Protocol wire | **0.6.0** Frozen (`xaiop.ProtocolVersion`) |
| Normative | **No** — product parity inventory |
| Authority | Node reference + [../behavioral-contract.md](../behavioral-contract.md) |

**Guide:** [README.md](README.md) · **API:** [API.md](API.md) · **Code:** [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/)  
**No** browser entry (same as Java / Python).

---

## 1. Purpose & versions

| Stack | Package / module | SDK | Protocol | Status |
| --- | --- | --- | --- | --- |
| Node.js (primary) | `@bylan280/xaiop` | **0.15.1** | **0.6.0** | Reference |
| Java (official) | `io.xaiop:xaiop` | **0.15.1** | **0.6.0** | Aligned |
| Python (official) | `xaiop` | **0.15.1** | **0.6.0** | Aligned |
| Go (official port) | `…/xaiop-sdk/go` | **0.15.1** | **0.6.0** | Aligned |

---

## 2. Feature parity matrix

| Feature | Node | Go | Notes |
| --- | --- | --- | --- |
| Parse (strict / compat) | ✅ | ✅ | `Parse` STRICT; `ParseWithOptions` · Compat ×8 + `symbolKeys` wired |
| Fragment | ✅ | ✅ | `Fragment` |
| Compat ×8 | ✅ | ✅ | `xaiop/compat` + ingest rewrites / pop-and-retry / locate retries |
| Encode (dotPolicy + path cuts) | ✅ | ✅ | ES `Number#toString` · OrderedObject insertion |
| Merge / inject | ✅ | ✅ | `MergeJSON` · `MergeToJSON` / `MergeToXAIOP` · Engine inject |
| Engine store | ✅ | ✅ | `Engine` sync-first |
| Live parse | ✅ | ✅ | `LiveParser` |
| `&` delete / `#` ignore | ✅ | ✅ | Cursor-chain forbid · cover tombstones |
| Checkpoint Diff / cover / history | ✅ | ✅ | `xaiop/stream` |
| Diff isolation (D1) / `@` Diff (D2) | ✅ | ✅ | |
| Buffer compact | ✅ | ✅ | `CompactCommitted` |
| `XaiopStream` HTTP / SSE / RAW | ✅ | ✅ | |
| Stream options wiring | ✅ | ✅ | |
| typeCheck / TypeRegistry | ✅ | ✅ | `xaiop/types` |
| Line intercept / Annotation Span | ✅ | ✅ | `AnnotationSpanKeep` sentinel |
| Control Root (`#!`) | ✅ | ✅ | `xaiop/control` demux / ingest / resume log |
| Phase encode | ✅ | ✅ | `PhaseEncodeJSON` / KeyValue |
| `symbolKeys` | ✅ | ✅ | U+001F encode + decode on parse |
| `XaiopWs` listen / connect | ✅ | ✅ | stdlib RFC6455 subset · `xaiop/ws` |
| Browser entry | ✅ | ❌ | Out of scope |

---

## 3. API idiom mapping (Node → Go)

| Node.js | Go |
| --- | --- |
| `parseSync` / `encodeSync` | `Parse` / `Encode` |
| `parseSync(src, true)` / CompatPolicy | `ParseWithOptions` · `compat.Resolve` |
| `LiveXaiopParser` | `LiveParser` |
| `materializeSnapshot` | `Materialize` / `MaterializeSnapshot` |
| Annotation Span keep (`undefined`) | `AnnotationSpanKeep` |
| `for await (chunks())` | `Chunks() <-chan any` |
| Options objects | structs |
| `AbortSignal` | `Abort()` / `context.Context` |

---

## 4. Package map

| Node | Go |
| --- | --- |
| `xaiop` facade | `xaiop` |
| `core/compat.ts` | `xaiop/compat` |
| `core/checkpoint.ts` · history | `xaiop/stream` |
| `core/control*.ts` | `xaiop/control` |
| `core/types.ts` | `xaiop/types` |
| `node/XaiopStream.ts` | `xaiop/stream` |
| `node/ws/*` | `xaiop/ws` |

---

## 5. Verification & cross-validation

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go
cd xaiop-sdk/conformance && npm run core-wire
cd xaiop-sdk/go && go run ./cmd/fuzz-go -max=100 -seed=1
```

| Gate | What it proves | Count / scope |
| --- | --- | --- |
| `go test ./...` | Unit + package parity vs Node/Python suites | `xaiop` · `stream` · `control` · `types` · `ws` (Compat ×8 · `&`/`!`/`@`/`#` · encode/merge · D1/D2 · cover · framing · demux · WS) |
| `npm run golden:go` | Node ↔ Go **product** NDJSON | **50** cases — encode corpus **30** + parse **10** + stream **10** |
| `npm run core-wire` | Python ↔ Go **STRICT** protocol wire | **46** cases |
| `cmd/fuzz-go` | Mutation crash budget | CI / local seed runs |

**Product golden fixtures** (`xaiop-sdk/conformance/fixtures/`):

- Encode: `encode-corpus.json` (indices `encode:0` … `encode:29`)
- Parse + stream (`mergeChunkWindow: false`): `complex` · `stream-phases` → `stream:phases` · `overwrite-id` · `delete-phases` · `at-array-d2` · `bang-broadcast` · `d1-named-enter` · `locate-equals` · `hash-ignore` · `at-exact`

**Claim strength:** Go package tests + Node↔Go product golden (**50**) + Python↔Go STRICT core-wire (**46**) + fuzz. CI job: `golden-go` in `.github/workflows/ci.yml`.

**Timing:** same stage names as Node / Python / Java — [`xaiop-sdk/timing/go`](../../../xaiop-sdk/timing/go/) (`npm run bench:go` / `bench:go:quick`).

**Parse ↔ JSON gate** (STRICT one-shot `Parse` vs same-machine JSON on one nested fixture):

```bash
cd xaiop-sdk/timing
npm run bench:go:json-gate:quick   # depth=2 breadth=5
npm run bench:go:json-gate         # depth=3 breadth=8
```

| Side | Input | Op |
| --- | --- | --- |
| JSON | `JSON.stringify` / `json.Marshal` of tree | Node `JSON.parse` · Go `encoding/json.Unmarshal` |
| XAIOP | `Encode(..., DotPolicy:"none")` of same tree | Go `xaiop.Parse` |

| Gate | Target | Notes |
| --- | --- | --- |
| Primary | `Parse / Node JSON.parse ≤ 1.2` | V8 ≈ browser-class JSON engine |
| Secondary | `Parse / encoding/json` (report; ≤1.2 preferred) | Same-process Go fairness |

**Before → after** (same machine, nested fixture; wall-clock; ratios vary ±~0.2× run-to-run):

| Fixture | Parse/Node (primary) | Parse/GoJSON (secondary) |
| --- | ---: | ---: |
| Baseline quick / full | **~3.8×** / **~5.3×** | **~1.5×** / **~1.5×** |
| After quick / full | **~1.3–1.5×** / **~1.7–2.1×** | **~0.45–0.55×** / **~0.55–0.62×** |

Hot-path work: no-broadcast direct calls, hand-rolled float scanner, content first-byte fast-path, one-shot line feeder (no `[]string`), typed cursor frames, array header sync-on-pop, parser `sync.Pool`, STRICT `assertName` ASCII fast-path; **encode** native float token fast path + hand `needsForcedString` + sized wire `Builder`; **checkpoint/stream** `[]byte` ingest (no `buffer +=`), demux `carry` `[]byte`, merge-scan no per-Push `phaseLines` copy, live `Buffer()` (no per-Push full-string materialize). Artifact: `timing/go/last-json-gate.json`.

**Stage timing** (vs same-machine baseline after the **2026-08-09** extreme-perf round): encode ~−33%; `checkpoint/long/grow-buffer` ~−58%; `stream.send/PROMISE/chunked-3B` ~−98.5%; summary **19 faster / 0 slower** on a clean run. Narrative: [../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md) · Hub: [../../performance.md](../../performance.md).

Primary ≤1.2× Node remains a stretch while Go `encoding/json`→`map[string]any` itself is typically **~2.5–3.5×** Node on this fixture (runtime/hashmap floor; non-goal: change product tree type). Secondary (beat same-process `encoding/json`) is the reproducible same-runtime bar and currently **passes** (~0.5–0.6×).

---

## 6. Acceptable differences

| Topic | Difference |
| --- | --- |
| Sync-first | Blocking API; async via channels / goroutines |
| No browser | WS under `xaiop/ws` only |
| `undefined` | `AnnotationSpanKeep` sentinel |
| Numbers | `int64` / `float64`; wire float = ES `Number#toString` |
| WS | Zero-dep stdlib RFC6455 subset |

---

## 8. Behavioral-contract §8 checklist

- [x] Strict default; compat opt-in; encode always strict  
- [x] Eight compat fixes  
- [x] Fragment vs complete root vs empty `{}`; stream materialize policy stated  
- [x] Encode defaults + trailing `\n` + SPACE-leading refuse + ES float tokens  
- [x] Merge/inject offline  
- [x] Diff = `.` phase; default **window-merge**; empty → `null` stepwise; cover tombstones  
- [x] Async ingest optional — coalesced / channel Chunks  
- [x] Parse history optional — `JumpTo` forward-only  
- [x] Final Snapshot ≡ one-shot parse of full buffer (under same compat)  
- [x] WS phase encode / listen + connect  
