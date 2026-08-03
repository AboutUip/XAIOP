# XAIOP Node.js SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | `xaiop` |
| Protocol | v0.4.0 Frozen |
| Runtime | Node.js ≥ 18 (ESM) |
| Code | [../../../xaiop-sdk/nodejs/](../../../xaiop-sdk/nodejs/) |

**Isolation:** Protocol = wire only · Practice = model & streaming transport · This package = APIs — [../../SEPARATION.md](../../SEPARATION.md).  
**Parity:** [../behavioral-contract.md](../behavioral-contract.md) (protocol conformant ≠ this SDK).  
**Docs:** [Guide](README.md) · [Stream](stream.md) · [Encode](encode.md) · [Merge](merge.md) · [Notes](notes/) · [Practice](../../practice/) · [Protocol](../../protocol/)

---

## Install

```bash
cd xaiop-sdk/nodejs
npm install
npm test
npm run build
# → dist/xaiop-0.7.0.tgz
```

```js
import { XaiopEngine, PROTOCOL_VERSION } from "xaiop";
```

---

## Primary APIs

All primary methods are **async**. Matching **sync** methods are provided.

### 1. `new XaiopEngine()` — create engine

```js
const engine = new XaiopEngine();
// optional: enable compatibility mode (off by default; pop-and-retry on errors)
const engineCompat = new XaiopEngine({ compatibilityMode: true });
engine.setCompatibilityMode(true);
```

Holds an in-memory store of uploaded documents keyed by runtime **data id**.

### 2. `upload` / `get` — instance APIs

Upload a **complete** (non-streaming) XAIOP string; receive a data id.  
Pass the data id to get parsed JSON. Instance uploads use the engine’s current `compatibilityMode`.

```js
const dataId = await engine.upload(xaiopText);
const json = await engine.get(dataId);

// sync
const dataId2 = engine.uploadSync(xaiopText);
const json2 = engine.getSync(dataId2);
```

### 3. `XaiopEngine.parse` — static API

Parse without an engine instance / without storing an id.

```js
const json = await XaiopEngine.parse(xaiopText);
const jsonSync = XaiopEngine.parseSync(xaiopText);
// second argument: compatibility mode boolean only (default false)
const jsonCompat = XaiopEngine.parseSync(xaiopText, true);
```

**Asymmetry:** free `parseSync` / `parseAsync` accept `boolean | CompatPolicy | partial fix map` (see CompatPolicy below). Static `XaiopEngine.parse` / `parseSync` accept **boolean only**.

### 3b. Root fragments — `XaiopFragment`

Strict mode: if the document has no anonymous root (`>` / `-`) and opens with `>name` or Root Content, parse returns an **`XaiopFragment`** (not a wrapped `{ "a": … }` object).

| Property / method | Meaning |
| --- | --- |
| `entries` | Named bindings at Root |
| `isFragment` | Always `true` |
| `notation()` | Debug string like `"a":{}` |

Empty source → `{}` (not a fragment). Compatibility `forcedRoot` never returns a fragment for that shape — it yields a complete object.  
**Stream / WS JSON surfaces** call `materializeSnapshot`: fragments become a clone of `entries` (plain object). Engine `get` preserves fragments when present.

```js
import { parseSync, XaiopFragment } from "xaiop";
const v = parseSync(`>meta\nname:demo\n`);
// v instanceof XaiopFragment → true; v.entries.meta === { name: "demo" }
```

### 4. `encode` / `uploadJson` — JSON → XAIOP

Encode emits **strict** wire only (compatibility mode does not change output).  
Default `dotPolicy` is `perTopLevelKey` so each top-level key is a `.` phase for `DotCheckpointEngine` / `XaiopStream`.

```js
import { encodeSync, DOT_POLICY, XaiopEngine } from "xaiop";

const wire = encodeSync(
  { meta: { name: "demo" }, tags: ["a", "b"] },
  { dotPolicy: DOT_POLICY.NONE }, // single phase, no `.`
);

const phased = XaiopEngine.encodeSync(
  { a: 1, b: 2, c: 3 },
  { dotPolicy: "perNKeys", phaseEvery: 2, maxPhases: 10 },
);

const engine = new XaiopEngine();
const id = await engine.uploadJson({ x: 1 }, { finalDot: false });
```

| Option | Default | Notes |
| --- | --- | --- |
| `root` | `auto` | `object` / `array` / `auto` |
| `dotPolicy` | `perTopLevelKey` | `none` · `perTopLevelKey` · `perNKeys` · `custom` |
| `phaseEvery` | `1` | Used by `perNKeys` |
| `maxPhases` | — | Merges the tail when set |
| `shouldPhase` | — | Required for `custom` |
| `finalDot` | `false` | Trailing `.` line |
| `nullPolicy` | `encode` | `encode` (default) · `omit` (object keys) · `error`. Arrays emit typed `null` unless `error`. |
| `keyOrder` | `insertion` | Or `sorted` |

**Rejected keys** (would corrupt structure): empty / whitespace / `:`, trailing `-`, characters `>` `<` `=` `!`.

Round-trip guarantee: `parseSync(encodeSync(json))` matches `json` for plain JSON values the encoder accepts (no `null` array elements, no non-finite numbers, no CR/LF in strings). Byte-identical `encode(parse(wire))` is **not** required.

**Full encode guide:** [encode.md](encode.md) (stability contract, key hazards, phase options, tests).

### 4b. `mergeToJson` / `mergeToXaiop` / `inject*` — pre/post merge

Not streaming. Merge **base JSON** with XAIOP (or inject into a stored `dataId`). Conflict policy applies to **keys only** (`overwrite` | `keep`).

```js
import { mergeToJson, mergeToXaiop, MERGE_CONFLICT, XaiopEngine } from "xaiop";

const json = mergeToJson({ a: 1 }, ">\nb:2\n", { conflict: MERGE_CONFLICT.KEEP });
const wire = mergeToXaiop({ a: 1 }, ">\na:9\n"); // returns XAIOP

const engine = new XaiopEngine();
const id = engine.uploadJsonSync({ a: 1 });
engine.injectXaiopSync(id, ">\nb:2\n");
engine.injectJsonSync(id, { a: 9 }, { conflict: "keep", as: "json" });
```

**Guide:** [merge.md](merge.md).

### 5. `XaiopWs` — WebSocket listen / connect (SDK 0.4.0+)

First-class skeleton-stream sessions (one package: push + consume). See [notes/ws-session.md](notes/ws-session.md) and [../../practice/skeleton-stream.md](../../practice/skeleton-stream.md).

```js
import { XaiopWs } from "xaiop";
const hub = await XaiopWs.listen({ port: 0 });
hub.onConnection(async (c) => {
  c.pushJson("a", 1, { final: true });
  await c.end();
});
const client = await XaiopWs.connect(hub.url());
await client.done;
await hub.close();
```

HTTP/SSE/RAW remain on `XaiopStream` for other paths — full API: [stream.md](stream.md).

### 6. `XaiopStream` — HTTP / SSE / WS / RAW consumer

Independent streaming client. Diff = `.` phase (not Block Diff). Defaults: `streamProcessing` on, **`mergeChunkWindow` on**, `compatibilityMode` off, `asyncParse` off, **`historySnapshot` / `historyRealtime` off**, modes = `callback` only.

```js
import { XaiopStream } from "xaiop";
const stream = new XaiopStream(url, {
  mergeChunkWindow: true, // default — one Diff per buffer window of complete dots
  asyncParse: true, // production: coalesced async ingest
  historySnapshot: true, // opt-in read-only `.` history
  historyRealtime: true, // opt-in forward jumpTo
});
stream.onChunk((diff) => {});
await stream.send({ transport: "http" });
// stream.history.exportTimeRoot() · stream.jumpTo(i)
```

See [stream.md](stream.md) · phase algorithm [notes/streaming-parse.md](notes/streaming-parse.md) · history [notes/history.md](notes/history.md).

---

## Compatibility mode

Compatibility mode is an **opt-in** parse path for imperfect model output.  
The frozen wire protocol stays strict; this mode changes **root shape coercion** and **how the SDK recovers** when a line is illegal at the current Cursor.

### Defaults and how to enable

| | |
| --- | --- |
| Default | **Off** — every `XaiopSyntaxError` fails immediately (protocol-faithful) |
| Instance | `new XaiopEngine({ compatibilityMode: true })` · `engine.setCompatibilityMode(true\|false)` · read `engine.compatibilityMode` |
| Static Engine | `XaiopEngine.parse(source, compatibilityMode?)` — **boolean only**; omit or `false` = off |
| Free parse | `parseSync` / `parseAsync` — second arg: `boolean \| CompatPolicy \| Partial<Record<CompatFixId, boolean>>` |

```js
// Strict (default)
XaiopEngine.parseSync(text);

// Compatibility (all eight fixes on)
XaiopEngine.parseSync(text, true);
parseSync(text, true);

const engine = new XaiopEngine({ compatibilityMode: true });
await engine.upload(text); // uses engine.compatibilityMode
```

### CompatPolicy — fine-grained fixes

When compatibility mode is on, eight **independent** deterministic fixes apply. Constructing `CompatPolicy` with no overrides yields **all on**. A plain object passed to `parseSync` is treated as **overrides on those defaults** (unset keys stay `true`).

| Fix ID | Default (mode on) | Summary |
| --- | --- | --- |
| `forcedRoot` | `true` | Inject anonymous object root when opener is not `>` / `-` |
| `rewriteBareNameArray` | `true` | `name-` → `>name-` |
| `rewriteEnterLine` | `true` | Whitespace / glued `>key:value` rewrites |
| `ignoreBareLeaveAtRoot` | `true` | Ignore bare `<` at Root |
| `popAndRetry` | `true` | Pop Cursor and retry the failing line |
| `locatePathTrim` | `true` | `=` path trim retry |
| `locatePathStripSpaces` | `true` | `=` strip-all-spaces retry |
| `locatePathArraySuffix` | `true` | `=` trailing `-` as array key when value is array |

Exports: `CompatPolicy`, `COMPAT_FIX_IDS`, `COMPAT_FIX_DEFAULTS`.

```js
import { parseSync, CompatPolicy } from "xaiop";

parseSync(text, { popAndRetry: true, forcedRoot: false }); // other fixes still default true
parseSync(text, new CompatPolicy({ forcedRoot: false }));

engine.setCompatibilityMode(true);
engine.setCompatForcedRoot(false); // returns false if mode off or non-boolean — no mutate
// setCompatibilityMode does NOT reset per-fix flags
```

Engine / `XaiopStream` expose `compatForcedRoot` … `setCompatLocatePathArraySuffix` mirrors for each ID. While mode is **off**, setters return `false` and leave flags unchanged.

### Forced complete root (outer object or array)

Under compatibility mode the outer document **must** be a complete anonymous **object** or **array** — not a root fragment.

| First line | Compatibility action |
| --- | --- |
| `>` | Keep object root (as written) |
| `-` | Keep array root (as written) |
| Anything else (`>name`, Content, …) | **Inject** an empty anonymous object root (same effect as a missing leading `>`) before parsing |

Strict mode still treats a leading `>name` / Root Content as a **root fragment** (`"a":{}`, no outer `{}`). Compatibility never returns a fragment for that shape — it yields `{ "a": {} }`.

Example — LLM skipped the root opener:

```text
>meta
name:demo
.
>characters-
>
name:alice
<
```

Strict: fragment path → bare `>` after `>characters-` fails (`fragment bindings`).  
Compatibility: implied leading `>` → `{ meta:{ name:"demo" }, characters:[{ name:"alice" }] }`.

### Bare `name-` → `>name-`

Before handling a line, if it matches `^[A-Za-z_][A-Za-z0-9_]*-$` (e.g. `aliases-`, `tags-`), rewrite to `>name-`.

- Does **not** rewrite bare names without `-` (e.g. `aliases` alone still errors)
- Strict mode never rewrites
- Models often omit `>` on named arrays; that form has no legal strict reading, so the rewrite is deterministic

### `>` whitespace / glued `>key:value`

Compatibility also rewrites, before handling:

| Written | Becomes |
| --- | --- |
| `>  ` (`>` + whitespace only) | `>` |
| `>  meta` / `>  tags-` | `>meta` / `>tags-` |
| `>shard_index:1` (text after `>` contains `:`) | Content `shard_index:1` |
| Trailing spaces on a line | stripped |

Label names after `>` **cannot** contain `:`, so `>key:value` uniquely means Content. Strict mode never rewrites these.

### Redundant bare `<` at Root

Under compatibility mode, if the Cursor is already at document Root (`stack.length <= 1`) and the line is bare `<`, **ignore** it (no-op).

Typical:

```text
.
<
>
id:23-1
```

`.` already reset to Root; another `<` is strictly illegal and meaningless — skip and continue.  
Does **not** ignore `<name` at Root (still errors). Legal `<` when not at Root is unchanged.

### What it does (pop-and-retry)

When a line raises `XaiopSyntaxError` and compatibility mode is on:

1. **Pop** the Cursor one level (same effect as a missing `<` at that depth).  
2. **Retry the same line** at the new Cursor (after any line rewrite above).  
3. If it **succeeds** → continue with the rest of the stream.  
4. If the error is **unchanged** (same message, ignoring the `line N:` prefix) → pop again and retry.  
5. If the error **changes** → stop recovery for **this line** and **throw the new error**.  
6. If Cursor cannot pop further (already at document root) → **throw the original error**.

Recovery does not invent new label **names** or values; it may insert implied leaves (pop) and the deterministic line rewrites above.

### Multiple errors in one document

Recovery is **per line**, then the parser **keeps scanning**.  
If the stream has two (or more) Cursor slips:

1. Recover error A on its line (pop-and-retry until that line succeeds).  
2. Continue parsing following lines.  
3. When error B appears later, run the same recovery again.  

A successful recovery does **not** end the parse. “Error changes → throw” applies only **inside** one line’s recovery loop — not “ignore later errors after the first fix.”

Example — two missing leave-array slips in one Stream:

```text
>
>tags-
:a
>features-
:x
>meta
name:demo
.
```

Strict: fails on the first bad line (`>features-`).  
Compatibility: recover out of `tags`, continue; recover out of `features`, then accept `>meta` → `{ tags:["a"], features:["x"], meta:{ name:"demo" } }`.

### Typical recoveries

These are the cases this mode is designed for (common LLM slips):

| Strict failure | Likely cause | Compatibility action |
| --- | --- | --- |
| `>name` / `>name-` while Cursor is inside an array | Finished a list but forgot `<` / `.` before the next section | Pop until outside the array, then accept `>name-` |

Under the wire protocol, bare `>` while already on an **object** **re-enters** that object (modify / overwrite on later keys) — it is **not** a syntax error. Compatibility pop-and-retry is not used for that case. Inside an **array**, bare `>` still **creates** a new element.

Example — missing leave after a named array (strict fails; compatibility succeeds):

```text
>
>tags-
:alpha
:beta
>users-
>
id:1
name:alice
<
```

Strict: error on `>users-` (“inside an array”).  
Compatibility: pop out of `tags`, then parse `>users-` normally.

### `=path` whitespace / array-suffix retry

When `=path` is not found and compatibility mode is on, retry matching:

1. **Trim** leading/trailing whitespace (e.g. `= siblings` → `siblings`).  
2. If still not found, **strip all whitespace** (e.g. `=child > inner` → `child>inner`).  
3. If still not found, treat a segment trailing `-` as the **`>name-` create postfix** reused on locate: match key without `-` **only when that value is an array** (e.g. `=siblings-` → `siblings` array; `=wrap>items-` → `wrap.items` array).  
4. If still not found → throw the original `=path not found` error (path text unchanged in the message).

Strict mode never strips spaces or create-suffix hyphens.  
`=meta-` does **not** match an object key `meta` (postfix `-` only applies to arrays).

### What it does **not** do

- Does **not** rewrite arbitrary Bare Labels (only listed deterministic cases such as `name-` → `>name-`).  
- Does **not** invent keys or fix typos beyond `=path` retries and listed line rewrites.  
- Does **not** change array semantics: bare `>` inside an array still **creates** a new element.  
- Does **not** guarantee a document “makes sense” — only root coercion + listed line rewrites + `=path` retries + Cursor pop-and-retry.  
- Note: a stream that is a **valid root fragment** under strict mode **will** become a complete object under compatibility (forced root).

### When to use

| Prefer strict (default) | Prefer compatibility |
| --- | --- |
| Conformance tests, protocol QA, golden fixtures | Ingesting LLM output that often skips `<` / under-pops |
| You need byte-for-byte protocol fidelity | You would rather salvage a tree than reject the whole stream |

**Recommendation:** keep production validators on **strict** when you control the generator (Skill + good models). Enable compatibility at the **ingest boundary** when models frequently omit leave-array / leave-element.

### Errors under compatibility

- Still throws `XaiopSyntaxError` when recovery cannot help or when the error changes after a pop.  
- Strict mode remains: **no** silent repair of any kind.

---

## API reference

### `new XaiopEngine(options?)`

Creates a standard XAIOP engine instance.

- **options.compatibilityMode** — optional boolean; default `false`

### `engine.compatibilityMode` / `engine.setCompatibilityMode(enabled)`

Read or toggle compatibility mode for subsequent `upload` / `uploadSync` on this instance.  
When on: failed lines trigger pop-and-retry recovery (see Compatibility mode).

### `engine.upload(source): Promise<string>`

- **source** — full XAIOP document text  
- **returns** — runtime data id (string)  
- Parses deterministically; throws `XaiopSyntaxError` on invalid input  
- Does **not** stream; entire `source` is required  

### `engine.uploadSync(source): string`

Synchronous counterpart of `upload`.

### `engine.uploadJson(value, encodeOptions?): Promise<string>`

Encode JSON → XAIOP (strict), then `upload`. Same encode options as `encodeSync`.

### `engine.uploadJsonSync(value, encodeOptions?): string`

Synchronous counterpart of `uploadJson`.

### `engine.encode` / `engine.encodeSync`

Instance encode (identical to static / free `encode` — compat flags do not affect wire).

### `mergeToJson` / `mergeToXaiop` / `mergeJson`

Pre/post merge (not streaming). See [merge.md](merge.md). Instance methods use engine compat for XAIOP parse.

### `engine.injectXaiop` / `injectJson` (+ Sync)

Merge overlay into stored `dataId` (mutates store). `as: "json" | "xaiop"` selects return shape.

### `engine.get(dataId): Promise<unknown>`

- **dataId** — id from `upload` / `uploadSync` / `uploadJson`  
- **returns** — JSON-compatible value (`object` / `array` / …), cloned  
- Throws if id is unknown  

### `engine.getSync(dataId): unknown`

Synchronous counterpart of `get`.

### `XaiopEngine.parse(source, compatibilityMode?): Promise<unknown>`

Static parse → JSON-compatible value or (strict) `XaiopFragment`.  
Second argument optional **boolean**; default / omitted = compatibility **off**.

### `XaiopEngine.parseSync(source, compatibilityMode?): unknown`

Static sync parse. Same boolean compatibility flag as `parse`.

### Free `parseSync` / `parseAsync`

```ts
parseSync(
  source: string,
  compat?: boolean | CompatPolicy | Partial<Record<CompatFixId, boolean>>,
): unknown | XaiopFragment;
```

`false` / omitted → strict; `true` → all fixes; object / `CompatPolicy` → fine-grained (see CompatPolicy).

### `XaiopEngine.encode` / `encodeSync` / free `encode` / `encodeSync`

JSON → XAIOP wire text. See **encode / uploadJson** above. Throws `XaiopEncodeError` (optional `.path`).

### Helpers

| Member | Meaning |
| --- | --- |
| `PROTOCOL_VERSION` | `"0.4.0"` (protocol; package may be newer) |
| `SDK_VERSION` | `"0.7.0"` (package) |
| `DOT_POLICY` | Encode phase policy constants |
| `MERGE_CONFLICT` | Merge/inject conflict constants (`overwrite` / `keep`) |
| `HISTORY_NODE_KIND` / `ParseHistory` | Opt-in parse history — [notes/history.md](notes/history.md) |
| `mergeToJson` / `mergeToXaiop` / `mergeJson` | Pre/post merge — [merge.md](merge.md) |
| `CompatPolicy` / `COMPAT_FIX_IDS` / `COMPAT_FIX_DEFAULTS` | Fine-grained compatibility |
| `XaiopFragment` | Strict root-fragment parse result |
| `engine.has(dataId)` | whether id exists |
| `engine.delete(dataId)` | drop one entry |
| `engine.clear()` | drop all |
| `engine.setCompat*` / `compat*` getters | Per-fix toggles (active only while mode on) |
| `XaiopSyntaxError` | parse error class (`.line`) |
| `XaiopEncodeError` | encode error class (`.path`) |
| `XaiopStream` | HTTP/SSE/WS/RAW consumer — [stream.md](stream.md) |
| `XaiopWs` / `XaiopWsConnection` / `XaiopWsHub` | WebSocket sessions (0.4.0+) |
| `encodePhaseJson` / `encodePhaseObject` | Single-phase encode for WS push |
| `materializeSnapshot` | Fragment → plain object for stream JSON |

Low-level exports: `parseSync`, `parseAsync`, `encodeSync`, `encode`.

Third-party parity checklist: [../behavioral-contract.md](../behavioral-contract.md).

---

## Errors

- Invalid wire → `XaiopSyntaxError`  
  - **Strict (default):** fail immediately; **no** silent repair  
  - **Compatibility:** pop-and-retry as above; still throws if recovery fails or the error changes  
- Invalid encode input / options → `XaiopEncodeError`  
- Unknown data id → `Error`  
- Bad argument types / invalid `conflict` / `as` → `TypeError`  

---

## Example

```js
import { XaiopEngine } from "xaiop";

const text = `>
>meta
name:demo
count: 2
`;

const engine = new XaiopEngine();
const id = await engine.upload(text);
console.log(await engine.get(id));
// { meta: { name: "demo", count: "2" } }

console.log(await XaiopEngine.parse(text));

const wire = XaiopEngine.encodeSync({ meta: { name: "demo" }, n: 1 });
console.log(await XaiopEngine.parse(wire));
```

---

## Fixtures

Must match: [../../examples/complex.xaiop](../../examples/complex.xaiop) → [../../examples/complex.expected.json](../../examples/complex.expected.json)

---

## Out of scope (this package slice)

- Java / Python encode parity
