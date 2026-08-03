# Node.js note — streaming parse (XAIOP → JSON)

[English](streaming-parse.md) · [简体中文](streaming-parse.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-STREAM` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** — Node SDK behavior |
| Code | `xaiop-sdk/nodejs/src/stream/` |
| Package | `xaiop` 0.4.0+ (protocol wire 0.2.1) |

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
| Main risk | Semantic misuse + Generator array reopen — not random byte loss when lines are LF/CRLF |

---

## 2. Pipeline (implementation)

```text
Transport text → DotCheckpointEngine.push
  → scan complete "." lines
  → parseSync(phase) → materialize → onChunk(diff)
  → finish(): flush tail + parseSync(full buffer) → onDone / getSnapshot
```

| Layer | Path |
| --- | --- |
| Client | `src/stream/XaiopStream.js` |
| Checkpoint | `src/stream/checkpoint.js` |
| Materialize | `src/stream/materialize.js` |
| Parse | `src/parse.js` |
| Transport | `src/stream/transport.js` |

---

## 3. What each API surface means

| Surface | When | Value |
| --- | --- | --- |
| `onChunk` / event `chunk` / async iterator | Each completed `.` phase + EOF tail | Materialized parse of **that phase only** (or `null` if empty) |
| `onDone` / promise / `getSnapshot()` after complete | After `finish()` | Materialized parse of **entire buffer** (later-wins applied) |
| `getCommittedSnapshot()` | After each `.` / EOF flush | Cumulative parse of committed prefix — **safe mid-stream** |
| `DotCheckpointEngine.committedSnapshot` | Each `.` or EOF flush | Same underlying value as above |
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
2. **Merging chunks yourself:** object keys accumulate/overwrite; a phase that reopens `>name-` **replaces** that array key. Prefer `getCommittedSnapshot()` for cumulative JSON.  
3. **Tolerate `null` chunks** (empty phases, e.g. consecutive `.`).  
4. **Do not use mid-stream `getSnapshot()`** for UI progress — use `getCommittedSnapshot()`.  
5. **Compatibility mode** (default **off**): each phase parses with the same policy; `forcedRoot` looks at the **first line of that phase text** (later phases often start with synthetic `.`) — multi-phase + root-array shapes need explicit testing.  
6. **Transport:** prefer complete lines per SSE/WS **text** message; RAW/WS **binary** now uses a streaming UTF-8 decoder across chunks (do not interleave string+binary mid-code-point).  
7. **Errors:** mid-stream `XaiopSyntaxError` fails the stream; already emitted chunks are not rolled back.  
8. **Cost:** each `.` triggers phase parse + prefix re-parse for commit; `finish` parses full buffer again.  
9. **Lone CR** without LF: checkpoint `.` detection is weaker than full `parseSync` normalization — prefer LF/CRLF.

Wire rules that still apply: [../../../protocol/notes/wire-attention.md](../../../protocol/notes/wire-attention.md) (especially array reopen after `.`).

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

Encode alignment: [../encode.md](../encode.md) · [encode-attention.md](encode-attention.md).

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
- Guide: [../README.md](../README.md)  
- Separation: [../../../SEPARATION.md](../../../SEPARATION.md)
