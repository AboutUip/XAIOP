# Hierarchy and Cursor

[English](hierarchy.md) · [简体中文](hierarchy.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-HIER` |
| Status | **Frozen** |
| Version | 0.6.0 |
| Spec title | Boundary & Hierarchy Specification |
| Spec version | v0.1 |
| Last updated | 2026-08-04 |
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

Any address located by the Cursor **MUST** have value type **`object`**, unless fixed as **`array`** by postfix `-` (Section 11).

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

Same-address revisit (object Cursor + bare `>` again, or later Content on the same keys) follows create-or-update / overwrite (Section 12): later wins. Duplicate counting by a Generator is out of scope for the wire protocol.

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

## 6. Operator `=` (fuzzy locate)

```text
Syntax: =<path>
Semantics: Fuzzy match-locate <path> in the hierarchy tree built so far; move single Cursor
```

1. Path segments are separated by `>` (e.g. `=data>cor`).  
2. Matching is **fuzzy**; full Root-to-target path is not required.  
3. More complete paths are more precise.  
4. On multiple matches, take the **first** (deterministic document order).  
5. Zero matches → **syntax error** (does **not** create).  
6. Does **not** create nodes. Target **MUST** be an object or array address.  
7. **Forward across `.` phases:** `=` locates in the **whole tree built so far**, including nodes written in earlier phases (full-document / cumulative parse).

Contrast: `@` is exact from Root and **creates** missing segments (本相); `!` broadcasts to all complete path-fragment matches (also whole tree so far).

---

## 7. Operator `@` (exact path from Root; create-or-enter)

```text
Syntax: @<path>
Semantics: Exact path from Root along <path>; create missing object segments; move single Cursor; no fuzzy search
```

1. Path segments separated by `>` (e.g. `@a>b`).  
2. Matching starts at the document Root (or fragment root) and follows **exact** consecutive keys — **not** a deep search of sibling branches.  
3. Each segment **MUST** be a complete label (no substring / partial-label match).  
4. If a segment is **missing** or holds a scalar → **create** an empty object at that key and enter (本相 create).  
5. If a segment already holds an **object** → enter it; if it holds an **array** and this is the **final** segment → enter that array; if an array appears mid-path → replace with `{}` and continue.  
6. Does **not** enter broadcast mode.  
7. Unlike `=` / `!`, `@` is **not** a cross-phase locate of prior data only — missing path is filled in the current write (本相). Prior-phase nodes that already exist on the exact Root path are still entered.

---

## 8. Operator `!` (broadcast path match)

```text
Syntax: !<path>
Semantics: Locate every complete path-fragment match; enter broadcast multi-Cursor mode
```

### 8.1 Matching

1. Path segments separated by `>` (e.g. `!test`, `!a>b`).  
2. Search the **whole** tree built so far for complete path-fragment matches (consecutive keys), including nodes from **earlier `.` phases** (向前跨相 / cumulative).  
3. **Outer prune:** when a match is found starting at a child key, that child's subtree is **not** searched for further matches of the same query. Sibling / other branches continue.  
4. Partial labels do not match (e.g. `!te` does not match a node `test` unless a node `te` exists).  
5. Targets **MUST** be object or array.  
6. Zero matches → **syntax error** (does **not** create).

### 8.2 Broadcast mode

1. On success, Cursor becomes a **set** of clones (one per match).  
2. Subsequent Structure and Content lines apply to **every** Cursor.  
3. If **any** Cursor fails the line → the whole line **fails** (document error).  
4. `!` / `@` / `=` while broadcast is active → **syntax error** (emit `.` first).  
5. **`&path` is allowed** while broadcast is active (Section 9) — path is relative to each Cursor.  
6. `.` resets Cursor to Root and **exits** broadcast mode.  
7. After `!`, writes use ordinary XAIOP (type conflict → overwrite; compatible re-enter → update / append). `@` alone may create; `!` / `=` only move.

Streaming: implementations that emit per-`.` Diff **MUST** parse a **cumulative prefix** for phases that contain `=` / `!` / `&` so locate and delete see prior phases. `@` create-or-enter **MAY** stay phase-local.

---

## 9. Operator `&` (delete path)

```text
Syntax: &<path>
Semantics: Delete the deepest key along <path>; do not move Cursor
```

1. Path segments separated by `>` (same path form as `@`, e.g. `&a`, `&a>b`). Bare `&` (empty path) is **forbidden** (syntax error).  
2. **Single Cursor:** path is **absolute from Root**; delete the deepest key; **do not** move Cursor.  
3. **Missing target:** silent **no-op**.  
4. Requires an **object** document root. Forbidden on **array root** and **fragment root**. Cannot delete the document root itself.  
5. **MAY** delete a whole named array value (the key whose value is the array). There is **no** array-element index delete.  
6. If the delete would remove a node on the **Cursor chain** (the current Cursor value or any ancestor on the stack) → **syntax error**.  
7. **Broadcast** (`!` active): **allowed**. Path is **relative to each Cursor**. Per-Cursor missing target = no-op. Cursor-chain conflict on **any** Cursor fails the whole line (same as other broadcast failures).  
8. `.` still only resets Cursor / exits broadcast; it does not specially interact with `&`.  
9. A later write to the same address **creates** again (ordinary create-or-update).

Streaming: phases that contain `&` **MUST** use cumulative-prefix parse for per-`.` Diff (same rule as `=` / `!`). Cover-mode Diff shaping for `&` is an **SDK-only** option (default off): inject `.` after consecutive `&`, emit a deepest-key `null` tombstone Diff, then restore with a `>` chain — not part of the wire grammar.

---

## 10. Operator `.` (reset)

```text
Syntax: .
Semantics: Reset Cursor to Root; clear relative position state; exit broadcast mode
```

When level is uncertain or generation accuracy is dropping, Generators **SHOULD** emit `.` then relocate with `=` / `@` / `>` from Root. Do not guess depth with extra `<` / `>`.

---

## 11. Operator `#` (custom annotation transmission)

```text
Syntax: # <any text to end of line>
Semantics: Custom annotation transmission; protocol does not interpret text after #; no Cursor / JSON tree effect
```

1. **Official name:** **custom annotation transmission**. Normative text **MUST NOT** define this primitive as a “comment”.  
2. **MUST** be a **standalone line** whose logical line begins with `#` (`#` is the first character; leading whitespace means it is **not** this primitive).  
3. **Position unrestricted** — anywhere in the document, as long as it is a standalone line.  
4. Parsers **MUST** recognize such lines and **MUST NOT** move Cursor, write/delete the tree, end a Block, or enter/exit broadcast because of them.  
5. Text after `#` has **no protocol meaning** (may be empty: a line that is only `#`). Whether apps retain or forward annotations is out of scope.  
6. A `#` inside a Content value (e.g. `note:#x`) is **not** this primitive — still parsed as Content.

---

## 12. Array operator `-`

`-` **opens** arrays. Sibling elements are **not** separated by `-`.

After `>` opens an object element, Cursor stays **inside** that element until `<` / `<name` / `.` returns to the array.

### 12.1 Postfix `-` (named array)

```text
>data
>tags-
:a
:b
```

→ `{ "data": { "tags": ["a", "b"] } }`

**Create-or-reenter (aligned with `>name` objects):**

1. If key `name` is missing or not an array → create a new empty array, assign it, enter.  
2. If key `name` already holds an array → **re-enter that same array**; later elements **append** (do **not** replace).  
3. Re-opening after `.` with `>name-` therefore grows the array across phases.

```text
>
>tags-
:a
.
>
>tags-
:b
```

→ `{ "tags": ["a", "b"] }`

### 12.2 Standalone `-` (anonymous array)

```text
-
:a
:b
:c
```

→ `[ "a", "b", "c" ]`

Inside an array, another `-` opens a **nested** anonymous array as the next element and enters it.

### 12.3 Array level vs inside element

| At array level | Inside element after `>` |
| --- | --- |
| `:v` → scalar element | Content on current object |
| `key:value` → **one-line object element** (normative: single-property `{k:v}`; Cursor stays at array) | nested Structure allowed |
| `>` → object element **and enter** | deeper nesting |
| `-` → nested array element | — |
| | `<` → return to array |

### 12.4 Examples

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

## 13. Create-or-update and overwrite / discard

### 13.1 Create-or-update

No explicit create vs modify declaration. Missing paths are created; compatible continued use appends / updates / **re-enters**.

Examples:

- `>name` then later `>name` at the same parent (still an object) → re-enter.  
- `>name-` then later `>name-` at the same parent (still an array) → re-enter; elements **append**.  
- Bare `>` while Cursor is already on an object → re-enter that object (Section 4.2).  
- Bare `>` while Cursor is inside an array → create a **new** element (not re-enter).  
- After `&path` removes a key, a later write to the same address **creates** again.

### 13.2 Overwrite / discard

Later Cursor action that re-types or replaces a populated address (object ↔ array, or equivalent): later wins; prior payload discarded. Clearing / JSON materialization is an SDK concern.

Examples:

- Key holds an object, then `>name-` → discard object, install new array.  
- Key holds an array, then `>name` → discard array, install new object.  
- Key already holds an array, then `>name-` → **not** discard; re-enter and append (Section 11.1).

---

## 14. Order independence

1. `.` plus absolute / more complete `=` / `@` paths **can** yield order-independent tree shape.  
2. Relative `>` / `<` introduce order dependency.  
3. Order independence is **not** a default guarantee.  
4. Applications that require it **MUST** restrict Generators to `.` + `=` / `@` and prohibit relative operators.

---

## 15. See also

Cheat-sheet: **[syntax.md](syntax.md)**.
