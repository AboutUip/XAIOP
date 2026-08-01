# Syntax Reference (Complete Grammar)

[English](syntax.md) · [简体中文](syntax.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-SYNTAX` |
| Status | **Frozen** |
| Version | 0.1.0 |
| Last updated | 2026-08-02 |
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
2. **`>`** creates empty anonymous object **and enters** it (only way to create an **anonymous** object).  
3. **`>name`** creates/enters a **named** child at the current Cursor — **not** an outer anonymous wrap.  
4. **`<`** pops one level only; **`<` at Root is a syntax error**.  
5. **`<name`** pops one level, then creates/enters `name`.  
6. **No** brace pairing, indentation, or multi-character terminators as boundaries.  
7. **No** Block end marker — next Label line or EOF ends the Block.  
8. Value **MUST NOT** contain line endings.  
9. Content splits on the **first** `:` only.  
10. **`-` does not separate sibling array elements** — it opens an array (or a nested array element).  
11. **Root declaration** (Section 2): when a root object or root array is intended, open with `>` or `-`; when no such root container is intended, omit them.

---

## 2. Root declaration

The Generator **MUST** make root intent explicit when a root container exists:

| Intent | First Structure line | Meaning |
| --- | --- | --- |
| Root is an **object** | standalone `>` | Create empty anonymous object at Root **and enter** it |
| Root is an **array** | standalone `-` | Create empty anonymous array at Root **and enter** it |
| **No** root object/array | omit leading `>` / `-` | Start with `>name`, Content, `=`, `!`, etc. at Root |

1. If a root **object** or root **array** is intended, the Stream **MUST** begin with `>` or `-` respectively — telling the Parser the root is an empty object or an empty array.  
2. If **no** root object/array is intended, the Generator **MUST NOT** be required to write a leading `>` or `-`.  
3. `>name` alone does **not** declare an anonymous root object.

**With root object:**

```text
>
>meta
name:demo
```

→ `{ "meta": { "name": "demo" } }`

**With root array:**

```text
-
:a
:b
```

→ `[ "a", "b" ]`

**Without root container:**

```text
>meta
name:demo
```

→ `{ "meta": { "name": "demo" } }` (named child of Root; no anonymous root opener)

---

## 3. Line grammar

| Line | Kind | Meaning |
| --- | --- | --- |
| `>` | Structure | Create/enter **anonymous** object — **always enters**; never implied by `>name` |
| `>name` | Structure | Create/enter **named** child at current Cursor (no outer anonymous wrap) |
| `>name-` | Structure | Create/enter named array |
| `-` | Structure | Create/enter anonymous array (or nested array as next element) |
| `<` | Structure | Pop one level only |
| `<name` | Structure | Pop one level, then create/enter `name` |
| `key:value` | Content | Property of **current** object |
| `:value` | Content | Scalar / anonymous value |
| `.` | Structure | Reset Cursor to Root |
| `=path` | Structure | Absolute / fuzzy locate |
| `!name` | Structure | Broadcast-append to matches |

**Forbidden:** Bare Label · `>>x` stacking · `<` at Root · multiline value.

---

## 4. `>` / `<` pair

- **`>`** — create empty anonymous object and enter (same in objects and arrays). Later writes go into it until leave.  
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
| **Array level** | `:v` · one-line `key:value` · `>` (object element and enter) · `-` (nested array element) |
| **Inside element** (after `>`) | Content on that object · nested Structure · **`<`** returns to array |

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
| exactly `true`/`false` | bool |
| else | string |
| spaces after `:` before value | forced string |

---

## 8. Boundary / overwrite (summary)

- Label ends at `LF` or `CRLF`; Content until next Label; last Block at EOF; one Label per line.  
- Later re-type at same address: overwrite/discard (SDK clears).

---

## 9. Lookup

| Need | Go to |
| --- | --- |
| Root `>` / `-` / omit | §2 |
| Line forms | §3 |
| `>` / `<` | §4 |
| Nesting | §5 |
| Arrays | §6 |
| Types | §7 · [content.md](content.md) |
| Line endings | [boundary.md](boundary.md) |
| Operators | [hierarchy.md](hierarchy.md) |
| Streaming | [streaming.md](streaming.md) |
| Fixture | [../examples/complex.xaiop](../examples/complex.xaiop) |
