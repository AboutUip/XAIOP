# Content Encoding

[English](content.md) · [简体中文](content.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-CONTENT` |
| Status | **Frozen** |
| Version | 0.4.0 |
| Last updated | 2026-08-03 |
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

## 4. Newline ban in value

A value **MUST NOT** contain `LF` / `CRLF`.  
The next line is a new parse attempt, never a value continuation.

---

## 5. Minimal typing

After forced-string mark (Section 6), apply the first matching rule:

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
