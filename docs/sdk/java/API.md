# XAIOP Java SDK API Reference

[English](API.md) · [简体中文](API.zh-CN.md)

**Protocol**: v0.6.0 Frozen (sealed)  
**SDK**: 0.15.1 (Java)  
**Runtime**: **Java 17+** · artifact **`io.xaiop:xaiop`** (single JAR, zero runtime deps)  
**Code**: [../../../xaiop-sdk/java/](../../../xaiop-sdk/java/) (`src/main/java/io/xaiop/`)  
**Parity matrix**: [ALIGNMENT.md](ALIGNMENT.md) · **Product-choice catalog**: [../behavioral-contract.md](../behavioral-contract.md) · **Releases**: [../../meta/releases.md](../../meta/releases.md)  
**Node reference API**: [../nodejs/API.md](../nodejs/API.md)

---

## 0. Runtime scope and packages

Java ships **one JAR**. There is **no** `xaiop/browser` / `xaiop/core` subpath split — import packages directly.

| Package | Surface |
| --- | --- |
| `io.xaiop` | Facade `Xaiop`, `Parse`, `Encode`, `Merge`, `XaiopEngine`, options, errors, `DotPolicy` |
| `io.xaiop.compat` | `CompatPolicy`, `CompatFixId` (×8) |
| `io.xaiop.stream` | `DotCheckpointEngine`, `ParseHistory`, `XaiopStream`, `LineIntercept`, `AnnotationSpan`, `PhaseEncode`, `Materialize`, `Transport` |
| `io.xaiop.ws` | `XaiopWs` listen + connect, `XaiopWsHub`, `XaiopWsConnection` |
| `io.xaiop.types` | `TYPE`, `TypeRegistry`, freeze / checker, `XaiopTypeError` |
| `io.xaiop.control` | Control Root demux / session / resume / seq frames |

| Claim | |
| --- | --- |
| Browser / JS bundler entry | **No** — JDK only |
| Server `listen` | **Yes** — `XaiopWs.listen` (zero-dep RFC6455 `ServerSocket`) |
| Client `connect` | **Yes** — JDK `HttpClient` WebSocket (`XaiopWs.connect`) |
| Phase Diff (`.` / cover / intercept / Annotation Span / Control Root / typeCheck) | **Yes** — same observable semantics as Node |
| Wire semantics | Protocol package **0.6.0**; cross-checked against Node via **golden CI** ([ALIGNMENT.md §7](ALIGNMENT.md#7-how-parity-is-verified)) |

### Java idioms (vs Node)

| Topic | Java |
| --- | --- |
| Sync-first | Blocking APIs are primary; `parseAsync` / `encodeAsync` → `CompletableFuture`; checkpoint `pushAsync` / `finishAsync` coalesce on a daemon thread |
| Trees | `LinkedHashMap<String,Object>` / `ArrayList<Object>`; scalars `String`, `Integer`/`Long`/`Double`, `Boolean`, `null` |
| No `undefined` | Only `null`; Annotation Span keep → **`AnnotationSpan.KEEP`**; line-intercept keep → return current `raw` |
| Async chunks | Blocking `ChunkPull` / `for (Object d : stream.chunks())` |
| Options | Immutable / fluent builders (`EncodeOptions.builder()`, `DotCheckpointEngine.Options`, …) |
| Compat setters | Single `setCompatFix(CompatFixId, boolean)` (returns `false` while mode off) |
| Numbers | Split integer / float JVM types; wire floats still match Node `Number::toString` |

---

## Contents

0. [Runtime scope and packages](#0-runtime-scope-and-packages)
1. [Quick start](#1-quick-start)
2. [Core concepts](#2-core-concepts)
3. [Parse API](#3-parse-api)
4. [Encode API](#4-encode-api)
5. [Engine API](#5-engine-api) (incl. [§5.5 Type checking](#55-type-checking-instance))
6. [Streaming API](#6-streaming-api) (incl. [§6.4 Line intercept](#64-line-intercept-onlineintercept) · [§6.5 Annotation Span](#65-annotation-span-onannotationspan) · phase `meta.seq`)
7. [WebSocket API](#7-websocket-api) (incl. [§7.6 No browser package](#76-no-browser-package) · [§7.7 Control Root](#77-sdk-control-root---session--resume))
8. [Merge and inject](#8-merge-and-inject)
9. [Compatibility mode](#9-compatibility-mode)
10. [Types and constants](#10-types-and-constants)
11. [Error handling](#11-error-handling)

---

## 1. Quick start

### Install

```xml
<dependency>
  <groupId>io.xaiop</groupId>
  <artifactId>xaiop</artifactId>
  <version>0.15.1</version>
</dependency>
```

```bash
cd xaiop-sdk/java
mvn test
```

### Basics

```java
import io.xaiop.*;
import io.xaiop.stream.*;

// XAIOP → JSON tree (LinkedHashMap / ArrayList / scalars)
Object json = Xaiop.parse(">\na:1\n");           // → {a=1}

// JSON → XAIOP (default: one phase per top-level key, with `.`)
String wire = Xaiop.encode(Map.of("a", 1, "b", 2));

// Engine store
XaiopEngine engine = new XaiopEngine();
String id = engine.uploadJsonSync(Map.of("meta", Map.of("name", "demo")));
Object stored = engine.getSync(id);

// Streaming consume (`cover` defaults to false)
XaiopStream stream = new XaiopStream(url, XaiopStream.Options.defaults().cover(false));
stream.onChunk(diff -> { /* phase Diff */ });
stream.send(new XaiopStream.SendOptions().transport(TransportKind.HTTP));
```

WebSocket skeleton (listen + connect share `io.xaiop.ws`):

```java
import io.xaiop.ws.*;

XaiopWsHub hub = XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1")).join();
hub.onConnection(conn -> {
  conn.pushJson("a", 1, false);
  conn.pushJson("b", Map.of("x", 2), true);
  conn.end();
});

XaiopWs.ConnectOptions opts = new XaiopWs.ConnectOptions();
opts.onPhase(diff -> { /* may run before join() returns — see §7.5 */ });
XaiopWsConnection client = XaiopWs.connect(hub.url(), opts).join();
Object done = client.done().join();
hub.close().join();
```

Primary methods are **sync**; async mirrors return `CompletableFuture` where Node uses Promises.

---

## 2. Core concepts

**XAIOP wire** is a streaming, line-oriented **cursor-construction protocol**. These SDK docs describe the Java implementation of **sealed protocol package 0.6.0** (SDK **0.15.1**), aligned with the Node reference at the observable-semantics level ([ALIGNMENT.md](ALIGNMENT.md)).

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
| `>` | Complete anonymous **object** root (`LinkedHashMap`) |
| `-` | Complete anonymous **array** root (`ArrayList`) |
| `>name` / Root Content, etc. | Strict mode → **`XaiopFragment`** (no outer `{}`) |

Empty source → empty `LinkedHashMap` (`{}`). Compat `forcedRoot` injects an object root for fragment openings and never returns a fragment.

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

`cover` is an **SDK streaming option** (default `false`). It does not change the final key set: after `finish`, Snapshot ≡ `Parse.parse(wire)`.

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

Plus Java-only sentinel: **`AnnotationSpan.KEEP`** (keep wire) ≠ `null` (drop capture) — see §6.5.

---

## 3. Parse API

### 3.1 `Parse.parse` / `Parse.parseAsync` · facade `Xaiop.parse`

```java
Parse.parse(source)                                          // strict
Parse.parse(source, boolean compat)
Parse.parse(source, CompatPolicy policy)
Parse.parse(source, Map<CompatFixId, Boolean> overrides)
Parse.parse(source, ParseOptions options)                    // + symbolKeys
Parse.parseAsync(...) → CompletableFuture<Object>
```

Parse full XAIOP text to a JSON tree or a Fragment (sync / async mirror).

**Parameters:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `source` | `String` | — | Full XAIOP text (`null` → `NullPointerException`) |
| `compat` | `boolean` \| `CompatPolicy` \| `Map<CompatFixId,Boolean>` | `false` | `false` strict; `true` all eight fixes; map/policy overrides defaults |
| `ParseOptions` | builder | — | `compat` + `symbolKeys` (U+001F label escape) |

**Returns:**

- Complete document → `LinkedHashMap` / `ArrayList` / scalar tree
- Root fragment (strict mode) → `XaiopFragment` (use `getEntries()`)
- Empty source → empty `LinkedHashMap`

```java
import io.xaiop.*;
import io.xaiop.compat.*;

Parse.parse(">\na:1\n");
Parse.parse(text, true);
Parse.parse(text, Map.of(CompatFixId.forcedRoot, false)); // other fixes stay default true
Parse.parse(text, new CompatPolicy(Map.of(CompatFixId.popAndRetry, false)));
Parse.parse(text, ParseOptions.builder().symbolKeys(true).build());
```

**Asymmetry:** free `Parse.parse` accepts fine-grained `compat`; `XaiopEngine.parse` accepts **boolean only**.

### 3.2 `Parse.LiveXaiopParser`

Incremental parser: feed lines / text; semantics ≡ `Parse.parse` over the concatenation. Used by streaming checkpoints to avoid re-scanning the whole prefix on every `.`.

```java
new Parse.LiveXaiopParser()
new Parse.LiveXaiopParser(boolean compat)
new Parse.LiveXaiopParser(boolean compat, boolean symbolKeys)
new Parse.LiveXaiopParser(ParseOptions options)
new Parse.LiveXaiopParser(CompatPolicy policy)
new Parse.LiveXaiopParser(Map<CompatFixId, Boolean> overrides)

feedLine(line): this
feedText(text): this
value(): Object              // live reference — clone / Materialize before exposing
cursorRestoreLines(): List<String>  // `>` / `>name-` chain for cover restore; at Root → []
docKind(): String            // "object" / "array" / "fragment" / null
```

| Method | Notes |
| --- | --- |
| `feedLine` | Complete logical line (no trailing LF/CRLF) |
| `feedText` | Split like `Parse.parse` — **no half-line buffer across calls**; a trailing segment without LF is a full line. For arbitrary network chunks use `DotCheckpointEngine.push` / `XaiopStream` |
| `value` | Current document (further feeds mutate in place) |
| `cursorRestoreLines` | Unavailable while broadcast is active; anonymous / array-element frames on stack → syntax error |

```java
Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();
// OK: complete lines (trailing incomplete segment without LF is still one line)
live.feedText(">\n>a\nx:1\n.\n>b\ny:2\n");
live.cursorRestoreLines(); // → [">b"]
live.value();              // → {a={x=1}, b={y=2}}
Object snap = Materialize.materializeSnapshot(live.value());
// NOT for TCP/WS byte slices: feedText(">me") then feedText("ta\n") ≠ feedText(">meta\n")
```

### 3.3 `XaiopFragment`

Returned in strict mode when there is no anonymous root and the document opens with `>name` / Root Content.

| Member | Meaning |
| --- | --- |
| `getEntries()` | Named bindings at Root (`LinkedHashMap`) |
| `isFragment()` | Always `true` |
| `notation()` | Debug string, e.g. `"a":{}` |

Streaming / WS JSON surfaces run `Materialize.materializeSnapshot`: fragment → clone of entries. Engine `getSync` keeps the fragment.

---

## 4. Encode API

### 4.1 `Encode.encode` / `Encode.encodeAsync` · facade `Xaiop.encode`

```java
Encode.encode(value): String
Encode.encode(value, EncodeOptions options): String
Encode.encodeAsync(value[, options]): CompletableFuture<String>
```

Encodes **plain JSON trees** to **strict** XAIOP (compatibility mode **never** changes encode output).  
Free functions / `XaiopEngine` static / instance produce the same wire for the same `(value, options)`.

**Guarantees:** for accepted values, `Parse.parse(Encode.encode(value, opt))` deep-equals `value`; wire ends with exactly one `\n`.  
**Not guaranteed:** byte-identical `encode(parse(handwritten wire))`.

**Rejected string values (throw `XaiopEncodeError`):** containing CR/LF; **beginning with U+0020 SPACE** (forced-string markers after `:` are not payload — emitting such values would silently strip leading spaces on parse). Tab (`U+0009`) and trailing spaces remain encodable.

```java
import io.xaiop.*;

Encode.encode(Map.of("a", 1, "b", 2)); // default perTopLevelKey
Encode.encode(Map.of("a", 1, "b", 2), EncodeOptions.singlePhase()); // dotPolicy: none
Encode.encode(obj, EncodeOptions.builder()
    .dotPolicy(DotPolicy.PER_N_KEYS)
    .phaseEvery(2)
    .build());
Encode.encode(obj, EncodeOptions.builder()
    .dotPolicyPaths(List.of("meta", "items[0]"))
    .build());
```

### 4.2 `EncodeOptions`

| Option | Default | Notes |
| --- | --- | --- |
| `root` | `AUTO` | `OBJECT` \| `ARRAY` \| `AUTO` (`ARRAY` requires a `List`, `OBJECT` a `Map`) |
| `style` | `RESET` | `RELATIVE` only with `dotPolicy: none` |
| `dotPolicy` | `PER_TOP_LEVEL_KEY` | `DotPolicy.NONE` \| `PER_TOP_LEVEL_KEY` \| `PER_N_KEYS` \| `CUSTOM`, or `dotPolicyPaths(...)` |
| `phaseEvery` | `1` (when set) | Keys per phase when `PER_N_KEYS` |
| `maxPhases` | — | Cap phase count (merge the tail) |
| `finalDot` | `false` | Append a trailing `.` |
| `keyOrder` | `INSERTION` | or `SORTED` |
| `nullPolicy` | `ENCODE` | `ENCODE` typed null; `OMIT` drop object null keys (arrays still encode); `ERROR` throw on null |
| `undefinedPolicy` | `OMIT` | **Inert in Java** (no `undefined`); kept for option-table parity |
| `shouldPhase` | — | Required when `dotPolicy: CUSTOM`; `Predicate<PhaseContext>` |
| `symbolKeys` | `false` | Opt-in U+001F label-escape dialect so keys may begin with `#` `@` `>` `<` `=` `!` `&` or U+001F; **both encode and parse must enable**; see [label-escape](../../protocol/notes/label-escape.md) |

Path-array overload (`dotPolicyPaths`) is **mutually exclusive** with `phaseEvery` / `maxPhases` / `shouldPhase`; requires `style: RESET`; array index must be the **final** path segment. Helpers: `Encode.parseJsonPath` / `Encode.formatJsonPath`.

`PhaseContext` record: `key`, `index`, `total`, `keysInPhase`, `phaseIndex`.

### 4.3 Rejected keys

These keys throw `XaiopEncodeError` (no silent reshape):

| Form | Why |
| --- | --- |
| Empty / whitespace / contains `:` | Illegal Label name |
| Ends with `-` | Conflicts with `>name-` array enter |
| Contains `>` `<` `=` `!` **`&`** (in the key body) | Cursor / locate / delete operator ambiguity |
| **Begins with** `#` `@` `>` `<` `=` `!` `&` or **U+001F** | Line-class / reserved escape introducer — unless `symbolKeys: true` |

Constants: `DotPolicy.*` · `LabelEscape.INTRODUCER` (`"\u001f"`, package `io.xaiop.internal`).

`getPath()` on `XaiopEncodeError` returns the JSON path of value/key failures (e.g. `$.meta.name`); it is `null` for option-level failures (bad `phaseEvery`, etc.).

---

## 5. Engine API

`XaiopEngine`: in-memory store (runtime data ids) plus parse / encode / merge-inject. Compatibility mode is **off** by default. Java is **sync-first** (`*Sync`); there is no Promise-first twin for every store method.

```java
import io.xaiop.XaiopEngine;

XaiopEngine engine = new XaiopEngine();
XaiopEngine engineCompat = new XaiopEngine(true);
```

### 5.1 Store

| API | Returns | Notes |
| --- | --- | --- |
| `uploadSync(source)` | `dataId` | Parse full XAIOP → store; follows instance compat |
| `uploadJsonSync(value[, encodeOptions])` | `dataId` | Strict encode → upload |
| `getSync(dataId)` | JSON or `XaiopFragment` (clone) | Unknown id → `IllegalArgumentException` |
| `has` / `delete` / `clear` | — | Store management |

### 5.2 Instance encode / merge

| API | Notes |
| --- | --- |
| `encodeSync` | Same as free `Encode.encode`; **ignores** compat switch |
| `mergeToJsonSync` | Base JSON + XAIOP → JSON (parse uses instance compat; override via `options.compat`) |
| `mergeToXaiopSync` | → XAIOP wire |
| `injectXaiopSync` | Inject XAIOP into existing `dataId` (mutates store) |
| `injectJsonSync` | Inject JSON into existing `dataId` |

### 5.3 Static methods

| API | Notes |
| --- | --- |
| `XaiopEngine.parse` | Second arg **boolean only** |
| `XaiopEngine.encode` | Same as free functions |
| `XaiopEngine.mergeToJson` / `mergeToXaiop` | Same as free functions |

### 5.4 Compatibility switches (instance)

| API | Notes |
| --- | --- |
| `compatibilityMode()` / `setCompatibilityMode` | Master switch; does **not** reset per-fix flags; turning compat **on** clears `typeCheck` |
| `compatFix(id)` / `setCompatFix(id, enabled)` | Eight fine-grained fixes; if mode is off, setter returns `false` and leaves state unchanged |

### 5.5 Type checking (instance)

**Not protocol:** registry / freeze / push are **SDK** product features; they do not rewrite the wire grammar. Package: `io.xaiop.types`.

| API | Notes |
| --- | --- |
| `typeCheck()` / `setTypeCheck(enabled)` | Master switch (default `false`); **strict mode only**; turning compat **on** clears it; when on, `upload*` / `inject*` run registry checks |
| `Types.TYPE` | Leaf/structure constants: `INT` `FLOAT` `BOOL` `STRING` `NULL` `OBJECT` `ARRAY` `ANY` (leaves align with `PROT-CONTENT`) |
| `Types.objectType(fields)` / `Types.arrayType(element)` | Builders; surface sugar strings also accepted (below) |
| `registerType(path, type[, polarity])` | Bind a JSON path; `TypePolarity.ALLOW` (default) \| `DENY`; **immutable once set** (re-register → `false`) |
| `registerTypes(map[, polarity])` | Batch; returns `RegisterManyResult` (`ok`, `rejected`) |
| `registerTypeDeny(path, type)` | Deny helper |
| `getRegisteredType` / `typeRegistry` / `exportTypeSchema` | Query and snapshot |
| `encodeTypeSchemaFrame()` | Encode control frame (prefer `pushTypeConsistency` on the connection) |
| `onTypeViolation(BiConsumer\|null)` | Violation hook (called **before** throwing `XaiopTypeError`) |

**Path house style:** `data.fork`, `items[0]` (same as encode `parseJsonPath`; **not** wire `data>fork`).

**Optional surface sugar:** `string`, `array<int>`, `object<name:string,old:int>` → compared as **canonical** types.

**Server checks (`typeCheck` + registry):**

| Rule | |
| --- | --- |
| Scope | **Registered paths only**; unregistered paths are ignored by the registry |
| `ALLOW` | Value must match; `int` ≠ `float` (same split as encode) |
| `DENY` | Value must **not** match that type |
| `any` | Explicit ignore (cannot combine `DENY` + `any`) |
| Empty registry | Enabling checks is a no-op |
| When | `uploadSync` / `uploadJsonSync` / `injectXaiopSync` / `injectJsonSync` |

```java
import io.xaiop.XaiopEngine;
import io.xaiop.types.*;

XaiopEngine eng = new XaiopEngine();
eng.registerType("data.fork", Types.TYPE.STRING);
eng.registerType("user", Types.objectType(Map.of(
    "name", Types.TYPE.STRING,
    "old", Types.TYPE.INT)));
eng.registerType("items", Types.arrayType(Types.TYPE.INT));
eng.registerTypeDeny("data.bad", Types.TYPE.STRING);
eng.registerType("meta.note", Types.TYPE.ANY);
eng.setTypeCheck(true);
eng.uploadSync(">\n>data\nfork:ok\n"); // OK
```

**Client (`XaiopWs` / `XaiopStream`, `typeCheck: true`):**

| Rule | |
| --- | --- |
| Freeze | First **non-`null`** observation at a path locks the type; later values must be compatible |
| `null` | **Skipped** on the client (no refresh, no error) so delete/clear primitives are not broken |
| Arrays | Element types must be **homogeneous** when checking is on |
| Refresh | Key absent from commit (delete) clears subtree freeze; recreate after delete may change type |
| No schema push | First-seen freeze still enforces consistency |
| Schema push / preload | `ALLOW` / `DENY` / `any` apply first; **schema-violating observations do not write freeze**; `any` does **not** lock freeze |
| Options | `typeCheck`, `typeSchema` (snapshot / registry / surface); with `compatibilityMode` on, **typeCheck is ignored** |

**Type-consistency push (WS):** `conn.pushTypeConsistency(engine|registry|snapshot)`

| Prerequisite | |
| --- | --- |
| Connection | **Strict** (`compatibilityMode == false` on that connection) |
| Payload | Non-empty registry; if passing `XaiopEngine`, its **`typeCheck == true`** |
| Shape | Control frame (**not** XAIOP wire): prefix `#!xaiop/types/v1\n` + JSON snapshot; demuxed by Control Root before parse / Span |
| Failure | Bad prerequisites → `IllegalArgumentException`; socket not OPEN → `false` |

---

## 6. Streaming API

### 6.1 `XaiopStream`

HTTP / SSE / WebSocket / RAW **consumer**. Text feeds `DotCheckpointEngine`, emits Diffs on `.`, and parses the final Snapshot at EOF. Inbound text is control-demuxed before checkpoint push when session options are set.

```java
import io.xaiop.stream.*;

XaiopStream stream = new XaiopStream(url, XaiopStream.Options.defaults()
    .streamProcessing(true)    // default
    .compatibilityMode(false)  // default
    .mergeChunkWindow(true)    // default — batch complete `.` in the buffer window into one Diff
    .asyncParse(false)         // default; production may set true (coalesced pushAsync)
    .historySnapshot(false)
    .historyRealtime(false)
    .retainWireHistory(true)
    .cover(false)              // default — see §2.6
    .modes(StreamMode.CALLBACK));

stream.onChunk(diff -> {});
stream.onChunkWithMeta((diff, meta) -> {});
stream.onDone(json -> {});
stream.send(new XaiopStream.SendOptions().transport(TransportKind.HTTP));
```

Facade: `Xaiop.stream(url)` / `Xaiop.stream(url, options)`.

#### Constructor options (`XaiopStream.Options`)

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
| `symbolKeys` | `false` | U+001F label-escape dialect |
| `typeCheck` | `false` | Client freeze / schema checks (§5.5); ignored if compatibility mode is also on |
| `typeSchema` | — | Preload type snapshot / registry / surface |
| `lineIntercept` | — | Initial line-intercept handler(s) (§6.4) |
| `annotationSpan` | — | Initial Annotation Span handler(s) (§6.5) |
| `session` / `autoAck` / control callbacks | — | Optional Control Root inbound cursor (§7.7) |
| `modes` | `CALLBACK` | Multi-select allowed (`PROMISE`, `ASYNC_ITERATOR`, `EVENTS`) |

#### Snapshot / chunk

| API | When | Value |
| --- | --- | --- |
| `onChunk` / `onChunkWithMeta` / iterator | Phase / window boundary | Diff JSON; empty phase may be `null`; **meta** may include `seq` / `seqs` (phase sequence, §7.7) and `typeCheckEscapePaths`. Diff is already isolated from Commit — delivered **by reference** (Node-aligned); mutate carefully if multiple listeners share one chunk |
| `getCommittedSnapshot()` | After each commit | Cumulative later-wins through last `.` / EOF |
| `bufferStats()` / `compactCommitted(...)` | Mid-stream | Receive-buffer sizes / discard committed wire (keep live tree) |
| `getSnapshot()` / `onDone` | After finish | Full-buffer parse; empty → `{}` |
| Mid-stream `getSnapshot()` | `streaming` | Usually `null` / unset |

Fragments are materialized to plain maps on these surfaces (`Materialize.materializeSnapshot`).

#### Delivery modes

| Mode | Surface |
| --- | --- |
| `CALLBACK` (floor) | `onChunk` / `onDone` / `onError`; also line intercept · Annotation Span |
| `PROMISE` | `send()` → `CompletableFuture` of final Snapshot |
| `ASYNC_ITERATOR` | Blocking `ChunkPull` / `for (Object d : stream.chunks())` |
| `EVENTS` | `on(StreamEvent, …)` |

`disableMode` never leaves an empty set (keeps `CALLBACK`). Busy `send` again: promise mode → exceptional future; otherwise throw.

#### `send` essentials (`XaiopStream.SendOptions`)

| Item | Rule |
| --- | --- |
| Default transport | `HTTP` (`java.net.http.HttpClient`) |
| SSE | Sets `Accept: text/event-stream`; joins multi-line `data:` with `\n` |
| RAW | Requires `source` (`Iterable` of `CharSequence`/`byte[]`) or `InputStream` |
| Binary | Streaming UTF-8 decode across chunks |
| `timeoutMs` | Per-send abort deadline (AbortSignal equivalent with `abort()`) |
| `abort()` | Status `ABORTED` |

State machine: `IDLE → CONNECTING → STREAMING → COMPLETING → COMPLETED` (or `ABORTED` / `ERROR`). Enums: `StreamStatus`, `TransportKind`, `StreamMode`; busy check via `StreamStatus.busy()`.

### 6.2 `DotCheckpointEngine`

Low-level `.`-phase parser (used inside `XaiopStream` / WS; usable directly). Implements `AutoCloseable`.

```java
DotCheckpointEngine eng = DotCheckpointEngine.Options.of(diff -> {})
    .streamProcessing(true)    // default
    .mergeChunkWindow(true)    // default
    .emitDiff(true)            // default; false → Commit/final only
    .cover(false)
    .historySnapshot(false)
    .historyRealtime(false)
    .retainWireHistory(true)
    .compat(false)
    .lineIntercept(/* handlers */)
    .annotationSpan(/* handlers */)
    .build();
// or: Xaiop.checkpoint(diff -> {});

eng.push(chunk);
eng.bufferStats();       // { length, committedAt, pendingBytes, openPhase }
eng.compactCommitted();  // drop committed wire; keep live tree
eng.finish();
eng.snapshot();          // final
eng.committedSnapshot(); // last commit
eng.history();           // ParseHistory | null
eng.onLineIntercept(fn); // see §6.4
eng.onAnnotationSpan(fn); // see §6.5
```

| Option | Default | Notes |
| --- | --- | --- |
| `streamProcessing` | `true` | Mid-stream `.` phases + line-scan path (intercept / Span). Bare builder without the flag is **on**. |
| `mergeChunkWindow` | `true` | Batch complete `.` in the buffer window → one Diff |
| `emitDiff` | `true` | Set `false` when only Commit / final snapshot is needed; `onChunk` optional (omit → Diff no-op) |
| `cover` | `false` | Cover-mode Diff for `&` |
| `phaseSeq` | `true` | Allocate monotonic phase seq in `ChunkMeta` |
| `symbolKeys` | `false` | Decode U+001F label escapes |

| Method | Notes |
| --- | --- |
| `push` / `pushAsync` | Sync ingest / coalesced async scan (daemon thread) |
| `finish` / `finishAsync` | Flush tail |
| `bufferStats()` | `{ length, committedAt, pendingBytes, openPhase }`. `pendingBytes` **MUST** equal `length - committedAt`. Prefer over reading `buffer()` for monitoring. |
| `compactCommitted(dropHistory?)` | Discard `buffer[0..committedAt)`; keep live tree. **MUST** throw on closed engine; on `historyRealtime`+`retainWireHistory`; on non-empty history — unless `dropHistory: true`. |
| `jumpTo(index)` | Requires `historyRealtime`; discards nodes after the index |
| `onLineIntercept` / `clearLineIntercepts` | After complete line split, before parse; see §6.4 |
| `onAnnotationSpan` / `clearAnnotationSpans` | Phase `#` span; see §6.5 |
| `streamProcessing()` / `mergeChunkWindow()` | Read-only getters for the resolved defaults |

`ChunkMeta` fields: `typeCheckEscapePaths`, `seq`, `seqs`, `logSeq`, `logSeqs`.

### 6.3 `ParseHistory` / Snapshot helpers

History is built by the checkpoint when `historySnapshot` and/or `historyRealtime` is on.

| API | Notes |
| --- | --- |
| `info()` / `exportTimeRoot()` | Metadata / node list |
| `getNode` / `getDiff` / `getBefore` / `getAfter` | Read by index (**deep-clone** export; callers may mutate safely) |
| `compare` / `viewRange` | Compare / range view (defensive clones on return) |
| `jumpTo` / `canJumpTo` | Realtime forward jump |
| `setSource` / `release` | Associate source key / release |

The checkpoint engine may store owned / shared trees internally when history is on; **public** history APIs above remain clone-on-read (Node-aligned).

`Materialize.materializeSnapshot(parsed)`: Fragment → plain object (JSON surface).  
`Materialize.materializeOwned(parsed)`: skips clone for a plain root (unsafe if parser reused).

Constants: `ParseHistory.HISTORY_NODE_KIND.DOT` / `TAIL`.

### 6.4 Line intercept (`onLineIntercept`)

**SDK product feature** (not wire grammar): after the checkpoint **receive buffer** splits a complete logical line and **before** `LiveXaiopParser` feed, run handlers in **registration order**.

| Contrast | Line intercept | `onPhase` / `onChunk` |
| --- | --- | --- |
| Layer | Buffer line boundary (post-split) | Phase Diff (after parse + Commit) |
| Grain | Each complete line | `.` phase (may window-merge) |
| Rewrite / skip | **Yes** (return string or `null`) | **No** |

```java
import io.xaiop.stream.*;

eng.onLineIntercept(ctx -> {
  if (LineKind.ANNOTATION.equals(ctx.view().kind())) return null; // skip line
  if (LineKind.CONTENT.equals(ctx.view().kind()) && "x".equals(ctx.view().key()))
    return "x:42"; // rewrite
  return ctx.raw(); // keep
});
```

| Return | Meaning |
| --- | --- |
| `String` | Text fed downstream; next handler sees it |
| `null` | **Skip this line** (short-circuit; later handlers not called) |
| `ctx.raw()` (same text) | Keep current text (Java has no `undefined`) |

**Three `null`s (do not conflate):** intercept skip ≠ Content `key:null` ≠ empty-phase Diff `null`.

**Fixed template `LineView`:** `kind` · `raw` · `name` · `path` · `key` · `valueText` · `annotationText` (unused slots `null`). Also: `LineKind` / `LineIntercept.classifyLine` / `emptyLineView` / `runLineInterceptChain`.

| Edge | Behavior |
| --- | --- |
| `streamProcessing: false` | Whole-buffer parse; interceptors **do not** run |
| Skip `.` / rewrite to `.` | Phase close follows **post-intercept** text |
| `mergeChunkWindow` / `cover` / `pushAsync` | Existing phase rules after effective lines |
| `jumpTo` (`historyRealtime`) | Rebuild **re-runs** the intercept chain |
| Interceptors present → Diff owned-parse | Uses **effective** line wire (may differ from transport buffer) |

Surfaces: `DotCheckpointEngine` · `XaiopStream` · `XaiopWsConnection` (ctor `lineIntercept` and/or `onLineIntercept` / `clearLineIntercepts`).

### 6.5 Annotation Span (`onAnnotationSpan`)

**SDK product feature** (not wire grammar): wire `#…` still has no tree side effects. After **this phase’s** lines are ready and **before Diff / Commit / `typeCheck`**, on `#` collect **forward same-level** siblings (+ subtrees), call handlers with **annotation text + template JSON**, and remount / drop / keep. Lines starting with `#!` are Control Root: demuxed before Span; Span **hard-skips** any remaining `#!`.

| Contrast | Line intercept §6.4 | Annotation Span §6.5 |
| --- | --- | --- |
| Layer | Buffer line split | Phase lines (JSON-facing capture) |
| Trigger | Every complete line | `#` + forward same-level region |
| Handler input | Wire `view` | `annotation` + materialized `json` (no `=`/`@`/`!` forms) |
| vs typeCheck | Orthogonal | **Before typeCheck**; processed region **escapes** type check |

```java
eng.onAnnotationSpan((annotation, view) -> {
  if (!annotation.contains("tag")) return AnnotationSpan.KEEP; // keep wire; still escape capture keys
  if (annotation.contains("drop")) return null;                // drop # + capture
  Map<String, Object> rewritten = new LinkedHashMap<>((Map) view.json());
  rewritten.put("rewritten", true);
  return rewritten; // remount
});
```

| Return | Meaning |
| --- | --- |
| `AnnotationSpan.KEEP` | Keep `#` + capture wire; **still** record escape paths for capture keys (Node `undefined`) |
| `null` | Drop `#` + capture |
| `Map` / `List` / JSON text `String` | Encode as sibling wire replacing capture |

**TypeCheck escape (must understand):** once this phase **invokes** the Span handler chain for a `#`, the region handlers process and the same-level keys covered by that forward region enter `meta.typeCheckEscapePaths`; later `observeTree` **skips** those paths (and descendants). Same-level keys **before** `#` are **not** escaped.

Surfaces: ctor `annotationSpan` · `onAnnotationSpan` · `clearAnnotationSpans` (checkpoint / Stream / WS).

Helpers: `AnnotationSpan.applyAnnotationSpans` / `encodeAsSiblingLines` / `pathEscapesTypeCheck`.

---

## 7. WebSocket API

Prefer `XaiopWs` for long-lived skeleton sessions (push + consume on one connection). Keep using `XaiopStream` for HTTP/SSE/RAW.  
The **wire** does not define `connect` / Futures / callback order; the following is **locked Java SDK** behavior, matching Node’s session contract.

Facade aliases: `Xaiop.wsListen(...)` / `Xaiop.wsConnect(...)`.

### 7.1 `XaiopWs`

```java
import io.xaiop.ws.*;

XaiopWsHub hub = XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1")).join();
hub.onConnection(conn -> {
  // Sync first frames are legal and common — client MUST pass callbacks in connect options
  conn.pushJson("a", 1, false);
  conn.pushJson("b", Map.of("x", 2), true);
  conn.end();
});

XaiopWs.ConnectOptions opts = new XaiopWs.ConnectOptions();
opts.onPhase(diff -> {
  /* may run before this join returns — see §7.5 */
});
XaiopWsConnection client = XaiopWs.connect(hub.url(), opts).join();
Object json = client.done().join(); // may already be settled when connect returns
hub.close().join();
```

| API | Notes |
| --- | --- |
| `XaiopWs.listen(options?)` | → `CompletableFuture<XaiopWsHub>`; may attach to an existing `ServerSocket` + `path` |
| `XaiopWs.connect(url, options?)` | → `CompletableFuture<XaiopWsConnection>`; semantics in §7.5 |
| `XaiopWs.encodePhaseJson` / `encodePhaseObject` | Encode only (no send); delegates to `PhaseEncode` |

**`ConnectOptions`:** parse/control options (`streamProcessing`, `mergeChunkWindow`, `asyncParse`, `cover`, `compatibilityMode`, `typeCheck`, `typeSchema`, `symbolKeys`, `lineIntercept`, `annotationSpan`, **`session`**, **`autoSession`**, **`autoAck`**, **`retainOutbound`**) + `protocols`, `handshakeTimeoutMs` (default **15000**), `headers`, `httpClient`, and construction-time `onPhase` / `onChunk` / `onDone` / `onError` / **`onControlError`** / **`onSession`** / **`onResume`** / **`onAck`** / **`onSnapshot`**.

**`ListenOptions`:** the parse/control-related options above + `port` / `host` / `path` / `backlog` / `serverSocket` / `protocols` / `maxPayload`.  
**Not implemented:** Node’s `perMessageDeflate`. JDK `HttpServer` attach is **not** supported — use `serverSocket(...)` + path multiplex (`GET /health` on the same socket).

### 7.2 `XaiopWsConnection`

| Member | Notes |
| --- | --- |
| `pushJson(key, value, finalPhase\|options)` | One key per phase; non-final ensures trailing `.\n`; not OPEN → `false` |
| `pushObject(object, finalPhase\|options)` | Multiple keys in one phase; same |
| `pushWire(text)` | Raw wire **as-is** (no auto `\n`); consecutive frames must already be line-safe or peer may glue; not OPEN → `false` |
| `pushWireLn(text)` | Like `pushWire`, but appends `\n` when `text` does not already end with LF |
| `pushTypeConsistency(engine\|registry\|snapshot)` | Push registered type schema (control frame); prerequisites in §5.5 |
| `session` / `autoSession` / `autoAck` / `retainOutbound` | Control session / hello / auto-ack / outbound log (§7.7) |
| `sendSession` / `sendAck` / `sendResume` / `sendSnapshot` | Outbound control frames |
| `getResumeState()` / `phaseSeq` / `outboundSeq` / `sessionId` / `ackedSeq` / `logSeq` | Resume cursors (`getResumeState` includes inbound/outbound seq) |
| `outboundLog` / `replayOutboundAfter` / `noteOutboundPhase` | Producer outbound phase log |
| `ResumeWireLog` | App-owned durable log across reconnects (`io.xaiop.control`) |
| `typeCheck()` | Read-only; whether client type checking is on for this connection |
| `onPhase` / `onChunk` | Diff callback; with-meta variant available; **locked after `connect`** — use connect options |
| `onLineIntercept` / `clearLineIntercepts` | Buffer-line intercept (§6.4); **locked after `connect`** |
| `onAnnotationSpan` / `clearAnnotationSpans` | Phase Annotation Span (§6.5); **locked after `connect`** |
| `onResume` / `onSession` / `onAck` / `onSnapshot` / `onControlError` | Control callbacks; **locked after `connect`**; listen-accept stays unlocked |
| `onDone` / `onError` | Final / error; **locked after `connect`** |
| `handlersLocked()` | `true` after successful `XaiopWs.connect` |
| `getCommittedSnapshot` / `getSnapshot` | Same as Stream: committed mid-stream; `getSnapshot()` unset until final |
| `done()` | `CompletableFuture` of final Snapshot after peer close + `finish` |
| `closed()` | Socket teardown finished (after the `done` path) |
| `end` / `abort` | Drain-close / abort |

### 7.3 `XaiopWsHub`

| Member | Notes |
| --- | --- |
| `url(host?)` | Connect URL (`ws://…`) |
| `onConnection` / `onError` | Accept callbacks (may **sync** `push*` here) |
| `connections()` | Current connections |
| `port()` / `path()` | Bound listen info |
| `close()` | Close the hub (`CompletableFuture`) |

### 7.4 `encodePhaseJson` / `encodePhaseObject`

```java
PhaseEncode.encodePhaseJson(key, value[, PhaseEncode.Options])
PhaseEncode.encodePhaseObject(object[, PhaseEncode.Options])
// also: XaiopWs.encodePhaseJson / encodePhaseObject
```

Uses `Encode.encode` internally (force `dotPolicy: none`); `final: true` omits the phase `.`. Illegal keys still throw `XaiopEncodeError`.

### 7.5 `connect` Future vs callback ordering (attention)

Internal `connect` order: **create socket → immediately construct `XaiopWsConnection` (bind message + option callbacks) → wait for open → complete Future**.

| Explicit semantics | |
| --- | --- |
| `connect` complete means | Handshake OK; usable connection object returned |
| `connect` complete does **not** mean | “No `onPhase` / `onDone` yet” or “`done` is unsettled” |
| SDK does **not** buffer phases until after complete | Deliberate — avoids dropping sync first frames on accept |

Therefore **`onPhase` / `onDone` / `onError` and settlement of `done` may all happen before `connect(...).join()` returns** (especially when the accept side pushes synchronously in `onConnection`).

**Required:** put **`onPhase` / `onChunk` / `onDone` / `onError` / `lineIntercept` / `annotationSpan` / control callbacks (`onResume`, `onSession`, …)** in **`ConnectOptions`**.  
After connect completes, mutators (`onPhase`, `onLineIntercept`, `onAnnotationSpan`, `onResume`, `onSession`, `onAck`, `onSnapshot`, `onControlError`, `onDone`, `onError`, and their `clear*`) **throw** (`handlersLocked`) — there is **no replay** of early frames.  
Listen-accept connections stay unlocked so a producer/consumer can still attach in `hub.onConnection` if needed.  
If the app needs “process only after connect returns”: queue in the application layer; do not ask the SDK to defer delivery.

### 7.6 No browser package

Java has **no** `xaiop/browser` subpath. Phase client + server both live under `io.xaiop.ws`.

| Need | Java |
| --- | --- |
| Phase Diff consumer over HTTP/SSE/WS | `XaiopStream` |
| Long-lived bidirectional session | `XaiopWs.listen` + `XaiopWs.connect` |
| Local checkpoint only | `DotCheckpointEngine` / `Xaiop.checkpoint` |
| Browser JS client | Use Node [`xaiop/browser`](../nodejs/API.md#76-browser-xaiopbrowser--phase-client) |

| vs Node browser | |
| --- | --- |
| Socket | JDK `HttpClient` WebSocket (connect) · RFC6455 `ServerSocket` (listen) |
| `listen` / hub | **Provided** in the same JAR |
| `connect` early-frame semantics | **Same** as Node: callbacks in options; complete ≠ “no events yet” |
| Phase / Diff / Commit / `cover` / `typeCheck` / line intercept / Annotation Span / Control Root | **Same** observable semantics |

### 7.7 SDK Control Root (`#!`) — session / resume

Product convention (not a Frozen 0.6.0 grammar change): lines starting with `#!` are the **SDK control plane**. They are demuxed **before** parse / Annotation Span. Package: `io.xaiop.control`.

| Item | Summary |
| --- | --- |
| Official frames | `#!xaiop/types/v1`, `session/v1`, `ack/v1`, `resume/v1`, `snapshot/v1`, **`seq/v1`** |
| Unknown `#!` | Discard + `XaiopControlError` (`onControlError`); never enter the wire pipeline |
| **Two seq spaces** | `meta.seq` = **connection-local** (resets each socket); `meta.logSeq` = **session-log** for `fromSeq` / ack. **Never** assign `resumeCursor = meta.seq` after reconnect — use `meta.logSeq` / `getResumeState()` |
| Stamp | `#!xaiop/seq/v1` before each phase; `pushJson`/`pushObject` auto-stamp when `session`/`retainOutbound`; `ResumeWireLog.wiresAfter` stamps |
| Window merge | Default `mergeChunkWindow: true` may merge resume catch-up into one chunk (`meta.logSeqs` still lists units) — not a bug; use `false` for per-phase callbacks |
| Resume | `sendResume({ sessionId, fromSeq })` → continue from `fromSeq+1` in **log** space; **no** historical Diff replay; optional `sendSnapshot` |
| Connect options | `session`, `autoSession`, `autoAck`, `retainOutbound`, `onSession`, `onResume`, `onAck`, `onSnapshot`, `onControlError` |
| Producer log | auto-record + stamp when `session`/`retainOutbound`; durable: app-owned `ResumeWireLog` by `sessionId` |
| Stream | `onChunkWithMeta(diff, meta)` may include `seq`/`seqs` and `logSeq`/`logSeqs` |

Constants / codecs: `ControlFrames.CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY`, `encodeSeqFrame`, `stampWireWithLogSeq`, `ControlDemux`, `ControlIngest`, `ControlPlaneHost`, `ControlSessionState`, `ResumeWireLog`, `XaiopResumeLogError`, `XaiopControlError`.

---

## 8. Merge and inject

**Pre/post-processing**, not streaming. Conflict policy applies only to **conflicting keys** (deep objects recurse; arrays / scalars conflict as a whole).

| `MergeConflict` | Behavior |
| --- | --- |
| `OVERWRITE` (default) | Take overlay **at conflicting keys** |
| `KEEP` | Keep base; non-conflicting keys still merge in |

**Not a Diff applicator:** `Merge.mergeJson` / `mergeToJson` **do not delete** keys that are absent from the overlay. Example: `mergeJson({ cart: { a: 1, b: 2 } }, { cart: { a: 1 } })` keeps `b`. Phase Diffs from `onChunk` / `onPhase` are **subtree replacement** (or cumulative commit) surfaces — to apply a Diff locally, replace by path (or take `getCommittedSnapshot()`); **do not** pipe Diffs into `mergeJson`.

| API | Returns |
| --- | --- |
| `Merge.mergeJson(base, overlay[, conflict])` | JSON ← JSON+JSON |
| `Merge.mergeToJson(baseJson, xaiopSource[, options])` | JSON |
| `Merge.mergeToXaiop(baseJson, xaiopSource[, options])` | XAIOP (default `encodeOptions` = single-phase / `dotPolicy: none`) |
| Facade | `Xaiop.mergeJson` / `mergeToJson` / `mergeToXaiop` |

`MergeOptions`: `conflict`, `compat` (parse overlay), `encodeOptions`, `as` (`JSON` \| `XAIOP` — inject result shape).

Engine inject (mutates store):

| API | Overlay |
| --- | --- |
| `injectXaiopSync(dataId, xaiop[, options])` | XAIOP |
| `injectJsonSync(dataId, json[, options])` | JSON |

```java
import io.xaiop.*;

Merge.mergeToJson(Map.of("a", 1), ">\nb:2\n",
    MergeOptions.builder().conflict(MergeConflict.KEEP).build());

XaiopEngine engine = new XaiopEngine();
String id = engine.uploadJsonSync(Map.of("a", 1));
engine.injectXaiopSync(id, ">\nb:2\n");
```

---

## 9. Compatibility mode

Optional parse path for imperfect model output. Does **not** change the sealed wire protocol; only changes ingest recovery. **Off** by default.

| Entry | Form |
| --- | --- |
| Free `Parse.parse` / `parseAsync` | `boolean` \| `CompatPolicy` \| override `Map` |
| `XaiopEngine.parse` | **boolean only** |
| Engine / Stream instance | `compatibilityMode` + `setCompatFix` |

When enabled with no overrides: **all eight** fixes on. Maps/policies override defaults (omitted keys stay `true`).

| `CompatFixId` | Summary |
| --- | --- |
| `forcedRoot` | Inject anonymous object root when opening is not `>`/`-` |
| `rewriteBareNameArray` | `name-` → `>name-` |
| `rewriteEnterLine` | Rewrite `>` whitespace / glued `>key:value` |
| `ignoreBareLeaveAtRoot` | Ignore bare `<` at Root |
| `popAndRetry` | Pop Cursor and retry the failing line |
| `locatePathTrim` | Retry `=` after trimming path whitespace |
| `locatePathStripSpaces` | Retry `=` after stripping all whitespace |
| `locatePathArraySuffix` | Treat trailing `-` on `=` segment as array key when value is array |

Exports: `CompatPolicy`, `CompatFixId`, `CompatPolicy.DEFAULTS`.

```java
import io.xaiop.*;
import io.xaiop.compat.*;

Parse.parse(text, new CompatPolicy(Map.of(CompatFixId.forcedRoot, false)));
engine.setCompatibilityMode(true);
engine.setCompatFix(CompatFixId.forcedRoot, false); // returns false if mode is off
```

Recovery does **not** invent field names; still throws `XaiopSyntaxError` when recovery fails or the error changes.

---

## 10. Types and constants

| Export | Value / notes |
| --- | --- |
| `Xaiop.PROTOCOL_VERSION` | `"0.6.0"` |
| `Xaiop.SDK_VERSION` | `"0.15.1"` |
| `DotPolicy` | `NONE` · `PER_TOP_LEVEL_KEY` · `PER_N_KEYS` · `CUSTOM` (string constants) |
| `MergeConflict` | `OVERWRITE` · `KEEP` |
| `StreamMode` | `CALLBACK` · `PROMISE` · `ASYNC_ITERATOR` · `EVENTS` |
| `StreamStatus` | `IDLE` … `ERROR` |
| `TransportKind` | `HTTP` · `SSE` · `WEBSOCKET` · `RAW` |
| `ParseHistory.HISTORY_NODE_KIND` | `DOT` · `TAIL` |
| `LineKind` / `LineIntercept.classifyLine` / `emptyLineView` / `runLineInterceptChain` | Line-intercept classify + chain helpers (§6.4) |
| `AnnotationSpan.KEEP` / `applyAnnotationSpans` / … | Annotation Span helpers (§6.5) |
| `ControlFrames.CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY` | SDK Control Root constants (§7.7) |
| `encodeSeqFrame` / `stampWireWithLogSeq` | Session-log seq stamp (`#!xaiop/seq/v1`) |
| `ControlDemux` / `ControlIngest` / `ControlPlaneHost` / `ControlSessionState` | Control demux / session helpers |
| `ResumeWireLog` / `XaiopResumeLogError` | Durable outbound phase log for resume |
| `encodeControlFrame` / `encodeSessionFrame` / `encodeAckFrame` / `encodeResumeFrame` / `encodeSnapshotFrame` | Control frame codecs |
| `isSdkControlLine` / `parseControlHeader` / `dispatchControlFrame` | Control classify / route |
| `XaiopControlError` | Soft control-plane errors |
| `CompatFixId` / `CompatPolicy.DEFAULTS` | Eight-fix list and defaults |
| `Types.TYPE` / `objectType` / `arrayType` | Type-check constants and builders (§5.5) |
| `TypeRegistry` / `TypeChecker` / `TypeFreezeSession` | Registry / server check / client freeze |
| `Types.TYPE_SCHEMA_FRAME_PREFIX` / `encodeTypeSchemaFrame` / `tryParseTypeSchemaFrame` | Type-consistency control frames |
| `canonicalizeType` / `parseTypeSurface` / `classifyValue` / `valueMatchesType` | Normalize and match helpers |
| `PhaseEncode` | WS phase encode helpers |
| `Materialize` | Fragment → plain JSON snapshot |

Javadoc on the public types under `io.xaiop*` is the in-IDE companion to this page.

---

## 11. Error handling

| Error | When |
| --- | --- |
| `XaiopSyntaxError` | Illegal wire; optional `getLine()`. Strict: fail immediately. Compat: still throws when recovery fails or the error changes |
| `XaiopEncodeError` | Illegal encode input / options / rejected keys; optional `getPath()` (e.g. `$.meta.name`); `null` path for option-level failures |
| `XaiopTypeError` | Type registry / freeze / schema check failure; optional path / expected / actual / polarity |
| `XaiopControlError` | Unknown / malformed control frame (soft by default; see §7.7) |
| `XaiopResumeLogError` | Durable resume-log failures |
| `IllegalArgumentException` | Unknown `dataId`; bad argument shapes; `pushTypeConsistency` prerequisites; etc. |
| `NullPointerException` | Non-string / null source where a string is required |
| `IllegalStateException` | Push after `finish`; handlers locked after connect; stream busy; etc. |

All protocol / SDK product errors above are **unchecked** (`RuntimeException`), so call sites mirror JavaScript throw-anywhere behaviour.

```java
import io.xaiop.*;

try {
  Parse.parse(">\n&\n"); // bare & → XaiopSyntaxError
} catch (XaiopSyntaxError e) {
  System.err.println(e.getLine() + " " + e.getMessage());
}

try {
  Encode.encode(Map.of("a&b", 1));
} catch (XaiopEncodeError e) {
  System.err.println(e.getPath() + " " + e.getMessage());
}
```

---

## Related

| Doc | Purpose |
| --- | --- |
| [README.md](README.md) | Package landing / quick start |
| [ALIGNMENT.md](ALIGNMENT.md) | Java ↔ Node parity matrix (definitive) |
| [../nodejs/API.md](../nodejs/API.md) | Node reference API |
| [../behavioral-contract.md](../behavioral-contract.md) | Node product-choice catalog (optional guide) |
| [../../protocol/syntax.md](../../protocol/syntax.md) | Protocol grammar |
| [../../meta/releases.md](../../meta/releases.md) | Seal / releases |
| [../../../xaiop-sdk/conformance/](../../../xaiop-sdk/conformance/) | Node↔Java golden dumps (`npm run golden`) |
| [../nodejs/notes/](../nodejs/notes/) | Deep notes (streaming parse, history, WS, type check, line intercept, Annotation Span, Control Root, adjustment policy) — shared product semantics |
