# Releases

[English](releases.md) · [简体中文](releases.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-REL` |
| Status | Informative |
| Last updated | 2026-08-05 |
| Normative | **No** — release index; seal rules live in `META-VER` |
| Depends on | `META-VER`, `META-REV` |

---

## 1. Purpose

Index of **immutable** protocol and SDK releases (GitHub Releases style).

- Sealed protocol package versions **do not** move when a newer package is sealed.  
- Published SDK package versions **do not** rewrite prior version numbers.  
- Normative seal rules: [status-and-versioning.md](status-and-versioning.md).

---

## 2. Protocol packages (sealed)

| Protocol | Status | Wire highlights | Git tag (recommended) |
| --- | --- | --- | --- |
| `0.6.0` | Frozen | `#` custom annotation transmission; prior `&` / `@` / `!` / `=` | `protocol-v0.6.0` |
| `0.5.0` | Frozen | `&path` delete; prior `@` / `!` / `=` | `protocol-v0.5.0` |
| `0.4.0` | Frozen | `@` create-or-enter; `!` broadcast | `protocol-v0.4.0` |
| `0.3.0` | Frozen | Named-array re-enter append | `protocol-v0.3.0` |

Full narrative history: [revisions.md](revisions.md).

---

## 3. SDK packages (Node.js `xaiop`)

| SDK | Implements protocol | Git tag (recommended) | Notes |
| --- | --- | --- | --- |
| `0.15.0` | `0.6.0` | `sdk-nodejs-v0.15.0` | `bufferStats` / `compactCommitted` (long-session wire discard); still protocol **0.6.0** |
| `0.14.3` | `0.6.0` | `sdk-nodejs-v0.14.3` | `@` cumulative Diff (D2); optional `onChunk` / `emitDiff:false`; still protocol **0.6.0** |
| `0.14.2` | `0.6.0` | `sdk-nodejs-v0.14.2` | Diff isolation after `.` (D1); keyed-state modeling docs / NG6; still protocol **0.6.0** |
| `0.14.1` | `0.6.0` | `sdk-nodejs-v0.14.1` | `#!xaiop/seq/v1` → `meta.logSeq`; stamp on pushJson / `ResumeWireLog.wiresAfter`; two-seq docs; still protocol **0.6.0** |
| `0.14.0` | `0.6.0` | `sdk-nodejs-v0.14.0` | SDK Control Root `#!` demux; session / seq / resume / ack / snapshot; Span hard-skip `#!`; still protocol **0.6.0** |
| `0.13.0` | `0.6.0` | `sdk-nodejs-v0.13.0` | Annotation Span (`onAnnotationSpan`); typeCheck escape for span region; still protocol **0.6.0** |
| `0.12.0` | `0.6.0` | `sdk-nodejs-v0.12.0` | Buffer line intercept (`onLineIntercept`); still protocol **0.6.0** |
| `0.11.0` | `0.6.0` | `sdk-nodejs-v0.11.0` | Parse `#` custom-annotation lines; implements protocol **0.6.0** |
| `0.10.0` | `0.5.0` | `sdk-nodejs-v0.10.0` | Type registry / freeze checks; WS `pushTypeConsistency` |
| `0.9.0` | `0.5.0` | `sdk-nodejs-v0.9.0` | TypeScript; `core` / `browser` / Node entries; `&` + `cover` |
| `0.8.0` | `0.5.0` | `sdk-nodejs-v0.8.0` | `&` parse; optional `cover` Diff (JS source) |
| `0.7.0` | `0.4.0` (as declared at publish) | `sdk-nodejs-v0.7.0` | Parse history |
| `0.6.0` | `0.4.0` | `sdk-nodejs-v0.6.0` | `@` / `!` alignment |

### SDK packages (Java `io.xaiop:xaiop`)

| SDK | Protocol implemented | Notes |
| --- | --- | --- |
| `0.5.0` | `0.4.0` | `XaiopStream` consumer (HTTP / SSE / RAW); still wire **0.4.0** |
| `0.4.0` | `0.4.0` | parse · encode · merge · checkpoint |

Other languages: declare their own sealed mapping in language READMEs. A language that has not implemented `0.5.0` **MUST** continue to cite the protocol version it actually implements (e.g. Java may still cite `0.4.0`).

---

## 4. Release notes & announcements

| Date | Notes |
| --- | --- |
| 2026-08-05 | [release-notes-2026-08-05-0.15.0.md](release-notes-2026-08-05-0.15.0.md) — Node `0.15.0` `bufferStats` / `compactCommitted` |
| 2026-08-05 | [release-notes-2026-08-05-0.14.3.md](release-notes-2026-08-05-0.14.3.md) — Node `0.14.3` `@` cumulative Diff (D2) / optional `onChunk` |
| 2026-08-05 | [release-notes-2026-08-05-0.14.2.md](release-notes-2026-08-05-0.14.2.md) — Node `0.14.2` Diff isolation (D1) / keyed modeling |
| 2026-08-05 | [release-notes-2026-08-05-0.14.1.md](release-notes-2026-08-05-0.14.1.md) — Node `0.14.1` `meta.logSeq` / seq stamp |
| 2026-08-05 | [release-notes-2026-08-05.md](release-notes-2026-08-05.md) — Node `0.14.0` Control Root `#!` / session / resume / ack / snapshot |
| 2026-08-04 | [release-notes-2026-08-04.md](release-notes-2026-08-04.md) — Node `0.13.0` · Java `0.5.0` · **Skills no longer provided** (source remains under [`skills/`](../../skills/)) |

---

## 5. Conformance citation

Valid: “Conforms to XAIOP protocol package **0.5.0** (Frozen).”  
Invalid: “Conforms to the latest Frozen XAIOP” (no version number).
