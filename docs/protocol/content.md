# Content Encoding

[English](content.md) · [简体中文](content.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-CONTENT` |
| Status | **Draft** |
| Version | 0.7.0 |
| Last updated | 2026-08-27 |
| Normative | **Normative** |
| Depends on | `PROT-SYNTAX`, `PROT-BOUND`, `PROT-HIER` |
| Informs | `CONF` |

---

## 1. Scope

Content encoding inside a Block after Structure Labels locate the Block.  
Full grammar: **[syntax.md](syntax.md)** first.

Out of scope: business-semantic key validation; application naming/depth policies.

---

## 2. Separator `:`

Content **MUST** use `:` as key/value separator.  
No double-quote markup for string type.

A Content value line **MUST** contain at least one `:` (standalone Structure `-` is not Content).

### 2.1 First-`:` split

Split on the **first** `:` only.

- Before: key (empty ⇒ anonymous `:value`)  
- After: raw value text  
- Later `:` characters stay inside the value  

---

## 3. Forms

### 3.1 `key:value`

Object property: `name:xuan` → `{ "name": "xuan" }`

### 3.2 `:value`

Anonymous / scalar value (typical array element): `:a` → `"a"` under an array Cursor.

---

## 4. Physical newline ban; semantic newlines

A Content **line** **MUST NOT** contain physical `LF` / `CRLF` in the value. The next physical line is a new parse attempt, never a value continuation. Empty Content lines remain syntax errors (Section 7).

String values **MAY** contain `U+000A` and `U+000D`. Those code points **MUST** appear on the wire as the two-character escapes in Section 4.1. This alphabet is **always on** (not an option).

### 4.1 Content escape alphabet

After the first `:` split and after stripping forced-string leading spaces (Section 6), unescape the remaining payload **before** typing (Section 5).

If the payload contains no `U+005C REVERSE SOLIDUS` (`\`), unescape is a no-op.

Otherwise scan left to right. `\` **MUST** be followed by one of:

| Sequence | Payload |
| --- | --- |
| `\\` | `\` |
| `\n` | `U+000A` |
| `\r` | `U+000D` |

- Trailing `\` with no follower → syntax error.  
- Any other `\x` → syntax error.  
- Tab (`U+0009`) is written literally (not `\t`).

Encode **MUST** apply this alphabet to every `\` / `U+000A` / `U+000D` in a string value (after the leading-space refusal in Section 6).

### 4.2 Relation to package 0.6.0

Protocol package **0.6.0** treated `\n` / `\r` / `\\` in a payload as literal characters. Package **0.7.0** unescapes them. Cite the package version.

---

## 5. Minimal typing

After forced-string mark (Section 6) and unescape (Section 4.1), apply the first matching rule:

1. int-parsable → **int**  
2. float-parsable → **float** (JSON number; IEEE 754 **binary64**)  
3. exactly `true` or `false` (lowercase) → **bool**  
4. exactly `null` (lowercase) → **null**  
5. else → **string**

### 5.1 Int-parsable

Optional leading `+` or `-`, then one or more decimal digits (`0`–`9`) only. No `.`, no exponent.

### 5.2 Float-parsable

A token that is **not** int-parsable and matches:

```text
[ "+" / "-" ] (
  1*DIGIT "." *DIGIT [ exponent ] /
  "." 1*DIGIT [ exponent ] /
  1*DIGIT exponent
)
exponent = ( "e" / "E" ) [ "+" / "-" ] 1*DIGIT
```

Examples that **MUST** type as float: `1.5`, `-2.25`, `.5`, `5.`, `1e3`, `-2.5E-2`.

### 5.3 Float precision

When a float token is exposed as a JSON number, conforming implementations **MUST** interpret it as an IEEE 754 **binary64** (double) value — the highest precision commonly available for JSON numbers. Host APIs **SHOULD** use the native binary64 floating type for that surface (e.g. ECMAScript `Number`, Java `double`).

`NaN`, `Infinity`, and `-Infinity` are **not** float-parsable; they remain **string** unless forced otherwise.

---

## 6. Forced string

One or more spaces immediately after `:` and before the value text force **string**. Those spaces are not part of the payload. The rule applies equally to int-looking and float-looking text.

```text
value: 1
```

→ `{ "value": "1" }`

```text
ratio: 1.5
```

→ `{ "ratio": "1.5" }`

```text
flag: true
```

→ `{ "flag": "true" }`

```text
empty: null
```

→ `{ "empty": "null" }`

Without the space:

```text
ratio:1.5
```

→ `{ "ratio": 1.5 }`

```text
empty:null
```

→ `{ "empty": null }`

**Encoder implication:** a JSON string whose first character is U+0020 SPACE cannot be placed
losslessly after `:` (those spaces are this marker). Conforming encode APIs **MUST** refuse such
values rather than emit wire that parses to a different string. Leading tab (`U+0009`) is not this
marker and may round-trip. JSON strings containing `U+000A` / `U+000D` **MUST** use Section 4.1
escapes rather than physical line breaks.

---

## 7. Empty lines

An empty Content line **MUST** be a Content syntax error.

---

## 8. Array Content interaction

See [syntax.md](syntax.md) §6 / §6.1:

- **Array level — scalar:** `:value` pushes one scalar element.  
- **Array level — one-line object (normative):** non-empty-key `key:value` pushes one complete element `{ "key": <typed value> }`. Cursor **stays** at array level (does not enter).  
- **Array level — fillable object:** `>` creates an object element **and enters** it; Content accumulates; **`<`** returns to the array before the next sibling.  
- Empty object elements **MUST** use `>`.
