# Java ↔ Node SDK alignment

[English](ALIGNMENT.md) · [简体中文](ALIGNMENT.zh-CN.md)

| Field | Value |
| --- | --- |
| Document | Living parity matrix (Java official port) |
| Java artifact | `io.github.aboutuip:xaiop` **0.16.0** this tree (last Central **0.15.1**; packages `io.xaiop.*`) |
| Node package | `@bylan280/xaiop` **0.16.0** this tree (last npm **0.15.1**) |
| Protocol wire | **0.7.0** Draft (`Xaiop.PROTOCOL_VERSION`) |
| Normative | **No** — product parity inventory (not protocol conformance) |
| Authority | Node reference + [../behavioral-contract.md](../behavioral-contract.md) |

**Isolation:** Protocol = wire only · Practice = transport scenarios · This page = **Java ↔ Node observable-semantics map**.  
**Guide:** [README.md](README.md) · **Contract:** [../behavioral-contract.md](../behavioral-contract.md) · **Code:** [../../../xaiop-sdk/java/](../../../xaiop-sdk/java/)

---

## 1. Purpose & versions

This document is the **definitive parity matrix** for the Java port against the Node.js reference. Method names and idioms differ; **observable semantics** (Diff boundary, compat suite, encode defaults, WS phase push, Control Root, typeCheck, intercept / Annotation Span) must match.

| Stack | Package / artifact | SDK | Protocol | Status |
| --- | --- | --- | --- | --- |
| Node.js (primary) | `@bylan280/xaiop` | **0.16.0** | **0.7.0** Draft | Reference |
| Java (official port) | `io.github.aboutuip:xaiop` | **0.16.0** | **0.7.0** Draft | Aligned |
| Python (official port) | `xaiop` | **0.16.0** | **0.7.0** Draft | Aligned |

Pin the Maven artifact version; read `Xaiop.PROTOCOL_VERSION` for the wire package. Java has **no** `xaiop/browser` subpath — listen and connect share one JDK package (`io.xaiop.ws`).

---

## 2. Feature parity matrix

| Feature | Node | Java | Notes |
| --- | --- | --- | --- |
| Parse (strict / compat) | ✅ | ✅ | `Parse.parse` · `Xaiop.parse` |
| Fragment (`XaiopFragment`) | ✅ | ✅ | Stream surfaces materialize to plain maps |
| Compat ×8 (`CompatPolicy`) | ✅ | ✅ | Same eight fix IDs; master off → toggle no-op |
| Encode (all `dotPolicy` + path cuts) | ✅ | ✅ | Enums for string unions; float = ES `Number::toString` |
| Merge / inject (`overwrite` / `keep`) | ✅ | ✅ | Offline only — not streaming Diff |
| Engine store (`XaiopEngine`) | ✅ | ✅ | Sync-first (`*Sync`); async via `CompletableFuture` |
| Live parse (`LiveXaiopParser`) | ✅ | ✅ | Nested as `Parse.LiveXaiopParser` |
| `&` delete | ✅ | ✅ | Protocol **0.6.0** |
| `#` annotation ignore (parse) | ✅ | ✅ | Protocol **0.6.0** |
| Checkpoint Diff (`.` phase / window-merge) | ✅ | ✅ | Default `mergeChunkWindow=true` |
| Cover Diff (`cover`) | ✅ | ✅ | `&` run → tombstone Diffs + Cursor restore |
| Parse history (snapshot / realtime) | ✅ | ✅ | `ParseHistory` · `jumpTo` |
| Diff isolation (D1) | ✅ | ✅ | Diff never aliased with Commit; stream/WS deliver Diff by reference after engine isolation (same as Node) |
| `@` cumulative Diff (D2) | ✅ | ✅ | Same as Node stepwise / opt rules |
| Buffer compact (`compactCommitted`) | ✅ | ✅ | Long-session wire discard |
| `XaiopStream` HTTP | ✅ | ✅ | `java.net.http.HttpClient` |
| `XaiopStream` SSE | ✅ | ✅ | Multi-`data:` joined with `\n` |
| `XaiopStream` RAW | ✅ | ✅ | `Iterable` / `InputStream` |
| `XaiopStream` WebSocket | ✅ | ✅ | Via `Transport`; long sessions → `XaiopWs` |
| Stream options (cover · history · typeCheck · intercept · annotationSpan · session / autoAck · control callbacks · `chunks()`) | ✅ | ✅ | Wired on `XaiopStream.Options` / setters (0.16.0) |
| typeCheck / TypeRegistry / freeze | ✅ | ✅ | `io.xaiop.types` |
| Line intercept | ✅ | ✅ | `LineIntercept` |
| Annotation Span | ✅ | ✅ | `AnnotationSpan.KEEP` ↔ Node `undefined` keep |
| Control Root (`#!` session / ack / resume / snapshot / seq) | ✅ | ✅ | `io.xaiop.control` |
| `XaiopWs` listen | ✅ | ✅ | Zero-dep RFC6455; `serverSocket` / path / `protocols` / `maxPayload` |
| `XaiopWs` connect | ✅ | ✅ | JDK `HttpClient` WebSocket |
| Phase encode (`phaseEncode`) | ✅ | ✅ | `PhaseEncode` · force `dotPolicy: none` |
| `symbolKeys` (U+001F label escape) | ✅ | ✅ | Encode + parse / checkpoint / stream |

Legend: ✅ = present and aligned at observable-semantics level.

---

## 3. API idiom mapping (Node → Java)

| Node.js | Java |
| --- | --- |
| `async` first, `*Sync` mirrors | **Sync first**; `parseAsync` / `encodeAsync` → `CompletableFuture`; checkpoint `pushAsync` / `finishAsync` coalesce on a daemon thread |
| `encode` (async short) ≡ `encodeAsync`; `encodeSync` → `string` | Java `Encode.encode()` / `Xaiop.encode()` **are the string** (Node `encodeSync`). Async mirror: `Encode.encodeAsync` |
| Plain objects / arrays | `LinkedHashMap<String,Object>` / `ArrayList<Object>`; scalars `String`, `Integer`/`Long`/`Double`, `Boolean`, `null` |
| `undefined` vs `null` | Only `null`; `undefinedPolicy` inert (option-table parity) |
| Annotation Span keep (`return undefined`) | Return `AnnotationSpan.KEEP` |
| Async iterator `for await (const d of stream.chunks())` | Blocking `ChunkPull` / `for (Object d : stream.chunks())` |
| `AbortSignal` / `signal` | `stream.abort()` · `SendOptions.timeoutMs` |
| String unions (`root`, `style`, …) | `EncodeOptions` enums |
| `DOT_POLICY` constants | `DotPolicy` **string** constants (or path array via `dotPolicyPaths`) |
| Options objects | Immutable / fluent builders |
| Eight `setCompat*` setters | `setCompatFix(CompatFixId, boolean)` |
| Top-level `LiveXaiopParser` / `materializeSnapshot` | `Parse.LiveXaiopParser` / `Materialize.materializeSnapshot` |
| One JS `number` | `Integer`/`Long` integers · `Double` floats — compare with `Number#doubleValue()` when needed |
| `throw new TypeError(...)` | `IllegalArgumentException` / `NullPointerException`; protocol → `XaiopSyntaxError` / `XaiopEncodeError` (unchecked) |
| `xaiop` · `xaiop/browser` · `xaiop/core` barrels | Single JAR; import packages directly (no barrel re-export) |
| Attach WS hub to existing `http.Server` | **`ListenOptions.serverSocket(ServerSocket)`** + same-port HTTP multiplex (`GET /health`); JDK `HttpServer` upgrade is not supported |

---

## 4. Package map (Node module → Java package)

| Node module / entry | Java package / type |
| --- | --- |
| `xaiop` facade (`index.ts`) | `io.xaiop.Xaiop` |
| `core/parse.ts` | `io.xaiop.Parse` · `io.xaiop.internal.Parser` |
| `core/encode.ts` | `io.xaiop.Encode` · `io.xaiop.internal.Encoder` |
| `core/merge.ts` | `io.xaiop.Merge` |
| `core/engine.ts` | `io.xaiop.XaiopEngine` |
| `core/compat.ts` | `io.xaiop.compat` |
| `core/checkpoint.ts` | `io.xaiop.stream.DotCheckpointEngine` |
| `core/history.ts` | `io.xaiop.stream.ParseHistory` |
| `core/materialize.ts` | `io.xaiop.stream.Materialize` |
| `core/line-intercept.ts` | `io.xaiop.stream.LineIntercept` |
| `core/annotation-span.ts` | `io.xaiop.stream.AnnotationSpan` |
| `core/phase-encode.ts` | `io.xaiop.stream.PhaseEncode` |
| `core/types.ts` | `io.xaiop.types` |
| `core/control.ts` · `control-host.ts` · `resume-log.ts` | `io.xaiop.control` |
| `node/XaiopStream.ts` · `node/transport.ts` | `io.xaiop.stream.XaiopStream` · `Transport` |
| `node/ws/*` | `io.xaiop.ws` |
| `xaiop/browser` | **N/A** (no browser package) |
| `xaiop/core` | Use `io.xaiop` + `stream` / `types` / `control` directly |

---

## 5. Test map (Node → Java)

| Node test | Java test class |
| --- | --- |
| `engine.test.js` | `EngineTest` · `XaiopTest` · `CompatTest` |
| `encode.test.js` | `EncodeTest` |
| `encode.stability.test.js` | `EncodeRobustTest` |
| `merge.test.js` | `MergeTest` · `MergeRobustTest` |
| `bang.at.test.js` | `BangAtTest` |
| `amp.delete.test.js` | `AmpDeleteTest` |
| `hash.annotation.test.js` | `HashAnnotationTest` |
| `live.parse.test.js` | `LiveParseTest` |
| `checkpoint.window.test.js` | `CheckpointTest` |
| `checkpoint.opt.test.js` | `CheckpointRobustTest` |
| `checkpoint.diff-isolation.test.js` | `CheckpointDiffIsolationTest` |
| `checkpoint.buffer-compact.test.js` | `CheckpointBufferCompactTest` |
| `history.test.js` | `HistoryTest` |
| `stream.test.js` | `StreamTest` · `StreamHttpTest` · `StreamControlTest` |
| `stream.consistency.test.js` | `StreamConsistencyTest` · `StreamAdvancedTest` |
| `typecheck.test.js` | `TypeCheckTest` · `WsTypeCheckTest` |
| `line.intercept.test.js` | `LineInterceptTest` |
| `annotation.span.test.js` | `AnnotationSpanTest` |
| `control.plane.test.js` | `ControlPlaneTest` |
| `control.coverage.test.js` | `ControlCoverageTest` |
| `control.resume.test.js` | `ControlResumeTest` |
| `ws.session.test.js` | `WsSessionTest` · `WsDeepTest` |
| `ws.phase-encode.test.js` | `PhaseEncodeTest` |
| `symbol.keys.test.js` | `SymbolKeysTest` |
| *(surface smoke)* | `SdkSurfaceTest` |

≈37 JUnit classes under `io.xaiop` (ported suite + thin robustness / surface smokes; **564** methods in `mvn test`). Parity is asserted by Java-side expectations transcribed from the Node suite. **Node↔Java golden comparison runs in CI** ([`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) `golden` job — encode / parse / stream Diff NDJSON dumps under [`xaiop-sdk/conformance/`](../../../xaiop-sdk/conformance/)).

**Timing:** same stage names as Node / Python / Go — [`xaiop-sdk/timing/java`](../../../xaiop-sdk/timing/java/) (`npm run bench:java` / `bench:java:quick`).

**Parse ↔ JSON gate** (STRICT one-shot `Parse.parse` vs same-machine JSON on one nested fixture):

```bash
cd xaiop-sdk/timing
npm run bench:java:json-gate:quick   # depth=2 breadth=5
npm run bench:java:json-gate         # depth=3 breadth=8
```

| Side | Input | Op |
| --- | --- | --- |
| JSON | `Json.stringify` of tree | Node `JSON.parse` · `io.xaiop.Json.parse` (not Jackson) |
| XAIOP | `Encode.encode(..., DotPolicy.NONE)` of same tree | `Parse.parse` |

| Gate | Target | Notes |
| --- | --- | --- |
| Primary | `Parse / Node JSON.parse ≤ 1.2` | Report only this round (JVM vs V8 floor) |
| Secondary | `Parse / Json.parse` (report; ≤1.2 preferred) | Same product tree shape; JDK has no std Map JSON |

**Before → after** (same machine, nested fixture; wall-clock; ratios vary ±~0.2× run-to-run):

| Fixture | Parse/Node (primary) | Parse/JavaJSON (secondary) |
| --- | ---: | ---: |
| Baseline quick / full | **~2.5×** / **~1.4×** | **~1.15×** / **~1.27×** |
| After quick / full | **~3.0–3.4×** / **~1.3–1.4×** | **~1.20×** / **~1.08–1.24×** |

Hot-path work: no-broadcast direct calls, content first-byte fast-path, hand-rolled float (already present), `splitLines` capacity, STRICT `assertName` ASCII pass, one-shot line feeder, small map/list capacity hints; **encode** `Double.toString` float fast path (BigDecimal fallback) + hand `needsForcedString`/`assertKey`; **checkpoint** phase-line ownership swap + skip snapshot clone when no `onChunk`. Artifact: `timing/java/last-json-gate.json`.

**Stage timing** (vs baseline · **2026-08-09**): encode ~−27–64%; stream CALLBACK ~−69%; clean re-run **20 faster / 0 slower** (tiny locate/long rows can jitter). Narrative: [../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md) · Hub: [../../performance.md](../../performance.md).

Secondary on the full fixture is near the ≤1.2 bar (~1.08–1.24× `Json.parse`). Primary ≤1.2× Node remains a stretch under JVM/`LinkedHashMap` vs V8. Non-goal: introduce Jackson only for a column, or change product tree type.

---

## 6. ACCEPTABLE differences

These are intentional host-language / packaging differences — **not** parity gaps:

| Topic | Difference |
| --- | --- |
| Sync-first | Java APIs default to blocking; async is explicit (`CompletableFuture`, coalesced `pushAsync`) |
| No browser package | No `xaiop/browser`; WS client + server live under `io.xaiop.ws` |
| `chunks()` | Blocking `Iterable` / `ChunkPull`, not a native async iterator |
| Compat setters | Single `setCompatFix` instead of eight `setCompat*` methods |
| No attach-to-`HttpServer` | JDK `HttpServer` cannot expose the TCP socket for RFC6455 upgrade. Use `ListenOptions.serverSocket(...)` or same-port multiplex (`path` + `GET /health`). Node `listen({ server })` attaches to `http.Server` directly. |
| WS advanced options | Java offers `protocols` / `maxPayload` / `serverSocket` / path filter; `perMessageDeflate` is not implemented (Node `ws` optional) |
| No barrel re-export | Import `io.xaiop.*` / `stream` / `ws` / `types` / `control` as needed |
| Abort | `abort()` + `timeoutMs` instead of DOM/`AbortSignal` |
| `undefined` | Absent; Annotation Span keep uses `AnnotationSpan.KEEP` |
| Number width | Split integer / float JVM types; wire float formatting still matches Node |
| Internal checkpoint helpers | Package-private `CheckpointDiffBuild` / `Cover` / `Scan` / `Async` — not a published API; same observable engine surface |

---

## 7. How parity is verified

1. Ported JUnit scenarios covering the matrix in §2 (see §5).  
2. Shared fixtures (including chunked replay of [../../examples/complex.xaiop](../../examples/complex.xaiop)) and a seeded random JSON corpus.  
3. Encode float surface = ECMAScript `Number::toString` (shortest round-tripping decimal on any JDK) → byte-identical wire for shared fixtures.  
4. Manual / PR review against [../behavioral-contract.md](../behavioral-contract.md).  
5. **Golden CI** — Node and Java dump the same case ids (encode corpus · parse · stream Diffs) to NDJSON; [`compare.mjs`](../../../xaiop-sdk/conformance/compare.mjs) deep-equals trees/diffs and byte-equals wire. See [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) job `golden` and [`xaiop-sdk/conformance/`](../../../xaiop-sdk/conformance/).

**Claim strength:** “verified by the ported suite **and** continuously golden-diffed against Node in CI”.

```bash
cd xaiop-sdk/java && mvn test
cd xaiop-sdk/conformance && npm run golden
cd xaiop-sdk/timing && npm run bench:java:quick   # optional same-machine stage timing
```

---

## 8. Behavioral-contract §8 checklist (Java official port)

All items **satisfied** by `io.github.aboutuip:xaiop` **0.16.0** (see [../behavioral-contract.md](../behavioral-contract.md) §8):

- [x] Strict default; compat opt-in; encode always strict  
- [x] Eight compat fixes with same rewrite / pop-and-retry / locate retries  
- [x] Fragment vs complete root vs empty `{}`; stream materialize policy stated  
- [x] Encode defaults + array-root no top-level `.` + trailing `\n` + key hazards + reject leading U+0020 strings  
- [x] Merge/inject: `overwrite`/`keep` on conflicting keys only; inject mutates store; not streaming  
- [x] Diff = `.` phase; default **window-merge** (`mergeChunkWindow`); empty → `null` when stepwise; commit vs chunk; leading-`.` inject on later phases  
- [x] Async ingest optional (`pushAsync` / `asyncParse`) — coalesced, not fake Promise  
- [x] Parse history optional (`historySnapshot` / `historyRealtime`) — per-`.`; snapshot read-only; realtime forward `jumpTo`  
- [x] Final Snapshot ≡ one-shot parse of full buffer (under same compat)  
- [x] WS phase `.\n` / `final` / close codes (skeleton sessions via `XaiopWs`)  

Third-party ports claiming the same level **SHOULD** still tick this list independently; the official Java and Python ports already do.

---

## Related

- Java guide: [README.md](README.md)  
- Node API: [../nodejs/API.md](../nodejs/API.md)  
- Behavioral contract: [../behavioral-contract.md](../behavioral-contract.md)  
- Releases: [../../meta/releases.md](../../meta/releases.md)
