# Syntax Reference (Complete Grammar)

[English](syntax.md) · [简体中文](syntax.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-SYNTAX` |
| Status | **Frozen** |
| Version | 0.6.0 |
| Last updated | 2026-08-04 |
| Normative | **Normative** — grammar entry point |
| Depends on | `PROT-BOUND`, `PROT-HIER`, `PROT-CONTENT` |
| Informs | Generators, Parsers, SKILL authors, `CONF` |

---

## 0. Purpose

Single entry for “what may one line contain?”.  
Details: [boundary.md](boundary.md) · [hierarchy.md](hierarchy.md) · [content.md](content.md) · [streaming.md](streaming.md)

---

## 1. Hard rules (MUST)

1. **No Bare Labels** — name-only line (e.g. `data`) is a syntax error.  
2. **`>`** creates or re-enters an anonymous object by Cursor context (Section 4 / [hierarchy.md](hierarchy.md) §4.2): root open, **new array element**, or **re-enter** current object — only way to create an **anonymous** object.  
3. **`>name`** creates/enters a **named** child at the current Cursor — **not** an outer anonymous wrap.  
4. **`<`** pops one level only; **`<` at Root is a syntax error**.  
5. **`<name`** pops one level, then creates/enters `name`.  
6. **No** brace pairing, indentation, or multi-character terminators as boundaries.  
7. **No** Block end marker — next Label line or EOF ends the Block.  
8. Value **MUST NOT** contain line endings.  
9. Content splits on the **first** `:` only.  
10. **`-` does not separate sibling array elements** — it opens an array (or a nested array element).  
11. **Root opener** (Section 2): `>` / `-` declare a **complete** anonymous root document value; omitting them yields a **root fragment** (no outer object) — **not** the same as `{"a":{}}`.  
12. **Array one-line object** (Section 6.1): at array level, `key:value` is one complete single-property object element (Cursor stays at array level).

---

## 2. Root declaration — complete document vs fragment

A leading standalone `>` or `-` **declares and enters** an anonymous root **object** or **array**. That anonymous container **is** the document root value for JSON materialization.

Starting with `>name` (or Root-level Content) **without** a prior `>` / `-` does **not** create an outer anonymous object. The Stream is a **root fragment**: named bindings at Root. Notation is `"a":{}` — **not** the JSON document `{"a":{}}`.

| Situation | Opener | Result |
| --- | --- | --- |
| Complete JSON **array** document | `-` (**MUST**) | e.g. `["a","b"]` |
| Complete JSON **object** document (entered anonymous root) | `>` (**MUST** when that is the intent) | e.g. `{"a":{}}`, `{"x":1}` |
| Root **fragment** (no outer anonymous object) | omit `>` / `-`; use `>name` / Content | e.g. semantic `"a":{}` — **not** standalone JSON |

**Different products (normative):**

```text
>
>a
```

→ JSON document `{ "a": {} }` — outer anonymous object **exists** (declared by `>`).

```text
>a
```

→ root fragment `"a":{}` — **no** outer anonymous object; **cannot** stand alone as a JSON document.

```text
>
x:1
```

→ `{ "x": 1 }` — anonymous root with direct Content.

```text
-
:a
:b
```

→ `[ "a", "b" ]` — root array.

---

## 3. Line grammar

| Line | Kind | Meaning |
| --- | --- | --- |
| `>` | Structure | Anonymous object: open root / **new array element** / **re-enter** current object |
| `>name` | Structure | Create/enter **named** child at current Cursor (no outer anonymous wrap) |
| `>name-` | Structure | Create/**re-enter** named array (append elements if already an array) |
| `-` | Structure | Create/enter anonymous array (or nested array as next element) |
| `<` | Structure | Pop one level only |
| `<name` | Structure | Pop one level, then create/enter `name` |
| `key:value` | Content | Property of **current** object |
| `:value` | Content | Scalar / anonymous value |
| `.` | Structure | Reset Cursor to Root |
| `=path` | Structure | Fuzzy locate (first match) |
| `@path` | Structure | Exact from Root; **create** missing object segments |
| `!path` | Structure | Broadcast to all path-fragment matches |
| `&path` | Structure | Delete deepest key (absolute from Root; no Cursor move) |
| `#…` | Custom annotation transmission | Standalone line; protocol does not interpret text after `#`; no Cursor / tree effect |

**Forbidden:** Bare Label · bare `&` · `>>x` stacking · `<` at Root · multiline value.

> **Terminology:** The official name for `#` lines is **custom annotation transmission** (not a “comment primitive”). Parsers may ignore the whole line; normative wording must use the former.

---

## 4. `>` / `<` pair

- **`>`** — by Cursor: open anonymous root, push+enter a new array element, or **re-enter** the current object (modify). Never implied by `>name`. Later writes go into the current object until leave.  
- **`<`** — pop to parent; no create; illegal at Root.  
- **`<name`** — pop, then create/enter `name` at parent.

```text
>
>data
```

```text
>
x:1
```

→ `{ "x": 1 }` until `<` or other leave.

---

## 5. Object nesting

```text
>data
>config
version:1
```

→ `{ "data": { "config": { "version": 1 } } }`

```text
>data
a:b
>c
```

→ `{ "data": { "a": "b", "c": {} } }` (Cursor inside `c` after last `>`).

---

## 6. Arrays

Open with `-` or `>name-`. Do **not** use `-` between siblings.  
A Stream whose **root** is an array **MUST** open with `-` (Section 2).

| Cursor | Next lines |
| --- | --- |
| **Array level** | `:v` · one-line `key:value` (Section 6.1) · `>` (object element and enter) · `-` (nested array element) |
| **Inside element** (after `>`)| Content on that object · nested Structure · **`<`** returns to array |

### 6.1 One-line object element (normative)

When the Cursor is at **array level**, a Content line with a **non-empty** key:

```text
key:value
```

**MUST** be parsed as **one complete array element** whose value is the single-property object `{ "key": <typed value> }`.

1. The Cursor **MUST remain** at array level (it does **not** enter that object).  
2. This is a **full** element declaration, not a property of the array.  
3. It is **distinct** from `>` … Content … `<`, which creates a fillable object element and **enters** it.  
4. Use `>` when the element needs **zero or multiple** properties, or nested Structure.

```text
-
a:solo
```

→ `[ { "a": "solo" } ]`

### Scalars

```text
-
:a
:b
:c
```

→ `[ "a", "b", "c" ]`

### Empty objects

```text
-
>
<
>
<
```

→ `[ {}, {} ]`

### Fillable objects

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

### One-line object elements (array level)

```text
-
a:b
a:b
```

→ `[ { "a": "b" }, { "a": "b" } ]`

### Mixed

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

### Named array

```text
>data
>tags-
:a
:b
```

→ `{ "data": { "tags": ["a", "b"] } }`

---

## 7. Content typing (summary)

| Rule | Result |
| --- | --- |
| `key:value` | property |
| `:value` | scalar / anonymous |
| int-parsable | int |
| float-parsable | float (JSON number, binary64) |
| exactly `true`/`false` | bool |
| exactly `null` | null |
| else | string |
| spaces after `:` before value | forced string |

See [content.md](content.md) §5–§6.

---

## 8. Boundary / overwrite (summary)

- Label ends at `LF` or `CRLF`; Content until next Label; last Block at EOF; one Label per line.  
- Later re-type at same address (object ↔ array): overwrite/discard (SDK clears).  
- Same-type revisit: `>name` / `>name-` **re-enter** (array elements append). See [hierarchy.md](hierarchy.md) §11–§12.

---

## 9. Lookup

| Need | Go to |
| --- | --- |
| Root opener `>` / `-` / omit | §2 |
| Line forms | §3 |
| `>` / `<` | §4 |
| Nesting | §5 |
| Arrays / one-line object elements | §6 · §6.1 |
| Types | §7 · [content.md](content.md) |
| Line endings | [boundary.md](boundary.md) |
| Operators | [hierarchy.md](hierarchy.md) |
| Streaming | [streaming.md](streaming.md) |
| Fixture | [../examples/complex.xaiop](../examples/complex.xaiop) |
