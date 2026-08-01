# Content Encoding

[English](content.md) · [简体中文](content.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-CONTENT` |
| Status | **Frozen** |
| Version | 0.1.0 |
| Last updated | 2026-08-02 |
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

After forced-string mark (Section 6):

1. int-parsable → **int**  
2. exactly `true` or `false` (lowercase) → **bool**  
3. else → **string**

---

## 6. Forced string

One or more spaces immediately after `:` and before the value text force **string**. Those spaces are not part of the payload.

```text
value: 1
```

→ `{ "value": "1" }`

```text
flag: true
```

→ `{ "flag": "true" }`

---

## 7. Empty lines

An empty Content line **MUST** be a Content syntax error.

---

## 8. Array Content interaction

See [syntax.md](syntax.md) §5:

- **Array level:** `:value` / one-line `key:value` add elements; `>` opens object element and enters.  
- **Inside element after `>`:** Content accumulates; **`<`** returns to the array before the next sibling.  
- Empty object elements **MUST** use `>` (then usually `<` if more siblings follow).
