---
name: xaiop
description: >-
  Generate and interpret XAIOP (eXtensible AI Output Protocol) v0.2.0 Frozen.
  Use when producing XAIOP, converting JSON↔XAIOP, or when the user attaches
  this skill / mentions XAIOP, .xaiop, or AI-native structured output.
---

# XAIOP v0.2.0 Frozen — Generator Skill (Protocol Digest)

This document is the **working protocol summary** for emitters.  
Emit **valid XAIOP only**. Prefer this Skill over inventing JSON-like habits.

**Non-negotiables**

- One **Label** or one **Content** per line. Line ending ends the Label.
- **No** `{` `}` `[` `]` · **no** JSON/JS quotes-as-syntax · **no** indent-as-structure.
- **No Bare Labels** (a name alone on a line is illegal).
- **No blank lines** (empty line = Content syntax error).
- **No** markdown fences, commentary, checklists, or “thinking out loud” in the output stream.
- Values **MUST NOT** contain newlines; next line is never a value continuation.
- **Fields are always `key:value` (colon).** Never `key=value`, never `=key value`, never `=key:value`.
- **`=` is locate-only** (move Cursor to an existing node). It does **not** assign / set fields.

---

## 0. Mental model (read once)

XAIOP is a **Cursor** walking a tree while you emit lines:

| Concept | Meaning |
| --- | --- |
| **Cursor** | Current write address (always an **object**, or an **array** if opened with `-` / `>name-`) |
| **Structure Label** | Moves / creates addresses (`>`, `>name`, `>name-`, `-`, `<`, `<name`, `.`, `=path`, `!name`) |
| **Content** | Writes data at Cursor (`key:value` or `:value`) |
| **Block** | Content after a Label until the next Label or EOF — **no** end marker |

You do **not** close braces. You **leave** with `<` / `<name` / `.` / `=`.

---

## 1. Hard rules (MUST)

1. Bare name line (`data`, `aliases-` without `>`) → **syntax error**. Use `>data` / `>aliases-`.
2. Standalone `>` is the **only** way to create an **anonymous** object (root · array element · or re-enter current object — see §4).
3. `>name` creates/enters a **named** child at Cursor — it does **not** invent an outer anonymous wrap.
4. `<` pops **one** level only. **`<` at Root is illegal**.
5. `<name` = pop once, then create/enter `name` at the parent.
6. No brace pairing, indentation boundaries, or multi-character terminators.
7. Content splits on the **first** `:` only; later `:` stay inside the value.
8. `-` **opens** an array (or a nested array element). It does **not** separate sibling elements.
9. Leading `>` / `-` declare a **complete** anonymous root document. Omitting them yields a **root fragment** (not a standalone JSON object document).
10. At **array level**, `key:value` is a **one-line object element** `{key: value}`; Cursor **stays** at array level (does not enter).

---

## 2. Complete line grammar

| Line | Kind | Meaning |
| --- | --- | --- |
| `>` | Structure | Anonymous object: **open root** · **new array element** · or **re-enter** current object |
| `>name` | Structure | Create/enter **named object** at Cursor |
| `>name-` | Structure | Create/enter **named array** (**one** token, **one** line) |
| `-` | Structure | Create/enter **anonymous array** (or nested array as next element) |
| `<` | Structure | Pop one level (**illegal at Root**) |
| `<name` | Structure | Pop one level, then create/enter `name` |
| `key:value` | Content | Object field · **or** array one-line object element |
| `:value` | Content | Scalar / anonymous value (typical array scalar element) |
| `.` | Structure | Reset Cursor to **Root** |
| `=path` | Structure | Fuzzy locate first match (`>` joins path segments) |
| `!name` | Structure | Broadcast-append to every match named `name` |

**Forbidden line forms:** Bare Label · `>>x` / same-symbol stacking · `<` at Root · multiline values · blank lines · `>  name` (spaces after `>`) · gluing Structure onto Content (`>key:value`).

**Label names:** no whitespace, no `:` inside the name token.

---

## 3. Root: complete document vs fragment

| Intent | First line | JSON materialization |
| --- | --- | --- |
| Complete **object** document | leading `>` | e.g. `{ "a": {} }`, `{ "x": 1 }` |
| Complete **array** document | leading `-` | e.g. `["a","b"]` |
| **Root fragment** (no outer anonymous object) | start with `>name` / Content (no prior `>`/`-`) | semantic `"a":{}` — **not** standalone `{"a":{}}` |

```text
>
>a
```
→ `{ "a": {} }` — outer anonymous root **exists**.

```text
>a
```
→ fragment `"a":{}` — **no** outer object; not a normal standalone JSON document.

```text
>
x:1
```
→ `{ "x": 1 }`

```text
-
:a
:b
```
→ `[ "a", "b" ]`

**Generator default for app payloads:** always open with `>` (object) or `-` (array). Do not emit fragments unless explicitly asked.

---

## 4. Operator `>` — three meanings (no ambiguity)

Bare `>` is **context-dependent**:

| Cursor state | Bare `>` does |
| --- | --- |
| Init / no document yet | Create empty **anonymous root object** and enter |
| Inside an **array** (array level) | Create a **new object element**, push it, **enter** it |
| Already on an **object** (incl. Root after `.`) | **Re-enter** that same object (modify / overwrite) — does **not** nest another anonymous object |

**Critical:** after `.`, Cursor is at Root **object**. Another `>` **re-enters Root** (modify), it does **not** create a second root.

`>name` never implies a missing leading `>`. If you need `{ "meta": … }` as a document, write:

```text
>
>meta
…
```

not only `>meta` (that is a fragment).

---

## 5. Content typing

Split on the **first** `:`.

| Form | Role |
| --- | --- |
| `key:value` | Named property of current **object**, or one-line object element at **array level** |
| `:value` | Scalar / anonymous — normal at **array level** |

**Typing after optional forced-string mark:**

| Raw value | Type |
| --- | --- |
| int-parsable token (`5`, `-3`) | int |
| float-parsable token (`1.5`, `.5`, `1e3`) | float (JSON number, IEEE 754 binary64) |
| exactly `true` / `false` (lowercase) | bool |
| exactly `null` (lowercase) | null |
| anything else | string |
| **one or more spaces** immediately after `:` | **forced string** (spaces not part of payload) |

| Written | JSON |
| --- | --- |
| `n:5` | `"n": 5` |
| `n: 5` | `"n": "5"` |
| `r:1.5` | `"r": 1.5` |
| `r: 1.5` | `"r": "1.5"` |
| `flag:true` | `"flag": true` |
| `flag: true` | `"flag": "true"` |
| `url:https://a/b` | `"url": "https://a/b"` (later `:` kept in value) |

---

## 6. Objects, nesting, leave

Named nest:

```text
>
>data
>config
version:1
```
→ `{ "data": { "config": { "version": 1 } } }`

Content and children coexist:

```text
>
>data
a:b
>c
```
→ `{ "data": { "a": "b", "c": {} } }` — Cursor ends inside `c`.

Leave with `<` to write siblings at parent:

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

`<name` = pop then enter sibling/new name at parent (one line).

---

## 7. Arrays (most failure-prone)

### 7.1 Open

| Need | Write |
| --- | --- |
| Named array field | `>tags-` on **one** line — **never** `>tags` then `-` |
| Anonymous / root array | `-` |
| Nested array as next element | another `-` while at array level |

### 7.2 Array level vs inside element

| At **array level** | Inside element after `>` |
| --- | --- |
| `:v` → scalar element | Content on that object |
| `key:value` → **one-line** `{key:v}` element; Cursor **stays** at array | nested Structure allowed |
| `>` → object element **and enter** | deeper nesting |
| `-` → nested array element | — |
| | `<` → return to **array level** |

### 7.3 Fillable object elements

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

Between elements: `<` then `>`.  
**After the last `<` you are still inside `users` (array level).**

### 7.4 Leave the whole array (mandatory before next named section)

| Goal | Do |
| --- | --- |
| Next element in **same** array | `<` then `>` (or `:v` / one-line `k:v`) |
| Finished entire `>name-` / `-` list; next is `>other` / `>other-` | emit **`.`** (preferred) **or** one more `<` to leave the array, **then** `>other` |

**Wrong:** last element `<` then immediately `>note` / `>meta` / `>users-` → still inside array → error / wrong tree.

**Right:**

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

### 7.5 One-line object elements (array level)

```text
-
a:solo
a:solo
```
→ `[ { "a": "solo" }, { "a": "solo" } ]` — Cursor never entered those objects.

Use `>` … `<` when the element needs **0, 2+, or nested** fields.

### 7.6 Empty object elements

```text
-
>
<
>
<
```
→ `[ {}, {} ]` — empty elements **MUST** use `>`.

---

## 8. Cursor operators `.` `=` `!`

### 8.1 `.` — reset to Root

Clears relative position. Cursor sits on the **root value** (object or array root).

**When uncertain / deep / after a finished section:** emit `.`, then `>name` / `>name-` / `=path`.  
**Do not** guess depth with stacked `<`.

After `.`, **do not** write bare `<` (illegal at Root).

### 8.2 `=` — fuzzy locate (**not** assignment)

```text
=path
=data>cor
=child>child
=siblings
```

**What `=` does:** move Cursor to the first matching node already in the tree.  
**What `=` never does:** write a field value. Writing fields is **only** Content `key:value` / `:value`.

| Intent | Illegal | Legal |
| --- | --- | --- |
| Set title on current object | `=title 我的剧本` · `title=我的剧本` · `=title:我的剧本` | `title:我的剧本` |
| Set nested meta fields | `=meta` then indented `title=…` | `>meta` then `title:…` |
| Jump to existing `meta` then add field | (ok) `=meta` then **`ok:1`** | same — locate then Content |
| Jump to array `siblings` | `=siblings-` | `=siblings` |
| Path with dots | `=a.b` | `=a>b` |

Rules:

1. Path text after `=` is **only** segment names joined by `>` — **no spaces**, no values, no `key:value`.
2. Segments join with **`>`** — **not** `.` (`.` is Root reset, not JSON dots).
3. Matching is fuzzy; first match wins; fuller paths are safer.
4. Lands Cursor on an **object**, or on an **array** if that key’s value is an array.
5. Locate a named array by the **key name only**: `=siblings` — **not** `=siblings-`.  
   Trailing `-` is the **create** postfix on `>name-`, not part of the locate key.
6. No numeric index syntax (`=arr>0` is not “element 0”; `0` would be a name).
7. Prefer **create with `>name` / Content** for new data. Use `=` only when you must **return** to a node already written.

After `=siblings` (array), write the next element with `>` / `:v` / one-line `k:v`.

### 8.3 `!` — broadcast append

`!name` — subsequent Content appends to **every** existing node matching `name`. Prefer rare use; prefer precise `=` / `>` when possible.

### 8.4 `=` vs `:` vs `>` (memorize)

```text
>meta                 # create/enter named object
title:demo            # Content: write field (COLON)
source:file.txt       # Content
.
=meta                 # locate existing meta (rare; only if already created)
note:extra            # Content after locate
```

If you are about to type `=` and then a **field name + a value**, stop — you want `field:value`.

---

## 9. Ambiguity map (modes models confuse)

Use this table when two habits collide:

| Situation | Wrong instinct | Correct XAIOP |
| --- | --- | --- |
| Want `{ "a": {} }` document | start with `>a` | leading `>` then `>a` |
| Named list | `>tags` + `-` | `>tags-` one line |
| Separate array siblings | `-` between elements | `<` then `>` (objects) or just next `:v` / `k:v` |
| Done with list, next field | one `<` then `>note` | `.` then `>note` |
| Deep path | `=a.b.c` | `=a>b>c` |
| Relocate array | `=tags-` | `=tags` |
| Deep same-name chain | pop back to Root then `>child` again | stay inside: `>child` … `>child` (no pop ladder) |
| Lost depth | many `<` | `.` then `=` / `>` |
| After `.` | `<` “to be safe” | next Structure/Content — never `<` at Root |
| Array scalar | `"x"` / quotes | `:x` |
| Force string `"5"` | quotes | `n: 5` (space after `:`) |
| Empty object in array | skip / `{}` | `>` then `<` |
| Multi-prop array element | many `k:v` at array level | each `k:v` becomes its **own** one-line element — use `>` … `<` instead |
| Modify root after `.` | another nested root | bare `>` re-enters Root, then Content |
| Glue field to enter | `>shard_index:1` | `shard_index:1` |
| Spaces in Label | `>  meta` / `>  ` | `>meta` / `>` |
| Write a field | `=title 剧本名` · `title=剧本名` | `title:剧本名` |
| “Assign” after `>meta` | `=title …` / `=source …` | `title:…` / `source:…` |
| Shell / ini style | `key=value` anywhere | `key:value` |
| Indentation / pretty tree | spaces before `>` / `<` / Content | column 0 only — indent is **not** structure |
| HTML/JSON attrs on `<` | `< id="1", loc="x"` | `>` then `id:1` / `location:x` then fields |
| Cast / name list member | bare `江辞` / `"江辞"` | `:江辞` after `>cast-` |
| Open array object element | `<id:22-1` / `<value:江辞` | `>` then `id:22-1` · cast uses `:江辞` |
| Glue Content onto `<` / `>` | `<id:1` · `>key:value` | separate lines: `<` or `>` · then `key:value` |
| Trailing junk after long array | `>tagger…` / tool prose / JSON dump | stop on last real element; then `.` or EOF |
| Quoted names as lines | `"江辞"` alone | `:江辞` (array scalar) or `name:江辞` |
| Emit this Skill’s checklist | `Leading \`>\` present? Yes.` | **payload only** — never self-audit text |
| YAML / pseudo block | `=meta` + indented children | `>meta` + flat `key:value` lines |

---

## 10. Blacklist — never emit

| Wrong | Right | Why |
| --- | --- | --- |
| `data` / `meta` / `aliases-` | `>data` / `>meta` / `>aliases-` | Bare Label banned |
| `>tags` then `-` | `>tags-` | Named array is one token |
| `-` between sibling elements | `<` / next Content / `>` | `-` opens arrays only |
| After list: `<` then `>note` | `.` then `>note` | One `<` returns to array level only |
| `>name` / `>name-` / bare `>` while still inside an array **for a new section** | leave array with `.` first | “inside an array” class of failures |
| `=child.child` / `=a.b` | `=child>child` / `=a>b` | `.` ≠ path joiner |
| `=siblings-` / `=tags-` | `=siblings` / `=tags` | Locate key has no create postfix |
| `=title 值` / `=name 江辞` / `=source file.txt` | `title:值` / `name:江辞` / `source:file.txt` | `=` ≠ assignment; space-path is invalid |
| `=title:值` / `=meta:…` | `title:值` or `>meta` | `=` path must not be Content |
| `title=值` / `kind=dialogue` | `title:value` / `kind:dialogue` | Only `:` separates key/value |
| `=meta` then indented `title=…` | `>meta` / `title:…` | No indent; create with `>`; fields with `:` |
| `< id="43-1", day_night="日"` | `>` / `id:43-1` / `day_night:日` / … | `<` is pop only — not HTML/JSON attributes |
| `"角色名"` as its own line | `name:角色名` or `:角色名` | Quotes are not Label/Content syntax |
| Leading spaces / tabs for nesting | flush-left lines | Indent is not hierarchy |
| bare `江辞` under `>cast-` | `:江辞` | Cast members are `:value` scalars |
| `<id:22-1` / `<value:江辞` | `>` + `id:22-1` · or `:江辞` | Never glue Content onto `<` |
| `  >scenes-` (indented Structure) | `>scenes-` at column 0 | Indent ≠ nest |
| `>tagger…` / tool prose after array | stop / `.` | No trailing junk Labels |
| `>child` … `<`<… then Root `>child` for deeper chain | nested `>child` without returning to Root | Extra `<` → overwrite; depth stays shallow |
| `>>x` / `>root>child` stacking habits | one Structure per line; use `=` for jump | Same-symbol stacking banned |
| `>shard_index:1` | `shard_index:1` | Don’t glue `>` onto Content |
| `>  ` / `>  meta` | `>` / `>meta` | No spaces after `>` in Labels |
| `.` then `<` | `.` then next section | `<` at Root illegal |
| Blank lines | omit | Empty line is Content error |
| `{…}` / `[…]` / `"key":` | XAIOP lines | Not JSON |
| markdown \`\`\` fences | raw XAIOP only | Contaminates parse |
| Checklist / “Yes.” / bullet self-check | start with `>` or `-` payload | Output is data, not protocol Q&A |
| Multiline string value | single line (or restructure) | Newline ends the value |
| 3+ stacked `<` to “climb out” | `.` then `=` / `>` | Depth guessing fails |
| `!` / `=` before any tree | open root first | Nothing to locate |
| Treat one-line `a:1` `b:2` at array level as one object | `>` / `a:1` / `b:2` / `<` | Each `k:v` at array level is its own element |
| `shard: index=2, total=3` prose | `>shard` / `index:2` / `total:3` | One Label or Content per line |

---

## 11. Playbooks (copy the pattern)

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

### C. Leave nest, continue parent fields

```text
>
>meta
name:demo
>author
name:xuan
role:dev
<
version:1
enabled:true
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

### E. Root array mixed elements

```text
-
>
a:1
b:2
<
:plain
c:solo
-
:x
:y
```

### F. Forced strings + bools + ints

```text
>
n:5
s: 5
ok:true
label: true
url:https://example.com/a:b
```

### G. Recover when lost

1. Emit `.`
2. Emit `=section>child` or `>section`
3. Continue Content  
Never invent a long `<` `<` `<` climb.

### H. Meta / shard header (fields = Content, not `=`)

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
.
>beats-
>
kind:dialogue
speaker:江辞
emotion:低声
text:示例对白一行写完
<
.
<
<
```

**Wrong twin (do not emit):** `=title …` · `title=…` · `< id="1-1", loc="x"` · indented trees · checklist lines.

### I. After locate, only Content / element openers

```text
>
>meta
title:demo
.
=meta
version:1
```

`=meta` moves Cursor; `version:1` writes. Never `=version 1`.

---

## 12. Create-or-update / overwrite

- Same address revisited → later wins (re-enter / overwrite).
- Bare `>` on an object Cursor → re-enter that object (modify).
- Bare `>` at array level → **new** element (not re-enter previous element).
- Under-pop then `>` on an object element → may **overwrite** the current element instead of creating a sibling — leave correctly (`<` count) or use `.` + `=`.

---

## 13. Before send (silent self-check — **do not print**)

Run mentally. **Never** write these bullets into the output.

- [ ] Complete object → leading `>`; complete array → leading `-`
- [ ] Every named list is `>name-` on one line
- [ ] Between object elements: `<` then `>`; after **whole** list: `.` before next `>name` / `>name-`
- [ ] Never open a new named section while Cursor is still inside an array
- [ ] **Every field uses `key:value`** — zero `=field value`, zero `field=value`
- [ ] `=` lines (if any) are **paths only** (`=a>b` / `=meta`) with **no** value payload
- [ ] Paths: `=a>b` not `=a.b`; arrays locate as `=name` not `=name-`
- [ ] No Bare Labels, blank lines, indent nesting, `{}`/`[]`, fences, quotes-as-syntax, or `<` at Root
- [ ] No HTML-like `< attrs…>`; no `<id:…>` / `<value:…>` glue; no checklist / “Yes.” / prose headers
- [ ] After `>cast-` / `>tags-`, members are `:name` only — never bare names
- [ ] Long arrays: finish required count then `.` or stop — no `>tagger…` trailers
- [ ] Deep / multi-section: prefer `.` and occasional `=`; no 3+ stacked `<`
- [ ] Deep same-name chain: nest with repeated `>child` — do not return to Root between levels
- [ ] Multi-field array elements use `>` … `<`, not adjacent `k:v` at array level
- [ ] Lost? → `.` then `>name` or `=a>b`

---

## 14. Output contract

When asked for XAIOP:

1. Output **only** the XAIOP stream (unless the user explicitly allows a wrapper).
2. First line of a normal object payload is almost always `>` (or `-` for a root array) — never a checklist sentence.
3. Do **not** draft JSON / YAML / `key=value` first and translate.
4. Do **not** explain the protocol, paste Skill rules, or answer “is `>` present?” in the same message as the payload.
5. If the task needs multiple top-level sections, separate them with `.` after finishing each array/object section cleanly.
6. Long documents: keep the same grammar — `>name` / `>name-` / `key:value` / `<` / `.` — at any scale.
