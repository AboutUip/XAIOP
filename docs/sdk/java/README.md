# XAIOP Java SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Artifact | `io.xaiop:xaiop` **0.5.0** (JAR) |
| Protocol | v0.4.0 Frozen (`Xaiop.PROTOCOL_VERSION`) |
| SDK version constant | `Xaiop.SDK_VERSION` = `0.5.0` |
| Runtime | Java 17+ |
| Code | [../../../xaiop-sdk/java/](../../../xaiop-sdk/java/) |

This repository’s **SDK focus is Node.js** (`xaiop` **0.14.0** ↔ protocol **0.6.0**); this Java
package implements a **0.4.0** wire subset plus a Node-aligned **stream consumer** (HTTP / SSE / RAW). Pin the artifact version; read
`Xaiop.PROTOCOL_VERSION` when you need the wire version.

**Isolation:** Protocol = wire only · Practice = model & streaming transport · This package = APIs — [../../SEPARATION.md](../../SEPARATION.md).  
**Parity:** [../behavioral-contract.md](../behavioral-contract.md) (protocol conformant ≠ this SDK).  
**Reference implementation:** [Node.js](../nodejs/README.md) — the Java port tracks its observable semantics.

---

## Status

**Active** — parse · encode · merge · checkpoint · **stream (consumer)**.

| Area | State |
| --- | --- |
| `Parse` / `Parse.LiveXaiopParser` / `XaiopFragment` | Done |
| `CompatPolicy` (8 fixes, individually toggleable) | Done |
| `Encode` (all `dotPolicy` modes incl. path arrays) | Done |
| `Merge` / inject (`overwrite` / `keep`) | Done |
| `DotCheckpointEngine` (`.` phase Diff, window batching) | Done |
| `XaiopStream` (HTTP / SSE / RAW consumer) | **Done** (0.5.0) |
| `XaiopWs` / hub / connection, phase-push helpers | **Not yet** |
| cover Diff · typeCheck · line intercept · Annotation Span | **Not yet** |

### How parity is verified

The Java unit suite ports the Node reference suite's scenarios for parse, `@` / `!` / `=`
addressing, the eight compatibility fixes, the encode option matrix, merge / inject, checkpoint
phasing, and **stream** (`StreamTest` · `StreamConsistencyTest` · `StreamHttpTest`: phase Diff, window merge, asyncParse, busy/abort, promise/events, UTF-8 splits, HTTP/SSE smoke, one-shot identity), plus a seeded random JSON corpus and a chunked replay of
[../../examples/complex.xaiop](../../examples/complex.xaiop). Float tokens follow the ECMAScript
`Number::toString` surface exactly — the shortest decimal that round-trips, on any JDK — so encode
output for the shared fixtures is byte-for-byte what Node emits.

That parity is asserted by Java-side tests against expectations transcribed from the Node suite.
There is **no automated Node↔Java golden comparison in CI**, so treat the claim as "verified by the
ported suite" rather than "continuously diffed". Divergence outside the ported scenarios is
possible; report it against [../behavioral-contract.md](../behavioral-contract.md).

---

## Java idioms

The port keeps observable semantics, not JavaScript shapes.

| Node.js | Java |
| --- | --- |
| `async` first, `*Sync` mirrors | **Sync first**; `Parse.parseAsync` / `Encode.encodeAsync` return `CompletableFuture`, and `DotCheckpointEngine` adds real (coalescing) `pushAsync` / `finishAsync` |
| Plain objects / arrays | `LinkedHashMap<String,Object>` / `ArrayList<Object>` trees; scalars are `String`, `Integer` / `Long` / `Double`, `Boolean`, `null` |
| `undefined` vs `null` | Java has **no `undefined`** — only `null` exists, so `undefinedPolicy` is inert (kept for option-table parity) |
| String unions (`root`, `style`, `keyOrder`, `nullPolicy`) | Enums on `EncodeOptions` |
| `DOT_POLICY` constants | `DotPolicy` **string** constants (the option doubles as a path array) |
| Options objects | Immutable builders (`EncodeOptions.builder()`, `MergeOptions.builder()`, `DotCheckpointEngine.Options`) |
| Eight `setCompat*` setters | One `setCompatFix(CompatFixId, boolean)` — same contract: returns `false` and changes nothing while compatibility mode is off |
| Top-level `LiveXaiopParser` / `materializeSnapshot` | `Parse.LiveXaiopParser` / `io.xaiop.stream.Materialize.materializeSnapshot` |
| One `number` type | `Integer` / `Long` for integer tokens (widening as needed), `Double` for float tokens — compare with `Number#doubleValue()` when a value may cross that line |
| `throw new TypeError(...)` | `IllegalArgumentException` / `NullPointerException`; protocol errors stay `XaiopSyntaxError` / `XaiopEncodeError` (both unchecked) |

---

## Quick start

```xml
<dependency>
  <groupId>io.xaiop</groupId>
  <artifactId>xaiop</artifactId>
  <version>0.5.0</version>
</dependency>
```

```java
import io.xaiop.*;
import io.xaiop.stream.*;

Object json = Xaiop.parse(">\n>meta\nname:demo\n");   // LinkedHashMap tree
String wire = Xaiop.encode(json);                      // one `.` phase per top-level key

XaiopEngine engine = new XaiopEngine();
String id = engine.uploadSync(wire);
Object stored = engine.getSync(id);
```

### Encode

```java
String single = Encode.encode(value, EncodeOptions.singlePhase());          // dotPolicy: none

String phased = Encode.encode(value, EncodeOptions.builder()
    .dotPolicy(DotPolicy.PER_N_KEYS)
    .phaseEvery(2)
    .maxPhases(4)                    // cap the phase count; the tail merges into the last phase
    .keyOrder(EncodeOptions.KeyOrder.SORTED)
    .build());

String custom = Encode.encode(value, EncodeOptions.builder()
    .dotPolicy(DotPolicy.CUSTOM)     // requires shouldPhase, else XaiopEncodeError
    .shouldPhase(ctx -> ctx.keysInPhase() >= 2)
    .build());

String cut = Encode.encode(value, EncodeOptions.builder()
    .dotPolicyPaths(List.of("meta", "items[2]"))                            // phase after each path
    .build());
```

### Streaming consumer (`XaiopStream`)

Aligns with Node `XaiopStream` as a **consumer**: status machine
`idle → connecting → streaming → completing → completed` (plus `aborted` / `error`); defaults
`mergeChunkWindow=true`, `streamProcessing=true`.

```java
XaiopStream stream = Xaiop.stream("https://example.com/feed.xaiop");
stream.onChunk(diff -> { /* phase Diff; empty phase → null */ });
stream.onDone(snapshot -> { /* full-buffer Snapshot */ });
stream.onError(err -> { /* ... */ });
stream.send(new XaiopStream.SendOptions().transport(TransportKind.HTTP));

// Tests / local: RAW chunks
stream.sendRaw(List.of(">\na:1\n.\n", ">b\nc:2\n.\n"));

// Promise mode
XaiopStream once = new XaiopStream("raw://x",
    XaiopStream.Options.defaults().modes(StreamMode.PROMISE));
Object jsonDone = once.send(new XaiopStream.SendOptions()
    .transport(TransportKind.RAW)
    .source(List.of(">\nz:9\n.\n"))).get();
```

| Transport | Notes |
| --- | --- |
| `HTTP` | `java.net.http.HttpClient` streaming body (default) |
| `SSE` | `Accept: text/event-stream`; multi-line `data:` joined with `\n`; trailing newline appended so phases do not glue |
| `RAW` | `Iterable` of `CharSequence`/`byte[]`, or `InputStream` (UTF-8 across reads) |

**Not included:** WebSocket consume / listen·hub, `cover`, typeCheck, line intercept, Annotation Span.

| Option | Default | Notes |
| --- | --- | --- |
| `root` | `AUTO` | `ARRAY` requires a `List`, `OBJECT` a `Map` |
| `style` | `RESET` | `RELATIVE` only changes anything with `dotPolicy = none` (a phase always resets the Cursor); a path array requires `RESET` |
| `dotPolicy` | `PER_TOP_LEVEL_KEY` | or `NONE` / `PER_N_KEYS` / `CUSTOM`, or `dotPolicyPaths(...)` |
| `phaseEvery` | `1` | only read by `PER_N_KEYS` |
| `maxPhases` | unset | caps the phase count; surplus phases merge into the last one |
| `shouldPhase` | unset | required by `CUSTOM`; gets `PhaseContext(key, index, total, keysInPhase, phaseIndex)` and is never asked about the final key |
| `finalDot` | `false` | appends a trailing `.` |
| `keyOrder` | `INSERTION` | or `SORTED` |
| `nullPolicy` | `ENCODE` | `OMIT` drops null object keys (array elements still emit a typed null so indices hold); `ERROR` throws |
| `undefinedPolicy` | `OMIT` | inert in Java — kept only so cross-SDK option tables line up |

`dotPolicyPaths` is mutually exclusive with `phaseEvery`, `maxPhases` and `shouldPhase`, rejects
duplicates and paths that do not exist in the value, and refuses to cut inside an array element
object (an index must be the final segment).

Rejected keys (empty, whitespace, `:`, trailing `-`, `>` `<` `=` `!`), CR/LF in strings,
**strings beginning with U+0020 SPACE** (forced-string markers after `:` are not payload),
non-finite numbers and unsupported value types throw `XaiopEncodeError`. `getPath()` returns the JSON path of
the offending node (e.g. `$.ok.bad`) for those **value- and key-level** failures; it is `null` for
**option-level** failures such as a bad `phaseEvery`, which are not tied to a node.

### Merge / inject

```java
Object merged = Merge.mergeJson(base, overlay, MergeConflict.KEEP);   // keys only; arrays atomic
Object json   = Merge.mergeToJson(base, xaiopSource);
String wire   = Merge.mergeToXaiop(base, xaiopSource);                // single phase by default

engine.injectXaiopSync(id, ">\nb:2\n");
engine.injectJsonSync(id, Map.of("a", 9), MergeOptions.builder().as(MergeOptions.As.XAIOP).build());
```

### Checkpoint stream

```java
try (DotCheckpointEngine cp = Xaiop.checkpoint(diff -> render(diff))) {
  cp.push(">\na:1\n.\n>\nb:2\n.\n");   // one Diff: both phases share this buffer window
  cp.finish();
  Object full = cp.snapshot();          // {a=1, b=2}
}
```

`mergeChunkWindow` defaults to **true**: every complete `.` present in the buffer when a push is
scanned collapses into one feed, one Commit and one `onChunk`. So the number of Diffs tracks how
the bytes arrived, not how many phases the document has — the push above yields a single
`{a=1, b=2}` chunk, not one per phase. Set `mergeChunkWindow(false)` for a Diff per `.`:

```java
DotCheckpointEngine cp = DotCheckpointEngine.Options.of(diff -> render(diff))
    .mergeChunkWindow(false)     // stepwise: {a=1} then {b=2}
    .emitDiff(false)             // skip the Diff parse entirely; onChunk always gets null
    .streamProcessing(false)     // defer everything to finish(): exactly one whole-document chunk
    .compat(true)                // compatibility fixes for the incoming wire
    .build();
```

Diff is the phase document (the later-wins unit); `committedSnapshot()` is the cumulative tree up
to `committedAt()`, and `snapshot()` is only set at `finish()`. A phase containing `=` or `!`
reaches back across earlier phases, so its Diff is the cumulative tree rather than a phase-local
one. An empty phase yields a `null` chunk. Diffs handed to `onChunk` are never aliased by the
Commit, so a callback may retain or mutate them freely. `pushAsync` / `finishAsync` append
immediately and coalesce the scan onto one daemon thread, so a burst of pushes shares one drain.

### Incremental parsing without the checkpoint engine

`Parse.LiveXaiopParser` keeps one live tree across feeds and is observationally equivalent to
`Parse.parse` over the concatenation of everything fed — that is what the checkpoint engine uses
internally to avoid re-parsing the growing prefix.

```java
Parse.LiveXaiopParser live = new Parse.LiveXaiopParser();   // or (true) / (CompatPolicy) / (overrides)
live.feedLine(">");              // one complete logical line, no trailing newline
live.feedText(">a\nx:1\n");      // or a block, split exactly like Parse.parse
Object tree = Materialize.materializeSnapshot(live.value());
```

`value()` returns the **live** tree: further feeds mutate it. `Materialize.materializeSnapshot`
deep-clones it into a JSON-facing snapshot and unwraps a root `XaiopFragment` to its entries — use
it for anything you retain. `Materialize.materializeOwned` skips the clone for a plain root and is
only safe when the parser will not be reused.

---

## Errors

| Condition | Type |
| --- | --- |
| Invalid wire | `XaiopSyntaxError` (`getLine()`) |
| Invalid encode input | `XaiopEncodeError` (`getPath()` = the offending node) |
| Invalid encode options | `XaiopEncodeError` (`getPath()` is `null`) |
| Unknown data id, bad argument | `IllegalArgumentException` / `NullPointerException` |
| Push after `finish` | `IllegalStateException` |

All of these are unchecked, so call sites mirror the JavaScript throw-anywhere behaviour.

---

## Build

```bash
cd xaiop-sdk/java
mvn test                  # 221 tests
mvn -DskipTests package   # target/xaiop-0.5.0.jar
mvn test                  # includes StreamTest / StreamConsistencyTest / StreamHttpTest
```
