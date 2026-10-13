---
name: xaiop-0-7
description: >-
  XAIOP wire protocol v0.7.0 (Draft) production emit skill. Streaming,
  line-oriented cursor construction; the wire materializes deterministically to
  JSON. Covers the full grammar: Structure and Content lines, typing, the
  always-on Content escape alphabet (\n \r \\), named/anonymous arrays, locate
  and broadcast operators, delete, array element select (? and bare &),
  annotation lines, and the symbol-key note. Use when producing XAIOP,
  converting JSON to/from XAIOP, or when the user attaches this skill or asks
  for XAIOP / structured cursor-IR output.
---

# XAIOP v0.7.0 Draft — production emit skill

This document is the **only** source of truth you need to emit valid XAIOP.
XAIOP is a streaming, line-oriented wire format: a **Cursor** walks a tree while
you emit lines; the SDK materializes the lines into JSON. Protocol package:
**0.7.0** (Draft). Emit **valid XAIOP only** — never JSON, YAML, or
`key=value` instead.

## 0. Non-negotiables

- One **Label** or one **Content** per line. The line ending ends the line.
- **No** `{` `}` `[` `]` · **no** JSON quote-as-syntax · **no** indent-as-structure.
- **No Bare Labels** (a name alone on a line is illegal).
- **No blank lines** (empty line = syntax error). No whitespace-only lines.
- **No** markdown fences, commentary, checklists, or "thinking out loud" in the stream.
- Values **MUST NOT** contain physical newlines (`\n` / `\r` **escapes** are the way).
- **Fields are always `key:value` (colon).** Never `key=value`, never `=key value`.
- **`=` is locate-only** (moves the Cursor to an existing node). It never assigns.
- **Escapes are always on:** in values, a backslash `\` MUST be followed by
  exactly `\`, `n`, or `r`. Any other `\x` and any trailing `\` are syntax errors.
- **Keys MUST NOT begin** with `#` `@` `>` `<` `=` `!` `&` `?` (nor U+001F).

## 1. Mental model

| Concept | Meaning |
| --- | --- |
| **Cursor** | Current write address — always an **object**, or an **array** if opened with `-` / `>name-` |
| **Structure Label** | Moves / creates addresses, or deletes keys (`>`, `>name`, `>name-`, `-`, `<`, `<name`, `.`, `=path`, `@path`, `!path`, `?selector`, `&path`, bare `&`) |
| **Content** | Writes data at the Cursor (`key:value` or `:value`) |
| **`#…`** | Custom annotation transmission — standalone line, no Cursor/tree effect |
| **Block** | Content after a Label until the next Label or EOF — no end marker |

You do **not** close braces. You **leave** with `<` / `<name` / `.` / `=`.

## 2. Complete line grammar

| Line | Kind | Meaning |
| --- | --- | --- |
| `>` | Structure | Anonymous object: **open root** · **new array element** · or **re-enter** current object |
| `>name` | Structure | Create/enter **named object** at Cursor |
| `>name-` | Structure | Create/**re-enter** **named array** (one token, one line) |
| `-` | Structure | Create/enter **anonymous array** (or nested array as next element) |
| `<` | Structure | Pop one level (**illegal at Root**) |
| `<name` | Structure | Pop one level, then create/enter `name` at the parent |
| `key:value` | Content | Object field · **or** array one-line object element |
| `:value` | Content | Scalar / anonymous value (typical array scalar element) |
| `.` | Structure | Reset Cursor to **Root** (also exits broadcast) |
| `=path` | Structure | Fuzzy locate (first match on tree so far); segments joined by `>` |
| `@path` | Structure | Exact from Root; **creates** missing object segments |
| `!path` | Structure | Broadcast to all path-fragment matches until `.` |
| `?selector` | Structure | Array-local select (`?2` / `?id:A2` / `?*` / `?*k:v`); does not create |
| `&path` | Structure | Delete deepest key (absolute from Root; no Cursor move) |
| `&` | Structure | Delete the **current array element** (only when every Cursor is a direct array element); land on the parent array |
| `#…` | Custom annotation transmission | Standalone line; text after `#` not interpreted; no Cursor/tree effect |

**Forbidden line forms:** Bare Label · bare `&` except on a direct array element ·
`>>x` stacking · `<` at Root · physical multiline values · blank lines ·
`>  name` (spaces after `>`) · gluing Structure onto Content (`>key:value`).

**Label names:** no whitespace, no `:`. Prefer `[A-Za-z_][A-Za-z0-9_]*` for
structure names (`>meta`, `>cast-`, `=siblings`). CJK and spaces belong in
**Content values**, not inside `>…` / `<…` / `=…` / `&…` tokens.

## 3. Root: complete document vs fragment

| Intent | First line | JSON materialization |
| --- | --- | --- |
| Complete **object** document | leading `>` | e.g. `{ "a": {} }`, `{ "x": 1 }` |
| Complete **array** document | leading `-` | e.g. `["a","b"]` |
| **Root fragment** (no outer anonymous object) | start with `>name` / Content (no prior `>`/`-`) | semantic `"a":{}` — not a standalone JSON document |

**Default for app payloads:** always open with `>` (object) or `-` (array).
Do not emit fragments unless explicitly asked.

## 4. Operator `>` — three meanings

| Cursor state | Bare `>` does |
| --- | --- |
| Init / no document yet | Create empty **anonymous root object** and enter |
| Inside an **array** (array level) | Create a **new object element**, push it, **enter** it |
| Already on an **object** (incl. Root after `.`) | **Re-enter** that same object (modify) — does **not** nest another anonymous object |

After `.`, Cursor is at Root **object**; another `>` **re-enters Root** (modify),
it does not create a second root. `>name` never implies a missing leading `>`.

## 5. Content typing

Split on the **first** `:`. Later `:` stay inside the value.

| Form | Role |
| --- | --- |
| `key:value` | Named property of the current **object**, or one-line object element at **array level** |
| `:value` | Scalar / anonymous — normal at **array level** |

**Processing order:** split at first `:` → strip forced-string leading spaces
(§6) → unescape (§7) → type (§5.1).

### 5.1 Typing

| Raw value (after unescape) | Type |
| --- | --- |
| int-parsable (`5`, `-3`, `+2`) | int |
| float-parsable (`1.5`, `.5`, `5.`, `1e3`, `-2.5E-2`) | float (IEEE 754 binary64) |
| exactly `true` / `false` (lowercase) | bool |
| exactly `null` (lowercase) | null |
| anything else | string |

`NaN`, `Infinity`, `-Infinity` are **not** float-parsable — they stay string.

## 6. Forced string

One or more spaces immediately after `:` force **string**; those spaces are not
part of the payload.

| Written | JSON |
| --- | --- |
| `n:5` | `"n": 5` |
| `n: 5` | `"n": "5"` |
| `flag:true` | `"flag": true` |
| `flag: true` | `"flag": "true"` |
| `url:https://a/b` | `"url": "https://a/b"` |
| `note:#x` | `"note": "#x"` (`#` inside a value is Content, not annotation) |

## 7. Content escapes (always on — 0.7.0)

A Content value is **one physical line**. Semantic newlines go on the wire as
two-character escapes. This alphabet is **always on** (not an option):

| Sequence | Payload |
| --- | --- |
| `\\` | `\` |
| `\n` | newline U+000A |
| `\r` | carriage return U+000D |

Rules:

- Scan left to right. `\` MUST be followed by exactly one of `\` `n` `r`.
- Trailing `\` with no follower → **syntax error**.
- Any other `\x` → **syntax error**. This includes `\"`, `\t`, `\u…` — XAIOP
  quotes are **not** special and tabs are written literally.
- Unescape happens **after** forced-string strip, **before** typing.

| Written | JSON value |
| --- | --- |
| `path:C:\\data\\x` | `"C:\data\x"` |
| `text:line1\nline2` | `"line1\nline2"` |
| `t:a\tb` (literal tab) | `"a\tb"` |
| `q:say "hi"` | `"say \"hi\""` (quotes are literal; never emit `\"`) |

**Breaking vs 0.6.0:** older packages kept `\n`/`\r`/`\\` as literal text.
Under 0.7.0 they unescape. A value containing a real backslash must be written
with `\\` (e.g. Windows paths — the most common trap).

## 8. Key name rules

- Keys MUST NOT begin with `#` `@` `>` `<` `=` `!` `&` `?` or U+001F.
- Keys containing `:` or whitespace are illegal in any mode.
- `#` in a non-initial position is fine (`a#b` is an ordinary key).
- A key starting with `#` would turn the line into an annotation line — never
  use such keys. Keys starting with `?` have no wire form — never use them.
- **Symbol-key mode** (opt-in, only if the consuming API explicitly documents
  `symbolKeys`): for keys starting with U+001F `#` `@` `>` `<` `=` `!` `&`,
  prefix the logical key with one U+001F on the wire. Default mode: refuse
  such keys. Do not use symbol-key mode unless the peer says so.

## 9. Objects, nesting, leave

```text
>
>data
>config
version:1
```

→ `{ "data": { "config": { "version": 1 } } }`

Content and children coexist; leave with `<` to write siblings at parent:

```text
>
>meta
name:demo
>author
name:xuan
<
version:1
```

→ `{ "meta": { "name": "demo", "author": { "name": "xuan" }, "version": 1 } }`

`<name` = pop one level, then create/enter `name` at the parent (one line).

## 10. Arrays

### 10.1 Open

| Need | Write |
| --- | --- |
| Named array field | `>tags-` on **one** line — never `>tags` then `-` |
| Anonymous / root array | `-` |
| Nested array as next element | another `-` while at array level |

`>name-` when `name` already holds an array **re-enters** it; later elements
**append** (never replace).

### 10.2 Array level vs inside element

| At **array level** | Inside element after `>` |
| --- | --- |
| `:v` → scalar element | Content on that object |
| `key:value` → **one-line** `{key:v}` element; Cursor **stays** at array | nested Structure allowed |
| `>` → object element **and enter** | deeper nesting |
| `-` → nested array element | — |
| — | `<` → return to **array level** |

### 10.3 Fillable object elements

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
```

Between elements: `<` then `>`. **After the last `<` you are still inside
`users` (array level).**

### 10.4 Leave the whole array (mandatory before the next section)

**Two cases — pick by where the next section lives:**

| Next section lives | Do |
| --- | --- |
| At the document **Root** (top-level sibling) | emit **`.`** (resets to Root), then `>other` |
| Inside the **same parent object** (nested sibling) | emit **`<`** (one pop to the parent object), then `>other` |

**Never** emit `.` while you still need the surrounding nesting — `.` always
jumps to Root.

**Wrong:** finished the nested `>beats-` list inside a scene, then `.` then
`>next` → `next` lands at document Root (or the stream dies on `<` at Root).
**Right (nested):**

```text
>
>episodes-
>
index:1
>scenes-
>
id:1-1
>cast-
:江辞
:唐如霜
<
>beats-
>
kind:dialogue
speaker:江辞
text:快起来
<
<
<
<
```

**Right (top-level):**

```text
>
>tags-
:alpha
:beta
.
>users-
>
id:1
name:alice
<
.
>note
text:end
```

### 10.5 One-line object elements (array level)

```text
-
a:solo
a:solo
```

→ `[ { "a": "solo" }, { "a": "solo" } ]` — each `key:value` at array level is
its **own** single-property element. Use `>` … `<` when an element needs 0, 2+,
or nested fields. Empty object elements MUST use `>`:

```text
-
>
<
>
<
```

→ `[ {}, {} ]`

## 11. Cursor operators `.` `=` `@` `!`

### 11.1 `.` — reset to Root

Clears relative position; Cursor sits on the root value; also exits broadcast
(`!` / `?*`). **When uncertain / deep / after a finished section:** emit `.`,
then `>name` / `>name-` / `=path`. Do not guess depth with stacked `<`. After
`.`, never write bare `<` (illegal at Root).

### 11.2 `=` — fuzzy locate (not assignment)

`=path` moves the Cursor to the first matching node already in the tree.
Segments join with `>` only (`=a>b`, **not** `=a.b`). No spaces, no values.

| Intent | Illegal | Legal |
| --- | --- | --- |
| Set title on current object | `=title 我的剧本` · `title=我的剧本` | `title:我的剧本` |
| Jump to existing `meta` then add field | — | `=meta` then `ok:1` |
| Jump to array `siblings` | `=siblings-` | `=siblings` |

Locate a named array by the **key name only** (`=siblings`). There is no numeric
index syntax (`=arr>0` is not element 0). Prefer create (`>name` / Content) for
new data; use `=` only to **return** to a node already written.

### 11.3 `@` — exact path from Root

`@a>b` enters the exact path, **creating** missing object segments. Mid-path,
if a segment lands on a scalar or an array that the next segment addresses as a
key, it is replaced by `{}` — slot addressing is **not** `@`; use `?` after
entering the array.

### 11.4 `!` — broadcast

`!path` matches every complete path-fragment on the **tree so far** (including
earlier `.` phases), one Cursor per match; subsequent Content/Structure fans
out to all of them until `.`. While broadcasting, do not emit another
`!` / `@` / `=` / `?` — emit `.` first. `&path` is allowed during broadcast
(path relative to each Cursor).

### 11.5 `?` — array element select (0.7)

From an **array** Cursor only (`@orders` when `orders` is an array, `>name-`,
`-`, or `<` back to the array). Zero matches → syntax error. `?` never creates.

| Selector | Meaning |
| --- | --- |
| `?2` | Enter 0-based index `2` (digits only; `?0` ok; `?01` illegal) |
| `?id:A2` | First object element whose key `id` equals typed payload `A2` (Content typing: `true` ≠ `1`; forced-string space and escapes apply) |
| `?*` | Every element (broadcast, even one match) |
| `?*status:pending` | Every matching object element (broadcast) |

After a single `?` / `?2` / `?id:…`: Cursor is **inside** that element.
`<` returns to the array without deleting. Bare `&` deletes that element and
lands on the parent array. `.` resets to Root.

After `?*` / `?*k:v`: broadcast mode. Bare `&` deletes every selected element
of that array and exits broadcast, landing on the array. `=` / `@` / `!` / `?`
remain illegal until `.`.

```text
>
>orders-
>
id:A1
status:pending
<
>
id:A2
status:pending
<
.
@orders
?id:A2
status:shipped
.
@orders
?id:A1
&
```

→ `{ "orders": [ { "id": "A2", "status": "shipped" } ] }`

### 11.6 `&path` — delete deepest key

- Segments joined by `>` (same form as `@`), e.g. `&a`, `&a>b`.
- **Single Cursor:** absolute from Root; delete deepest key; **do not** move Cursor.
- Missing target → silent no-op. May delete a whole named array value. No index segment.
- Object document root only (forbidden on array/fragment root).
- Deleting a node on the Cursor chain → syntax error.
- Allowed during broadcast (relative to each Cursor).
- A later write to the same address creates again.

**Bare `&`** (array-element delete): only when every Cursor is a **direct array
element** (entered by `>` / `-` / `?`); splice that element out and land on the
parent array. Indices after the hole shift. Otherwise bare `&` is a syntax
error. Unlike `&path`, it **does** move the Cursor (to the array).

## 12. Streaming / diff (brief)

Phases that use `=` / `!` / `&` / `?` operate on the **cumulative** tree built
so far (across `.` phases). Later same-key writes win. `>name-` reopen appends.
There is no insert-at-index, `move`, `copy`, or JSON Patch op list.

## 13. Ambiguity map

| Situation | Wrong instinct | Correct XAIOP |
| --- | --- | --- |
| Want `{ "a": {} }` document | start with `>a` | leading `>` then `>a` |
| Named list | `>tags` + `-` | `>tags-` one line |
| Separate array siblings | `-` between elements | `<` then `>` (objects) or next `:v` / `k:v` |
| Done with list, next **top-level** field | one `<` then `>note` | `.` then `>note` |
| Done with list, next field in **same parent** | `.` then `>next` | `<` then `>next` (`.` would jump to Root) |
| Deep path | `=a.b.c` | `=a>b>c` |
| Relocate array | `=tags-` | `=tags` |
| Lost depth | many `<` | `.` then `=` / `>` |
| After `.` | `<` "to be safe" | next Structure/Content — never `<` at Root |
| Array scalar | `"x"` / quotes | `:x` |
| Force string `"5"` | quotes | `n: 5` (space after `:`) |
| Empty object in array | skip / `{}` | `>` then `<` |
| Multi-prop array element | many `k:v` at array level | `>` … `<` (each `k:v` is its own element otherwise) |
| Modify root after `.` | another nested root | bare `>` re-enters Root |
| Glue field to enter | `>shard_index:1` | `shard_index:1` |
| Spaces in Label | `>  meta` | `>meta` |
| Shell / ini style | `key=value` | `key:value` |
| Indentation / pretty tree | spaces before Structure | column 0 only |
| Trailing junk after long array | prose / JSON dump / `>tagger…` | stop on last real element; then `.` or EOF |
| Want to remove a key | `delete a` / bare `&` on an object | `&a` (object root). Bare `&` only on a direct array element |
| Patch array index | `@orders>0` / JSON Pointer | `@orders` then `?0` or `?id:A2` |
| Side-channel metadata | trailing `# comment` on a Content line | standalone `#…` line |
| `#` inside a field value | treat as annotation | `note:#x` is Content |
| **Windows path / backslash** | `path:C:\a\b` | `path:C:\\a\\b` |
| **Quotes in a value** | `say:\"hi\"` | `say:"hi"` (quotes literal; `\"` is an error) |
| **Tab in a value** | `\t` | literal tab character |
| **Multi-line text** | physical line break in value | `\n` / `\r` escapes on one line |
| **Trailing backslash** | `dir:C:\` | `dir:C:\\` |
| **Key starting with `#`** | `#tag:1` | never emit such keys (it parses as an annotation line) |
| **Select element** | `@orders` + `orders>0` | `@orders` then `?0` |
| **Delete one element** | `&orders>0` | enter element via `?…` then bare `&` |
| **Delete while lost** | bare `&` at object level | `&path` with at least one segment |
| **Update all pending** | `!orders` + guess | `@orders` then `?*status:pending` then fields, then `.` |

## 14. Blacklist — never emit

| Wrong | Right | Why |
| --- | --- | --- |
| `data` / `meta` / `aliases-` | `>data` / `>meta` / `>aliases-` | Bare Label banned |
| `>tags` then `-` | `>tags-` | Named array is one token |
| `-` between sibling elements | `<` / next Content / `>` | `-` opens arrays only |
| After list: `<` then `>note` | `.` then `>note` (top-level) · `<` then `>note` (nested sibling) | One `<` returns to array level only; `.` jumps to Root |
| `=child.child` / `=a.b` | `=child>child` / `=a>b` | `.` ≠ path joiner |
| `=siblings-` | `=siblings` | Locate key has no create postfix |
| `=title 值` / `=name 江辞` | `title:值` / `name:江辞` | `=` ≠ assignment |
| `=title:值` | `title:值` or `>meta` | `=` path must not be Content |
| `title=值` | `title:值` | Only `:` separates key/value |
| `< id="43-1", day_night="日"` | `>` / `id:43-1` / `day_night:日` | `<` is pop only |
| `"角色名"` as its own line | `name:角色名` or `:角色名` | Quotes are not Label/Content syntax |
| Leading spaces / tabs for nesting | flush-left lines | Indent is not hierarchy |
| bare `江辞` under `>cast-` | `:江辞` | Cast members are `:value` scalars |
| `<id:22-1` / `<value:江辞` | `>` + `id:22-1` · or `:江辞` | Never glue Content onto `<` |
| `>>x` / `>root>child` | one Structure per line | Same-symbol stacking banned |
| `>shard_index:1` | `shard_index:1` | Don't glue `>` onto Content |
| `.` then `<` | `.` then next section | `<` at Root illegal |
| Blank lines | omit | Empty line is Content error |
| `{…}` / `[…]` / `"key":` | XAIOP lines | Not JSON |
| markdown fences | raw XAIOP only | Contaminates parse |
| Multiline physical value | single line or `\n` escape | Newline ends the value |
| `path:C:\x` / `dir:C:\` | `path:C:\\x` / `dir:C:\\` | Escape alphabet always on |
| `say:\"hi\"` / `\t` / `\uXXXX` | literal quotes / literal tab | Unknown `\x` = syntax error |
| 3+ stacked `<` to "climb out" | `.` then `=` / `>` | Depth guessing fails |
| `!` / `=` before any tree | open root first | Nothing to locate |
| `?01` / `?id:` with spaces | `?0` … `?1` / `?id:A2` | Selector syntax |
| `?` at an object Cursor | enter the array first (`@orders`) | Select is array-local |
| bare `&` on an object / at Root | `&path` with at least one segment | Empty delete path illegal except element splice |
| `&orders>0` | enter element via `?…` then bare `&` | No index delete segment |
| trailing `# comment` on a Structure/Content line | separate `#…` line | Annotation is a whole-line primitive |
| key starting with `#` `@` `>` `<` `=` `!` `&` `?` | rename the key | Line-class head would re-classify the line |

## 15. Playbooks (copy the pattern)

### A. Multi-section object (arrays + fields)

```text
>
>meta
name:demo
version:1
.
>tags-
:alpha
:beta
.
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

### B. Deep single chain (no pop ladder)

```text
>
>child
level:1
>child
level:2
>child
level:3
leaf:true
.
>siblings-
>
i:1
<
```

### C. Escapes and typing

```text
>
n:5
s: 5
ok:true
label: true
url:https://example.com/a:b
path:C:\\data\\report.txt
blob:first line\nsecond line
quote:she said "hi"
tab:a	b
```

### D. Relocate with `=` then append array element

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
label:S-2
<
```

### E. Select + update + element delete (`?` / bare `&`)

```text
>
>orders-
>
id:A1
status:pending
<
>
id:A2
status:pending
<
.
@orders
?id:A2
status:shipped
.
@orders
?id:A1
&
```

### F. Broadcast update (`?*k:v`)

```text
>
>tasks-
>
id:1
status:pending
<
>
id:2
status:pending
<
.
@tasks
?*status:pending
flag:retry
.
```

### G. Delete a key (`&path`)

```text
>
>tmp
v:1
>keep
v:2
.
&tmp
```

### H. Annotation line between Content

```text
>
a:1
#run-id:demo
b:2
```

### I. Recover when lost

1. Emit `.`
2. Emit `=section>child` or `>section`
3. Continue Content
Never invent a long `<` `<` `<` climb.

### J. Nested sections under one element (script style)

```text
>
>episodes-
>
index:1
>scenes-
>
id:1-1
location:楚家
>cast-
:江辞
:唐如霜
<
>beats-
>
kind:dialogue
speaker:江辞
text:快起来
<
<
<
<
```

After `>cast-` members: `<` back to the scene, `>beats-` for the sibling list,
then one `<` per open level (beat element · beats array · scene · scenes
array · episode). Top-level transitions use `.`; nested transitions use `<`.

## 16. Before send (silent self-check — do not print)

- [ ] Complete object → leading `>`; complete array → leading `-`
- [ ] Every named list is `>name-` on one line
- [ ] After a whole list: `.` before the next **top-level** `>name`; `<` before the next `>name` inside the same parent object
- [ ] Every field uses `key:value` — zero `=field value`, zero `field=value`
- [ ] `=` lines are paths only (`=a>b` / `=meta`)
- [ ] Paths join with `>` not `.`; arrays locate as `=name` not `=name-`
- [ ] Every `\` in a value is followed by `\`, `n`, or `r`; no trailing `\`; no `\"` `\t` `\u`
- [ ] No physical newline inside any value
- [ ] No key starts with `#` `@` `>` `<` `=` `!` `&` `?`
- [ ] Deletes use `&path` (object root) or bare `&` on a direct array element after `?` / `>`
- [ ] Annotation uses a whole `#…` line — never trailing `#` on Structure/Content
- [ ] No Bare Labels, blank lines, indent nesting, `{}`/`[]`, fences, quotes-as-syntax, or `<` at Root
- [ ] After `>cast-` / `>tags-`, members are `:name` only
- [ ] Multi-field array elements use `>` … `<`
- [ ] Lost? → `.` then `>name` or `=a>b`

## 17. Output contract

1. Output **only** the XAIOP stream (unless the user explicitly allows a wrapper).
2. First line of a normal object payload is almost always `>` (or `-` for a root array) — never a checklist sentence.
3. Do **not** draft JSON / YAML / `key=value` first and translate.
4. Do **not** explain the protocol or paste Skill rules alongside the payload.
5. Long documents: same grammar at any scale — `>name` / `>name-` / `key:value` / `<` / `.` / `&path` / `?…` / `#…`.
6. Stop on the last data line — no trailers.
