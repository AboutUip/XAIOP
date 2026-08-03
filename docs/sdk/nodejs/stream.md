# Node.js Stream (`XaiopStream`)

[English](stream.md) · [简体中文](stream.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | `xaiop` **0.7.0+** |
| Protocol wire | Frozen **v0.4.0** |
| Code | `xaiop-sdk/nodejs/src/stream/` |
| Semantics note | [notes/streaming-parse.md](notes/streaming-parse.md) |
| Parity contract | [../behavioral-contract.md](../behavioral-contract.md) |

Parent guide: [README.md](README.md) · WS sessions: [notes/ws-session.md](notes/ws-session.md) · Practice: [../../practice/streaming-transport.md](../../practice/streaming-transport.md)

---

## 1. Role

`XaiopStream` is the HTTP / SSE / WebSocket / RAW **consumer** client. It line-buffers transport text into `DotCheckpointEngine`, emits **`.`-phase** Diffs (by default **window-merged**), and resolves a final Snapshot at EOF.

Skeleton long-lived **push + consume** sessions prefer `XaiopWs` ([notes/ws-session.md](notes/ws-session.md)); `XaiopStream` remains the general transport client (including `transport: "websocket"`).

Diff boundary is an **SDK policy** (`.` phases), not Block-by-Block `PROT-STREAM` §5 — see [notes/streaming-parse.md](notes/streaming-parse.md).

---

## 2. Construct

```js
import { XaiopStream, STREAM_MODES, TRANSPORT_KIND } from "xaiop";

const stream = new XaiopStream(url, {
  streamProcessing: true, // default on
  compatibilityMode: false, // default off
  mergeChunkWindow: true, // default on — batch complete `.` in buffer window
  asyncParse: false, // default off — set true for coalesced pushAsync ingest
  historySnapshot: false, // default off — read-only `.` history
  historyRealtime: false, // default off — forward-jump live rewind
  modes: [STREAM_MODES.CALLBACK], // default if omitted
});
```

| Option | Default | Notes |
| --- | --- | --- |
| `streamProcessing` | `true` | Mid-stream phase Diffs; `false` → one chunk at finish |
| `mergeChunkWindow` | `true` | Batch all complete `.` in the current buffer window → **one** Diff (= committed after batch). `false` → stepwise per-`.` Diff |
| `asyncParse` | `false` | Transport uses `pushAsync` (setImmediate coalesce; yields event loop). Prefer `true` in production with large/multi-`.` frames |
| `historySnapshot` | `false` | Opt-in read-only history (export / compare / `viewRange` / URL release) |
| `historyRealtime` | `false` | Opt-in forward-only `jumpTo` (keep node, discard after) |
| `retainWireHistory` | `true` | When history on, retain per-`.` wire slices |
| `compatibilityMode` | `false` | Same ingest policy as Engine; fine-grained `setCompat*` available |
| `modes` | `["callback"]` | Multi-select; empty input floors to `callback` |

History detail: [notes/history.md](notes/history.md).

---

## 3. Status machine

```text
idle → connecting → streaming → completing → completed
                 ↘ aborted
                 ↘ error
```

| Status | Meaning |
| --- | --- |
| `idle` | Ready for `send` |
| `connecting` | Transport opening |
| `streaming` | First bytes received / phases flowing |
| `completing` | Transport done; finishing checkpoint |
| `completed` | Final Snapshot available |
| `aborted` | `abort()` while busy |
| `error` | Parse / transport failure |

Busy = `connecting` | `streaming` | `completing`. Idle-like statuses allow another `send`. Inspect with `getStatus()` / event `status`.

Constants: `STREAM_STATUS`.

---

## 4. Delivery modes

Modes are **multi-select**. Inactive modes receive nothing. Inspection (`getSnapshot`, `getCommittedSnapshot`, `getStatus`) is always available and is **not** a mode.

| Mode | Surfaces |
| --- | --- |
| `callback` (**floor**) | `onChunk` / `onDone` / `onError` |
| `promise` | `send()` returns Promise of final Snapshot |
| `asyncIterator` | `for await` / `chunks()` |
| `events` | `on("chunk"|"done"|"error"|"status", …)` |

- Default: **callback only**.
- `disableMode` never leaves an empty set — last remaining mode stays `callback`.
- Event listeners: exceptions inside listeners are **isolated** (swallowed); they do not fail the stream.

```js
stream.setModes(["callback", "events", "promise"]);
stream.onChunk((diff) => { /* window Diff or phase JSON / null */ });
stream.on("status", (info) => {});
const json = await stream.send({ transport: "http" });
```

---

## 5. Snapshots and chunks

| API | When | Value |
| --- | --- | --- |
| `onChunk` / `chunk` / iterator | Default: once per buffer window of complete `.` (+ EOF tail); `mergeChunkWindow: false` → each `.` | Window Diff = committed tree after batch; stepwise = phase-only parse or `null` if empty |
| `getCommittedSnapshot()` | After each commit | Cumulative later-wins through last `.` / EOF flush |
| `getSnapshot()` / `onDone` / promise | After finish | Full-buffer parse; empty → `{}` |
| Mid-stream `getSnapshot()` | During `streaming` | Typically `undefined` |

Fragments from the parser are **materialized** to plain objects on these surfaces (`materializeSnapshot`). Algorithm: [notes/streaming-parse.md](notes/streaming-parse.md) § Checkpoint algorithm.

---

## 6. `send` / `abort`

```js
stream.send({
  transport: TRANSPORT_KIND.HTTP, // default
  method: "GET",
  headers: {},
  body: null,
  timeoutMs: 30_000,
  signal: abortSignal,
  // SSE
  sseEvents: ["message"], // optional filter; default event name "message"
  // WebSocket
  protocols: undefined,
  // RAW
  source: asyncIterableOrReadableStream,
  fetch: globalThis.fetch,
});
```

| Behavior | Rule |
| --- | --- |
| Default transport | `http` |
| Busy `send` | If `promise` mode enabled → `Promise.reject`; else **throw** `Error("XaiopStream is busy; …")` |
| SSE | Sets `Accept: text/event-stream`; joins multi-line `data:` with `\n` |
| Binary (WS/RAW/HTTP body) | Streaming UTF-8 decoder across chunks; flush on close |
| Empty text | Not forwarded into the checkpoint buffer |
| Timeout | Aborts with `transport timeout after Nms` |
| `abort()` | Status `aborted`, error `"aborted"`; rejects promise / iterators |

RAW requires `source`. Prefer complete Label lines per SSE/WS text message ([../../practice/streaming-transport.md](../../practice/streaming-transport.md)).

---

## 7. Compatibility on the stream

Same as Engine: master switch + eight fixes via `setCompat*` / `CompatPolicy` (active only while `compatibilityMode` is on). Each phase parse uses the current policy. `forcedRoot` looks at the **first line of that phase text** (later phases often start with a synthetic `.`) — test multi-phase + root-array shapes explicitly.

See [README.md](README.md) Compatibility mode · CompatPolicy.

---

## 8. Related exports

| Member | Role |
| --- | --- |
| `DotCheckpointEngine` | Low-level `.` phase parser |
| `materializeSnapshot` | Fragment → plain object for JSON surfaces |
| `openTransport` / `TRANSPORT_KIND` | Transport helpers |
| `STREAM_MODES` / `STREAM_STATUS` | Constants |
| `isStreamBusy` | Status helper |

---

## 9. Tests

`test/stream.test.js` · `test/stream.consistency.test.js` · `test/encode.stability.test.js` (chunked RAW through stream).
