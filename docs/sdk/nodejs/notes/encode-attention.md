# Node.js note — encode attention (JSON → XAIOP)

[English](encode-attention.md) · [简体中文](encode-attention.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-ENCODE` |
| Status | Informative |
| Last updated | 2026-08-27 |
| Normative | **No** |
| Full guide | [../API.md](../API.md) |

Protocol wire rules remain Frozen **0.6.0**. Encode is an **SDK** feature (`xaiop` **0.6.0+**).

---

## 1. Stability contract (SDK)

For values the encoder accepts:

1. `parseSync(encodeSync(value, opt))` deep-equals `value` (`-0` → `0`).  
2. Same `(value, options)` → identical wire (deterministic). Non-empty wire ends with exactly one `\n` (terminator, not a Content line).  
3. Named arrays **MAY** span `.` phases (`>name-` re-enter appends). Default encode still keeps each named array in one phase for Diff clarity.  
4. Compatibility mode does **not** change encode output (strict wire only).  
5. **Array roots** do not emit object-style top-level `.` phases (`dotPolicy` ignored for phasing).

Not guaranteed: byte-identical `encode(parse(handWire))`; preserving object `undefined` (default omit); sparse array holes; document-root null.

Default `nullPolicy` is **`encode`** (`key:null` / `:null`). Use `omit` to drop object null keys; `error` to reject.

---

## 2. Key hazards (SDK validation)

Rejected to prevent silent shape corruption:

| Key | Why |
| --- | --- |
| empty / whitespace / `:` | Invalid Label name |
| ends with `-` | `>name-` is array enter |
| contains `>` `<` `=` `!` | Operator / path ambiguity |

Encode is **not** a general JSON serializer: legal JSON keys can be illegal Labels (`a:b`, empty, whitespace, trailing `-`). `symbolKeys` only escapes a leading line-class character. See [API.md](../API.md) §4.3.

---

## 2b. String value hazards (SDK validation)

Physical `U+000A` / `U+000D` in a string **value** are encoded as the two-character sequences `\n` / `\r` (protocol **0.7.0** Draft, always on). `\\` encodes a backslash. Encode **MUST NOT** emit a physical line break inside a Content payload. Unknown `\x` and a trailing `\` are **parse** syntax errors.

| Value | Why rejected |
| --- | --- |
| begins with **U+0020 SPACE** | After `:`, leading spaces are the **forced-string** marker ([content.md](../../../protocol/content.md) §6), not payload — `encode` **MUST** refuse rather than emit wire that parse would strip |

Still accepted (and round-trip): empty string, leading **tab**, trailing spaces, strings that only need forced-string for typed tokens (`"1"`, `"true"`, …), and strings whose semantic value contains CR/LF (via `\n` / `\r`).

---

## 3. Dot policy ↔ streaming

Default `dotPolicy: perTopLevelKey` aligns with Node stream Diff checkpoints (`.` phases).  
`dotPolicy: string[]` cuts after listed JSON paths (`a.b[2]`); mutually exclusive with frequency options; index must be final.

**Production:** deliberately place `.` via encode options — keep large contiguous fields in one phase; cut only at separable subunits so progressive delivery stays smooth. See [API.md](../API.md) Encode section.

See [streaming-parse.md](streaming-parse.md). Wire later-wins / named-array re-enter append: [../../../protocol/notes/wire-attention.md](../../../protocol/notes/wire-attention.md).

---

## 4. Related

- Guide: [../API.md](../API.md)  
- Tests: `encode.test.js`, `encode.stability.test.js`, `content.escape.test.js`  
- Bench methodology ≠ encode ban: [../../../performance.md](../../../performance.md) §2
