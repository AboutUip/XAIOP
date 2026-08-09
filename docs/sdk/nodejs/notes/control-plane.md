# SDK Control Root (`#!`) — demux, session, resume

[English](control-plane.md) · [简体中文](control-plane.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-CONTROL` |
| Status | Informative (SDK product convention) |
| Last updated | 2026-08-05 |
| Package | `xaiop` **0.14.1+** |
| Normative wire | **No** — Frozen protocol **0.6.0** still classifies `#…` as custom annotation; this note is an **SDK Control Root** convention |
| Depends on | [ws-session.md](ws-session.md), [annotation-span.md](annotation-span.md), [typecheck.md](typecheck.md), [streaming-parse.md](streaming-parse.md) |
| Tests | `test/control.plane.test.js` · `test/control.resume.test.js` · `test/control.coverage.test.js` |

---

## 1. Why a control root

Document wire (`>` / `-` / Content / ordinary `#…`) and SDK internals must not share the same root.

| World | Shape | Enters parse / Span? |
| --- | --- | --- |
| **Document** | `>` `-` Content `#app…` | Yes |
| **Control** | `#!…` | **Never** |
| **App annotation** | `#…` with second char **≠** `!` | Yes (parse ignores; Span may remount) |

**Hard rule:** a logical line whose first two characters are `#` `!` is the **SDK Control Root**. Applications **MUST** avoid that shape for annotations.

---

## 2. Frame grammar (SDK)

```text
#!<ns>/<name>/v<major>\n
<body-line>\n
```

| Part | Rule |
| --- | --- |
| `ns` | Official capabilities use `xaiop`. Other namespaces still enter the control plane. |
| `name` | Capability id (`types`, `session`, `resume`, `ack`, `snapshot`, …) |
| `vN` | Capability major version |
| body | **Exactly one** logical line (JSON text or empty). No CR/LF inside the body. Encoders always terminate with `\n`. |

**Unknown policy (0.14):** every `#!…` is demuxed as control. Unknown ns/capability / unsupported version → **discard** (never parse/Span) **and** report `XaiopControlError` via `onControlError` (else soft `onError` / console). Connection is **not** aborted by default.

Exports: `encodeControlFrame`, `encodeSessionFrame`, `encodeAckFrame`, `encodeResumeFrame`, `encodeSnapshotFrame`, `ControlDemux`, `ControlIngest`, `ControlPlaneHost`, `ControlSessionState`, `ResumeWireLog`, `XaiopControlError`, `CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY`.

---

## 3. Official capabilities (`ns=xaiop`)

| Frame | Body (JSON) | Role |
| --- | --- | --- |
| `#!xaiop/types/v1` | Type schema snapshot | Same semantics as pre-0.14 `pushTypeConsistency` |
| `#!xaiop/session/v1` | `{ sessionId, role, capabilities[], epoch }` | Session hello / capability advertise |
| `#!xaiop/ack/v1` | `{ sessionId, seq }` | Consumer confirms contiguous applied **session-log** seq |
| `#!xaiop/resume/v1` | `{ sessionId, fromSeq, epoch? }` | Reconnect: continue from **`fromSeq + 1`** (log space) |
| `#!xaiop/snapshot/v1` | `{ sessionId, seq, tree }` | Optional committed-tree seed after resume (**no** Diff replay); `seq` is log space |
| `#!xaiop/seq/v1` | `{ seq }` (`seq >= 1`) | Stamp **session-log** seq for the **following** document phase → `meta.logSeq` |

`types/v1` is the first leaf under this root. Encoders append a trailing body `\n` (historical whole messages without that LF remain accepted).

---

## 4. Demux & interleaving

Ingest path (WS / Stream):

```text
text → ControlDemux (line / frame boundary)
     → control frames → dispatch / ControlPlaneHost
     → remaining wire → DotCheckpointEngine (intercept → Span → parse)
```

| Behavior | Detail |
| --- | --- |
| Interleave | Control frames **MAY** mix with document lines in one buffer or across chunks / WS messages |
| Compat | Whole-message `#!xaiop/types/v1\n{…}` without trailing LF after JSON still works |
| CRLF | Document wire terminators are preserved byte-for-byte when peeling control |
| Char-stream | If JSON body is finalized without LF (compat), a following empty LF is **not** emitted as wire |

---

## 5. Phase seq & resume (locked in 0.14 / clarified 0.14.1)

| Topic | Decision |
| --- | --- |
| **Two numbering spaces** | **Do not conflate** connection-local `meta.seq` with session-log `meta.logSeq` / `fromSeq` |
| **Seq granularity** | One unit per completed **physical** `.` (and non-empty finish tail). Cover-mode sub-emits also allocate. |
| **Window merge** | `mergeChunkWindow: true` may deliver one `onChunk` for several `.`; `meta.seqs` / `meta.logSeqs` list all; `meta.seq` / `meta.logSeq` are the highest. |
| **Ack / resume / snapshot.seq** | **Session-log space only** (prefer `meta.logSeq` when stamps are present). |
| **Reconnect Diff** | **Do not** replay historical Diffs. Optional `snapshot`, then wire from `fromSeq + 1`. |
| **Byte offsets** | **Not** used. |

### Two seq spaces (highest-frequency resume pitfall)

| Space | Where | Lifetime | Use for `fromSeq` / ack? |
| --- | --- | --- | --- |
| **Connection-local** | `meta.seq` / `meta.seqs` / `phaseSeq` / `getResumeState().inboundSeq` | **Resets to 1** on every new socket / `DotCheckpointEngine` | **No** (after reconnect) |
| **Session-log** | `meta.logSeq` / `meta.logSeqs` / `logSeq` / `getResumeState().seq` / `ResumeWireLog` / `outboundSeq` on one producer connection | Durable across reconnects when stamped / logged | **Yes** |

**Wrong:** after reconnect catch-up, set `resumeCursor = meta.seq` (local 1/2/3) and later `sendResume({ fromSeq: resumeCursor })` — you drop log phases that already had higher numbers.

**Right:** persist `resumeCursor = meta.logSeq` (or `getResumeState().seq` / `conn.logSeq`) whenever stamps are present. On a first live connection without stamps, local seq may coincide with log seq until the first reconnect.

Stamps: `#!xaiop/seq/v1\n{"seq":N}\n` immediately before the phase wire. `pushJson` / `pushObject` with `session` / `retainOutbound` stamp automatically. `ResumeWireLog.wiresAfter(fromSeq)` prefixes each entry; use `wiresAfterRaw` only for dumps/tests. Helpers: `encodeSeqFrame` / `stampWireWithLogSeq`.

### Catch-up + `mergeChunkWindow` (not a bug)

Default `mergeChunkWindow: true`: a single `pushWire` of several resumed phases often yields **one** `onChunk` (batch-end Diff) with `meta.logSeqs` listing every log unit. Fine for state catch-up. If the product needs **per-phase** callbacks (e.g. animation), connect with `mergeChunkWindow: false` — still not a resume defect, just the default window policy.

### Inbound vs outbound

| Cursor | Meaning |
| --- | --- |
| `phaseSeq` / `inboundSeq` | Connection-local phases received by `DotCheckpointEngine` |
| `logSeq` / `getResumeState().seq` | Session resume cursor (logSeq when stamps seen; else falls back to local) |
| `outboundSeq` | Phases **sent** via `pushJson` / `pushObject` / `noteOutboundPhase` when `session` or `retainOutbound` is on (**per connection** — use app `ResumeWireLog` across reconnects) |
| `pushWire` | Does **not** auto-record / auto-stamp (call `stampWireWithLogSeq` + `noteOutboundPhase` / `log.record` if needed) |

### WS APIs (Node `XaiopWsConnection` / browser `XaiopBrowserWsConnection`)

| Option / method | Meaning |
| --- | --- |
| `session: true \| {…}` | Enable session cursor (+ outbound log + auto stamp on pushJson/Object) |
| `retainOutbound: true` | Outbound log without full session hello |
| `autoSession: true` | Send `session` hello when socket opens |
| `autoAck: true` | Ack after each inbound phase (**logSeq** when present) |
| `onControlError` / `onSession` / `onResume` / `onAck` / `onSnapshot` | Control callbacks (pass in **connect options**; locked after `connect`) |
| `sendSession` / `sendAck` / `sendResume` / `sendSnapshot` | Outbound frames |
| `getResumeState()` | `{ sessionId, seq, logSeq, inboundSeq, outboundSeq, epoch, committedSnapshot? }` — **`seq`/`logSeq` = resume cursor** |
| `logSeq` | Getter for session resume cursor |
| `replayOutboundAfter(fromSeq)` | Stamped wire for same-connection producer replay |
| `ResumeWireLog` | **App-owned** durable log across reconnects (keyed by `sessionId`) |
| Listen-accept | Handlers stay **unlocked** — `conn.onResume(fn)` etc. may be attached in `hub.onConnection` |

### Stream (`XaiopStream`)

Receive-side demux + optional `session` for inbound cursor. `onChunk(diff, meta)` receives `meta.seq` / `meta.seqs` and optional `meta.logSeq` / `meta.logSeqs`. Control **send** is receive-only (`send` no-op). Prefer WS for bidirectional resume.

### Cross-reconnect sketch

```js
import { ResumeWireLog, XaiopWs, stampWireWithLogSeq } from "@bylan280/xaiop";

const log = new ResumeWireLog();
const sessionId = "durable-1";

hub.onConnection((conn) => {
  conn.onResume((body) => {
    const snap = log.committedAt(body.fromSeq);
    if (snap !== undefined) conn.sendSnapshot(snap);
    // wiresAfter stamps #!xaiop/seq/v1 so the client gets meta.logSeq
    const wire = log.wiresAfter(body.fromSeq);
    if (wire) conn.pushWire(wire);
  });
});

// Live produce: either pushJson with session:true (auto stamp + outboundLog),
// or stampWireWithLogSeq(seq, wire) + log.record({ seq, wire, committed })
```

Consumer:

```js
let resumeCursor = 0;
const client = await XaiopWs.connect(url, {
  session: { sessionId },
  onPhase: (diff, meta) => {
    if (Number.isInteger(meta?.logSeq)) resumeCursor = meta.logSeq;
    // do NOT assign resumeCursor = meta.seq across reconnects
  },
});
// later reconnect:
await client2.sendResume({ sessionId, fromSeq: resumeCursor });
```

Per-connection `outboundLog` is cleared when the socket closes — durable resume **requires** an app-level log.

---

## 6. Annotation Span

`applyAnnotationSpans` **hard-skips** lines starting with `#!` (defense in depth; demux normally strips them first). Ordinary `#…` behavior is unchanged — see [annotation-span.md](annotation-span.md).

---

## 7. Direction (next)

| Item | Status |
| --- | --- |
| Length-prefixed / multi-line control bodies | Deferred (keep one-line JSON) |
| `ping` / control `error` frames | Deferred |
| Hub-side automatic phase retention | App / later SDK |
| Java control demux + session | Separate language tip |
| Protocol Frozen rewrite of `#` | Out of scope until a future package |

---

## 8. Related

- API: [../API.md](../API.md) §7.7 · §6 · constants  
- [typecheck.md](typecheck.md) · [ws-session.md](ws-session.md) · [streaming-parse.md](streaming-parse.md)  
- Release: [../../../meta/release-notes-2026-08-05.md](../../../meta/release-notes-2026-08-05.md)
