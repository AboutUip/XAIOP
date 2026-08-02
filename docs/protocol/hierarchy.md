# Hierarchy and Cursor

[English](hierarchy.md) · [简体中文](hierarchy.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-HIER` |
| Status | **Frozen** |
| Version | 0.1.0 |
| Spec title | Boundary & Hierarchy Specification |
| Spec version | v0.1 |
| Last updated | 2026-08-02 |
| Normative | **Normative** |
| Depends on | `PROT-SYNTAX`, `PROT-BOUND`, `TERM-GLOSS` |
| Informs | `PROT-STREAM`, `PROT-CONTENT`, `CONF` |

---

## 1. Scope

Cursor operators and hierarchy.  
**Grammar first:** [syntax.md](syntax.md).

**Pair:** `>` = create anonymous object **and enter**, or **re-enter** current object when already on one; inside an array = new element. `<` = **pop one level only**; `<` at Root = syntax error.

**Root opener:** `>` / `-` produce a complete anonymous root document value. Omitting them yields a **root fragment** (e.g. `"a":{}`) with **no** outer anonymous object — **not** `{"a":{}}`. See [syntax.md](syntax.md) §2.

---

## 2. Cursor address type

Any address located by the Cursor **MUST** have value type **`object`**, unless fixed as **`array`** by postfix `-` (Section 9).

A Label that creates/enters a named or anonymous object denotes an **object** node (unless postfix `-` applies).

---

## 3. Bare Label ban

A Label that is only a name with **no** Cursor operator is **forbidden** (syntax error):

```text
data
```

Required named-object form:

```text
>data
```

---

## 4. Operator `>` — named and anonymous object

### 4.1 Named object

```text
Syntax: ><label>
Semantics: Relative to current Cursor, create / enter child object <label>
```

`>a` alone yields a **named** child `a` at the current Cursor (JSON shape `{ "a": {} }` at that level). It does **not** create an outer anonymous wrapper. An anonymous object exists only when a standalone `>` (Section 4.2) was used.

### 4.2 Anonymous object (`>`)

```text
Syntax: >
Semantics: Context-dependent create-or-update for an anonymous object
```

| Cursor | Semantics |
| --- | --- |
| Init / no document yet | Create empty anonymous **root** object and enter |
| Inside an **array** | Create a new empty object **element**, push it, and enter (one element per `>` … `<`) |
| Already on an **object** (including Root after `.`) | **Re-enter** the current object (modify) — do **not** nest another anonymous object |

This is the **only** way to create an anonymous object. There is no “create empty element without entering” variant. `>name` never implies a prior anonymous outer object.

Same-address revisit (object Cursor + bare `>` again, or later Content on the same keys) follows create-or-update / overwrite (Section 10): later wins. Duplicate counting by a Generator is out of scope for the wire protocol.

```text
>
>data
```

- First `>`: create/enter anonymous root.  
- `>data`: create/enter **named** child `data` inside it.  
- View: `{ "data": {} }`.

```text
>
id:1
.
>
id:2
```

- After `.`, Cursor is at the root object; the second `>` **re-enters** that root (modify).  
- `id:2` overwrites `id:1` → `{ "id": 2 }`.

### 4.3 Nesting

```text
>data
>config
version:1
```

→ `{ "data": { "config": { "version": 1 } } }`

### 4.4 Coexistence with Content

Direct Content properties and nested objects/arrays **MAY** coexist in one object:

```text
>data
a:b
>c
```

→ `{ "data": { "a": "b", "c": {} } }`

### 4.5 Same-symbol stacking ban

`>>label` **MUST NOT** be supported.

Legal multi-level descent:

1. One `>` action per line (including empty `>`).  
2. Absolute path via `=` (Section 6).

In-line composition at different positions (e.g. `>root>child`) **MAY** be allowed as one relative path on one Label line — not same-symbol stacking.

---

## 5. Operator `<` — pop / ascend

### 5.1 Pop only (`<`)

```text
Syntax: line that is exactly <
Semantics: Move Cursor to parent one level. Do not create.
```

`<` at Root is a **syntax error**.

### 5.2 Pop then enter (`<name`)

```text
Syntax: < immediately followed by a label name
Semantics: Pop one level, then create / enter <label> at parent
```

### 5.3 Role

Leave the current object (including an array element opened by `>`) so the next sibling can be written at the parent (e.g. enclosing array).

---

## 6. Operator `=` (absolute / fuzzy path)

```text
Syntax: =<path>
Semantics: Match-locate <path> in the hierarchy tree built so far
```

1. Matching is **fuzzy**; full Root-to-target path is not required.  
2. More complete paths are more precise.  
3. On multiple matches, take the **first**.  
4. `=` **MAY** combine with `>` (e.g. `=data>cor`).

---

## 7. Operator `!` (broadcast append)

```text
Syntax: !<label>
Semantics: Append subsequent Content to every existing node matching <label>
```

---

## 8. Operator `.` (reset)

```text
Syntax: .
Semantics: Reset Cursor to Root; clear relative position state
```

When level is uncertain or generation accuracy is dropping, Generators **SHOULD** emit `.` then relocate with `=` or `>` from Root. Do not guess depth with extra `<` / `>`.

---

## 9. Array operator `-`

`-` **opens** arrays. Sibling elements are **not** separated by `-`.

After `>` opens an object element, Cursor stays **inside** that element until `<` / `<name` / `.` returns to the array.

### 9.1 Postfix `-` (named array)

```text
>data
>tags-
:a
:b
```

→ `{ "data": { "tags": ["a", "b"] } }`

### 9.2 Standalone `-` (anonymous array)

```text
-
:a
:b
:c
```

→ `[ "a", "b", "c" ]`

Inside an array, another `-` opens a **nested** anonymous array as the next element and enters it.

### 9.3 Array level vs inside element

| At array level | Inside element after `>` |
| --- | --- |
| `:v` → scalar element | Content on current object |
| `key:value` → **one-line object element** (normative: single-property `{k:v}`; Cursor stays at array) | nested Structure allowed |
| `>` → object element **and enter** | deeper nesting |
| `-` → nested array element | — |
| | `<` → return to array |

### 9.4 Examples

```text
-
>
<
>
<
```

→ `[ {}, {} ]`

```text
-
>
a:1
b:2
<
>
c:3
<
```

→ `[ { "a": 1, "b": 2 }, { "c": 3 } ]`

```text
-
a:b
a:b
```

→ `[ { "a": "b" }, { "a": "b" } ]`

```text
-
>
<
>
<
:a
:b
```

→ `[ {}, {}, "a", "b" ]`

---

## 10. Create-or-update and overwrite / discard

### 10.1 Create-or-update

No explicit create vs modify declaration. Missing paths are created; compatible continued use appends / updates / **re-enters**.

Examples:

- `>name` then later `>name` at the same parent (still an object) → re-enter.  
- Bare `>` while Cursor is already on an object → re-enter that object (Section 4.2).  
- Bare `>` while Cursor is inside an array → create a **new** element (not re-enter).

### 10.2 Overwrite / discard

Later Cursor action that re-types or replaces a populated address (object ↔ array, or equivalent): later wins; prior payload discarded. Clearing / JSON materialization is an SDK concern.

---

## 11. Order independence

1. `.` plus absolute / more complete `=` paths **can** yield order-independent tree shape.  
2. Relative `>` / `<` introduce order dependency.  
3. Order independence is **not** a default guarantee.  
4. Applications that require it **MUST** restrict Generators to `.` + `=` and prohibit relative operators.

---

## 12. See also

Cheat-sheet: **[syntax.md](syntax.md)**.
