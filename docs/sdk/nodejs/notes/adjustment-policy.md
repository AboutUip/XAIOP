# Node.js note — careful adjustment policy

[English](adjustment-policy.md) · [简体中文](adjustment-policy.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-ADJUST` |
| Status | Informative |
| Last updated | 2026-08-05 |
| Normative | **No** |

---

## 1. Principle

Adjust the Node SDK **carefully**: prefer additive APIs and bugfixes that do not change Frozen wire meaning or existing defaults.

| Do | Do not |
| --- | --- |
| Add methods / status fields | Flip Diff boundary defaults silently |
| Fix transport decoding bugs | Change later-wins / named-array re-enter append (protocol) |
| Document by-design Diff = `.` phase | Rewrite `PROT-STREAM` to match the SDK |
| Opt-in future flags | Break `getSnapshot()` final-only semantics |

---

## 2. Status board

| Item | Status | Notes |
| --- | --- | --- |
| Final stream ≡ one-shot parse | **Closed** | Consistency tests |
| Diff = `.` phase (default) | **By design** | Documented; Block Diff only as future opt-in |
| `getCommittedSnapshot()` | **Done** (additive) | Mid-stream cumulative JSON |
| `getSnapshot()` mid-stream | **Unchanged** | Still final-after-finish |
| RAW/WS binary UTF-8 streaming decode | **Done** | Matches HTTP body path |
| Empty phase → `null` chunk | **By design** | Consumers must tolerate |
| `bufferStats` / `compactCommitted` | **Done** (additive, **0.15.0**) | Long-session receive-wire discard; history conflict throws by default |
| `autoCompact` watermark | **Deferred** | Manual compact first |
| Compat × multi-phase | **Open (low priority)** | Keep default off |
| SSE auto-insert `\n` between events | **Deferred** | Prefer producer contract |
| Block-level Diff mode | **Deferred** | Opt-in only if pursued |
| Protocol later-wins / named-array re-enter append | **Not adjustable here** | [protocol notes](../../../protocol/notes/) |

---

## 3. Related

- [streaming-parse.md](streaming-parse.md)  
- [../../notes/principles.md](../../notes/principles.md)  
- [../../../SEPARATION.md](../../../SEPARATION.md)
