# Node.js Encode (JSON → XAIOP)

[English](encode.md) · [简体中文](encode.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | `xaiop` **0.6.0+** |
| Protocol wire | Frozen **v0.4.0** |
| Code | [`encode.js`](../../../xaiop-sdk/nodejs/src/encode.js) |
| Tests | `encode.test.js` · `encode.stability.test.js` |
| Attention note | [notes/encode-attention.md](notes/encode-attention.md) |

Parent guide: [README.md](README.md) · Separation: [../../SEPARATION.md](../../SEPARATION.md)

---

## 1. Purpose

The encoder turns **plain JSON values** into **strict XAIOP wire text**.

| Use case | Notes |
| --- | --- |
| Tools / adapters / tests | Build wire without hand-writing Labels |
| Streaming demos | Control `.` phase size for `XaiopStream` / `DotCheckpointEngine` |
| `uploadJson` | Encode then store via the Engine |

It does **not** replace LLM-native XAIOP generation. Bench methodology still uses dual-channel native emit ([performance.md](../../performance.md) §2) — SDK encode is for **tooling**, not for claiming “model translated JSON→XAIOP” in those metrics.

---

## 2. APIs

All primary methods are async; sync counterparts exist. Instance / static / free functions produce the **same** wire for the same `(value, options)`.

```js
import {
  encode,
  encodeSync,
  DOT_POLICY,
  XaiopEncodeError,
  XaiopEngine,
} from "xaiop";

const wire = encodeSync({ a: 1, b: { x: true } });
const wire2 = await XaiopEngine.encode({ a: 1 }, { dotPolicy: DOT_POLICY.NONE });

const engine = new XaiopEngine();
const id = await engine.uploadJson({ tags: ["a", "b"] }, { dotPolicy: "none" });
```

| API | Role |
| --- | --- |
| `encode` / `encodeSync` | Free functions |
| `XaiopEngine.encode` / `encodeSync` | Static |
| `engine.encode` / `encodeSync` | Instance (compat flags **ignored**) |
| `engine.uploadJson` / `uploadJsonSync` | Encode → `upload` |

Compatibility mode never alters encode output (strict wire only).

---

## 3. Stability contract

### Guaranteed

For values the encoder **accepts**:

1. **`parseSync(encodeSync(value, opt))` deep-equals `value`** (JSON value equality; `-0` collapses to `0`).
2. **Determinism** — same `(value, options)` → identical wire string.
3. **Double round-trip** — `rt(rt(value)) === value` under the same options.
4. Named arrays **MAY** be split across `.` phases (`>name-` re-enter **appends**). Default encode still keeps each named array in one phase for Diff clarity.
5. Wire ends with exactly one trailing `\n`.

### Not guaranteed

- Byte-identical `encode(parse(handWrittenWire))` (hand wire may use different `<` / spacing / phase cuts).
- Preserving object `undefined` keys (default **omit**).
- Sparse array holes (`undefined` elements → **error**).
- Non-plain objects (`Date`, class instances, `Map`, `Set`, functions, `symbol`, `bigint`).
- Non-finite numbers (`NaN`, `±Infinity`).
- Strings containing `CR` / `LF`.
- Document-root `null` / `undefined` (must be object or array root).

### Rejected keys (prevent silent shape corruption)

| Key pattern | Why |
| --- | --- |
| empty / whitespace / contains `:` | Invalid Label name (same as parser) |
| ends with `-` | `>name-` is **array** enter — would turn objects into arrays |
| contains `>` `<` `=` `!` | Cursor / locate operator ambiguity |

---

## 4. Typing (Content)

Matches `PROT-CONTENT` (package **0.2.1**):

| JSON | Wire |
| --- | --- |
| safe integer | `key:42` |
| finite non-integer number | `key:1.5` / scientific as `String(n)` |
| boolean | `key:true` / `key:false` |
| **null** | `key:null` / array `:null` |
| string | `key:text` |
| string that looks like int/float/bool/**null** | **forced string** `key: null` (space after `:`) |

---

## 5. Dot policy (`. ` phases)

`.` resets Cursor to Root and bounds **stream phases**. Default policy emits one phase per **top-level object key**.

| `dotPolicy` | Behavior |
| --- | --- |
| `perTopLevelKey` (**default**) | `.` between each top-level **object** key |
| `none` | Single document; no phase `.` (unless `finalDot`) |
| `perNKeys` | Group `phaseEvery` keys per phase |
| `custom` | Cut when `shouldPhase(ctx)` returns true |
| **`string[]`** (path overload) | After each listed JSON path node is fully encoded, insert `.` |

**Path-array overload** (`dotPolicy: string[]`):

- Paths use **JSON-style** segments: `a.b[2]` (`.` and `[i]`). Not XAIOP `>`.
- `.` is inserted **after** that node (and all of its prior content in document order) is encoded.
- Missing paths → `XaiopEncodeError` (strict).
- Mutually exclusive with `phaseEvery` / `maxPhases` / `shouldPhase`.
- Requires `style: "reset"` (default).
- An array index may only be the **final** segment (`data.childs[2]` OK; `data.childs[2].name` rejected — after `.`, named-array reopen **appends** and cannot continue the same element object).
- Helpers: `parseJsonPath` / `formatJsonPath`.

**Array document roots:** when the encoded value is an array (or `root: "array"`), the wire starts with `-` and **object-style named `dotPolicy` phasing does not apply**. Path-array mode still walks the value; prefer object roots when you need mid-stream `.` for `XaiopStream` / `DotCheckpointEngine`.

| Option | Default | Notes |
| --- | --- | --- |
| `phaseEvery` | `1` | `perNKeys` |
| `maxPhases` | — | Merges the tail when set |
| `finalDot` | `false` | Extra trailing `.` line |
| `style` | `reset` | `relative` only meaningful with `dotPolicy: "none"` |
| `root` | `auto` | `object` / `array` / `auto` |
| `keyOrder` | `insertion` | Or `sorted` |
| `nullPolicy` | `encode` | `encode` · `omit` (object keys only) · `error`. Arrays always emit typed `null` unless `error`. |
| `undefinedPolicy` | `omit` | Object undefined |

`DOT_POLICY` constants mirror the string literals.

### Phase context (`custom`)

```ts
{
  key: string;
  index: number;       // 0-based among top-level keys
  total: number;
  keysInPhase: number; // including current key
  phaseIndex: number;
}
```

Return `true` to **end the phase after** the current key (ignored on the last key).

### Production streaming — place `.` deliberately

For **production stream pipelines** (`XaiopStream` / `DotCheckpointEngine` / WS phase push), treat `.` placement as part of the product design — do **not** rely on the default `perTopLevelKey` unless that matches your delivery shape.

| Goal | Prefer |
| --- | --- |
| Large contiguous payload (big text, blob fields, dense tables) stays **one phase** | Keep that subtree **inside** a single phase — no `.` mid-blob. Use `none`, a coarse `perNKeys` / `custom`, or a **path array that only cuts outside** the heavy region |
| Separable sub-results should arrive **early and smoothly** | Cut with `dotPolicy: string[]` (or `custom`) **after** each ready subunit — e.g. metadata, then each list element / section the UI can render |
| Avoid accidental O(phases × size) cost on the consumer | Fewer, purposeful `.` beats “one phase per top-level key” when the document is wide |

**Rule of thumb:** one `.` = one consumer Diff/Commit boundary. Put boundaries where the **receiver benefits** (progressive UI / partial commit), and keep **bulk continuous data** in one transfer unit so it is not chopped into many re-parses.

Path-array mode is the usual tool when JSON shape is known: list only the cut points you want (`["meta", "items[0]", "items[1]"]`), leave the large field unlisted so it ships in whichever phase contains it — intact.

---

## 6. Structures

```text
Object key → Content or >name / >name-
Array root → leading -
Array element object → > … <
Array element array → - … <
Array element scalar → :value
```

Within a phase, nested objects/arrays emit `<` before siblings so Cursor returns to the parent. A trailing `<` immediately before `.` or EOF may be omitted (redundant with reset / end).

---

## 7. Errors

`XaiopEncodeError` — encode failures. Optional `.path` (JSONPath-like, e.g. `$.meta.name`, `$[0].id`).

---

## 8. Examples

### Compact single phase

```js
encodeSync(
  { meta: { name: "demo" }, n: 1 },
  { dotPolicy: "none" },
);
// >
// >meta
// name:demo
// <
// n:1
```

### Stream-friendly phases

```js
encodeSync({ a: 1, b: 2, c: 3 });
// >
// a:1
// .
// >
// b:2
// .
// >
// c:3
```

### Path-array phases

```js
encodeSync(
  { data: { childs: [{ id: 0 }, { id: 1 }, { id: 2 }], meta: true } },
  { dotPolicy: ["data.childs[1]"] },
);
// After childs[1] is fully encoded → `.` → reopen `>data` / `>childs-` and append the rest
```

### Forced strings

```js
encodeSync({ n: 5, s: "5" }, { dotPolicy: "none" });
// >
// n:5
// s: 5
```

---

## 9. Test coverage

| Suite | Focus |
| --- | --- |
| `encode.test.js` | API surface, typing, policies, stream alignment, fixture |
| `encode.stability.test.js` | Determinism, double round-trip, seeded random corpus, unicode, key hazards, chunked stream |

Run: `cd xaiop-sdk/nodejs && npm test`

**Pitfalls checklist:** [notes/encode-attention.md](notes/encode-attention.md) · Stream Diff boundary: [notes/streaming-parse.md](notes/streaming-parse.md)
