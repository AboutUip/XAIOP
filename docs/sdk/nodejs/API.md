# XAIOP Node.js SDK API Reference

[English](API.md) · [简体中文](API.zh-CN.md)

**Protocol**: v0.6.0 Frozen (sealed)  
**SDK**: 0.15.0 (TypeScript)  
**Runtime**: default entry **Node.js ≥ 18 (ESM)**; browser via subpath (see §0)  
**Code**: [../../../xaiop-sdk/nodejs/](../../../xaiop-sdk/nodejs/) (`src/` TS → `dist/`)  
**Node product-choice catalog**: [../behavioral-contract.md](../behavioral-contract.md) (optional guide; not a cross-language mandate) · **Releases**: [../../meta/releases.md](../../meta/releases.md)

---

## 0. Runtime scope and entrypoints

| Entry | Environment | Surface |
| --- | --- | --- |
| `import "xaiop"` | **Node.js ≥ 18** (primary) | Full: parse/encode/engine/stream/`XaiopWs` listen+connect |
| `import "xaiop/browser"` | **Browsers** (client subset) | Core + **phase streaming** `XaiopStream` (fetch/SSE/native WS) + `XaiopBrowserWs.connect`; **no** listen/hub |
| `import "xaiop/core"` | Isomorphic (Node or bundler) | Wire core only: parse/encode/merge/checkpoint/engine; **no** network I/O |

| Claim | |
| --- | --- |
| Default `"xaiop"` works in browsers as-is | **No** (pulls `ws` / `node:stream`) |
| Browser server `listen` | **No** — use Node `XaiopWs.listen`; browser only `connect` / `XaiopStream` |
| Browser **`.` phase Diff** | **Yes** — same `DotCheckpointEngine` as Node (`onChunk` / `onPhase`, Commit, optional `cover` / `mergeChunkWindow` / `typeCheck` / **line intercept** / **Annotation Span** / **Control Root**) |
| Wire semantics | All three entries share one `core` (protocol package **0.6.0**) |

This repository’s **SDK focus is Node.js**; other-language ports need not match the full Node surface.

---

## Contents

0. [Runtime scope and entrypoints](#0-runtime-scope-and-entrypoints)
1. [Quick start](#1-quick-start)
2. [Core concepts](#2-core-concepts)
3. [Parse API](#3-parse-api)
4. [Encode API](#4-encode-api)
5. [Engine API](#5-engine-api) (incl. [§5.5 Type checking](#55-type-checking-instance))
6. [Streaming API](#6-streaming-api) (incl. [§6.4 Line intercept](#64-line-intercept-onlineintercept) · [§6.5 Annotation Span](#65-annotation-span-onannotationspan) · phase `meta.seq`)
7. [WebSocket API](#7-websocket-api) (incl. [§7.6 Browser](#76-browser-xaiopbrowser--phase-client) · [§7.7 Control Root](#77-sdk-control-root---session--resume))
8. [Merge and inject](#8-merge-and-inject)
9. [Compatibility mode](#9-compatibility-mode)
10. [Types and constants](#10-types-and-constants)
11. [Error handling](#11-error-handling)

---

## 1. Quick start

### Install

```bash
cd xaiop-sdk/nodejs
npm install
npm test
```

### Basics

```js
import {
  parseSync,
  encodeSync,
  XaiopEngine,
  XaiopStream,
  PROTOCOL_VERSION,
  SDK_VERSION,
} from "xaiop";

// XAIOP → JSON
parseSync(">\na:1\n");           // → { a: 1 }

// JSON → XAIOP (default: one phase per top-level key, with `.`)
encodeSync({ a: 1, b: 2 });

// Engine store
const engine = new XaiopEngine();
const id = await engine.uploadJson({ meta: { name: "demo" } });
const json = await engine.get(id);

// Streaming consume (`cover` defaults to false) — Node default entry
const stream = new XaiopStream(url, { cover: false });
stream.onChunk((diff) => {});
await stream.send({ transport: "http" });
```

Browser (**phase Diffs supported**; import from `xaiop/browser`):

```js
import { XaiopStream, XaiopBrowserWs, TRANSPORT_KIND } from "xaiop/browser";

const stream = new XaiopStream(url);
stream.onChunk((diff) => { /* that phase’s JSON */ });
await stream.send({ transport: TRANSPORT_KIND.WEBSOCKET });

const client = await XaiopBrowserWs.connect(wsUrl, {
  onPhase: (diff) => { /* same as onChunk; may fire before await returns — see §7.5 / §7.6 */ },
});
await client.done;
```

Primary methods are **async**, with matching **sync** variants (parse / encode / Engine store / merge-inject).

---

## 2. Core concepts

**XAIOP wire** is a streaming, line-oriented **cursor-construction protocol**. The legacy name “eXtensible AI Output Protocol” is **not** the definition. These SDK docs describe the Node.js implementation of **sealed protocol package 0.6.0** (SDK **0.15.0**).

- Full grammar: [../../protocol/syntax.md](../../protocol/syntax.md)
- Seal and release index: [../../meta/releases.md](../../meta/releases.md)

### 2.1 Wire lines (Labels)

| Form | Role |
| --- | --- |
| `>` / `>name` / `>name-` / `<` | Enter / leave structure (object, named object, named array) |
| `-` | Enter anonymous array element |
| `key:value` / `:value` | Content (keyed value / array element) |
| `.` | Reset Cursor to Root; exit broadcast; bound a **phase** |
| `=path` | Fuzzy locate (no create; zero hits → syntax error) |
| `@path` | Exact path from Root; **create** missing object segments and enter |
| `!path` | Broadcast: match all full path fragments; later lines run on each Cursor |
| `&path` | Delete deepest key; does **not** move Cursor |

Path segments use `>` (e.g. `@a>b`, `&a>b`). Bare Labels, bare `&`, bare `<` at Root, and newlines inside values are forbidden.

**Example:**

```text
>
>user
name:Alice
<
.
&user
>user
name:Bob
<
```

Full grammar: [../../protocol/syntax.md](../../protocol/syntax.md)

### 2.2 Phase

`.` resets Cursor to Root and is the streaming **Diff boundary** (SDK policy: phase on `.`, not on Blocks).  
Phases that contain `=` / `!` / `&` must see the **cumulative tree so far**; the official streamer parses a cumulative prefix for those phases.

### 2.3 Root shapes

| Opening | Result |
| --- | --- |
| `>` | Complete anonymous **object** root |
| `-` | Complete anonymous **array** root |
| `>name` / Root Content, etc. | Strict mode → **`XaiopFragment`** (no outer `{}`) |

Empty source → `{}`. Compat `forcedRoot` injects an object root for fragment openings and never returns a fragment.

### 2.4 `&` delete (protocol semantics)

| Rule | Behavior |
| --- | --- |
| Deepest key | `&a>b` deletes only `b`; parent may remain as `{}` |
| Single Cursor | Path is **absolute** from Root |
| Missing | Silent **no-op** (never creates) |
| Document root | **Object only**; array root / fragment root → syntax error |
| Cursor chain | Deleting current Cursor or an ancestor → **syntax error** |
| Broadcast | `&path` is **relative** to each Cursor; missing on that Cursor → no-op for it; any chain conflict → whole line fails |
| Arrays | May delete an entire named array value; **no** element-index delete |
| Cursor | **Unchanged** by `&`; later Content still writes at the prior Cursor |

### 2.5 `#` custom annotation transmission (protocol)

A standalone line beginning with `#` is **custom annotation transmission** (official name; not a “comment”). Position unrestricted; protocol does not interpret text after `#`; parsers ignore it (no Cursor / tree effect). `note:#x` remains Content. A line with leading whitespace before `#` is **not** this primitive.

### 2.6 Cover vs non-cover (streaming Diff only)

`cover` is an **SDK streaming option** (default `false`). It does not change the final key set: after `finish`, Snapshot ≡ `parseSync(wire)`.

| `cover` | Diff behavior |
| --- | --- |
| `false` (default) | `&` updates the live / Commit tree; **already-emitted Diffs are not rewritten** |
| `true` | Consecutive `&` → forced `.` → deepest-key **`null` tombstone Diff** → restore Cursor with a `>` chain → continue |

Do **not** confuse three kinds of `null`:

| Kind | Meaning |
| --- | --- |
| Diff tombstone `null` | Cover-mode delete-phase Diff value (key present, value `null`) |
| Content typed `null` | Wire `key:null` / `:null` (protocol Content) |
| Empty-phase chunk `null` | Delivery value for an empty streaming phase / no Diff |

---

## 3. Parse API

### 3.1 `parseSync` / `parseAsync`

```ts
parseSync(source, compatOrOptions?): unknown | XaiopFragment
parseAsync(source, compat?): Promise<unknown | XaiopFragment>
```

Parse full XAIOP text to JSON or a Fragment (sync / async).

**Parameters:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `source` | `string` | — | Full XAIOP text |
| `compat` | `boolean \| CompatPolicy \| Partial<Record<CompatFixId, boolean>>` | `false` | `false` strict; `true` all eight fixes; object overrides defaults |

**Returns:**

- Complete document → plain object / array
- Root fragment (strict mode) → `XaiopFragment` (use `.entries`)
- Empty source → `{}`

```js
import { parseSync, CompatPolicy } from "xaiop";

parseSync(">\na:1\n");
parseSync(text, true);
parseSync(text, { forcedRoot: false }); // other fixes stay default true
parseSync(text, new CompatPolicy({ popAndRetry: false }));
```

**Asymmetry:** free functions accept fine-grained `compat`; `XaiopEngine.parse` / `parseSync` accept **boolean only**.

### 3.2 `LiveXaiopParser`

Incremental parser: feed lines / text; semantics ≡ `parseSync` over the concatenation. Used by streaming checkpoints to avoid re-scanning the whole prefix on every `.`.

```ts
new LiveXaiopParser(compat?)
feedLine(line): this
feedText(text): this
value(): unknown | XaiopFragment   // live reference — clone before exposing
cursorRestoreLines(): string[]     // `>` / `>name-` chain for cover restore; at Root → `[]`
```

| Method | Notes |
| --- | --- |
| `feedLine` | Complete logical line (no trailing LF/CRLF) |
| `feedText` | Split like `parseSync` — **no half-line buffer across calls**; a trailing segment without LF is a full line. For arbitrary network chunks use `DotCheckpointEngine.push` / `XaiopStream` |
| `value` | Current document (further feeds mutate in place) |
| `cursorRestoreLines` | Unavailable while broadcast is active; anonymous / array-element frames on stack → syntax error |

```js
const live = new LiveXaiopParser();
// OK: complete lines (trailing incomplete segment without LF is still one line)
live.feedText(">\n>a\nx:1\n.\n>b\ny:2\n");
live.cursorRestoreLines(); // → [">b"]
live.value();              // → { a: { x: 1 }, b: { y: 2 } }
// NOT for TCP/WS byte slices: feedText(">me") then feedText("ta\n") ≠ feedText(">meta\n")
```

### 3.3 `XaiopFragment`

Returned in strict mode when there is no anonymous root and the document opens with `>name` / Root Content.

| Member | Meaning |
| --- | --- |
| `entries` | Named bindings at Root |
| `isFragment` | Always `true` |
| `notation()` | Debug string, e.g. `"a":{}` |

Streaming / WS JSON surfaces run `materializeSnapshot`: fragment → clone of `entries`. Engine `get` keeps the fragment.

---

## 4. Encode API

### 4.1 `encodeSync` / `encode`

```ts
encodeSync(value, options?: EncodeOptions): string
encode(value, options?: EncodeOptions): Promise<string>
```

Encodes **plain JSON** to **strict** XAIOP (compatibility mode **never** changes encode output).  
Free functions / `XaiopEngine` static / instance produce the same wire for the same `(value, options)`.

**Guarantees:** for accepted values, `parseSync(encodeSync(value, opt))` deep-equals `value`; wire ends with exactly one `\n`.  
**Not guaranteed:** byte-identical `encode(parse(handwritten wire))`.

**Rejected string values (throw `XaiopEncodeError`):** containing CR/LF; **beginning with U+0020 SPACE** (forced-string markers after `:` are not payload — emitting such values would silently strip leading spaces on parse). Tab (`U+0009`) and trailing spaces remain encodable.
```js
import { encodeSync, DOT_POLICY } from "xaiop";

encodeSync({ a: 1, b: 2 }); // default perTopLevelKey
encodeSync({ a: 1, b: 2 }, { dotPolicy: DOT_POLICY.NONE });
encodeSync({ a: 1, b: 2, c: 3 }, { dotPolicy: "perNKeys", phaseEvery: 2 });
encodeSync(obj, { dotPolicy: ["meta", "items[0]"] }); // path cuts
```

### 4.2 `EncodeOptions`

| Option | Default | Notes |
| --- | --- | --- |
| `root` | `"auto"` | `"object"` \| `"array"` \| `"auto"` |
| `style` | `"reset"` | `"reset"` inserts `.` between phases; `"relative"` only with `dotPolicy: "none"` |
| `dotPolicy` | `"perTopLevelKey"` | `"none"` \| `"perTopLevelKey"` \| `"perNKeys"` \| `"custom"` \| `string[]` (JSON paths; `.` after each listed node) |
| `phaseEvery` | `1` | Keys per phase when `perNKeys` |
| `maxPhases` | — | Cap phase count (merge the tail) |
| `finalDot` | `false` | Append a trailing `.` |
| `keyOrder` | `"insertion"` | or `"sorted"` |
| `nullPolicy` | `"encode"` | `"encode"` typed null; `"omit"` drop object null keys (arrays still encode); `"error"` throw on null |
| `undefinedPolicy` | `"omit"` | `"omit"` \| `"error"` |
| `shouldPhase` | — | Required when `dotPolicy: "custom"` |
| `symbolKeys` | `false` | Opt-in U+001F label-escape dialect so keys may begin with `#` `@` `>` `<` `=` `!` `&` or U+001F; **both encode and parse must enable**; see [label-escape](../../protocol/notes/label-escape.md) |

Path-array overload is **mutually exclusive** with `phaseEvery` / `maxPhases` / `shouldPhase`; requires `style: "reset"`; array index must be the **final** path segment. Helpers: `parseJsonPath` / `formatJsonPath`.

### 4.3 Rejected keys

These keys throw `XaiopEncodeError` (no silent reshape):

| Form | Why |
| --- | --- |
| Empty / whitespace / contains `:` | Illegal Label name |
| Ends with `-` | Conflicts with `>name-` array enter |
| Contains `>` `<` `=` `!` **`&`** (in the key body) | Cursor / locate / delete operator ambiguity |
| **Begins with** `#` `@` `>` `<` `=` `!` `&` or **U+001F** | Line-class / reserved escape introducer — unless `symbolKeys: true` |

Constants: `DOT_POLICY` · `LABEL_ESCAPE_INTRODUCER` (`"\u001f"`).

---

## 5. Engine API

`XaiopEngine`: in-memory store (runtime data ids) plus parse / encode / merge-inject. Compatibility mode is **off** by default.

```js
import { XaiopEngine } from "xaiop";

const engine = new XaiopEngine();
const engineCompat = new XaiopEngine({ compatibilityMode: true });
```

### 5.1 Store

| API | Returns | Notes |
| --- | --- | --- |
| `upload(source)` / `uploadSync` | `dataId` | Parse full XAIOP → store; follows instance compat |
| `uploadJson(value, encodeOptions?)` / Sync | `dataId` | Strict encode → upload |
| `get(dataId)` / `getSync` | JSON or `XaiopFragment` (clone) | Unknown id → `Error` |
| `has` / `delete` / `clear` | — | Store management |

### 5.2 Instance encode / merge

| API | Notes |
| --- | --- |
| `encode` / `encodeSync` | Same as free functions; **ignores** compat switch |
| `mergeToJson` / Sync | Base JSON + XAIOP → JSON (parse uses instance compat; override via `options.compat`) |
| `mergeToXaiop` / Sync | → XAIOP wire |
| `injectXaiop` / Sync | Inject XAIOP into existing `dataId` (mutates store) |
| `injectJson` / Sync | Inject JSON into existing `dataId` |

### 5.3 Static methods

| API | Notes |
| --- | --- |
| `XaiopEngine.parse` / `parseSync` | Second arg **boolean only** |
| `XaiopEngine.encode` / `encodeSync` | Same as free functions |
| `XaiopEngine.mergeToJson` / `mergeToXaiop` | Same as free functions |

### 5.4 Compatibility switches (instance)

| API | Notes |
| --- | --- |
| `compatibilityMode` / `setCompatibilityMode` | Master switch; does **not** reset per-fix flags; turning compat **on** clears `typeCheck` |
| `compatForcedRoot` … `setCompatLocatePathArraySuffix` | Eight fine-grained fixes; if mode is off or arg is not boolean, setter returns `false` and leaves state unchanged |

### 5.5 Type checking (instance)

**Not protocol:** registry / freeze / push are **SDK** product features; they do not rewrite the wire grammar.

| API | Notes |
| --- | --- |
| `typeCheck` / `setTypeCheck(enabled)` | Master switch (default `false`); **strict mode only**; turning compat **on** clears it; when on, `upload*` / `inject*` run registry checks |
| `TYPE` | Leaf/structure constants: `INT` `FLOAT` `BOOL` `STRING` `NULL` `OBJECT` `ARRAY` `ANY` (leaves align with `PROT-CONTENT`) |
| `objectType(fields)` / `arrayType(element)` | Builders; surface sugar strings also accepted (below) |
| `registerType(path, type, { polarity? })` | Bind a JSON path; `polarity`: `"allow"` (default whitelist) \| `"deny"` (blacklist); **immutable once set** (re-register → `false`) |
| `registerTypes(map\|entries, { polarity? })` | Batch; returns `{ ok, rejected }` |
| `registerTypeDeny(path, type)` | Deny helper |
| `getRegisteredType` / `typeRegistry` / `exportTypeSchema` | Query and snapshot |
| `encodeTypeSchemaFrame()` | Encode control frame (prefer `pushTypeConsistency` on the connection) |
| `onTypeViolation(fn\|null)` | Violation hook (called **before** throwing `XaiopTypeError`) |

**Path house style:** `data.fork`, `items[0]` (same as encode `parseJsonPath`; **not** wire `data>fork`).

**Optional surface sugar:** `string`, `array<int>`, `object<name:string,old:int>` → compared as **canonical** types.

**Server checks (`typeCheck` + registry):**

| Rule | |
| --- | --- |
| Scope | **Registered paths only**; unregistered paths are ignored by the registry |
| `allow` | Value must match; `int` ≠ `float` (same split as encode) |
| `deny` | Value must **not** match that type |
| `any` | Explicit ignore (cannot combine `deny` + `any`) |
| Empty registry | Enabling checks is a no-op |
| When | `upload` / `uploadSync` / `uploadJson*` / `injectXaiop*` / `injectJson*` |

```js
import { XaiopEngine, TYPE, objectType, arrayType } from "xaiop";

const eng = new XaiopEngine();
eng.registerType("data.fork", TYPE.STRING);
eng.registerType("user", objectType({ name: TYPE.STRING, old: TYPE.INT }));
eng.registerType("items", arrayType(TYPE.INT));
eng.registerTypeDeny("data.bad", TYPE.STRING);
eng.registerType("meta.note", TYPE.ANY);
eng.setTypeCheck(true);
eng.uploadSync(`>\n>data\nfork:ok\n`); // OK
```

**Client (`XaiopWs` / `XaiopStream` / `XaiopBrowserWs`, `typeCheck: true`):**

| Rule | |
| --- | --- |
| Freeze | First **non-`null`** observation at a path locks the type; later values must be compatible |
| `null` | **Skipped** on the client (no refresh, no error) so delete/clear primitives are not broken |
| Arrays | Element types must be **homogeneous** when checking is on |
| Refresh | Key absent from commit (delete) clears subtree freeze; recreate after delete may change type |
| No schema push | First-seen freeze still enforces consistency |
| Schema push / preload | `allow` / `deny` / `any` apply first; **schema-violating observations do not write freeze**; `any` does **not** lock freeze |
| Options | `typeCheck`, `typeSchema` (snapshot or `TypeRegistry`); with `compatibilityMode` on, **typeCheck is ignored** |

**Type-consistency push (WS):** `conn.pushTypeConsistency(engine|registry|snapshot)`

| Prerequisite | |
| --- | --- |
| Connection | **Strict** (`compatibilityMode === false` on that connection) |
| Payload | Non-empty registry; if passing `XaiopEngine`, its **`typeCheck === true`** |
| Shape | Control frame (**not** XAIOP wire): prefix `#!xaiop/types/v1\n` + JSON snapshot; demuxed by Control Root before parse / Span (**0.14.0+**) |
| Failure | Bad prerequisites → `TypeError`; socket not OPEN → `false` |

Deep-dive: [notes/typecheck.md](notes/typecheck.md).

---

## 6. Streaming API

### 6.1 `XaiopStream`

HTTP / SSE / WebSocket / RAW **consumer**. Text feeds `DotCheckpointEngine`, emits Diffs on `.`, and parses the final Snapshot at EOF.

```js
import { XaiopStream, STREAM_MODES, TRANSPORT_KIND } from "xaiop";

const stream = new XaiopStream(url, {
  streamProcessing: true,   // default
  compatibilityMode: false, // default
  mergeChunkWindow: true,   // default — batch complete `.` in the buffer window into one Diff
  asyncParse: false,        // default; production may set true (coalesced pushAsync)
  historySnapshot: false,
  historyRealtime: false,
  retainWireHistory: true,
  cover: false,             // default — see §2.6
  modes: [STREAM_MODES.CALLBACK],
});

stream.onChunk((diff) => {});
stream.onDone((json) => {});
const final = await stream.send({ transport: TRANSPORT_KIND.HTTP });
```

#### Constructor options

| Option | Default | Notes |
| --- | --- | --- |
| `streamProcessing` | `true` | Mid-stream phase Diffs; `false` → one chunk at finish |
| `mergeChunkWindow` | `true` | All complete `.` in the window → **one** Diff |
| `asyncParse` | `false` | Transport uses `pushAsync` |
| `historySnapshot` | `false` | Read-only `.` history |
| `historyRealtime` | `false` | Forward `jumpTo` |
| `retainWireHistory` | `true` | Keep wire slices when history is on |
| `cover` | `false` | Cover Diff for `&` (§2.6) |
| `compatibilityMode` | `false` | Same as Engine |
| `typeCheck` | `false` | Client freeze / schema checks (§5.5); ignored if compatibility mode is also on |
| `typeSchema` | — | Preload type snapshot or `TypeRegistry` |
| `lineIntercept` | — | Initial line-intercept handler or array (§6.4) |
| `annotationSpan` | — | Initial Annotation Span handler or array (§6.5) |
| `session` / control callbacks | — | Optional Control Root inbound cursor (§7.7); see [notes/control-plane.md](notes/control-plane.md) |
| `modes` | `["callback"]` | Multi-select allowed |

#### Snapshot / chunk

| API | When | Value |
| --- | --- | --- |
| `onChunk` / iterator | Phase / window boundary | Diff JSON; empty phase may be `null`; **second arg `meta`** may include `seq` / `seqs` (phase sequence, §7.7) and `typeCheckEscapePaths` |
| `getCommittedSnapshot()` | After each commit | Cumulative later-wins through last `.` / EOF |
| `bufferStats()` / `compactCommitted({ dropHistory? })` | Mid-stream (**0.15.0+**) | Receive-buffer sizes / discard committed wire (keep live tree) |
| `getSnapshot()` / `onDone` | After finish | Full-buffer parse; empty → `{}` |
| Mid-stream `getSnapshot()` | `streaming` | Usually `undefined` |

Fragments are materialized to plain objects on these surfaces (`materializeSnapshot`).

#### Delivery modes

| Mode | Surface |
| --- | --- |
| `callback` (floor) | `onChunk` / `onDone` / `onError`; also `onLineIntercept` (§6.4) · `onAnnotationSpan` (§6.5) |
| `promise` | `send()` → final Promise |
| `asyncIterator` | `for await` / `chunks()` |
| `events` | `on("chunk"\|"done"\|"error"\|"status")` |

`disableMode` never leaves an empty set (keeps `callback`). Busy `send` again: promise mode → reject; otherwise throw.

#### `send` essentials

| Item | Rule |
| --- | --- |
| Default transport | `http` |
| SSE | Sets `Accept: text/event-stream`; joins multi-line `data:` with `\n` |
| RAW | Requires `source` (AsyncIterable / ReadableStream) |
| Binary | Streaming UTF-8 decode across chunks |
| `abort()` | Status `aborted` |

State machine: `idle → connecting → streaming → completing → completed` (or `aborted` / `error`). Constants: `STREAM_STATUS`, `TRANSPORT_KIND`, `STREAM_MODES`; `isStreamBusy(status)`.

### 6.2 `DotCheckpointEngine`

Low-level `.`-phase parser (used inside `XaiopStream` / WS; usable directly).

```js
const eng = new DotCheckpointEngine({
  streamProcessing: true,   // default
  mergeChunkWindow: true,   // default
  emitDiff: true,           // default; false → Commit/final only
  cover: false,
  historySnapshot: false,
  historyRealtime: false,
  retainWireHistory: true,
  compat: false,
  lineIntercept: undefined, // or handler / handler[]
  annotationSpan: undefined, // or handler / handler[]
  onChunk: (diff) => {},    // optional; omit → Diff delivery no-op
});
eng.push(chunk);
eng.bufferStats();       // { length, committedAt, pendingBytes, openPhase }
eng.compactCommitted();  // drop committed wire; keep live tree (0.15.0+)
eng.finish();
eng.snapshot;            // final
eng.committedSnapshot;   // last commit
eng.history;             // ParseHistory | null
eng.onLineIntercept(fn); // see §6.4
eng.onAnnotationSpan(fn); // see §6.5
```

| Option | Default | Notes |
| --- | --- | --- |
| `streamProcessing` | `true` | Mid-stream `.` phases + line-scan path (intercept / Span); same default as `XaiopStream` / WS. Bare `new DotCheckpointEngine({...})` without the flag is **on**. |
| `mergeChunkWindow` | `true` | Batch complete `.` in the buffer window → one Diff |
| `emitDiff` | `true` | Set `false` when only Commit / final snapshot is needed; `onChunk` optional (omit → Diff no-op) |
| `cover` | `false` | Cover-mode Diff for `&` |

| Method | Notes |
| --- | --- |
| `push` / `pushAsync` | Sync ingest / `setImmediate`-coalesced scan |
| `finish` / `finishAsync` | Flush tail |
| `bufferStats()` | `{ length, committedAt, pendingBytes, openPhase }` (**0.15.0+**). `pendingBytes` **MUST** equal `length - committedAt`. Prefer over reading `buffer` for monitoring. |
| `compactCommitted({ dropHistory? })` | Discard `buffer[0..committedAt)`; keep live tree (**0.15.0+**). **MUST** throw on closed engine; on `historyRealtime`+`retainWireHistory`; on non-empty history — unless `dropHistory: true`. Full contract: [notes/streaming-parse.md](notes/streaming-parse.md) § Receive buffer compact. |
| `jumpTo(index)` | Requires `historyRealtime`; discards nodes after the index |
| `onLineIntercept` / `clearLineIntercepts` | After complete line split, before parse; see §6.4 |
| `onAnnotationSpan` / `clearAnnotationSpans` | Phase `#` span; see §6.5 |
| `streamProcessing` / `mergeChunkWindow` | Read-only getters for the resolved defaults |

### 6.3 `ParseHistory` / Snapshot helpers

History is built by the checkpoint when `historySnapshot` and/or `historyRealtime` is on.

| API | Notes |
| --- | --- |
| `info()` / `exportTimeRoot()` | Metadata / node list |
| `getNode` / `getDiff` / `getBefore` / `getAfter` | Read by index |
| `compare` / `viewRange` | Compare / range view |
| `jumpTo` / `canJumpTo` | Realtime forward jump |
| `setSource` / `release` | Associate source key / release |

`materializeSnapshot(parsed)`: Fragment → plain object (JSON surface).

Deep notes: [notes/streaming-parse.md](notes/streaming-parse.md) · [notes/history.md](notes/history.md).

### 6.4 Line intercept (`onLineIntercept`)

**SDK product feature** (not wire grammar): after the checkpoint **receive buffer** splits a complete logical line and **before** `LiveXaiopParser` feed, run handlers in **registration order**.

| Contrast | Line intercept | `onPhase` / `onChunk` |
| --- | --- | --- |
| Layer | Buffer line boundary (post-split) | Phase Diff (after parse + Commit) |
| Grain | Each complete line | `.` phase (may window-merge) |
| Rewrite / skip | **Yes** (return string or `null`) | **No** |

```js
import { LINE_KIND, DotCheckpointEngine } from "xaiop";

eng.onLineIntercept(({ raw, view }) => {
  if (view.kind === LINE_KIND.ANNOTATION) return null; // skip line
  if (view.kind === LINE_KIND.CONTENT && view.key === "x") return "x:42"; // rewrite
  return undefined; // keep
});
```

| Return | Meaning |
| --- | --- |
| `string` | Text fed downstream; next handler sees it |
| `null` | **Skip this line** (short-circuit; later handlers not called) |
| `undefined` | Keep current text |

**Three `null`s (do not conflate):** intercept skip ≠ Content `key:null` ≠ empty-phase Diff `null`.

**Fixed template `view`:** `kind` · `raw` · `name` · `path` · `key` · `valueText` · `annotationText` (unused slots `null`). Also exported: `LINE_KIND` / `classifyLine` / `emptyLineView` / `runLineInterceptChain`. Full kind table: [notes/line-intercept.md](notes/line-intercept.md) §3.

| Edge | Behavior |
| --- | --- |
| `streamProcessing: false` | Whole-buffer parse; interceptors **do not** run |
| Skip `.` / rewrite to `.` | Phase close follows **post-intercept** text |
| `mergeChunkWindow` / `cover` / `pushAsync` | Existing phase rules after effective lines |
| `jumpTo` (`historyRealtime`) | Rebuild **re-runs** the intercept chain |
| Interceptors present → Diff owned-parse | Uses **effective** line wire (may differ from transport buffer) |

Surfaces: `DotCheckpointEngine` · `XaiopStream` · `XaiopWsConnection` · `XaiopBrowserWsConnection` (ctor `lineIntercept: fn|fn[]` and/or `onLineIntercept` / `clearLineIntercepts`).

Deep dive: [notes/line-intercept.md](notes/line-intercept.md) · tests: `test/line.intercept.test.js`.

### 6.5 Annotation Span (`onAnnotationSpan`)

**SDK product feature** (not wire grammar): wire `#…` still has no tree side effects. After **this phase’s** lines are ready and **before Diff / Commit / `typeCheck`**, on `#` collect **forward same-level** siblings (+ subtrees), call handlers with **annotation text + template JSON**, and remount / drop / keep. Lines starting with `#!` are Control Root (**0.14.0+**): demuxed before Span; Span **hard-skips** any remaining `#!`.

| Contrast | Line intercept §6.4 | Annotation Span §6.5 |
| --- | --- | --- |
| Layer | Buffer line split | Phase lines (JSON-facing capture) |
| Trigger | Every complete line | `#` + forward same-level region |
| Handler input | Wire `view` | `annotation` + materialized `json` (no `=`/`@`/`!` forms) |
| vs typeCheck | Orthogonal | **Before typeCheck**; processed region **escapes** type check |

```js
eng.onAnnotationSpan((annotation, view) => {
  if (!annotation.includes("tag")) return undefined; // keep wire; still escape capture keys
  if (annotation.includes("drop")) return null; // drop # + capture
  return { ...view.json, rewritten: true }; // remount
});
```

| Return | Meaning |
| --- | --- |
| `undefined` | Keep `#` + capture wire; **still** record escape paths for capture keys |
| `null` | Drop `#` + capture |
| object / array / JSON text | Encode as sibling wire replacing capture |

**TypeCheck escape (must understand):** once this phase **invokes** the Span handler chain for a `#`, the region handlers process and the same-level keys covered by that forward region enter `meta.typeCheckEscapePaths`; later `observeTree` **skips** those paths (and descendants). Same-level keys **before** `#` are **not** escaped. Details: [notes/annotation-span.md](notes/annotation-span.md).

Surfaces: ctor `annotationSpan: fn|fn[]` · `onAnnotationSpan` · `clearAnnotationSpans` (Engine / Stream / WS / browser WS).

Deep dive: [notes/annotation-span.md](notes/annotation-span.md) · tests: `test/annotation.span.test.js`.

---

## 7. WebSocket API

Prefer `XaiopWs` for long-lived skeleton sessions (push + consume on one connection). Keep using `XaiopStream` for HTTP/SSE/RAW.  
The **wire** does not define `connect` / Promises / callback order; the following is **locked Node SDK** behavior. Deep dive: [notes/ws-session.md](notes/ws-session.md).

### 7.1 `XaiopWs`

```js
import { XaiopWs } from "xaiop";

const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
hub.onConnection(async (conn) => {
  // Sync first frames are legal and common — client MUST pass callbacks in connect options
  conn.pushJson("a", 1);
  conn.pushJson("b", { x: 2 }, { final: true });
  await conn.end();
});

const client = await XaiopWs.connect(hub.url(), {
  onPhase: (diff) => {
    /* may run before this await returns — see §7.5 */
  },
});
const json = await client.done; // may already be settled when connect returns
await hub.close();
```

| API | Notes |
| --- | --- |
| `XaiopWs.listen(options?)` | → `XaiopWsHub`; may attach to an existing `server` + `path` |
| `XaiopWs.connect(url, options?)` | → `Promise<XaiopWsConnection>`; semantics in §7.5 |
| `XaiopWs.encodePhaseJson` / `encodePhaseObject` | Encode only (no send) |

**`WsConnectOptions`:** `streamProcessing`, `mergeChunkWindow`, `asyncParse`, `cover`, `compatibilityMode`, `typeCheck`, `typeSchema`, `lineIntercept`, `annotationSpan`, **`session`**, **`autoSession`**, **`autoAck`**, **`retainOutbound`**, `protocols`, `handshakeTimeoutMs` (default **15000**), `headers`, and construction-time `onPhase` / `onChunk` / `onDone` / `onError` / **`onControlError`** / **`onSession`** / **`onResume`** / **`onAck`** / **`onSnapshot`**.  
**`WsListenOptions`:** the parse/control-related options above + `port` / `host` / `server` / `path` / `backlog` / `perMessageDeflate` / `maxPayload`.

### 7.2 `XaiopWsConnection`

| Member | Notes |
| --- | --- |
| `pushJson(key, value, { final? })` | One key per phase; non-final ensures trailing `.\n`; not OPEN → `false` |
| `pushObject(object, { final? })` | Multiple keys in one phase; same |
| `pushWire(text)` | Raw wire **as-is** (no auto `\n`); consecutive frames must already be line-safe or peer may glue; not OPEN → `false` |
| `pushWireLn(text)` | Like `pushWire`, but appends `\n` when `text` does not already end with LF |
| `pushTypeConsistency(engine\|registry\|snapshot)` | Push registered type schema (control frame); prerequisites in §5.5 |
| `session` / `autoSession` / `autoAck` / `retainOutbound` | Control session / hello / auto-ack / outbound log (§7.7) |
| `sendSession` / `sendAck` / `sendResume` / `sendSnapshot` | Outbound control frames |
| `getResumeState()` / `phaseSeq` / `outboundSeq` / `sessionId` / `ackedSeq` | Resume cursors (`getResumeState` includes `inboundSeq` / `outboundSeq`) |
| `outboundLog` / `replayOutboundAfter` / `noteOutboundPhase` | Producer outbound phase log |
| `ResumeWireLog` | App-owned durable log across reconnects |
| `typeCheck` | Read-only; whether client type checking is on for this connection |
| `onPhase` / `onChunk` | Diff callback (`onChunk` alias); **`(diff, meta?)`** with `seq` / `seqs`; **locked after `connect`** — use connect options |
| `onLineIntercept` / `clearLineIntercepts` | Buffer-line intercept (§6.4); **locked after `connect`**; prefer `lineIntercept` in connect options |
| `onAnnotationSpan` / `clearAnnotationSpans` | Phase Annotation Span (§6.5); **locked after `connect`**; prefer `annotationSpan` in options |
| `onResume` / `onSession` / `onAck` / `onSnapshot` / `onControlError` | Control callbacks; **locked after `connect`**; listen-accept stays unlocked |
| `onDone` / `onError` | Final / error; **locked after `connect`** |
| `handlersLocked` | `true` after successful `XaiopWs.connect` / `XaiopBrowserWs.connect` |
| `getCommittedSnapshot` / `getSnapshot` | Same as Stream: committed mid-stream; `getSnapshot()` is `undefined` until final |
| `done` | Promise of final Snapshot after peer close + `finish` |
| `closed` | Socket teardown finished (after the `done` path) |
| `end` / `abort` | Drain-close / abort |

### 7.3 `XaiopWsHub`

| Member | Notes |
| --- | --- |
| `url(host?)` | Connect URL |
| `onConnection` / `onError` | Accept callbacks (may **sync** `push*` here) |
| `connections` | Current connections |
| `close()` | Close the hub |

### 7.4 `encodePhaseJson` / `encodePhaseObject`

```ts
encodePhaseJson(key, value, { final?, encodeOptions? }): string
encodePhaseObject(object, { final?, encodeOptions? }): string
```

Uses `encodeSync` internally (default `dotPolicy: "none"`); `final: true` omits the phase `.`. Illegal keys still throw `XaiopEncodeError`.

### 7.5 `connect` Promise vs callback ordering (attention)

Internal `connect` order: **create socket → immediately construct `XaiopWsConnection` (bind message + option callbacks) → wait for `open` → resolve**.

| Explicit semantics | |
| --- | --- |
| `connect` resolve means | Handshake OK; usable connection object returned |
| `connect` resolve does **not** mean | “No `onPhase` / `onDone` yet” or “`done` is unsettled” |
| SDK does **not** buffer phases until after resolve | Deliberate — avoids dropping sync first frames on accept |

Therefore **`onPhase` / `onDone` / `onError` and settlement of `done` may all happen before `await connect(...)` returns** (especially when the accept side pushes synchronously in `connection`).

**Required:** put **`onPhase` / `onChunk` / `onDone` / `onError` / `lineIntercept` / `annotationSpan` / control callbacks (`onResume`, `onSession`, …)** in **`connect` options**.  
After `await connect(...)` returns, mutators (`onPhase`, `onLineIntercept`, `onAnnotationSpan`, `onResume`, `onSession`, `onAck`, `onSnapshot`, `onControlError`, `onDone`, `onError`, and their `clear*`) **throw** (`handlersLocked`) — there is **no replay** of early frames.  
Listen-accept connections stay unlocked so a producer/consumer can still attach in `hub.onConnection` if needed.  
If the app needs “process only after connect returns”: queue in the application layer; do not ask the SDK to defer delivery.

Full table and test reference: [notes/ws-session.md](notes/ws-session.md) §5.

### 7.6 Browser `xaiop/browser` — phase client

Import from **`xaiop/browser`** (not the default `"xaiop"`). Shares Node’s `DotCheckpointEngine` in `core`: `.` phases, later-wins Diff/Commit, optional `cover` / `mergeChunkWindow` / `asyncParse` / **`typeCheck`** (§5.5) / **line intercept** (§6.4) / **Annotation Span** (§6.5) / **Control Root** (§7.7).

| API | Phases | Notes |
| --- | --- | --- |
| `XaiopStream` | **Yes** | `onChunk(diff, meta?)` = phase Diff + optional `seq`; transports: `fetch` / SSE / **native** `WebSocket` / RAW (no `ws` / `node:stream`); optional `typeCheck` / `typeSchema` / `lineIntercept` / `annotationSpan` / `session` / `phaseSeq` |
| `XaiopBrowserWs.connect` | **Yes** | Same phase + Control Root surface as Node client (`session` / `sendResume` / …); optional `pushJson` / `pushObject` / `pushWire` / `pushWireLn`; **no** `listen` / hub / `pushTypeConsistency` (push from Node server); handlers locked after connect |
| `XaiopBrowserWs.encodePhaseJson` / `encodePhaseObject` | — | Same phase encode helpers as Node |
| `xaiop/core` | No network | Local `DotCheckpointEngine` only; you feed text yourself |

```js
import { XaiopBrowserWs } from "xaiop/browser";

const client = await XaiopBrowserWs.connect(url, {
  onPhase: (diff) => {
    /* phase JSON — not a patch; early-frame timing same as §7.5 */
  },
  cover: false,
  mergeChunkWindow: true,
});
console.log(await client.done);
```

| vs Node `XaiopWs` | |
| --- | --- |
| Socket | `globalThis.WebSocket` only |
| `listen` / `XaiopWsHub` | **Not provided** (server still `import { XaiopWs } from "xaiop"`) |
| `connect` early-frame semantics | **Same**: callbacks in options; resolve ≠ “no events yet” |
| Phase / Diff / Commit / `cover` / `typeCheck` / line intercept / Annotation Span / Control Root | **Same** (one checkpoint / freeze session); `pushTypeConsistency` is server-side |

Recommended skeleton combo: Node listen (producer) + browser consume. Practice: [../../practice/skeleton-stream.md](../../practice/skeleton-stream.md) · notes: [notes/ws-session.md](notes/ws-session.md) §9–§10 · [notes/typecheck.md](notes/typecheck.md) · [notes/line-intercept.md](notes/line-intercept.md) · [notes/annotation-span.md](notes/annotation-span.md) · [notes/control-plane.md](notes/control-plane.md).

### 7.7 SDK Control Root (`#!`) — session / resume

Product convention (not a Frozen 0.6.0 grammar change): lines starting with `#!` are the **SDK control plane**. They are demuxed **before** parse / Annotation Span. Full note: **[notes/control-plane.md](notes/control-plane.md)**.

| Item | Summary |
| --- | --- |
| Official frames | `#!xaiop/types/v1`, `session/v1`, `ack/v1`, `resume/v1`, `snapshot/v1`, **`seq/v1`** |
| Unknown `#!` | Discard + `XaiopControlError` (`onControlError`); never enter the wire pipeline |
| **Two seq spaces** | `meta.seq` = **connection-local** (resets each socket); `meta.logSeq` = **session-log** for `fromSeq` / ack. **Never** assign `resumeCursor = meta.seq` after reconnect — use `meta.logSeq` / `getResumeState().seq` / `logSeq` |
| Stamp | `#!xaiop/seq/v1` before each phase; `pushJson`/`pushObject` auto-stamp when `session`/`retainOutbound`; `ResumeWireLog.wiresAfter` stamps |
| Window merge | Default `mergeChunkWindow: true` may merge resume catch-up into one chunk (`meta.logSeqs` still lists units) — not a bug; use `false` for per-phase callbacks |
| Resume | `sendResume({ sessionId, fromSeq })` → continue from `fromSeq+1` in **log** space; **no** historical Diff replay; optional `sendSnapshot` |
| Connect options | `session`, `autoSession`, `autoAck`, `retainOutbound`, `onSession`, `onResume`, `onAck`, `onSnapshot`, `onControlError` |
| Producer log | auto-record + stamp when `session`/`retainOutbound`; durable: app-owned `ResumeWireLog` by `sessionId` |
| Stream | `onChunk(diff, meta)` may include `seq`/`seqs` and `logSeq`/`logSeqs` |

---

## 8. Merge and inject

**Pre/post-processing**, not streaming. Conflict policy applies only to **conflicting keys** (deep objects recurse; arrays / scalars conflict as a whole).

| `conflict` | Behavior |
| --- | --- |
| `overwrite` (default) | Take overlay **at conflicting keys** |
| `keep` | Keep base; non-conflicting keys still merge in |

**Not a Diff applicator:** `mergeJson` / `mergeToJson` **do not delete** keys that are absent from the overlay. Example: `mergeJson({ cart: { a: 1, b: 2 } }, { cart: { a: 1 } })` keeps `b`. Phase Diffs from `onChunk` / `onPhase` are **subtree replacement** (or cumulative commit) surfaces — to apply a Diff locally, replace by path (or take `getCommittedSnapshot()`); **do not** pipe Diffs into `mergeJson`. See [notes/streaming-parse.md](notes/streaming-parse.md) (Commit vs chunk).

Constants: `MERGE_CONFLICT.OVERWRITE` / `KEEP`.

| API | Returns |
| --- | --- |
| `mergeJson(base, overlay, conflict?)` | JSON ← JSON+JSON |
| `mergeToJson(baseJson, xaiopSource, options?)` | JSON |
| `mergeToXaiop(baseJson, xaiopSource, options?)` | XAIOP (default `encodeOptions.dotPolicy: "none"`) |

`MergeOptions`: `conflict`, `compat` (parse overlay). `MergeToXaiopOptions` adds `encodeOptions`.

Engine inject (mutates store):

| API | Overlay |
| --- | --- |
| `injectXaiop(dataId, xaiop, options?)` | XAIOP |
| `injectJson(dataId, json, options?)` | JSON |

`InjectOptions`: `conflict`, `compat`, `as: "json"|"xaiop"` (default `json`), `encodeOptions`.

```js
import { mergeToJson, MERGE_CONFLICT, XaiopEngine } from "xaiop";

mergeToJson({ a: 1 }, ">\nb:2\n", { conflict: MERGE_CONFLICT.KEEP });

const engine = new XaiopEngine();
const id = engine.uploadJsonSync({ a: 1 });
engine.injectXaiopSync(id, ">\nb:2\n");
```

---

## 9. Compatibility mode

Optional parse path for imperfect model output. Does **not** change the sealed wire protocol; only changes ingest recovery. **Off** by default.

| Entry | Form |
| --- | --- |
| Free `parseSync` / `parseAsync` | `boolean \| CompatPolicy \| partial` |
| `XaiopEngine.parse*` | **boolean only** |
| Engine / Stream instance | `compatibilityMode` + `setCompat*` |

When enabled with no overrides: **all eight** fixes on. Plain objects override defaults (omitted keys stay `true`).

| Fix ID | Summary |
| --- | --- |
| `forcedRoot` | Inject anonymous object root when opening is not `>`/`-` |
| `rewriteBareNameArray` | `name-` → `>name-` |
| `rewriteEnterLine` | Rewrite `>` whitespace / glued `>key:value` |
| `ignoreBareLeaveAtRoot` | Ignore bare `<` at Root |
| `popAndRetry` | Pop Cursor and retry the failing line |
| `locatePathTrim` | Retry `=` after trimming path whitespace |
| `locatePathStripSpaces` | Retry `=` after stripping all whitespace |
| `locatePathArraySuffix` | Treat trailing `-` on `=` segment as array key when value is array |

Exports: `CompatPolicy`, `COMPAT_FIX_IDS`, `COMPAT_FIX_DEFAULTS`.

```js
import { parseSync, CompatPolicy } from "xaiop";

parseSync(text, new CompatPolicy({ forcedRoot: false }));
engine.setCompatibilityMode(true);
engine.setCompatForcedRoot(false); // returns false if mode is off
```

Recovery does **not** invent field names; still throws `XaiopSyntaxError` when recovery fails or the error changes. Deep notes: [notes/adjustment-policy.md](notes/adjustment-policy.md).

---

## 10. Types and constants

| Export | Value / notes |
| --- | --- |
| `PROTOCOL_VERSION` | `"0.6.0"` |
| `SDK_VERSION` | `"0.15.0"` |
| `DOT_POLICY` | `NONE` · `PER_TOP_LEVEL_KEY` · `PER_N_KEYS` · `CUSTOM` |
| `MERGE_CONFLICT` | `OVERWRITE` · `KEEP` |
| `STREAM_MODES` | `CALLBACK` · `PROMISE` · `ASYNC_ITERATOR` · `EVENTS` |
| `STREAM_STATUS` | `IDLE` … `ERROR` |
| `TRANSPORT_KIND` | `HTTP` · `SSE` · `WEBSOCKET` · `RAW` |
| `HISTORY_NODE_KIND` | `DOT` · `TAIL` |
| `LINE_KIND` / `classifyLine` / `emptyLineView` / `runLineInterceptChain` | Line-intercept classify + chain helpers (§6.4) |
| `applyAnnotationSpans` / `encodeAsSiblingLines` / `pathEscapesTypeCheck` | Annotation Span helpers (§6.5) |
| `CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY` | SDK Control Root constants (§7.7) |
| `encodeSeqFrame` / `stampWireWithLogSeq` | Session-log seq stamp (`#!xaiop/seq/v1`) |
| `ControlDemux` / `ControlIngest` / `ControlPlaneHost` / `ControlSessionState` | Control demux / session helpers |
| `ResumeWireLog` / `XaiopResumeLogError` | Durable outbound phase log for resume (`wiresAfter` stamps logSeq) |
| `encodeControlFrame` / `encodeSessionFrame` / `encodeAckFrame` / `encodeResumeFrame` / `encodeSnapshotFrame` | Control frame codecs |
| `isSdkControlLine` / `parseControlHeader` / `dispatchControlFrame` | Control classify / route |
| `XaiopControlError` | Soft control-plane errors (`code`, optional `header` / `frame`) |
| `COMPAT_FIX_IDS` / `COMPAT_FIX_DEFAULTS` | Eight-fix list and defaults |
| `TYPE` / `objectType` / `arrayType` | Type-check constants and builders (§5.5) |
| `TypeRegistry` / `TypeChecker` / `TypeFreezeSession` | Registry / server check / client freeze |
| `TYPE_SCHEMA_FRAME_PREFIX` / `encodeTypeSchemaFrame` / `tryParseTypeSchemaFrame` | Type-consistency control frames |
| `canonicalizeType` / `parseTypeSurface` / `classifyValue` / `valueMatchesType` | Normalize and match helpers |
| `XaiopBrowserWs` / `XaiopBrowserWsConnection` | `xaiop/browser` only — phase WS client (no listen) |

Declarations are emitted by `tsc` under `dist/**/*.d.ts` (default / `browser` / `core` entries).

---

## 11. Error handling

| Error | When |
| --- | --- |
| `XaiopSyntaxError` | Illegal wire; optional `.line`. Strict: fail immediately. Compat: still throws when recovery fails or the error changes |
| `XaiopEncodeError` | Illegal encode input / options / rejected keys; optional `.path` (e.g. `$.meta.name`) |
| `XaiopTypeError` | Type registry / freeze / schema check failure; optional `.path` / `.expected` / `.actual` / `.polarity` |
| `XaiopControlError` | Unknown / malformed control frame (soft by default; see §7.7) |
| `Error` | Unknown `dataId`; Stream busy; etc. |
| `TypeError` | Bad argument types (non-string source, illegal `conflict` / `as`, `pushTypeConsistency` prerequisites, etc.) |

```js
import { parseSync, encodeSync, XaiopSyntaxError, XaiopEncodeError } from "xaiop";

try {
  parseSync(">\n&\n"); // bare & → XaiopSyntaxError
} catch (e) {
  if (e instanceof XaiopSyntaxError) console.error(e.line, e.message);
}

try {
  encodeSync({ "a&b": 1 });
} catch (e) {
  if (e instanceof XaiopEncodeError) console.error(e.path, e.message);
}
```

---

## Related

| Doc | Purpose |
| --- | --- |
| [README.md](README.md) | Package landing |
| [../behavioral-contract.md](../behavioral-contract.md) | Node product-choice catalog (optional) |
| [../../protocol/syntax.md](../../protocol/syntax.md) | Protocol grammar |
| [../../meta/releases.md](../../meta/releases.md) | Seal / releases |
| [notes/](notes/) | Streaming parse, history, encode pitfalls, WS, type check, line intercept, Annotation Span, **Control Root**, adjustment policy |
