---
name: xaiop
description: >-
  Generate and interpret XAIOP (eXtensible AI Output Protocol) v0.1.0 Frozen.
  Use when producing XAIOP, converting JSON↔XAIOP, or when the user attaches
  this skill / mentions XAIOP, .xaiop, or AI-native structured output.
---

# XAIOP v0.1.0 (Frozen)

Emit valid XAIOP only. One Label or Content line per line. No `{}`/`[]`, no quotes, no indent-as-structure, no Bare Labels (`data` alone is illegal → use `>data`).

## 1. Root declaration (required when root exists)

| Intent | Open with | Meaning |
| --- | --- | --- |
| Root is an **object** | `>` | Empty anonymous object at Root — **enter it** |
| Root is an **array** | `-` | Empty anonymous array at Root — **enter it** |
| **No** root object/array | omit `>` / `-` | Start with `>name`, Content, `=`, … |

- If a root object or root array is intended → **MUST** start with `>` or `-` so the root type is explicit.  
- If no root container is intended → **omit** leading `>` / `-`.  
- `>name` alone does **not** declare an anonymous root.

### With root object

```text
>
>meta
name:demo
```

↔ `{ "meta": { "name": "demo" } }`

### With root array

```text
-
:a
:b
```

↔ `[ "a", "b" ]`

### Without root container

```text
>meta
name:demo
```

↔ `{ "meta": { "name": "demo" } }`

## 2. Forms

| Line | Meaning |
| --- | --- |
| `>` | Create/enter **anonymous** object (only way) |
| `>name` | Create/enter **named** child at current Cursor |
| `>name-` | Create/enter named array |
| `-` | Create/enter anonymous array (or nested array element) |
| `<` | Pop one level (illegal at Root) |
| `<name` | Pop, then create/enter `name` |
| `key:value` | Property of **current** object |
| `:value` | Scalar / anonymous value |
| `.` | Reset Cursor to Root |
| `=path` | Fuzzy locate (first match) |
| `!name` | Broadcast-append to matches |

**Never:** Bare Label · `>>x` · `<` at Root · blank lines · newline in value · `-` between sibling elements · **`name:` then newline then `-`** (illegal named-array split).

## 3. Values — forced string (`x: 5`)

Split on the **first** `:`. No quotes. **Entire** `key:value` stays on **one line** — never break after `:`.

| XAIOP | JSON | Why |
| --- | --- | --- |
| `x:5` | `"x": 5` | int |
| `x: 5` | `"x": "5"` | space(s) after `:` → **forced string** |
| `flag:true` | `"flag": true` | bool |
| `flag: true` | `"flag": "true"` | forced string |
| `name:xuan` | `"name": "xuan"` | string |

Spaces after `:` are not part of the payload.

## 4. Arrays — one line opens the array

`-` or **`>name-`** opens an array. Do **not** separate siblings with `-`.

| Cursor | Next |
| --- | --- |
| Array level | `:v` · one-line `k:v` · `>` enter object element · `-` nested array |
| Inside element | fields / nest; **`<`** back to array before next sibling |

### Named array = single token `>name-` (critical)

A named array **MUST** be opened on **one** Structure line: `>tags-`.  
**Forbidden:** put the name as Content `tags:` then newline then `-`. That is **two** records: empty-string property + unrelated array — **not** `tags: [...]`.

| Wrong (AI common bug) | Right |
| --- | --- |
| `typical_structure:` ⏎ `-` ⏎ `>` … | `>typical_structure-` ⏎ `>` … |
| `>core_features` ⏎ `-` ⏎ `:a` | `>core_features-` ⏎ `:a` |

Wrong:

```text
typical_structure:
-
>
file:SKILL.md
<
```

Right:

```text
>typical_structure-
>
file:SKILL.md
<
```

Scalar named array — Right:

```text
>core_features-
:极简无符号语法
:游标精准导航
```

Not `>core_features` then `-`.

## 5. When accuracy drops

Emit **`.`** → Root, then relocate with `>` / `=`. Do not guess depth.

## 6. Side-by-side examples

### Nest + leave + sibling (root object)

```text
>
>meta
name:demo
>author
name:xuan
<
version:1
```

↔

```json
{
  "meta": {
    "name": "demo",
    "author": { "name": "xuan" },
    "version": 1
  }
}
```

### Named array + fillable + forced string (root object)

```text
>
>users-
>
id:1
name:alice
score: 10
<
>
id:2
name:bob
<
```

↔

```json
{
  "users": [
    { "id": 1, "name": "alice", "score": "10" },
    { "id": 2, "name": "bob" }
  ]
}
```

### Root array: scalars · one-line object · nested array

```text
-
:a
a:solo
-
:x
:y
```

↔

```json
["a", { "a": "solo" }, ["x", "y"]]
```

### Forced string vs int

```text
>
n:5
s: 5
```

↔

```json
{ "n": 5, "s": "5" }
```

### Root object vs no root opener (same JSON shape for one named child)

```text
>
>a
```

↔ `{ "a": {} }` — anonymous root declared, then named `a`.

```text
>a
```

↔ `{ "a": {} }` — **no** root container declared; named child of Root only.

## 7. Before send

- [ ] Root intent clear: `>` / `-` / omit
- [ ] Named arrays are `>name-` on **one line** — never `name:` ⏎ `-`
- [ ] Never break a `key:value` across lines
- [ ] Forced string when needed (`key: 5` → string)
- [ ] Entered array elements `<`-closed before next sibling
- [ ] Lost? → `.` then relocate · no Bare Label · no `<` at Root · no blank lines
