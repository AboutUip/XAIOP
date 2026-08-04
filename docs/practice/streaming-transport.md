# Practice — streaming data transport

[English](streaming-transport.md) · [简体中文](streaming-transport.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PRACTICE-STREAM` |
| Status | Informative |
| Last updated | 2026-08-04 |
| Normative | **No** |

**Recommended scenario** for carrying sealed wire over real networks — not protocol.  
**Protocol** defines when streamed *text* is valid and what JSON Snapshot/Diff mean at the Block level ([../protocol/streaming.md](../protocol/streaming.md)).  
**This page** is framing / transport practice and common product mistakes.

Runtime APIs: Node — **[../sdk/nodejs/API.md](../sdk/nodejs/API.md)** (`XaiopStream` · `XaiopWs`); browser phase consume — `xaiop/browser` (`XaiopStream` · `XaiopBrowserWs`, see API §7.6); Java consumer — **[../sdk/java/README.md](../sdk/java/README.md)** (`XaiopStream` · HTTP / SSE / RAW; no WS) · deep-dive [../sdk/nodejs/notes/streaming-parse.md](../sdk/nodejs/notes/streaming-parse.md) · [../sdk/nodejs/notes/ws-session.md](../sdk/nodejs/notes/ws-session.md) · practice [skeleton-stream.md](skeleton-stream.md).

---

## 1. Two layers of “streaming”

| Layer | Question | Owner |
| --- | --- | --- |
| **Wire streaming** | When is a Label/Block complete? When may JSON update? | Protocol (`PROT-STREAM`, `PROT-BOUND`) |
| **Network streaming** | How do HTTP / SSE / WebSocket / RAW chunks deliver UTF-8 text? | Practice + SDK transport |

Never confuse transport chunk boundaries with Label line boundaries. Reassemble to **complete lines** (`LF` / `CRLF`) before interpreting structure.

---

## 2. Producer contracts (any stack)

1. Prefer **LF** or **CRLF**; avoid lone CR as the only terminator.  
2. Put **complete lines** (including the newline) in each SSE event / WS text frame when possible.  
3. Do not split a Label across frames **without** eventually supplying the newline.  
4. Binary frames: do not split UTF-8 code points across chunks unless the consumer uses a **streaming** UTF-8 decoder.  
5. Emit `.` only when you intend a Cursor reset **and** (if your consumer Diffs on `.`) a mid-stream JSON unit.  
6. Reopen `>name-` across `.` when you intend to **append** to the same named array (protocol re-enters).

Wire checklist: [../protocol/notes/wire-attention.md](../protocol/notes/wire-attention.md) · [../protocol/notes/streaming-attention.md](../protocol/notes/streaming-attention.md).

---

## 3. Consumer contracts

1. Buffer until line endings; then feed a conforming Parser / stream client.  
2. Distinguish:
   - **Diff / phase chunk** — incremental view (boundary depends on implementation),  
   - **Committed / progressive Snapshot** — cumulative later-wins so far,  
   - **Final Snapshot** — full buffer at end-of-stream.  
3. Tolerate empty Diffs if the implementation emits them.  
4. On mid-stream parse error, decide app policy (keep vs discard prior Diffs); protocol does not require rollback.

---

## 4. Snapshot / Diff in practice

Protocol: Diff on each completed **Block**; Snapshot = usable JSON so far.  
Implementations **may** choose a coarser Diff boundary (e.g. `.` phases) — that must be documented in **SDK** notes, not by rewriting the protocol.

| If you need… | Do… |
| --- | --- |
| Strict Block-level UI updates | Prefer an implementation that Diffs per Block, or emit denser Labels without relying on `.` alone |
| Coarse section updates | Agree with the consumer that `.` bounds Diffs; structure the model Skill accordingly ([archive model-output](../archive/practice-llm-emit-2026-08-04/model-output.md)) |
| Only final JSON | Disable mid-stream processing if the SDK allows; still stream bytes for latency of first byte |

---

## 5. Related

- Protocol: [../protocol/streaming.md](../protocol/streaming.md)  
- Model emit: [archive model-output](../archive/practice-llm-emit-2026-08-04/model-output.md)  
- Skeleton WS: [skeleton-stream.md](skeleton-stream.md)  
- Node stream client: [../sdk/nodejs/notes/streaming-parse.md](../sdk/nodejs/notes/streaming-parse.md)
- Java stream consumer: [../sdk/java/README.md](../sdk/java/README.md) (`XaiopStream`)
- Node / browser WS: [../sdk/nodejs/notes/ws-session.md](../sdk/nodejs/notes/ws-session.md) (§9 browser phases)
- Separation: [../SEPARATION.md](../SEPARATION.md)
