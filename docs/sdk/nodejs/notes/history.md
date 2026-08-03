# Node.js note — parse history (snapshot + realtime)

[English](history.md) · [简体中文](history.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-HISTORY` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** — Node SDK behavior |
| Code | `xaiop-sdk/nodejs/src/stream/history.js` · wired in `checkpoint.js` |
| Package | `xaiop` **0.7.0+** |

Parent: [streaming-parse.md](streaming-parse.md) · [../stream.md](../stream.md) · Parity: [../../behavioral-contract.md](../../behavioral-contract.md)

---

## 1. Intent

Optional **flight recorder** for the `.` phase chain. Default **both modes off** (zero cost).

| Mode | Flag | Role |
| --- | --- | --- |
| **Snapshot** | `historySnapshot: true` | Read-only, git-like: export time-root, compare, range view, URL lifecycle |
| **Realtime** | `historyRealtime: true` | Live forward jump: keep positioning node, **discard everything after** |

Both may be enabled together: inspect with snapshot, then cut the live sequence with realtime.

History is keyed by **each physical `.`** (and EOF tail), even when `mergeChunkWindow` still delivers **one** Diff per buffer window.

---

## 2. Performance / scenarios

| Setup | Cost | Typical use |
| --- | --- | --- |
| Both off (default) | None | Production hot path |
| Snapshot only | Memory per `.` (before/after/diff/wire) | Audit, diff UI, interval replay |
| Realtime only | Same + jump rebuild | Server rewind, local preview cut |
| Both on | Full cost | Snapshot check → realtime truncate |

Prefer leaving history off unless you need rewind/audit. `retainWireHistory: false` drops per-node wire (range re-parse falls back to `after`).

---

## 3. Snapshot APIs (`ParseHistory`)

Requires `historySnapshot`.

| API | Behavior |
| --- | --- |
| `exportTimeRoot()` | Deep-cloned node array (time root) |
| `getDiff` / `getBefore` / `getAfter` / `getNode` | Per-index clones |
| `compare(a, b)` | `{ a, b }` = `after` trees at two indices |
| `viewRange(from, to)` | Maintained read-only view; re-parses joined wire when retained |
| `setSource(url)` | Bind source key; **different** URL releases all nodes + range view |
| `release()` | Clear nodes + range view |

`XaiopStream`: `setUrl` / new `send` URL triggers snapshot `setSource` when snapshot mode is on.

---

## 4. Realtime APIs

Requires `historyRealtime`.

| API | Behavior |
| --- | --- |
| `liveCursor` | Starts at `-1`; after `jumpTo(i)` becomes `i` |
| `canJumpTo(i)` | `i > liveCursor` and in range |
| `jumpTo(i)` / `engine.jumpTo(i)` / `stream.jumpTo(i)` | Keep `[0..i]` (node `i` **retained**); discard `i+1..`; rebuild buffer + Commit from prefix; **forward-only** (cannot restore discarded; cannot jump to `≤ liveCursor`) |

After jump, further `push` continues from the retained prefix.

---

## 5. Dual mode

```js
const engine = new DotCheckpointEngine({
  streamProcessing: true,
  historySnapshot: true,
  historyRealtime: true,
  onChunk: () => {},
});
// … push phases …
engine.history.compare(0, 2); // read-only check
engine.jumpTo(1);             // live truncate after index 1
```

---

## 6. Checklist

- [ ] Default: no `ParseHistory` instance (`engine.history === null`)
- [ ] Per-`.` records when either flag is on (independent of Diff windowing)
- [ ] Snapshot: export / compare / viewRange / setSource release
- [ ] Realtime: forward-only jump; positioning node kept; tail discarded; engine rebuild
- [ ] Dual: snapshot then jump works; discarded indices unavailable
