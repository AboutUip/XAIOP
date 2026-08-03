# Node.js Encode (JSON → XAIOP)

[English](encode.md) · [简体中文](encode.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | `xaiop` **0.3.0+** |
| Protocol wire | Frozen **v0.2.1** (unchanged) |
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
4. Named arrays are **never split across `.` phases** (re-opening `>name-` after `.` would **replace**, not append).
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
| `perTopLevelKey` (**default**) | `.` between each top-level key |
| `none` | Single document; no phase `.` (unless `finalDot`) |
| `perNKeys` | Group `phaseEvery` keys per phase |
| `custom` | Cut when `shouldPhase(ctx)` returns true |

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
