# Practice — keyed / named-path state modeling

[English](keyed-state-modeling.md) · [简体中文](keyed-state-modeling.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PRACTICE-KEYED-MODEL` |
| Status | Informative |
| Last updated | 2026-08-05 |
| Normative | **No** — modeling guidance; wire rules stay in `PROT-HIER` |

Protocol: [../protocol/hierarchy.md](../protocol/hierarchy.md) · intro scope: [../overview/introduction.md](../overview/introduction.md) (NG6).

---

## 1. Verdict

`=` / `!` / `&` act on **named path fragments** and Cursor position.  
**Anonymous array elements have no label** — they cannot be targeted by locate / broadcast / delete the way JSON Patch indexes can.

Prefer **keyed maps** or **repeated named children** when the product must evolve rows after the fact.

---

## 2. JSON array habit vs XAIOP

| JSON habit | XAIOP consequence |
| --- | --- |
| `orders: [{ id: "A1", … }, { id: "A2", … }]` | Elements are anonymous; `=A2` does **not** mean “row whose id is A2” unless you model differently |
| Patch “item 1” by index | **No** element-index delete / locate on the wire |
| Broadcast “every order.detail” | Needs a **repeated path fragment** named `detail` under each order |

### Pattern A — keyed map (recommended for mutable rows)

```text
>
>orders
>A1
status:pending
<
>A2
status:pending
<
.
=A2
status:shipped
.
```

Materializes roughly `{ "orders": { "A1": { "status": "pending" }, "A2": { "status": "shipped" } } }`.

### Pattern B — repeated named children + broadcast

```text
>
>shopA
>order
id:A1
>detail
checked:false
<
<
>order
id:A2
>detail
checked:false
<
<
.
!detail
checked:true
.
```

`!detail` hits every complete `detail` path fragment (outer prune). There is **no** wildcard “all array indices”.

### Pattern C — append-only anonymous array

Fine when you **never** need mid-stream locate/delete of a past element:

```text
>
>events-
>
type:open
<
.
>events-
>
type:close
<
.
```

Later phases only **append**; corrections to earlier rows are out of scope for this shape.

---

## 3. When to stay on JSON

Static whole-document exchange, index-heavy patches, or throughput-critical parse/stringify of finished trees — keep JSON (see introduction NG1). XAIOP’s cost/value shows up in **streaming phases** and **declaration-shaped corrections**, not as a faster `JSON.parse`.

---

## 4. Related

- Wire pitfalls: [../protocol/notes/wire-attention.md](../protocol/notes/wire-attention.md)
- Streaming product Snapshot/Diff: [streaming-transport.md](streaming-transport.md)
- Node Diff isolation (SDK): [../sdk/nodejs/notes/streaming-parse.md](../sdk/nodejs/notes/streaming-parse.md)
