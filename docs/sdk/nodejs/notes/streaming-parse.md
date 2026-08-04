# Node.js note — streaming parse (XAIOP → JSON)

[English](streaming-parse.md) · [简体中文](streaming-parse.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-STREAM` |
| Status | Informative |
| Last updated | 2026-08-05 |
| Normative | **No** — Node SDK behavior |
| Code | `xaiop-sdk/nodejs/src/stream/` |
| Package | `xaiop` **0.7.0+** (protocol wire **0.6.0**; buffer compact **0.15.0+**; `@` cumulative Diff / optional `onChunk` **0.14.3+**; Diff isolation **0.14.2+**; Control Root / `meta.logSeq` **0.14.1+**) |

**Protocol baseline (read first):**  
[../../../protocol/notes/wire-attention.md](../../../protocol/notes/wire-attention.md) ·  
[../../../protocol/notes/streaming-attention.md](../../../protocol/notes/streaming-attention.md)

This note covers **only** the Node.js JSON-facing stream path. It does not change Frozen wire meaning.

---

## 1. Verdict

| Concern | Assessment |
| --- | --- |
| Final document (`done` / completed snapshot) | **Robust** — matches one-shot `parseSync` under tested framings |
| Mid-stream JSON Diff | **Phase-based** (`.` checkpoints), not Block-by-Block as `PROT-STREAM` §5 literally suggests |
| Main risk | Semantic misuse (phase Diff ≠ cumulative Snapshot) — not random byte loss when lines are LF/CRLF |

---

## 2. Pipeline (implementation)

```text
Transport text → DotCheckpointEngine.push
  → scan complete "." lines
  → feed phase wire into LiveXaiopParser (once; keeps cumulative tree)
  → materialize live tree → committedSnapshot
  → Diff = phase-local parse (or shared committed for `=`/`!`/`&`/`@` after a prior `.`)
  → onChunk(diff, meta?)   # meta.seq / meta.seqs when phaseSeq on (0.14.0+); meta.logSeq when stamped (0.14.1+)
  → finish(): flush tail; reuse last commit when buffer fully covered
```

| Layer | Path |
| --- | --- |
| Client | `src/stream/XaiopStream.js` · API [../API.md](../API.md) |
| Checkpoint | `src/stream/checkpoint.js` |
| Control demux | `src/core/control.ts` (peels `#!` before parse; [control-plane.md](control-plane.md)) |
| Live parse | `LiveXaiopParser` in `src/parse.js` |
| Materialize | `src/stream/materialize.js` |
| Parse | `src/parse.js` |
| Transport | `src/stream/transport.js` |

---

## 2b. Checkpoint algorithm (portable)

`DotCheckpointEngine` implements later-wins **phase Diff**, not a JSON-tree diff of cumulative snapshots. Ports that omit leading-`.` injection on **Diff** slices, skip the live Commit tree, or confuse commit vs chunk will diverge from the official SDK.

### On each complete `.` line (stream processing on)

**Default `mergeChunkWindow: true`:** collect every complete `.` currently in the buffer window, feed all phase lines into the live tree **once**, one Commit, **one** `onChunk`. Multi-phase Diff = materialized committed tree after the batch (not N phase-local Diffs). Network framing is not preserved as delivery units.

**`mergeChunkWindow: false`:** stepwise — each `.` triggers its own Diff (legacy fine-grained surface). The checkpoint **receive buffer** holds partial lines; the live Commit path then feeds **complete** phase lines (not raw network slices):

```text
# DotCheckpointEngine (buffers across push chunks) — portable algorithm
closedPhases = takeCompleteDotPhases(buffer)   # may span many push() calls
feed complete phase lines into LiveXaiopParser   # feedLine / equivalent
… emit onChunk(phaseDiff)
```

`LiveXaiopParser.feedText` itself has **no** half-line buffer: it is for already line-oriented text. Arbitrary byte/chunk boundaries → `engine.push` / `XaiopStream`, not bare `feedText`.

**Async ingest:** `pushAsync` / `finishAsync` append immediately and coalesce the scan on `setImmediate` (yields the event loop; multiple rapid `pushAsync` share one drain). Prefer with `mergeChunkWindow` for fewer, larger computes. Sync `push` / `finish` remain available.

**Parse history (opt-in, SDK 0.7.0+):** `historySnapshot` / `historyRealtime` default **off**. When on, each physical `.` is recorded (before/after/diff) even if Diff delivery is window-merged. See [history.md](history.md).

### `injectLeadingDot(raw)` / Diff document root (0.14.2+)

If `raw` already begins with a `.` line (`.` / `.\n` / `.\r\n`), return as-is.  
Else if `raw` starts with `\n`, return `.` + `raw`.  
Else return `.\n` + `raw`.

Later-phase **Diff** parses are documents that **already reset to Root**, matching wire Cursor rules after a real `.`. The live Commit path does not inject — the prior phase’s `.` was already fed.

**D1 fix (0.14.2):** after a prior `.`, a phase that continues with named enter (`>rules-`) or Content is legal on the live object Root, but a fresh `parseSync(".\n>rules-…")` alone is a **fragment** and throws (`bare > after fragment bindings`). Diff isolation now prefixes a synthetic object root (`>\n`) when the live document is an object and the phase does not already open with bare `>` / `-`. Same complete phase sequence **must** agree for one `push` vs per-phase `push`, and for `mergeChunkWindow` on/off. If Diff isolation still fails, Commit is kept and Diff falls back to the cumulative committed tree (stream must not abort solely on Diff).

**D2 fix (0.14.3):** phases that contain `@` use the **same cumulative Diff path** as `=` / `!` / `&`. Protocol **MAY** keep `@` Diff phase-local; Node product Diff **does not** — create-vs-enter (especially into a prior-phase named array) must match live Commit. Framing split of `@orders` after `>orders-` must not emit an object-shaped Diff or throw on a later multi-element append.

Tests: `test/checkpoint.diff-isolation.test.js`.

### Receive buffer compact (0.15.0+)

**Product contract (Node SDK):** long-lived ingest **MUST NOT** rely on an unbounded receive string. After commits, callers **SHOULD** call `compactCommitted()` (or an equivalent future auto policy) so discarded wire cannot grow without bound.

#### `bufferStats()`

Returns a plain object (no side effects):

| Field | Type | Meaning |
| --- | --- | --- |
| `length` | `number` | `buffer.length` (UTF-16 code units; same as JS string length) |
| `committedAt` | `number` | Byte index of the commit frontier (`0 .. length`) |
| `pendingBytes` | `number` | **MUST** equal `length - committedAt` |
| `openPhase` | `boolean` | `true` when an incomplete phase / half-line remains after the frontier |

**MUST NOT** use `engine.buffer` solely for monitoring in hot paths — prefer `bufferStats()`.

#### `compactCommitted(options?)`

```js
/** @returns {{ discardedBytes: number, length: number }} */
eng.compactCommitted();
eng.compactCommitted({ dropHistory: true });
```

| Rule | Requirement |
| --- | --- |
| Effect | **MUST** discard `buffer[0 .. committedAt)` and reset the frontier to `0` |
| Live tree | **MUST NOT** re-parse; **MUST** keep live Commit / `committedSnapshot` |
| Uncommitted tail | **MUST** remain at the start of the new `buffer` (indices adjusted) |
| Return | `discardedBytes` = bytes removed; `length` = post-compact `buffer.length` |
| `committedAt === 0` | **MUST** no-op (`discardedBytes: 0`) |
| Closed engine | **MUST** throw |
| `historyRealtime` **and** `retainWireHistory` | **MUST** throw unless `dropHistory: true` |
| Non-empty parse history | **MUST** throw unless `dropHistory: true` (buffer indices on nodes become stale) |
| `dropHistory: true` | **MUST** clear history nodes (`ParseHistory.clear`); modes stay enabled |
| Idempotent | Second call with empty committed prefix **MUST** return `discardedBytes: 0` |

**`finish()` after compact:** when `committedAt === buffer.length`, final snapshot **MUST** reuse the live/committed value — it **MUST NOT** require the discarded session wire. After compact, `buffer` **MUST NOT** be treated as the full session transcript.

**Surfaces:** same methods on `XaiopStream` and WS client connections (delegate to the engine). **Out of scope:** `ResumeWireLog` / Control Root session log — compacting the receive buffer **MUST NOT** imply truncating the resume log.

**Not yet:** `autoCompact` watermarks (deferred).

Tests: `test/checkpoint.buffer-compact.test.js`.

### Empty phase → `null` chunk

Strip a leading `.` line and a trailing `.` line from `raw`, then `trim`. If the remaining body length is `0`, the chunk is **`null`** (even if parse would yield `{}`). Consecutive `.` lines produce `null` chunks.

### `finish()` / EOF tail

1. Flush any remaining `buffer[segmentStart ..]` into the live tree and emit a last chunk (same Diff rules; if no prior `.`, Diff aliases committed).  
2. If `committedAt === buffer.length`, final snapshot **reuses** the last committed value (no third full parse). This includes the post-`compactCommitted` case where both are `0` but a live/cached commit still exists.  
3. Otherwise parse the **current** buffer only (discarded pre-compact wire is gone).  
4. Never committed and empty buffer → final snapshot treated as **`{}`** on consumer surfaces.  
5. If `streamProcessing` is **false**: skip mid-stream phases and live; at finish emit one chunk = full parse of the **current** buffer.

### Commit vs chunk

| Value | Source |
| --- | --- |
| Chunk / Diff | Parse of **that phase text only** (after inject), except `=`/`!`/`&`/`@` after a prior `.` → cumulative committed value |
| `committedSnapshot` | Live tree after feeding all wire through last `.` / flushed tail (materialized clone). After a phase, the getter **may materialize lazily** on first read (`committedAt` already advanced). |

Do not implement Diff as `deepDiff(prevCommitted, newCommitted)` unless you document a different product surface — that is **not** the official Node behavior.

**Applying phase Diffs to a local tree:** treat each non-`null` Diff as a **path-level subtree replacement** (or replace from Root when the Diff is a full object shaped like that phase). **Do not** feed Diffs into `mergeJson` / `mergeToJson` — those APIs **deep-merge** and **never delete missing keys**, so delete-shaped phases (`&`, cover tombstones, or a phase that omits prior siblings) will not remove data. Use `getCommittedSnapshot()` for the cumulative truth, or replace by key/path yourself.
### Materialize

`XaiopFragment` → clone of `entries` (plain object). Complete documents clone as-is. Stream JSON surfaces never expose the fragment class.

---

## 3. What each API surface means

| Surface | When | Value |
| --- | --- | --- |
| `onChunk` / event `chunk` / async iterator | Each completed `.` phase + EOF tail | Materialized parse of **that phase only** (or `null` if empty); optional **`meta.seq` / `meta.seqs`** (Control Root phase cursor, **0.14.0+**); **`meta.logSeq`** when stamped (**0.14.1+**) |
| `onDone` / promise / `getSnapshot()` after complete | After `finish()` | Final materialized value (live/committed reuse when buffer fully covered; **not** a guarantee of replaying discarded pre-compact wire) |
| `getCommittedSnapshot()` | After each `.` / EOF flush | Cumulative parse of committed prefix — **safe mid-stream** (lazy materialize on first read is OK); **survives** `compactCommitted` |
| `bufferStats()` / `compactCommitted` | Anytime before close (**0.15.0+**) | Observe / discard committed receive-wire; see § Receive buffer compact |
| `DotCheckpointEngine.committedSnapshot` | Each `.` or EOF flush | Same underlying value as above; bare-engine readers: use the getter after `.` (`committedAt > 0`), not `getSnapshot()` |
| Mid-stream `getSnapshot()` | During STREAMING | Typically **`undefined`** (unchanged; use `getCommittedSnapshot`) |

---

## 4. Deliberate divergence from PROT-STREAM Diff

| `PROT-STREAM` §5 | Node SDK |
| --- | --- |
| Diff on each newly completed **Block** | Diff = materialized parse of each **`.` phase** |
| Snapshot of “parsed so far” | Progressive: `getCommittedSnapshot()`; final: `getSnapshot()` after EOF |

**Implication:** No `.` in the wire ⇒ no mid-stream `onChunk` until EOF tail (when stream processing is on).

**Careful change policy:** keep `.`-phase Diff as default. Optional Block-level Diff is a **future** opt-in only — not a silent default flip. See [adjustment-policy.md](adjustment-policy.md).

This is an **SDK policy**, documented here — not a silent protocol edit. See [../../notes/principles.md](../../notes/principles.md).

---

## 5. SDK footguns (on top of wire rules)

1. **Treat `onChunk` as phase JSON**, not JSON Patch and not cumulative Snapshot.  
2. **Merging chunks yourself:** object keys accumulate/overwrite; a phase that reopens `>name-` **appends** to that named array. Prefer `getCommittedSnapshot()` for cumulative JSON.  
2b. **Locate / delete / exact enter across phases:** `=` / `!` / `&` / `@` see the **whole tree so far** (向前跨相) for official Node Diff. Protocol package text **MAY** keep `@` Diff phase-local; this SDK uses **cumulative** Diff for `@` so create-vs-enter matches Commit (esp. re-entering a prior-phase named array).  
2b′. **`onChunk` optional:** omit or pass a non-function — Diff delivery no-ops; Commit / final snapshot still run. Safe with `emitDiff: false` (snapshot-only).  
2c. **Cover mode (`cover`, default off):** SDK-only Diff shaping for `&`. When on, consecutive `&` runs inject `.`, emit deepest-key `null` tombstone Diffs, then restore Cursor with a `>` chain before following lines. When off, Commit still applies `&` on the live tree; already-emitted Diffs are not rewritten.  
2d. **`mergeJson` ≠ Diff apply:** deep-merge keeps keys missing from the overlay; do **not** pipe `onChunk` Diffs into `mergeJson` if you need deletes — replace by path or read `getCommittedSnapshot()`.  
3. **Tolerate `null` chunks** (empty phases, e.g. consecutive `.`).  
4. **Do not use mid-stream `getSnapshot()`** for UI progress — use `getCommittedSnapshot()` (bare `DotCheckpointEngine`: same via `committedSnapshot` after `.`; `committedAt > 0` means a commit exists even if materialize is lazy until first read).  
5. **Compatibility mode** (default **off**): each phase parses with the same policy; `forcedRoot` looks at the **first line of that phase text** (later phases often start with synthetic `.`) — multi-phase + root-array shapes need explicit testing.  
6. **Transport:** prefer complete lines per SSE/WS **text** message; RAW/WS **binary** now uses a streaming UTF-8 decoder across chunks (do not interleave string+binary mid-code-point).  
7. **Errors:** mid-stream `XaiopSyntaxError` fails the stream; already emitted chunks are not rolled back.  
8. **Cost / buffer:** each `.` feeds the phase into a live parser; first phase and `=`/`!`/`&`/`@` Diff share one materialize with Commit; later ordinary Diff uses an owned phase parse. Long sessions **MUST** call **`compactCommitted()`** (or equivalent) so the receive buffer does not grow without bound — this is **not** optional for hour-scale connections. `emitDiff: false` skips Diff parses. Do **not** re-`parseSync` a growing prefix on every `.`.  
9. **Lone CR** without LF: checkpoint `.` detection is weaker than full `parseSync` normalization — prefer LF/CRLF.  
10. **History vs compact:** do not enable `historyRealtime` + `retainWireHistory` on the same engine you compact every phase unless you pass `dropHistory: true` (you then lose `jumpTo`).

Wire rules that still apply: [../../../protocol/notes/wire-attention.md](../../../protocol/notes/wire-attention.md) (especially named-array re-enter / append after `.`).

---

## 6. Consumer checklist (Node)

- [ ] `onDone` / final `getSnapshot()` is authoritative for the finished stream.  
- [ ] Mid-stream cumulative JSON → `getCommittedSnapshot()`.  
- [ ] `onChunk` = phase document; handle `null`.  
- [ ] Keep `compatibilityMode` off for protocol-faithful ingest.  
- [ ] Use `streamProcessing: false` if only final JSON is needed.  
- [ ] Long-lived connections: call `compactCommitted()` after commits; monitor via `bufferStats()`.  
- [ ] Do not assume `buffer` equals the full session wire after compact.  
- [ ] If using `historyRealtime` + retain wire, either avoid compact or pass `dropHistory: true`.  

---

## 7. Generator checklist (when targeting this SDK)

- [ ] Emit `.` when mid-stream JSON Diff is desired.  
- [ ] Keep each named array inside **one** phase (matches encode `dotPolicy` contract).  
- [ ] After `.`, re-enter from Root (`>` / `=`…).  
- [ ] Complete document: leading `>` / `-`.  
- [ ] LF or CRLF line endings.

Encode alignment: [../API.md](../API.md) · [encode-attention.md](encode-attention.md).

---

## 8. Tests that back the verdict

| Suite | Focus |
| --- | --- |
| `test/stream.consistency.test.js` | One-shot ≡ stream (char/sized), CRLF, overwrite, arrays, complex fixture |
| `test/stream.test.js` | Phase emit, empty phase `null`, modes, busy/abort |
| `test/encode.stability.test.js` | Encoded wire through RAW char stream + checkpoint commit |
| `test/checkpoint.diff-isolation.test.js` | D1 Diff root / D2 `@` cumulative / framing split |
| `test/checkpoint.buffer-compact.test.js` | `bufferStats` / `compactCommitted` contracts, history conflict, Stream / WS |

---

## Related

- Protocol streaming note: [../../../protocol/notes/streaming-attention.md](../../../protocol/notes/streaming-attention.md)  
- Control Root / resume: [control-plane.md](control-plane.md)  
- API: [../API.md](../API.md) · [../README.md](../README.md)  
- Parity contract: [../../behavioral-contract.md](../../behavioral-contract.md)  
- Separation: [../../../SEPARATION.md](../../../SEPARATION.md)
