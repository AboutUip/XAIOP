# Node.js Merge / Inject (JSON ↔ XAIOP)

[English](merge.md) · [简体中文](merge.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | `xaiop` **0.6.0+** |
| Code | [`merge.js`](../../../xaiop-sdk/nodejs/src/merge.js) |
| Tests | `merge.test.js` |

Parent guide: [README.md](README.md)

---

## 1. Purpose

**Pre/post-processing** helpers that merge a **base JSON** tree with an overlay (JSON or parsed XAIOP).

| Not this | This |
| --- | --- |
| Streaming / WS / `.` phases | Offline merge before send or after receive |
| Transport later-wins across chunks | Explicit `conflict` on **keys only** |

---

## 2. Conflict policy

| `conflict` | On a conflicting key |
| --- | --- |
| `overwrite` (**default**) | Take the overlay value |
| `keep` | Keep the base value; still accept **non-conflicting** overlay keys |

Deep **plain objects** recurse. **Arrays** and scalars are atomic at that key (whole value conflicts).

Constant: `MERGE_CONFLICT.OVERWRITE` / `MERGE_CONFLICT.KEEP`.

---

## 3. Full-argument APIs

Param order: **① base JSON**, **② XAIOP text**.

| API | Returns |
| --- | --- |
| `mergeToJson(base, xaiop, options?)` | JSON |
| `mergeToXaiop(base, xaiop, options?)` | XAIOP wire (encode of merged JSON; default `dotPolicy: "none"`) |

Also: free functions, `XaiopEngine.mergeToJson` / `mergeToXaiop` (static + instance; instance uses engine compat for parse), and `mergeJson(base, overlayJson, conflict?)` for JSON+JSON.

```js
import { mergeToJson, mergeToXaiop, MERGE_CONFLICT } from "xaiop";

const json = mergeToJson({ a: 1 }, ">\nb:2\n", { conflict: MERGE_CONFLICT.KEEP });
const wire = mergeToXaiop({ a: 1 }, ">\na:9\n", { conflict: "overwrite" });
```

---

## 4. Engine inject (few-arg)

When the instance **already holds** a document (`dataId` from `upload` / `uploadJson`), inject only the overlay:

| API | Overlay |
| --- | --- |
| `injectXaiop(dataId, xaiopSource, options?)` | XAIOP text |
| `injectJson(dataId, jsonValue, options?)` | JSON |

Both **mutate** the store. Options:

- `conflict` — same as above  
- `as: "json"` (**default**) | `"xaiop"` — return shape after merge  
- `encodeOptions` — when `as: "xaiop"`

Stored root **fragments** (`XaiopFragment`) are materialized to a plain object before merge, then written back as that object.

```js
const id = engine.uploadJsonSync({ a: 1 });
engine.injectXaiopSync(id, ">\nb:2\n");
engine.injectJsonSync(id, { a: 9 }, { conflict: "keep" }); // a stays 1, …
```

---

## 5. Related

- Encode (wire out): [encode.md](encode.md)  
- Stream Diff (not merge): [stream.md](stream.md)
