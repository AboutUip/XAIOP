# SDK behavioral contract (third-party parity)

[English](behavioral-contract.md) · [简体中文](behavioral-contract.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-BEHAVE` |
| Status | Informative |
| Last updated | 2026-08-08 |
| Normative | **No** — SDK product catalog (not protocol conformance) |
| Reference implementation (primary) | Node.js `xaiop` **0.15.1** (`xaiop-sdk/nodejs/`) |
| Official Java port | `io.xaiop:xaiop` **0.15.1** — aligned ([java/ALIGNMENT.md](java/ALIGNMENT.md)) |
| Official Python port | `xaiop` **0.15.1** — aligned ([python/ALIGNMENT.md](python/ALIGNMENT.md)) |
| Official Go port | `github.com/AboutUip/XAIOP/xaiop-sdk/go` **0.15.1** — aligned ([go/ALIGNMENT.md](go/ALIGNMENT.md)) |
| Protocol wire | Frozen **v0.6.0** |

**Isolation:** Protocol = **cursor IR** wire only · Practice = writers & transport · This page = **what an SDK must match for official parity** — [../SEPARATION.md](../SEPARATION.md).  
**Stance:** protocol IR ≠ product marketing surface — [../overview/introduction.md](../overview/introduction.md).  
**Conformance:** Protocol levels (`CONF`) do **not** certify SDK APIs ([../conformance/conformance.md](../conformance/conformance.md) §7). **Protocol-conformant ≠ official-SDK-equivalent.**

---

## 1. Purpose

Third-party and other-language SDKs that claim “same level as the official Node package” **SHOULD** implement the behaviors below (defaults, Diff boundary, compat suite, encode policies, WS phase push). Method names may differ; **observable semantics** should not.

Authority for wire grammar remains Frozen protocol docs. This contract documents **SDK product choices** already locked by the Node reference and its tests.

| Need | Document |
| --- | --- |
| Wire grammar / Content typing | [../protocol/](../protocol/) |
| Live practice (transport / sessions) | [../practice/](../practice/) |
| LLM emit (sealed) | [../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/) |
| Node API surface | [nodejs/API.md](nodejs/API.md) · [nodejs/README.md](nodejs/README.md) · [nodejs/notes/](nodejs/notes/) |
| Phase Diff algorithm detail | [nodejs/notes/streaming-parse.md](nodejs/notes/streaming-parse.md) |
| WS session detail | [nodejs/notes/ws-session.md](nodejs/notes/ws-session.md) |

---

## 2. Strict vs compatibility (ingest)

| Rule | Official behavior |
| --- | --- |
| Default parse | **Strict** — every `XaiopSyntaxError` fails immediately |
| Compatibility | **Opt-in** SDK ingest only; never implied by Well-Formed wire |
| Encode | **Always strict** — compat flags never change wire output |
| Fine-grained fixes | Eight independent flags (all **on** when mode is on); see §2.1 |

### 2.1 Compat fix IDs (all default `true` when mode on)

| ID | Effect (summary) |
| --- | --- |
| `forcedRoot` | If first effective line is not `>` / `-`, inject anonymous object root (no fragment) |
| `rewriteBareNameArray` | `name-` → `>name-` when `^[A-Za-z_][A-Za-z0-9_]*-$` |
| `rewriteEnterLine` | Trim; `>  ` → `>`; spaced enter; glued `>key:value` → Content |
| `ignoreBareLeaveAtRoot` | Bare `<` at Root (`stack.length <= 1`) is no-op |
| `popAndRetry` | On syntax error: pop Cursor, retry same line; same message → pop again; changed message → throw new; cannot pop → throw original |
| `locatePathTrim` | `=` miss → trim path whitespace and retry |
| `locatePathStripSpaces` | still miss → strip all spaces in path |
| `locatePathArraySuffix` | still miss → treat trailing `-` on a segment as array key (only if value is array) |

**Policy object semantics (Node):** `false` / omitted → strict; `true` → all fixes on; plain object / `CompatPolicy` → overrides on defaults (unset keys stay `true`). Turning the master switch off **does not** reset per-fix flags; toggling a fix while mode is off is a no-op.

Stack detail: [nodejs/README.md](nodejs/README.md) (Compatibility mode · CompatPolicy).

---

## 3. Document shapes (parse)

| Input | Strict result |
| --- | --- |
| Leading `>` / `-` | Complete object / array document |
| Leading `>name` / Root Content (no anonymous root) | **Fragment** type (not `{ "a": … }` wrapper) |
| Empty source | `{}` |
| Mid-document empty line | Syntax error |
| Per-line BOM (`U+FEFF`) | Stripped |

**JSON-facing stream surfaces** materialize fragments to plain objects (`entries` clone). One-shot engine/static parse **may** preserve the fragment type. Ports that only expose JSON **MUST** document which path they use.

Content typing follows `PROT-CONTENT` (space after `:` forces string; int → float → bool → null → string).

Other locked parser behaviors for parity:

- Object Cursor + bare `>` → **re-enter** (modify); array Cursor + bare `>` → **new element**.
- `>name-` → **re-enter** existing named array (elements **append**); create if missing / wrong type.
- `=` locate: fuzzy over **tree so far** (cross-phase forward); first hit; no create. `@path` → exact from Root, **create** missing objects (本相). `!path` → broadcast all matches on tree so far (outer prune) until `.`.

---

## 4. Encode defaults (JSON → wire)

For values the encoder accepts:

| Option | Official default |
| --- | --- |
| `root` | `auto` |
| `style` | `reset` |
| `dotPolicy` | `perTopLevelKey` |
| `phaseEvery` | `1` (forced for `perTopLevelKey`) |
| `finalDot` | `false` |
| `keyOrder` | `insertion` |
| `nullPolicy` | **`encode`** (`key:null` / `:null`) |
| `undefinedPolicy` | `omit` |

Additional locked rules:

1. `parse(encode(value))` deep-equals `value` (with `-0` → `0`).
2. Same `(value, options)` → identical wire; wire ends with exactly one trailing `\n`.
3. Named arrays **MAY** span `.` phases (`>name-` re-enter appends). Encode default still keeps each named array in one phase for Diff clarity.
4. **Array document root** starts with `-` and **does not** insert object-style top-level `.` phases (`dotPolicy` is ignored for phasing on array roots).
5. Trailing `<` immediately before `.` or EOF may be omitted (redundant with reset / end).
6. Reject keys: empty / whitespace / `:`, trailing `-`, characters `>` `<` = `!`.
7. Reject string values containing CR/LF, or **beginning with U+0020 SPACE** (forced-string marker is not payload — refuse rather than silent strip).
8. Sparse array `undefined` holes → error; object `null` under `omit` drops keys; **array null still encodes** unless `nullPolicy: "error"`.

Full guide: [nodejs/API.md](nodejs/API.md) §4 · [nodejs/notes/encode-attention.md](nodejs/notes/encode-attention.md).

---

## 4.1 Merge / inject (pre/post — not streaming)

| Rule | Official SDK |
| --- | --- |
| Role | Offline merge before send / after receive — **not** WS / `.` Diff transport |
| Operand order | Base **JSON** + overlay **XAIOP** (or JSON via `injectJson` / `mergeJson`) |
| `conflict` | `overwrite` (**default**) or `keep` — **conflicting keys only**; plain objects deep-merge; arrays/scalars atomic at that key; **absent overlay keys are not deletes** |
| Returns | `mergeToJson` → JSON; `mergeToXaiop` → wire (default encode `dotPolicy: "none"`) |
| Engine inject | `injectXaiop` / `injectJson` mutate store by `dataId`; `as: "json"\|"xaiop"` selects return shape |
| Fragments | Stored `XaiopFragment` is materialized before merge |
| vs stream Diff | **Do not** apply `onChunk` Diffs via `mergeJson` — Diff is subtree replace / commit surface; merge is offline deep-merge |

Guide: [nodejs/API.md](nodejs/API.md) §8.

---

## 5. Streaming Diff boundary (official default)

| Concern | Official SDK |
| --- | --- |
| Diff / `onChunk` unit | Default: **merged** complete `.` phases in the buffer window (one emit); `mergeChunkWindow: false` → each `.` phase |
| Async ingest | `pushAsync` / `finishAsync` / `asyncParse: true` — coalesce on `setImmediate` (not a thin Promise around sync) |
| Parse history | Opt-in `historySnapshot` / `historyRealtime` (default **off**). Per-`.` records; snapshot = read-only export/compare/range; realtime = forward-only `jumpTo` (keep node, discard after). See [nodejs/notes/history.md](nodejs/notes/history.md) |
| Empty phase | Chunk value **`null`** |
| Progressive Snapshot | Cumulative parse of committed prefix (`getCommittedSnapshot`) |
| Final Snapshot | Full-buffer parse after finish / peer close (`getSnapshot` / `done`) |
| Mid-stream `getSnapshot` | Typically **undefined** until finish |

### 5.1 Checkpoint algorithm (must match for parity)

```text
buffer += chunk
on each complete "." line:
  raw = slice since last phase start through end of "."
  text = first phase ? raw : injectLeadingDot(raw)
  chunkDiff = emptyPhaseBody(raw) ? null : materialize(parse(text))
  committed = materialize(parse(buffer[0 .. endOfDot]))
  emit chunkDiff
on finish:
  flush remaining tail as last chunk (same inject / empty rules)
  finalSnapshot = materialize(parse(full buffer))   # empty → {}
```

`injectLeadingDot`: if the slice does not already begin with a `.` line, prepend `.\n` (or `.` before a leading newline). Later phases are parsed as Root-reset documents so Cursor rules apply.

Detail + footguns: [nodejs/notes/streaming-parse.md](nodejs/notes/streaming-parse.md).

---

## 6. Stream client surface (Node reference)

Parity-minded ports **SHOULD** expose equivalents of:

| Behavior | Official default / rule |
| --- | --- |
| Delivery modes | Multi-select; default **`callback` only**; cannot disable below callback floor |
| Status machine | `idle → connecting → streaming → completing → completed` (+ `aborted` / `error`) |
| `streamProcessing` | Default **on**; when off, one chunk at finish = full parse |
| Busy `send` | Promise mode → reject; else throw |
| Event listeners | Errors in listeners are isolated (do not fail the stream) |
| Transport | Default `http`; SSE joins multi-`data:` with `\n`; binary uses streaming UTF-8 decoder; empty text not forwarded; timeout aborts |

API: [nodejs/API.md](nodejs/API.md) §6 · [nodejs/notes/streaming-parse.md](nodejs/notes/streaming-parse.md).

**Java (`io.xaiop:xaiop` 0.15.1):** official port aligned with the Node **0.15.1** product surface (protocol **0.6.0**). `XaiopStream` wires consumer options (cover · history · typeCheck · line intercept · Annotation Span · Control Root session/autoAck · `chunks()`) across **HTTP / SSE / RAW / WebSocket**, plus `XaiopWs` listen/connect, phase encode, and `symbolKeys`. Parity: [java/ALIGNMENT.md](java/ALIGNMENT.md).

**Python (`xaiop` 0.15.1):** official port aligned with the same Node **0.15.1** product surface (protocol **0.6.0**; no browser). Stream / WS / control / typeCheck / intercept / Annotation Span / history as in [python/ALIGNMENT.md](python/ALIGNMENT.md).

---

## 7. WebSocket phase sessions (`XaiopWs`)

| Rule | Official behavior |
| --- | --- |
| Phase encode | Force `dotPolicy: "none"`; non-`final` appends `.\n` after trailing newline; `final: true` omits phase separator |
| Later-wins | Concatenated phases parse as one document; reopened `>name-` **appends**; `!path` broadcasts (outer prune) until `.` |
| Handlers | Attach **before** `open` completes (sync server push must not be lost) |
| Connect handshake | Default timeout **15000** ms |
| `end` | Wait `bufferedAmount` up to **2s**, then close `1000` |
| `abort` | `terminate` + close `1001` `"aborted"` |
| Parse / finish fail | Close `1011`, reason = message slice ≤ **120** chars |
| Closed / not OPEN | `push*` returns `false` (encode errors throw **before** send) |

Detail: [nodejs/notes/ws-session.md](nodejs/notes/ws-session.md) · Practice: [../practice/skeleton-stream.md](../practice/skeleton-stream.md).

---

## 8. Third-party checklist

- [ ] Strict default; compat opt-in; encode always strict  
- [ ] Eight compat fixes (or documented subset) with same rewrite / pop-and-retry / locate retries  
- [ ] Fragment vs complete root vs empty `{}`; stream materialize policy stated  
- [ ] Encode defaults + array-root no top-level `.` + trailing `\n` + key hazards + reject leading U+0020 strings  
- [ ] Merge/inject: `overwrite`/`keep` on conflicting keys only; inject mutates store; not streaming  
- [ ] Diff = `.` phase; default **window-merge** (`mergeChunkWindow`); empty → `null` when stepwise; commit vs chunk; leading-`.` inject on later phases  
- [ ] Async ingest optional (`pushAsync` / `asyncParse`) — coalesced, not fake Promise  
- [ ] Parse history optional (`historySnapshot` / `historyRealtime`) — per-`.`; snapshot read-only; realtime forward `jumpTo`
- [ ] Final Snapshot ≡ one-shot parse of full buffer (under same compat)  
- [ ] WS phase `.\n` / `final` / close codes if offering skeleton sessions  

**Official Java port (`io.xaiop:xaiop` 0.15.1):** satisfies this checklist — see [java/ALIGNMENT.md §8](java/ALIGNMENT.md#8-behavioral-contract-8-checklist-java-official-port). Stage timing: [`../../xaiop-sdk/timing/java/`](../../xaiop-sdk/timing/java/) (`StageTimingMain` / `npm run bench:java`). Parse↔JSON gate: [java/ALIGNMENT.md §5](java/ALIGNMENT.md#5-test-map-node--java).

**Official Python port (`xaiop` 0.15.1):** satisfies this checklist — see [python/ALIGNMENT.md §8](python/ALIGNMENT.md). Verification: pytest (~**487**) + `golden-python` (**50** NDJSON cases) + `core-wire` (**46**) + Python fuzz. Stage timing: [`../../xaiop-sdk/timing/python/`](../../xaiop-sdk/timing/python/) (`bench.py`).

**Official Go port (`…/xaiop-sdk/go` 0.15.1):** satisfies this checklist — see [go/ALIGNMENT.md §8](go/ALIGNMENT.md). Verification: `go test ./...` + `golden-go` (**50** NDJSON) + `core-wire` (**46**) + Go fuzz. Cross-validation detail: [go/ALIGNMENT.md §5](go/ALIGNMENT.md#5-verification--cross-validation). Stage timing: [`../../xaiop-sdk/timing/go/`](../../xaiop-sdk/timing/go/) (`npm run bench:go`).

**Node reference (`@bylan280/xaiop` 0.15.1 on [npm](https://www.npmjs.com/package/@bylan280/xaiop)):** suite **688**; stage timing + Parse↔JSON gate: [nodejs/notes/performance.md](nodejs/notes/performance.md) · hub [../performance.md](../performance.md). Extreme-perf tip (2026-08-09, no version bump): [../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md). npm publish: [../meta/release-notes-2026-08-09-nodejs-npm.md](../meta/release-notes-2026-08-09-nodejs-npm.md).

**Golden suites (Node):** `engine.test.js` · `encode.stability.test.js` · `merge.test.js` · `checkpoint.window.test.js` · `stream.consistency.test.js` · `ws.session.test.js` · `ws.phase-encode.test.js`.

---

## Related

- Cross-stack principles: [notes/principles.md](notes/principles.md)  
- Separation: [../SEPARATION.md](../SEPARATION.md)  
- Node guide: [nodejs/README.md](nodejs/README.md)  
- Java parity matrix: [java/ALIGNMENT.md](java/ALIGNMENT.md)
- Python parity matrix: [python/ALIGNMENT.md](python/ALIGNMENT.md)
- Go parity matrix: [go/ALIGNMENT.md](go/ALIGNMENT.md)
- SDK stage timing hub: [../performance.md](../performance.md) · extreme-perf tip: [../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md)
