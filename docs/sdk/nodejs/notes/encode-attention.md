# Node.js note — encode attention (JSON → XAIOP)

[English](encode-attention.md) · [简体中文](encode-attention.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-ENCODE` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** |
| Full guide | [../encode.md](../encode.md) |

Protocol wire rules remain Frozen 0.2.1. Encode is an **SDK** feature (`xaiop` 0.4.1+).

---

## 1. Stability contract (SDK)

For values the encoder accepts:

1. `parseSync(encodeSync(value, opt))` deep-equals `value` (`-0` → `0`).  
2. Same `(value, options)` → identical wire (deterministic).  
3. Named arrays are **not** split across `.` phases (reopen would **replace** — protocol rule).  
4. Compatibility mode does **not** change encode output (strict wire only).

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
See [streaming-parse.md](streaming-parse.md). Wire later-wins / array replace: [../../../protocol/notes/wire-attention.md](../../../protocol/notes/wire-attention.md).

---

## 4. Related

- Guide: [../encode.md](../encode.md)  
- Tests: `encode.test.js`, `encode.stability.test.js`  
- Bench methodology ≠ encode ban: [../../../performance.md](../../../performance.md) §2
