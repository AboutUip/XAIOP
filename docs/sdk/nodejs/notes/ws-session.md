# Node.js note — WebSocket sessions (`XaiopWs`)

[English](ws-session.md) · [简体中文](ws-session.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-WS` |
| Status | Informative |
| Last updated | 2026-08-04 |
| Normative | **No** — Node SDK behavior |
| Code | `xaiop-sdk/nodejs/src/node/ws/` · `src/browser/ws-client.ts` |
| Package | `xaiop` **0.13.0** (implements protocol package **0.6.0**) |

Practice baseline: [../../../practice/skeleton-stream.md](../../../practice/skeleton-stream.md).  
Phase parse semantics: [streaming-parse.md](streaming-parse.md).

---

## 1. Role

One package, two faces on the **same connection type**:

| Face | API | Typical use |
| --- | --- | --- |
| Accept / push | `XaiopWs.listen` → `pushJson` / `pushObject` / `pushWire` / `pushWireLn` → `end` | Skeleton producer |
| Connect / consume | `XaiopWs.connect` → `onPhase` / `getCommittedSnapshot` / `done` | Consumer |

Dependency: Node `ws` (no polyfill required on Node ≥ 18).  
`XaiopStream` HTTP/SSE/RAW remain available; **skeleton long sessions are WS-primary via `XaiopWs`**.

---

## 2. Minimal producer / consumer

```js
import { XaiopWs } from "xaiop";

const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
hub.onConnection(async (conn) => {
  conn.pushJson("skeleton1", { title: "A" });
  conn.pushJson("mod1", { rows: [1, 2] }, { final: true });
  await conn.end(); // drains then closes — peer finishes parse
});

const client = await XaiopWs.connect(hub.url(), {
  onPhase: (diff) => {
    /* phase JSON only — not a patch */
  },
});
const json = await client.done; // final Snapshot
await hub.close();
```

Attach to an existing HTTP server: `XaiopWs.listen({ server, path: "/xaiop" })`.

---

## 3. Push helpers

| Method | Behavior |
| --- | --- |
| `pushJson(key, value, { final? })` | `encodeSync({[key]:value}, {dotPolicy:"none"})`; if not `final`, ensure trailing `\n` then append `.\n` |
| `pushObject(obj, { final? })` | Same for a plain object (multi-key one phase) |
| `pushWire(text)` | Raw XAIOP text **as-is** (no auto newline between frames) |
| `pushWireLn(text)` | Same, ensuring a trailing `\n` when missing |
| `encodePhaseJson` / `encodePhaseObject` | Encode without sending (discard after send) |

`final: true` omits the phase-separator `.` (last module). Non-final phases always end with `.\n` so the peer can emit mid-stream Diffs.

Hardened encode rules apply (rejected keys still throw `XaiopEncodeError` — nothing is sent).

---

## 4. Consume surfaces

| Surface | Meaning |
| --- | --- |
| `onPhase` / `onChunk` | Diff under the same policy as `XaiopStream` (default **window-merged** complete `.` in the buffer; see [streaming-parse.md](streaming-parse.md)) |
| `getCommittedSnapshot()` | Cumulative later-wins through last commit — safe mid-stream |
| `getSnapshot()` | Final only after peer close / `done` |
| `done` | Promise of final Snapshot |
| `closed` | Promise when socket teardown finishes |

`connect` / `listen` connection options (aligned with `XaiopStream`):

| Option | Default | Notes |
| --- | --- | --- |
| `streamProcessing` | `true` | Mid-stream Diffs |
| `mergeChunkWindow` | `true` | Batch complete `.` in the buffer window → one Diff |
| `asyncParse` | `false` | Coalesced `pushAsync` ingest (`setImmediate`) |
| `compatibilityMode` | `false` | Opt-in compat parse |

Pass **`onPhase` / `onChunk` / `onDone` / `onError` / `lineIntercept` / `annotationSpan`** in **`connect` options** if the peer may push synchronously in `connection` — listeners are attached before `open` completes. After `connect` resolves, those mutators **throw** (`handlersLocked`); there is no replay.

---

## 5. Session lifecycle (locked defaults)

| Concern | Official behavior |
| --- | --- |
| Connect handshake | `handshakeTimeoutMs` default **15000**; wraps `ws` open wait |
| Attach order | `XaiopWsConnection` binds message handlers **before** waiting for `open` (sync push on accept must not race); **`connect` then `lockHandlers()`** so late registration cannot silently miss frames |
| Binary frames | Streaming UTF-8 `TextDecoder` across chunks; flush decoder on peer close before `finish()` |
| `push*` when closed / not OPEN | Returns **`false`** (no throw). Encode errors throw **before** `send` |
| `end({ code?, reason? })` | Wait until `bufferedAmount === 0` or **2s** elapsed, then `close(code ?? 1000, reason ?? "")` |
| `abort()` | Prefer `terminate()`, also `close(1001, "aborted")`; returns `false` if already closed |
| Parse / finish failure | `done` rejects; `onError` fired; socket `close(1011, message.slice(0, 120))` |
| Peer close | `finish()` checkpoint → `onDone` / resolve `done` with final Snapshot (`{}` if empty); then resolve `closed` |
| Mid-stream `getSnapshot()` | Stays `undefined` until peer close / finish (use `getCommittedSnapshot`) |

Listen options of note: `port ?? 0`, optional existing `http.Server` + `path`, `host`, `backlog`, `perMessageDeflate`, `maxPayload`.

Phase Diff algorithm (leading `.` inject, empty → `null`): [streaming-parse.md](streaming-parse.md).

---

## 6. Tests

`test/ws.phase-encode.test.js` · `test/ws.session.test.js` — real loopback (listen → push phases → Snapshot), later-wins, named-array re-enter append, fragmented/binary frames, attach-to-`http.Server`, sync push race, `XaiopStream` websocket transport fallback to `ws`.

---

## 7. Related

- Practice: [../../../practice/skeleton-stream.md](../../../practice/skeleton-stream.md)  
- Streaming parse: [streaming-parse.md](streaming-parse.md)  
- Line intercept: [line-intercept.md](line-intercept.md) · API [§6.4](../API.md#64-line-intercept-onlineintercept)
- Annotation Span: [annotation-span.md](annotation-span.md) · API [§6.5](../API.md#65-annotation-span-onannotationspan)  
- Type check: [typecheck.md](typecheck.md)  
- Primary API: [../API.md](../API.md) §7  
- Catalog: [../../behavioral-contract.md](../../behavioral-contract.md)
