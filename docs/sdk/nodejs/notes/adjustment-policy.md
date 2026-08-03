# Node.js note — careful adjustment policy

[English](adjustment-policy.md) · [简体中文](adjustment-policy.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-ADJUST` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** |

---

## 1. Principle

Adjust the Node SDK **carefully**: prefer additive APIs and bugfixes that do not change Frozen wire meaning or existing defaults.

| Do | Do not |
| --- | --- |
| Add methods / status fields | Flip Diff boundary defaults silently |
| Fix transport decoding bugs | Change later-wins / array-replace (protocol) |
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
| Compat × multi-phase | **Open (low priority)** | Keep default off |
| SSE auto-insert `\n` between events | **Deferred** | Prefer producer contract |
| Block-level Diff mode | **Deferred** | Opt-in only if pursued |
| Protocol later-wins / array replace | **Not adjustable here** | [protocol notes](../../../protocol/notes/) |

---

## 3. Related

- [streaming-parse.md](streaming-parse.md)  
- [../../notes/principles.md](../../notes/principles.md)  
- [../../../SEPARATION.md](../../../SEPARATION.md)
