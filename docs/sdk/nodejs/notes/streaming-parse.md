# Node.js note — streaming parse (XAIOP → JSON)

[English](streaming-parse.md) · [简体中文](streaming-parse.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-STREAM` |
| Status | Informative |
| Last updated | 2026-08-05 |
| Normative | **No** — Node SDK behavior |
| Code | `xaiop-sdk/nodejs/src/stream/` |
| Package | `xaiop` **0.7.0+** (protocol wire **0.6.0**; Control Root / `meta.seq` **0.14.0+**) |

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
  → Diff = phase-local parse (or shared committed for `=`/`!`/`&` after a prior `.`)
  → onChunk(diff, meta?)   # meta.seq / meta.seqs when phaseSeq on (0.14.0+)
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

### `injectLeadingDot(raw)`

If `raw` already begins with a `.` line (`.` / `.\n` / `.\r\n`), return as-is.  
Else if `raw` starts with `\n`, return `.` + `raw`.  
Else return `.\n` + `raw`.

Later-phase **Diff** parses are therefore documents that **already reset to Root**, matching wire Cursor rules after a real `.`. The live Commit path does not inject — the prior phase’s `.` was already fed.

### Empty phase → `null` chunk

Strip a leading `.` line and a trailing `.` line from `raw`, then `trim`. If the remaining body length is `0`, the chunk is **`null`** (even if parse would yield `{}`). Consecutive `.` lines produce `null` chunks.

### `finish()` / EOF tail

1. Flush any remaining `buffer[segmentStart ..]` into the live tree and emit a last chunk (same Diff rules; if no prior `.`, Diff aliases committed).  
2. If `committedAt === buffer.length`, final snapshot **reuses** the last committed value (no third full parse); otherwise parse the full buffer.  
3. Empty full buffer → final snapshot treated as **`{}`** on consumer surfaces.  
4. If `streamProcessing` is **false**: skip mid-stream phases and live; at finish emit one chunk = full parse and set snapshot accordingly.

### Commit vs chunk

| Value | Source |
| --- | --- |
| Chunk / Diff | Parse of **that phase text only** (after inject), except `=`/`!`/`&` after a prior `.` → cumulative committed value |
| `committedSnapshot` | Live tree after feeding all wire through last `.` / flushed tail (materialized clone). After a phase, the getter **may materialize lazily** on first read (`committedAt` already advanced). |

Do not implement Diff as `deepDiff(prevCommitted, newCommitted)` unless you document a different product surface — that is **not** the official Node behavior.

**Applying phase Diffs to a local tree:** treat each non-`null` Diff as a **path-level subtree replacement** (or replace from Root when the Diff is a full object shaped like that phase). **Do not** feed Diffs into `mergeJson` / `mergeToJson` — those APIs **deep-merge** and **never delete missing keys**, so delete-shaped phases (`&`, cover tombstones, or a phase that omits prior siblings) will not remove data. Use `getCommittedSnapshot()` for the cumulative truth, or replace by key/path yourself.
### Materialize

`XaiopFragment` → clone of `entries` (plain object). Complete documents clone as-is. Stream JSON surfaces never expose the fragment class.

---

## 3. What each API surface means

| Surface | When | Value |
| --- | --- | --- |
| `onChunk` / event `chunk` / async iterator | Each completed `.` phase + EOF tail | Materialized parse of **that phase only** (or `null` if empty); optional **`meta.seq` / `meta.seqs`** (Control Root phase cursor, **0.14.0+**) |
| `onDone` / promise / `getSnapshot()` after complete | After `finish()` | Materialized parse of **entire buffer** (later-wins applied) |
| `getCommittedSnapshot()` | After each `.` / EOF flush | Cumulative parse of committed prefix — **safe mid-stream** (lazy materialize on first read is OK) |
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
2b. **Locate / delete across phases:** `=` / `!` / `&` see the **whole tree so far** (向前跨相). Official Diff phases that contain `=` / `!` / `&` parse a **cumulative prefix**. `@` create-or-enter is 本相 and may stay phase-local.  
2c. **Cover mode (`cover`, default off):** SDK-only Diff shaping for `&`. When on, consecutive `&` runs inject `.`, emit deepest-key `null` tombstone Diffs, then restore Cursor with a `>` chain before following lines. When off, Commit still applies `&` on the live tree; already-emitted Diffs are not rewritten.  
2d. **`mergeJson` ≠ Diff apply:** deep-merge keeps keys missing from the overlay; do **not** pipe `onChunk` Diffs into `mergeJson` if you need deletes — replace by path or read `getCommittedSnapshot()`.  
3. **Tolerate `null` chunks** (empty phases, e.g. consecutive `.`).  
4. **Do not use mid-stream `getSnapshot()`** for UI progress — use `getCommittedSnapshot()` (bare `DotCheckpointEngine`: same via `committedSnapshot` after `.`; `committedAt > 0` means a commit exists even if materialize is lazy until first read).  
5. **Compatibility mode** (default **off**): each phase parses with the same policy; `forcedRoot` looks at the **first line of that phase text** (later phases often start with synthetic `.`) — multi-phase + root-array shapes need explicit testing.  
6. **Transport:** prefer complete lines per SSE/WS **text** message; RAW/WS **binary** now uses a streaming UTF-8 decoder across chunks (do not interleave string+binary mid-code-point).  
7. **Errors:** mid-stream `XaiopSyntaxError` fails the stream; already emitted chunks are not rolled back.  
8. **Cost:** each `.` feeds the phase into a live parser; first phase and `=`/`!`/`&` Diff share one materialize with Commit; later ordinary Diff uses an owned phase parse (no extra clone). Full-tree materialize is lazy until committed is read. `emitDiff: false` (also auto when `XaiopStream` has no Diff consumer) skips Diff parses. `cloneJson` uses JSON round-trip. Do **not** re-`parseSync` the growing prefix on every `.`.  
9. **Lone CR** without LF: checkpoint `.` detection is weaker than full `parseSync` normalization — prefer LF/CRLF.

Wire rules that still apply: [../../../protocol/notes/wire-attention.md](../../../protocol/notes/wire-attention.md) (especially named-array re-enter / append after `.`).

---

## 6. Consumer checklist (Node)

- [ ] `onDone` / final `getSnapshot()` is authoritative.  
- [ ] Mid-stream cumulative JSON → `getCommittedSnapshot()`.  
- [ ] `onChunk` = phase document; handle `null`.  
- [ ] Keep `compatibilityMode` off for protocol-faithful ingest.  
- [ ] Use `streamProcessing: false` if only final JSON is needed.  

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

---

## Related

- Protocol streaming note: [../../../protocol/notes/streaming-attention.md](../../../protocol/notes/streaming-attention.md)  
- Control Root / resume: [control-plane.md](control-plane.md)  
- API: [../API.md](../API.md) · [../README.md](../README.md)  
- Parity contract: [../../behavioral-contract.md](../../behavioral-contract.md)  
- Separation: [../../../SEPARATION.md](../../../SEPARATION.md)
