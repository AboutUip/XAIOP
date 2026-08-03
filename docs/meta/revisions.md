# Specification Revisions

[English](revisions.md) · [简体中文](revisions.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-REV` |
| Status | **Frozen** |
| Version | 0.4.0 |
| Last updated | 2026-08-03 |
| Normative | Informative (history) |
| Depends on | `META-VER` |

---

## 1. Scope

Ordered revision history for the XAIOP **specification package**.  
English text is authoritative; Chinese mirrors track the same entries.

---

## 2. Package history

### 0.4.0 — 2026-08-03 (Frozen)

**Kind:** Breaking / additive normative (Hierarchy — locate & broadcast).

**Summary:** Specify **`@path`** (exact from Root; **create** missing object segments) and upgrade **`!path`** to true broadcast multi-Cursor with outer-prune matching over the **tree so far** (向前跨相, including prior `.` phases). Retain **`=`** as fuzzy first-match locate on the same cumulative tree. `.` exits broadcast.

| Area | Change |
| --- | --- |
| `PROT-HIER` §6–§9 | `=` / `@` / `!` / `.` (broadcast exit) |
| `PROT-SYNTAX` §3 | Table: `@path`, `!path` |
| Protocol notes | wire-attention locate section |
| `META-VER` | Current package → `0.4.0` |
| Node.js SDK | multi-Cursor `!`; `@` exact; `PROTOCOL_VERSION` → `0.4.0`; package `0.6.0` |

**Compatibility:** Prior Node locate-first `!` behavior is **not** protocol-faithful under 0.4.0. Writers that assumed single-Cursor `!` **MUST** switch to `@` or `=`. Broadcast requires `.` before another locate.

---

### 0.3.0 — 2026-08-03 (Frozen)

**Kind:** Breaking normative (Hierarchy — named arrays).

**Summary:** Re-opening a named array with `>name-` **re-enters** and **appends**, aligned with `>name` object re-enter. Prior 0.2.x behavior replaced the array.

| Area | Change |
| --- | --- |
| `PROT-HIER` §9.1 / §10 | Create-or-reenter for `>name-`; type conflict still discard |
| `PROT-SYNTAX` §3 / §8 | Table and overwrite summary |
| Protocol notes | wire-attention / streaming-attention |
| `META-VER` | Current package → `0.3.0` |
| Node.js SDK | `createEnterNamedArray` re-enter; `PROTOCOL_VERSION` → `0.3.0`; package `0.5.0` |

**Compatibility:** Streams that relied on a second `>name-` to **clear** a named array **MUST** adapt (no dedicated clear operator in 0.3.0). Append-across-`.` is now the default.

---

### 0.2.1 — 2026-08-03 (Frozen)

**Kind:** Additive normative (Content typing).

**Summary:** Add **null** to minimal Content typing, using the same forced-string rule as bool/int/float (spaces after `:` force string). Token `null` materializes as JSON `null`.

| Area | Change |
| --- | --- |
| `PROT-CONTENT` §5 | After bool; add exactly `null` → **null**; else string |
| `PROT-CONTENT` §6 | Forced-string example for `null` → `"null"` |
| `PROT-SYNTAX` §7 | Typing summary includes null |
| `META-VER` | Current package → `0.2.1` |
| Node.js SDK | `parseValue` / encode recognize null; `PROTOCOL_VERSION` → `0.2.1` |

**Compatibility:** Wire that previously typed bare `null` as **string** `"null"` now types it as JSON **null**. Structure / streaming grammar unchanged. Applications that relied on string `null` **MUST** adapt or force string with a leading space after `:`.

**Rationale (informative):** JSON payloads commonly use null for optional fields and sparse-looking arrays; omitting or rejecting null blocked faithful JSON ↔ XAIOP round-trips.

---

### SDK note — Node.js `xaiop` 0.4.0 / 0.4.1 (2026-08-03, informative)

**Not solely a protocol bump.** SDK features on Frozen wire:

| Area | Change |
| --- | --- |
| 0.4.0 | `XaiopWs` listen/push + connect/consume; dependency `ws` |
| 0.4.1 | Align encode/parse with protocol **0.2.1** null typing; default `nullPolicy: "encode"` |

---

### 0.2.0 — 2026-08-03 (Frozen)

**Kind:** Additive normative (Content typing).

**Summary:** Add **float** to minimal Content typing, using the same forced-string rule as integers (spaces after `:` force string). Float tokens materialize as IEEE 754 **binary64** JSON numbers.

| Area | Change |
| --- | --- |
| `PROT-CONTENT` §5 | After int-parsable → int; add float-parsable → float (binary64); then bool; else string |
| `PROT-CONTENT` §6 | Forced-string examples cover float tokens (`1.5` → `"1.5"`) |
| `PROT-SYNTAX` §7 | Typing summary includes float |
| `META-VER` | Current package → `0.2.0` |
| Node.js SDK | `parseValue` recognizes float tokens; `PROTOCOL_VERSION` → `0.2.0` |

**Compatibility:** Wire that previously typed `1.5` / `1e3` as **string** now types them as **number**. Structure / streaming grammar unchanged. Applications that relied on string floats **MUST** adapt or force string with a leading space after `:`.

**Rationale (informative):** Production payloads (metrics, money-like decimals, scientific values) need numeric floats without inventing a second markup. Binary64 matches common JSON number surfaces and is the highest precision available for JSON numbers in typical runtimes (e.g. ECMAScript `Number`, IEEE double).

---

### SDK note — Node.js `xaiop` 0.3.0 (2026-08-03, informative)

**Not a protocol package bump.** Additive SDK feature on Frozen wire 0.2.0:

| Area | Change |
| --- | --- |
| Encode | `encode` / `encodeSync` (static, instance, free) — JSON → strict XAIOP |
| Engine | `uploadJson` / `uploadJsonSync` |
| Options | Controllable `.` via `dotPolicy` / `phaseEvery` / `maxPhases` / `shouldPhase` |
| Docs | [sdk/nodejs/encode.md](../sdk/nodejs/encode.md) |
| Tests | `encode.test.js` + `encode.stability.test.js` |

---

### 0.1.0 — 2026-08-02 (Frozen)

Initial sealed protocol package: Structure (`PROT-BOUND`, `PROT-HIER`, `PROT-SYNTAX`), Content (`PROT-CONTENT` with int / bool / string only), Streaming (`PROT-STREAM`).
