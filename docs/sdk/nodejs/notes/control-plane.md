# SDK Control Root (`#!`) — demux, session, resume

[English](control-plane.md) · [简体中文](control-plane.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-CONTROL` |
| Status | Informative (SDK product convention) |
| Last updated | 2026-08-05 |
| Package | `xaiop` **0.14.0+** |
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
| `#!xaiop/ack/v1` | `{ sessionId, seq }` | Consumer confirms contiguous applied seq |
| `#!xaiop/resume/v1` | `{ sessionId, fromSeq, epoch? }` | Reconnect: continue from **`fromSeq + 1`** |
| `#!xaiop/snapshot/v1` | `{ sessionId, seq, tree }` | Optional committed-tree seed after resume (**no** Diff replay) |

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

## 5. Phase seq & resume (locked in 0.14)

| Topic | Decision |
| --- | --- |
| **Seq granularity** | One monotonic integer per completed **physical** `.` (and one for a non-empty finish tail). Cover-mode sub-emits also allocate seqs. |
| **Window merge** | `mergeChunkWindow: true` may deliver one `onChunk` for several `.`; `meta.seqs` lists all; `meta.seq` is the highest. |
| **Ack** | Highest contiguous applied seq (`sendAck` / `autoAck`). |
| **Reconnect Diff** | **Do not** replay historical Diffs. Optional `snapshot`, then wire from `fromSeq + 1`. |
| **Byte offsets** | **Not** used. |

### Inbound vs outbound

| Cursor | Meaning |
| --- | --- |
| `phaseSeq` / `inboundSeq` | Phases **received** and committed by `DotCheckpointEngine` |
| `outboundSeq` | Phases **sent** via `pushJson` / `pushObject` / `noteOutboundPhase` when `session` or `retainOutbound` is on |
| `pushWire` | Does **not** auto-record outbound (call `noteOutboundPhase` if needed) |

### WS APIs (Node `XaiopWsConnection` / browser `XaiopBrowserWsConnection`)

| Option / method | Meaning |
| --- | --- |
| `session: true \| {…}` | Enable session cursor (+ outbound log) |
| `retainOutbound: true` | Outbound log without full session hello |
| `autoSession: true` | Send `session` hello when socket opens |
| `autoAck: true` | Ack after each inbound phase seq |
| `onControlError` / `onSession` / `onResume` / `onAck` / `onSnapshot` | Control callbacks (pass in **connect options**; locked after `connect`) |
| `sendSession` / `sendAck` / `sendResume` / `sendSnapshot` | Outbound frames |
| `getResumeState()` | `{ sessionId, seq, inboundSeq, outboundSeq, epoch, committedSnapshot? }` |
| `replayOutboundAfter(fromSeq)` | Same-connection producer replay |
| `ResumeWireLog` | **App-owned** durable log across reconnects (keyed by `sessionId`) |
| Listen-accept | Handlers stay **unlocked** — `conn.onResume(fn)` etc. may be attached in `hub.onConnection` |

### Stream (`XaiopStream`)

Receive-side demux + optional `session` for inbound cursor. `onChunk(diff, meta)` receives `meta.seq` / `meta.seqs`. Control **send** is receive-only (`send` no-op). Prefer WS for bidirectional resume.

### Cross-reconnect sketch

```js
import { ResumeWireLog, XaiopWs, encodePhaseJson } from "xaiop";

const log = new ResumeWireLog();
const sessionId = "durable-1";

hub.onConnection((conn) => {
  conn.onResume((body) => {
    const snap = log.committedAt(body.fromSeq);
    if (snap !== undefined) conn.sendSnapshot(snap);
    const wire = log.wiresAfter(body.fromSeq);
    if (wire) conn.pushWire(wire);
  });
});

// On produce: pushWire + log.record({ seq, wire, committed })
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
