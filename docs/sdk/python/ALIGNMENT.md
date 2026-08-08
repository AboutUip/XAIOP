# Python ↔ Node SDK alignment

[English](ALIGNMENT.md) · Simplified Chinese: [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)

| Field | Value |
| --- | --- |
| Document | Living parity matrix (Python official port) |
| Python package | `xaiop` **0.15.1** |
| Node package | `xaiop` **0.15.1** |
| Protocol wire | **0.6.0** Frozen (`PROTOCOL_VERSION`) |
| Normative | **No** — product parity inventory (not protocol conformance alone) |
| Authority | Node reference + [../behavioral-contract.md](../behavioral-contract.md) |

**Isolation:** Protocol = wire only · Practice = transport scenarios · This page = **Python ↔ Node observable-semantics map**.  
**Guide:** [README.md](README.md) · **Code:** [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/)  
**No** `xaiop/browser` (same as Java).

---

## 1. Purpose & versions

This document is the **definitive parity matrix** for the Python official port against the Node.js reference. Method names and idioms differ; **observable semantics** (Diff boundary, compat suite, encode defaults, WS phase push, Control Root, typeCheck, intercept / Annotation Span, history) must match.

| Stack | Package | SDK | Protocol | Status |
| --- | --- | --- | --- | --- |
| Node.js (primary) | `xaiop` | **0.15.1** | **0.6.0** | Reference |
| Java (official) | `io.xaiop:xaiop` | **0.15.1** | **0.6.0** | Aligned |
| Python (official port) | `xaiop` | **0.15.1** | **0.6.0** | Aligned |

---

## 2. Feature parity matrix

| Feature | Node | Python | Notes |
| --- | --- | --- | --- |
| Parse (strict / compat) | ✅ | ✅ | `parse_sync` · `CompatPolicy` ×8 |
| Fragment (`XaiopFragment`) | ✅ | ✅ | Stream surfaces materialize to plain maps/lists |
| Compat ×8 (`CompatPolicy`) | ✅ | ✅ | Same eight fix IDs; master off → toggle no-op |
| Encode (all `dotPolicy` + path cuts) | ✅ | ✅ | ES `Number#toString` float tokens |
| Merge / inject (`overwrite` / `keep`) | ✅ | ✅ | Offline only — not streaming Diff |
| Engine store (`XaiopEngine`) | ✅ | ✅ | Sync-first |
| Live parse (`LiveParser`) | ✅ | ✅ | `feed_text` / `feed_line` |
| `&` delete | ✅ | ✅ | Protocol **0.6.0** + cover tombstones |
| `#` annotation ignore (parse) | ✅ | ✅ | Protocol **0.6.0** |
| Checkpoint Diff (`.` phase / window-merge) | ✅ | ✅ | Default `mergeChunkWindow=true` |
| Cover Diff (`cover`) | ✅ | ✅ | `&` run → tombstone Diffs + Cursor restore |
| Parse history (snapshot / realtime) | ✅ | ✅ | `ParseHistory` · `jump_to` · `view_range` · `export_time_root` · … |
| Diff isolation (D1) | ✅ | ✅ | Diff never aliased with Commit |
| `@` cumulative Diff (D2) | ✅ | ✅ | Same as Node stepwise / opt rules |
| Buffer compact (`compact_committed`) | ✅ | ✅ | Long-session wire discard; history gates |
| `XaiopStream` HTTP | ✅ | ✅ | stdlib + optional `httpx` |
| `XaiopStream` SSE | ✅ | ✅ | Multi-`data:` joined with `\n` |
| `XaiopStream` RAW | ✅ | ✅ | iterable / chunks |
| Stream options wiring | ✅ | ✅ | cover · history · typeCheck · intercept · span · control · `chunks()` |
| typeCheck / TypeRegistry / freeze | ✅ | ✅ | `xaiop.types` |
| Line intercept | ✅ | ✅ | `classify_line` · engine chain |
| Annotation Span | ✅ | ✅ | `AnnotationSpan.KEEP` ↔ Node `undefined` keep |
| Control Root (`#!` session / ack / resume / snapshot / seq) | ✅ | ✅ | `xaiop.control` · `ResumeWireLog` |
| Phase encode | ✅ | ✅ | `encode_phase_json` / `encode_phase_object` |
| `symbolKeys` (U+001F label escape) | ✅ | ✅ | Encode + parse / checkpoint / stream |
| `XaiopWs` listen / connect | ✅ | ✅ | optional `websockets` extra |
| Browser entry | ✅ | ❌ | Out of scope |

Legend: ✅ = present and aligned at observable-semantics level.

---

## 3. API idiom mapping (Node → Python)

| Node.js | Python |
| --- | --- |
| `parseSync` / `encodeSync` | `parse_sync` / `encode_sync` |
| `LiveXaiopParser` | `LiveParser` (`feed_text` / `feed_line`) |
| `materializeSnapshot` | `materialize` / `materialize_snapshot` |
| Annotation Span keep (`undefined`) | `AnnotationSpan.KEEP` |
| `for await (chunks())` | sync iterator `chunks()` / `chunks_of` |
| Options objects | kwargs / dict hooks (`mergeChunkWindow` camelCase accepted) |
| `DOT_POLICY` | `DOT_POLICY` string constants |
| Async coalesce `pushAsync` | `push_async` (thread schedule) |
| `history.getAfter` / `viewRange` / `jumpTo` | `get_after` / `view_range` / `jump_to` |
| `RangeError` | `xaiop.RangeError` (`ValueError` subclass) |
| Eight `setCompat*` setters | `CompatPolicy` toggles / fix IDs |
| `AbortSignal` / `signal` | `stream.abort()` |

---

## 4. Package map (Node module → Python)

| Node module / entry | Python module |
| --- | --- |
| `xaiop` facade | `xaiop` (`__init__.py` re-exports) |
| `core/parse.ts` | `xaiop.parse` · `LiveParser` |
| `core/encode.ts` | `xaiop.encode` |
| `core/merge.ts` | `xaiop.merge` |
| `core/engine.ts` | `xaiop.engine` |
| `core/compat.ts` | `xaiop.compat` |
| `core/checkpoint.ts` | `xaiop.checkpoint` · `DotCheckpointEngine` |
| `core/history.ts` | `xaiop.history` · `ParseHistory` |
| `core/materialize.ts` | `xaiop.materialize` |
| `core/line-intercept.ts` | `xaiop.line_intercept` |
| `core/annotation-span.ts` | `xaiop.annotation_span` |
| `core/phase-encode.ts` | `xaiop.phase_encode` |
| `core/types.ts` | `xaiop.types` |
| `core/control*.ts` · `resume-log.ts` | `xaiop.control` |
| `node/XaiopStream.ts` · `transport.ts` | `xaiop.stream` |
| `node/ws/*` | `xaiop.ws` |
| `xaiop/browser` | **N/A** |

---

## 5. Test map (Node → Python)

| Node test | Python test module(s) |
| --- | --- |
| `engine.test.js` | `test_engine.py` · `test_compat.py` · `test_compat_fixes.py` · `test_content.py` · `test_array.py` |
| `encode.test.js` | `test_encode.py` · `test_encode_options.py` · `test_encode_robust.py` |
| `encode.stability.test.js` | `test_encode_stability.py` |
| `merge.test.js` | `test_merge.py` |
| `bang.at.test.js` | `test_bang_at.py` · `test_ops.py` |
| `amp.delete.test.js` | `test_amp_delete.py` · `test_ops.py` |
| `hash.annotation.test.js` | `test_hash_annotation.py` |
| `live.parse.test.js` | `test_live.py` |
| `checkpoint.window` · `opt` · `diff-isolation` | `test_checkpoint.py` · `test_checkpoint_window.py` · `test_checkpoint_compact.py` |
| `checkpoint.buffer-compact.test.js` | `test_checkpoint_compact.py` |
| `history.test.js` | `test_history.py` |
| `stream.test.js` | `test_stream.py` · `test_stream_http.py` · `test_stream_advanced.py` |
| `stream.consistency.test.js` | `test_stream_consistency.py` |
| `typecheck.test.js` | `test_types.py` · `test_ws_typecheck.py` |
| `line.intercept.test.js` | `test_line_intercept.py` |
| `annotation.span.test.js` | `test_annotation_span.py` |
| `control.plane` · `coverage` · `resume` | `test_control.py` · `test_control_resume.py` · `test_control_coverage.py` |
| `ws.session.test.js` · `ws.phase-encode` | `test_ws.py` · `test_phase_encode.py` · `test_ws_typecheck.py` |
| `symbol.keys.test.js` | `test_symbol_keys.py` |
| *(core-wire STRICT)* | `test_core_wire_corpus.py` |
| *(surface / fixtures)* | `test_complex.py` · `test_root_fragment.py` · `test_modes.py` · `test_version.py` |

**Scale (local):** `pytest` ≈ **487** methods under `xaiop-sdk/python/tests/`. Parity is asserted by Python-side expectations transcribed from the Node suite, plus **Node↔Python golden** in CI.

**Timing:** same stage names as Node — [`xaiop-sdk/timing/python/bench.py`](../../../xaiop-sdk/timing/python/bench.py) (`npm run bench:python`).

---

## 6. Acceptable differences

| Topic | Difference |
| --- | --- |
| Sync-first | Public API defaults to blocking; async is explicit (`push_async`, thread schedule) |
| No browser package | No `xaiop/browser`; WS under `xaiop.ws` |
| `chunks()` | Sync iterator, not native async iterator |
| Optional extras | `[http]`=`httpx`, `[ws]`=`websockets` |
| Stream transports | `XaiopStream` is HTTP / SSE / RAW; WebSocket uses `XaiopWs` (not a stream transport kind) |
| `undefined` | Absent; Annotation Span keep uses `AnnotationSpan.KEEP` |
| Number width | Python `int`/`float`; wire float formatting still matches Node ES `Number#toString` |

---

## 7. How parity is verified

1. Ported pytest scenarios covering the matrix in §2 (see §5).  
2. Shared fixtures under [`xaiop-sdk/conformance/fixtures/`](../../../xaiop-sdk/conformance/fixtures/) (encode corpus · operator wires · complex).  
3. Encode float surface = ECMAScript `Number#toString` → byte-identical wire for shared fixtures.  
4. Review against [../behavioral-contract.md](../behavioral-contract.md).  
5. **Golden CI** — Node and Python dump the same case ids to NDJSON; [`compare.mjs`](../../../xaiop-sdk/conformance/compare.mjs) deep-equals trees/diffs and byte-equals wire. Job: `golden-python` in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml).

**Claim strength:** verified by the expanded pytest suite, continuously golden-diffed against Node in CI, plus Python ↔ Go STRICT core-wire and mutation fuzz.

```bash
cd xaiop-sdk/python && python -m pip install -e ".[dev,http,ws]" && pytest
cd xaiop-sdk/conformance && npm run golden:python
cd xaiop-sdk/conformance && npm run core-wire
python xaiop-sdk/conformance/fuzz/fuzz-python.py --max=100 --seed=1
```

**Golden coverage (product):** encode corpus (**30** values) + parse/stream for ten fixtures (`complex`, `stream-phases`, `overwrite-id`, `delete-phases`, `at-array-d2`, `bang-broadcast`, `d1-named-enter`, `locate-equals`, `hash-ignore`, `at-exact`) → **50** NDJSON cases.

**Separate track:** Python ↔ Go STRICT core-wire (`npm run core-wire`) remains for protocol wire only — not a substitute for Node product golden.

---

## 8. Behavioral-contract §8 checklist

- [x] Strict default; compat opt-in; encode always strict  
- [x] Eight compat fixes  
- [x] Fragment vs complete root vs empty `{}`; stream materialize policy stated  
- [x] Encode defaults + trailing `\n` + SPACE-leading refuse + ES float tokens  
- [x] Merge/inject offline  
- [x] Diff = `.` phase; default **window-merge**; empty → `null` stepwise; cover tombstones  
- [x] Async ingest optional (`push_async`) — coalesced  
- [x] Parse history optional (snapshot / realtime) — `jump_to` forward-only  
- [x] Final Snapshot ≡ one-shot parse of full buffer (under same compat)  
- [x] WS phase encode / listen + connect  

---

## Related

- Python guide: [README.md](README.md)  
- Java alignment (template peer): [../java/ALIGNMENT.md](../java/ALIGNMENT.md)  
- Behavioral contract: [../behavioral-contract.md](../behavioral-contract.md)  
- Conformance: [../../../xaiop-sdk/conformance/](../../../xaiop-sdk/conformance/)  
- Releases: [../../meta/releases.md](../../meta/releases.md)
