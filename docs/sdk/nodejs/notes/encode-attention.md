# Node.js note — encode attention (JSON → XAIOP)

[English](encode-attention.md) · [简体中文](encode-attention.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-ENCODE` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** |
| Full guide | [../API.md](../API.md) |

Protocol wire rules remain Frozen **0.3.0**. Encode is an **SDK** feature (`xaiop` **0.6.0+**).

---

## 1. Stability contract (SDK)

For values the encoder accepts:

1. `parseSync(encodeSync(value, opt))` deep-equals `value` (`-0` → `0`).  
2. Same `(value, options)` → identical wire (deterministic).  
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

---

## 3. Dot policy ↔ streaming

Default `dotPolicy: perTopLevelKey` aligns with Node stream Diff checkpoints (`.` phases).  
`dotPolicy: string[]` cuts after listed JSON paths (`a.b[2]`); mutually exclusive with frequency options; index must be final.

**Production:** deliberately place `.` via encode options — keep large contiguous fields in one phase; cut only at separable subunits so progressive delivery stays smooth. See [API.md](../API.md) Encode section.

See [streaming-parse.md](streaming-parse.md). Wire later-wins / named-array re-enter append: [../../../protocol/notes/wire-attention.md](../../../protocol/notes/wire-attention.md).

---

## 4. Related

- Guide: [../API.md](../API.md)  
- Tests: `encode.test.js`, `encode.stability.test.js`  
- Bench methodology ≠ encode ban: [../../../performance.md](../../../performance.md) §2
