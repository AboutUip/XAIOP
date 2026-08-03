# Protocol note — wire attention

[English](wire-attention.md) · [简体中文](wire-attention.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PROT-NOTE-WIRE` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** — checklist over Frozen text |
| Depends on | `PROT-SYNTAX`, `PROT-HIER`, `PROT-BOUND`, `PROT-CONTENT` |

Authority: Frozen documents under [../](../). This note does not change them.

---

## 1. Scope

Pitfalls that follow from **wire semantics alone**, for Generators and any conforming Parser (language-agnostic).

Out of scope: Skills, HTTP/SSE/WebSocket recipes, Diff checkpoint product choices, compatibility mode.
Those live under [../../practice/](../../practice/) and [../../sdk/](../../sdk/).

---

## 2. Root shape

| Intent | Required opener | Result |
| --- | --- | --- |
| Complete JSON **object** document | leading standalone `>` | Anonymous root object is the document |
| Complete JSON **array** document | leading standalone `-` | Anonymous root array is the document |
| Root **fragment** | omit `>` / `-`; use `>name` / Content | Named bindings at Root — **not** `{"a":{}}` |

Mixing “I meant a JSON object” with a fragment opener is the most common Generator mistake.

Normative: [../syntax.md](../syntax.md) §2.

---

## 3. Operator `.` (Root reset)

1. A Label line that is exactly `.` resets the **Cursor** to Root.  
2. It does **not** erase already written data.  
3. After `.`, relocate with `>` / `=` / `>name` / `>name-` from Root — do not invent depth with extra `<`.  
4. Bare `<` at Root is a **syntax error**.  
5. After `.`, bare `>` on an object root **re-enters** that root (modify); it does **not** nest another anonymous object.

Normative: [../hierarchy.md](../hierarchy.md) §8 / §4.2.

---

## 4. Later-wins (overwrite)

1. Same key written again → later Content wins.  
2. Re-entering a named **object** (`>name` when it already exists as object) continues that object.  
3. Re-opening a named **array** (`>name-`) **replaces** the array with a new empty array — it does **not** append.  
4. Planning multi-phase documents: grow one named array **without** re-emitting `>name-` after a Cursor reset if append was intended.

Normative: [../hierarchy.md](../hierarchy.md) §9–10.

---

## 5. Arrays

1. Open with `-` or `>name-`. Do **not** use `-` between sibling elements.  
2. Object element that needs multiple / nested fields: `>` … Content … `<`.  
3. Single-property object element at array level: one-line `key:value` (Cursor stays at array).  
4. Nested array element: `-` … `<`.

Normative: [../syntax.md](../syntax.md) §6.

---

## 6. Labels and Content

1. **No Bare Labels** (name-only line).  
2. One Label per line; Label ends at `LF` / `CRLF`.  
3. Content splits on the **first** `:` only.  
4. Values **MUST NOT** contain line endings.  
5. Typing: int → float (binary64) → bool → null → string; space(s) after `:` force string (`PROT-CONTENT`).

Normative: [../syntax.md](../syntax.md), [../content.md](../content.md), [../boundary.md](../boundary.md).

---

## 7. Generator checklist (protocol)

- [ ] Chose complete root vs fragment deliberately.  
- [ ] Prefer LF or CRLF; avoid relying on lone CR.  
- [ ] After `.`, re-address from Root.  
- [ ] Never reopen `>name-` across resets if append was intended.  
- [ ] No CR/LF inside values; no Bare Labels.  
- [ ] Forced string when a numeric/bool-looking token must stay text.

---

## 8. Parser checklist (protocol)

- [ ] Treat later same-key writes as overwrite.  
- [ ] Treat `>name-` reopen as replace.  
- [ ] Reject bare `<` at Root.  
- [ ] Do not invent missing leaves or braces.  
- [ ] Line-buffer until a full line before interpreting a Label (`PROT-BOUND` / streaming requirements).

---

## Related

- Streaming (protocol surfaces): [streaming-attention.md](streaming-attention.md)  
- Model emit / network streaming (practice): [../../practice/](../../practice/)
