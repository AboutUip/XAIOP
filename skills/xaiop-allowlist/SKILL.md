---
name: xaiop-allowlist
description: >-
  XAIOP v0.4.0 generator Skill (ALLOWLIST scheme): emit only permitted line
  forms. Cursor-IR writer for models. Use when producing allowlist / whitelist
  XAIOP, when this skill is attached, or when the user asks for allowlist output.
---

> **Notice (2026-08-04):** This Skill is **no longer provided** as an official product.
> Source remains in the repository for download only — see [../README.md](../README.md)
> and [../../docs/meta/release-notes-2026-08-04.md](../../docs/meta/release-notes-2026-08-04.md).

# XAIOP Allowlist Skill (`xaiop-allowlist`)

**Scheme:** ALLOWLIST (closed world).  
**Protocol:** XAIOP v0.4.0 Frozen. LLM writers are one Generator class on the cursor IR.

You may emit **only** lines and sequences described in this Skill.  
Anything not listed here as **Allowed** is **forbidden** — including JSON, YAML, `key=value`, markdown, prose, checklists, indentation-as-structure, bracket lists (`[a,b]`), quoted attribute tags, and any line with spaces inside a Structure token.

Output = contiguous XAIOP stream only (unless the user explicitly allows a wrapper).  
When the payload is complete, **stop** on the last Allowed line — do not append extra Labels, prose, or random tokens.

---

## 1. Line, blank, and whitespace semantics (normative)

### 1.1 What is a line

- The stream is a sequence of lines separated by **LF** (`\n`) or **CRLF** (`\r\n`). Both are equivalent.
- A lone **CR** without LF is **not** a line ending.
- Each line is **exactly one** of: an Allowed Structure Label, or Allowed Content, or (only where Allowed below) nothing else.
- **One line = one Label or one Content.** Never two Labels on one line. Never Label+Content glued.

### 1.2 Empty / blank lines

- A line with **zero characters** (empty between two line endings) is **not Allowed**.
- A line that contains **only spaces or tabs** is **not Allowed**.
- Do **not** insert blank lines for readability.

### 1.3 Leading / trailing whitespace on a line

| Position | Allowed? |
| --- | --- |
| Leading spaces/tabs before a Label or Content | **No** — every Allowed line starts at column 0 with the first significant character |
| Trailing spaces after Content value | Avoid; not required. Prefer no trailing spaces |
| Spaces **inside** an Allowed Content value (after the first `:`) | **Yes** — part of the value (see §3 typing) |
| Spaces inside a Structure Label (`> meta`, `< 楚雄`, `= a>b`, `>  `) | **No** — Labels have no internal padding; A2/A5/A6/A8 are flush forms only |

### 1.4 Newlines inside values

- A Content value **MUST NOT** contain LF or CRLF.
- The next line is always a **new** Label or Content attempt — never a continuation of the previous value.

### 1.5 What does **not** create structure

These are **not** hierarchy mechanisms (do not use them to nest):

- Indentation / column count  
- `{` `}` `[` `]` `(` `)`  
- Multi-character end markers (`---`, `<END>`, `###`, …)

**Only** Allowed Structure Labels move the Cursor.

---

## 2. Closed-world rule

1. Build every output line by matching **exactly one** row in **§3 Allowlist**.  
2. If a character sequence is not in §3, **do not emit it**.  
3. Prefer **create** (`>`, `>name`, `>name-`, Content) over relocate (`=`) when writing new data.  
4. Self-checks from this Skill stay **silent** — never print Q&A, bullets, or “Yes/No” about the protocol.  
5. **Flush-left only:** the first character of every line is `>`, `<`, `-`, `.`, `=`, `!`, or a Content key / `:` — never space or tab.  
6. **No glue:** never attach Content to a Structure character on the same line (`<id:1`, `>shard_index:1`, `<value:江辞` are all outside the allowlist).


---

## 3. Allowlist — permitted line forms

Only these lines exist in legal output.

### 3.1 Structure

| # | Exact form | Meaning | Minimal example |
| --- | --- | --- | --- |
| A1 | `>` | Open anonymous **root object** (document start) · **or** open new **array object-element** and enter · **or** **re-enter** current object | See §4.1 |
| A2 | `>name` | Create/enter **named object** `name` at Cursor | `>meta` |
| A3 | `>name-` | Create/**re-enter** **named array** `name` (**one** token, one line) | `>tags-` |
| A4 | `-` | Create/enter **anonymous array** (root or nested element) | `-` |
| A5 | `<` | Pop Cursor **one** level (not at Root). Line is **exactly** `<` | `<` |
| A6 | `<name` | Pop one level, then create/enter `name` at parent. **No space** after `<` | `<author` |
| A7 | `.` | Reset Cursor to **Root** | `.` |
| A8 | `=seg` or `=seg>seg>…` | Fuzzy **locate** existing node; segments join with `>` only; **no spaces**; **no values** | `=meta` · `=a>b` |
| A9 | `@seg` or `@seg>seg>…` | **Exact** from Root; **create** missing object segments (本相) | `@a>b` |
| A10 | `!seg` or `!seg>seg>…` | Broadcast all matches on **tree so far** (向前跨相; outer prune) until `.` | `!note` · `!a>b` |

**Name token (`name` / `seg`):** non-empty; **no whitespace**; no `:`; no `=`.  
Prefer `[A-Za-z_][A-Za-z0-9_]*` for structure names (`>meta`, `>cast-`, `=siblings`).  
CJK and spaces belong in **Content values** (`name:江辞`, `text:……`), not inside `>…` / `<…` / `=…` tokens.

**A3:** trailing `-` is part of `>name-` (create/re-enter array). Locate the same array with A8 `=name` (e.g. `=tags`).

**A5 vs A6 vs C2 (cast / name lists / leave):**

| Need | Allowed line | Not on allowlist |
| --- | --- | --- |
| Leave current object/element (pop only) | A5 — line is exactly `<` | `<id:1` · `<value:江辞` · `< 楚雄` |
| Pop then enter named object `author` | A6 `<author` (no space, name only) | `<author:x` · `< author` |
| Array member that is a plain string | C2 `:江辞` | bare `江辞` · `"江辞"` · `<江辞` (unless true A6) |
| New fillable object element in array | A1 `>` then C1 fields then A5 `<` | starting the element with `<…` |

**Open an episode/scene object element — Allowed sequence only:**

```text
>
id:22-1
day_night:日
location:神医大会
>cast-
:江辞
:唐如霜
.
>beats-
>
kind:dialogue
speaker:江辞
text:一行对白
<
<
```

- Element opener is bare `>` (A1), **not** `<id:22-1`.  
- Fields are separate C1 lines.  
- Cast names are separate C2 lines (`:江辞`), **not** bare `江辞`.

**A8 path:** after `=` only segments joined by `>` — no value payload, no spaces  
(`=meta` · `=a>b` Allowed; anything like `=title 剧本` is outside the allowlist).

### 3.2 Content

| # | Exact form | Meaning | Minimal example |
| --- | --- | --- | --- |
| C1 | `key:value` | Write property on current **object** · **or** at **array level**, one complete single-property object element (Cursor stays at array) | `title:demo` · `index:1` · `kind:dialogue` |
| C2 | `:value` | Scalar / anonymous value (typical **array** scalar element) | `:alpha` · `:江辞` |

**C1 separator is the first colon `:` only.**  
The Allowed field line always looks like `key:value` — examples:

```text
index:1
total:3
title:我真不是绝世神医
kind:dialogue
speaker:江辞
```

Forms such as `index=1`, `kind=dialogue`, `title=…`, `characters=[]` are **not** C1 and are **not** on this allowlist.  
JSON array / object text as a value (e.g. `aliases:[a,b]`) is outside the allowlist for structured lists — use A3 + C2 / fillable elements instead (§4.4–4.5, §4.15).

**Separator details:**  
- Before first `:` → key (`C2` has empty key).  
- After first `:` → raw value (may contain more `:` characters).
### 3.3 Typing for `value` (Allowed interpretations)

After optional forced-string mark:

| Value text | Type |
| --- | --- |
| Integer token (`0`, `-3`, `42`) | int |
| Float-parsable token (`1.5`, `.5`, `1e3`) | float (JSON number, IEEE 754 binary64) |
| Exactly `true` or `false` | bool |
| Exactly `null` | null |
| Anything else | string |
| One or more spaces immediately after `:` before the value | **forced string** (those spaces are not payload) |

Examples (Allowed):

```text
n:5
f:1.5
s: 5
s2: 1.5
ok:true
label: true
url:https://a/b:c
```

---

## 4. Allowlist — permitted sequences (how to compose)

Use only combinations of §3 lines. Each subsection is an Allowed pattern.

### 4.1 Complete object document

**Allowed start:** A1 `>` as first line.

```text
>
>meta
name:demo
version:1
```

```text
>
x:1
y:2
```

### 4.2 Complete array document

**Allowed start:** A4 `-` as first line.

```text
-
:a
:b
```

```text
-
>
id:1
name:alice
<
>
id:2
name:bob
<
```

### 4.3 Named object nest + leave + sibling field

```text
>
>meta
name:demo
>author
name:xuan
<
version:1
```

### 4.4 Named array of scalars

```text
>
>tags-
:alpha
:beta
.
>note
text:end
```

After the list, **`.` (A7)** then the next named section is Allowed.  
(Equivalently: one extra `<` to leave the array, then `>note` — still only §3 lines.)

### 4.5 Named array of fillable objects

```text
>
>users-
>
id:1
name:alice
<
>
id:2
name:bob
<
.
>note
text:end
```

**Between elements:** `<` then `>`.  
**After the whole array:** `.` then next `>name` / `>name-`.

### 4.6 Array-level one-line object elements

```text
-
a:solo
b:solo
```

→ two elements `{a:solo}`, `{b:solo}`. Cursor stays at array (C1 at array level).

### 4.7 Empty object elements in an array

```text
-
>
<
>
<
```

### 4.8 Nested anonymous array element

```text
-
-
:x
:y
```

### 4.9 Multi-section document (reset between sections)

```text
>
>meta
title:demo
.
>tags-
:a
:b
.
>users-
>
id:1
<
.
>note
text:end
```

### 4.10 Deep same-name object chain (stay inside)

```text
>
>child
level:1
>child
level:2
>child
level:3
leaf:true
```

### 4.11 Locate then write (A8 then Content / element)

Create first, locate later — A8 path has **only** segments:

```text
>
>meta
title:demo
.
=meta
version:1
```

```text
>
>siblings-
>
i:1
<
.
=siblings
>
i:2
<
```

### 4.12 Pop-then-enter (`<name`)

```text
>
>left
a:1
<right
b:2
```

### 4.13 Root re-enter after `.`

After `.`, Cursor is on Root object. Bare `>` **re-enters** Root (modify); then Content:

```text
>
id:1
.
>
id:2
```

### 4.14 Forced strings and URLs

```text
>
count: 2
flag: true
path:C:\a\b
url:https://ex.com/a:b
```

### 4.15 Script / shard style header (fields = C1 only)

```text
>
>meta
title:我真不是绝世神医
source:perf-use.txt
source_chars:53560
shard_index:0
shard_total:3
.
>shard
index:0
total:3
.
>characters-
>
name:江辞
role:主角
<
.
>episodes-
>
index:1
>scenes-
>
id:1-1
day_night:日
interior_exterior:内
location:楚家
>cast-
:江辞
:唐如霜
:楚雄
.
>beats-
>
kind:dialogue
speaker:江辞
emotion:低声
text:对白整行写完不要换行
<
.
<
<
```

**Cast / name roster:** after `>cast-` / `>tags-`, **only** repeated C2 (`:江辞`).  
Never bare names, never indented names, never `<value:…>`.

**Beat / scene fields:** only flush-left C1 (`kind:dialogue`, `id:22-1`).  
**Shard fields:** only C1 (`index:0`).  
**Nesting:** deeper sections use A2/A3 on column 0 — never indented `  >scenes-`.

### 4.16 Large homogeneous array (finish clean)

```text
>
>items-
>
id:0
name:Item-0
>detail
region:cn-east
tier:A
note:row-0
<
<
>
id:1
name:Item-1
>detail
region:cn-east
tier:B
note:row-1
<
<
.
>ok
done:true
```

**Element body pattern (repeat):** `>` → C1 fields → optional nested A2/A3… → A5 `<` (leave nested) → A5 `<` (leave element).  
**Next element:** another A1 `>`. **End list:** A7 `.` then next section — or stop.

When the required count is done: emit `.` or end the stream.  
**Do not** append junk Labels (`>tagger…`, mixed-language tokens, tool/system prose, JSON dumps).

### 4.17 Flush-left episode tree (no indent)

```text
>
>episodes-
>
index:22
>scenes-
>
id:22-1
day_night:日
interior_exterior:内
location:神医大会
>cast-
:江辞
:唐浩龙
.
>beats-
>
kind:dialogue
speaker:唐浩龙
emotion:惊恐
text:您是江神医？
<
>
kind:dialogue
speaker:江辞
text:快起来
<
.
<
<
```

### 4.18 Exact `@` / broadcast `!`

Create or enter from Root (`@`):

```text
@a>b
z:3
```

Broadcast all matches on tree so far; end with `.`:

```text
>
>a
>note
x:1
.
>b
>note
y:2
.
!note
z:3
.
```

---

## 5. Intent → Allowed choice (decision)

| Intent | Allowed action |
| --- | --- |
| Start object document | A1 `>` |
| Start array document | A4 `-` |
| Enter/create named object | A2 `>name` |
| Enter/create/re-enter named array | A3 `>name-` |
| Write a field | C1 `key:value` (colon only) |
| Write array scalar / cast name | C2 `:value` / `:江辞` |
| Write cast / tag string list | A3 `>cast-` then repeated C2 only |
| New object element in array | A1 `>` … C1 fields … A5 `<` |
| One-field object element without entering | C1 at array level |
| Finish whole array / section; next named part | A7 `.` then A2/A3 |
| Jump to existing node (fuzzy) | A8 `=path` then C1/C2/A1… |
| Jump exact from Root | A9 `@path` then C1/C2/A1… |
| Broadcast update all matches | A10 `!path` … then A7 `.` |
| Ascend one level | A5 `<` (entire line) |
| Ascend and open sibling/new name | A6 `<name` (no space; name has no `:`) |
| Nest scenes under episode | A3 `>scenes-` at column 0 (no indent) |
| Lost / unsure depth | A7 `.` then A2 or A8 |
| Stop | Last Allowed data line — no trailer |

---

## 6. Document shape defaults

| Goal | Allowed opening |
| --- | --- |
| Standalone JSON object document | First line A1 `>` |
| Standalone JSON array document | First line A4 `-` |

Starting with `>name` and **no** prior A1/A4 yields a **root fragment** (no outer anonymous object). Prefer A1/A4 unless a fragment was explicitly requested.

---

## 7. Silent pre-send gate (do not print)

Before sending, verify privately:

1. Every line matches §3 exactly (A1–A10 or C1–C2).  
2. No empty lines; **no leading spaces/tabs on any line**.  
3. No newlines inside values.  
4. First line is `>` or `-` for complete documents.  
5. Named arrays use `>name-` on one line.  
6. After a finished array, next `>other` / `>other-` is preceded by `.` (or an Allowed leave).  
7. Every field line uses **`key:value`** (colon).  
8. Every `=` line is path-only (`=meta`, `=a>b`) with no spaces and no value.  
9. After `>cast-` / `>tags-`, every member is `:name` — never bare `江辞`, never `<…`.  
10. A5 lines are exactly `<`; never `<id:…` / `<value:…`.  
11. No Structure+Content glue (`>key:value`, `<key:value`).  
12. Structure names have **no spaces**; no `>tagger…` trailers; stream ends when data ends.

Then emit **only** the stream.
