# Label escape introducer (symbol-key mode)

[English](label-escape.md) · [简体中文](label-escape.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-NOTE-LABEL-ESC` |
| Status | **Draft** (targets protocol package **0.7.0**; SDK may ship ahead) |
| Last updated | 2026-08-27 |
| Normative | **Yes** when `symbolKeys` / symbol-key mode is enabled |
| Depends on | `PROT-SYNTAX`, `PROT-HIER`, `PROT-CONTENT` |

---

## 1. Problem

A JSON object key that begins with a **line-class character** (`#` `@` `>` `<` `=` `!` `&` `?`) cannot be written as a bare Content / `>name` label: the first character would change how the line is classified (e.g. `#k:1` is custom annotation transmission, not Content).

Default generators **MUST** refuse such keys (`XaiopEncodeError` in SDKs). Silent emission that evaporates on parse is forbidden.

---

## 2. Reserved introducer

**Label escape introducer** = **U+001F** UNIT SEPARATOR (UTF-8 byte `0x1F`).

1. U+001F is **reserved** for this dialect.  
2. Default mode (symbol-key mode **off**): object keys **MUST NOT** begin with U+001F or with `#` `@` `>` `<` `=` `!` `&` `?`.  
3. Keys that contain `#` only in a non-initial position (e.g. `a#b`) remain ordinary Content labels.  
4. Standalone custom annotation lines (`#…` as the **first** character of the logical line) are **unchanged** and are **not** JSON keys.

---

## 3. Symbol-key mode (opt-in)

When both generator and parser enable **symbol-key mode** (`symbolKeys: true` in current SDKs):

### 3.1 Encode

If a logical key’s first character is in `{ U+001F, #, @, >, <, =, !, & }`, emit the wire label as:

```text
U+001F + logicalKey
```

(Double-escape: a logical key that already begins with U+001F receives another U+001F.)

Cursor/operator characters `>` `<` `=` `!` `&` remain forbidden in the **remainder** of the key after an escaped head.

### 3.2 Decode

After stripping Cursor operators from a Label (`>` / `<` / path segments / Content name before `:`), if the remaining label text begins with U+001F, remove **exactly one** introducer to obtain the logical JSON key.

### 3.3 Dialect coupling

Enabling encode without the matching parse option leaves U+001F in application keys. Peers **MUST** agree on the mode for a document or session.

---

## 4. Non-goals

- Escaping string **values** (unchanged).  
- Changing custom annotation transmission.  
- Claiming full JSON key-space coverage (with or without the opt-in mode). Keys containing `:` or whitespace remain illegal Labels even when symbol-key mode is on.

---

## 5. See also

- Hierarchy `#` annotation: [../hierarchy.md](../hierarchy.md) §11  
- SDK: [../../sdk/nodejs/API.md](../../sdk/nodejs/API.md) §4.2–4.3 · Java `EncodeOptions.symbolKeys` / `ParseOptions.symbolKeys`
