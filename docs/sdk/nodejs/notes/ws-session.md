# Node.js note — WebSocket sessions (`XaiopWs`)

[English](ws-session.md) · [简体中文](ws-session.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-WS` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** — Node SDK behavior |
| Code | `xaiop-sdk/nodejs/src/stream/ws/` |
| Package | `xaiop` **0.4.0+** (protocol wire 0.2.1) |

Practice baseline: [../../../practice/skeleton-stream.md](../../../practice/skeleton-stream.md).  
Phase parse semantics: [streaming-parse.md](streaming-parse.md).

---

## 1. Role

One package, two faces on the **same connection type**:

| Face | API | Typical use |
| --- | --- | --- |
| Accept / push | `XaiopWs.listen` → `pushJson` / `pushObject` / `pushWire` → `end` | Skeleton producer |
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
| `pushJson(key, value, { final? })` | `encodeSync({[key]:value}, {dotPolicy:"none"})` + optional `.\n` |
| `pushObject(obj, { final? })` | Same for a plain object (multi-key one phase) |
| `pushWire(text)` | Raw XAIOP text |
| `encodePhaseJson` / `encodePhaseObject` | Encode without sending (discard after send) |

Hardened encode rules apply (rejected keys still throw `XaiopEncodeError` — nothing is sent).

---

## 4. Consume surfaces

| Surface | Meaning |
| --- | --- |
| `onPhase` / `onChunk` | Diff = that `.` phase (same policy as `XaiopStream`) |
| `getCommittedSnapshot()` | Cumulative later-wins through last commit — safe mid-stream |
| `getSnapshot()` | Final only after peer close / `done` |
| `done` | Promise of final Snapshot |
| `closed` | Promise when socket teardown finishes |

Pass `onPhase` / `onDone` in **`connect` options** if the peer may push synchronously in `connection` — listeners are attached before `open` completes.

---

## 5. Tests

`test/ws.phase-encode.test.js` · `test/ws.session.test.js` — real loopback (listen → push phases → Snapshot), later-wins, array replace, fragmented/binary frames, attach-to-`http.Server`, sync push race, `XaiopStream` websocket transport fallback to `ws`.

---

## 6. Related

- Practice: [../../../practice/skeleton-stream.md](../../../practice/skeleton-stream.md)  
- Streaming parse: [streaming-parse.md](streaming-parse.md)  
- Encode: [../encode.md](../encode.md)
