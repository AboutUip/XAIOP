# XAIOP Java SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Artifact | `io.xaiop:xaiop` **0.15.1** (JAR) |
| Protocol | v0.6.0 Frozen (`Xaiop.PROTOCOL_VERSION`) |
| SDK version constant | `Xaiop.SDK_VERSION` = `0.15.1` |
| Runtime | Java 17+ (zero runtime dependencies) |
| Code | [../../../xaiop-sdk/java/](../../../xaiop-sdk/java/) |

This package tracks the Node.js reference (`xaiop` **0.15.1** ↔ protocol **0.6.0**) at the
**observable-semantics** level. Pin the artifact version; read `Xaiop.PROTOCOL_VERSION` for the
wire version. Java has no `xaiop/browser` subpath — listen and connect share one JDK package.

**API reference (authoritative):** **[API.md](API.md)** — full surface (§0–§11): Parse · Encode · Engine · Stream · WS · Control · Compat · types · errors.  
**Parity matrix (Java ↔ Node):** **[ALIGNMENT.md](ALIGNMENT.md)** — feature table · idiom map · package map · test map · acceptable differences · §8 checklist.  
**Isolation:** Protocol = wire only · Practice = model & streaming transport · This package = APIs — [../../SEPARATION.md](../../SEPARATION.md).  
**Contract:** [../behavioral-contract.md](../behavioral-contract.md) (protocol conformant ≠ official-SDK-equivalent).  
**Reference implementation:** [Node.js](../nodejs/README.md) — the Java port tracks its observable semantics.

---

## Status

**Active** — Node-aligned full product surface (protocol **0.6.0**).

| Area | State |
| --- | --- |
| `Parse` / `Parse.LiveXaiopParser` / `XaiopFragment` | Done |
| `CompatPolicy` (8 fixes, individually toggleable) | Done |
| `Encode` (all `dotPolicy` modes incl. path arrays) | Done |
| `Merge` / inject (`overwrite` / `keep`) | Done |
| `&` delete · `#` annotation ignore | Done |
| `DotCheckpointEngine` (`.` Diff · cover · history · Diff isolation · `@` Diff · buffer compact) | Done |
| `XaiopStream` (HTTP / SSE / RAW / WebSocket; wires cover · history · typeCheck · intercept · annotationSpan · control demux · `chunks()`) | Done |
| typeCheck / TypeRegistry / TypeFreezeSession | Done |
| Line intercept · Annotation Span | Done |
| Control Root (`#!` session / ack / resume / snapshot / seq) | Done |
| `XaiopWs` listen + connect (zero-dep RFC6455 + JDK client) | Done |
| Phase encode · `symbolKeys` | Done |

Full matrix + acceptable differences: **[ALIGNMENT.md](ALIGNMENT.md)**.

### How parity is verified

The Java unit suite ports the Node reference suite's scenarios. Float tokens follow the ECMAScript
`Number::toString` surface exactly — the shortest decimal that round-trips, on any JDK — so encode
output for shared fixtures is byte-for-byte what Node emits. Assertions are Java-side expectations
transcribed from Node. **Node↔Java golden comparison also runs in CI** (encode / parse / stream Diff
NDJSON dumps under [`xaiop-sdk/conformance/`](../../../xaiop-sdk/conformance/); see
[`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) job `golden`). Claim strength:
"verified by the ported suite **and** continuously golden-diffed against Node in CI". Full map:
[ALIGNMENT.md §5–§7](ALIGNMENT.md#5-test-map-node--java).

| Area | Representative tests |
| --- | --- |
| Parse / fragment / live | `ParseTest` · `LiveParseTest` · `XaiopTest` |
| Compat ×8 | `CompatTest` |
| Encode / `symbolKeys` | `EncodeTest` · `EncodeRobustTest` · `SymbolKeysTest` |
| Merge / engine | `MergeTest` · `MergeRobustTest` · `EngineTest` |
| `@` / `!` / `&` / `#` | `BangAtTest` · `AmpDeleteTest` · `HashAnnotationTest` |
| Checkpoint (window · cover · history · Diff isolation · `@` Diff · compact) | `CheckpointTest` · `CheckpointRobustTest` · `HistoryTest` · `CheckpointDiffIsolationTest` · `CheckpointBufferCompactTest` |
| Stream (HTTP/SSE/RAW/WS · advanced options) | `StreamTest` · `StreamHttpTest` · `StreamConsistencyTest` · `StreamAdvancedTest` |
| typeCheck · intercept · Annotation Span | `TypeCheckTest` · `LineInterceptTest` · `AnnotationSpanTest` |
| Control Root · resume | `ControlPlaneTest` · `ControlResumeTest` |
| WebSocket · phase encode | `WsSessionTest` · `PhaseEncodeTest` |

Also: seeded random JSON corpus + chunked replay of [../../examples/complex.xaiop](../../examples/complex.xaiop).

---

## Layout

```text
io.xaiop/                 facade · Parse · Encode · Merge · Engine · options · errors
  compat/                 CompatPolicy · CompatFixId (×8)
  types/                  TYPE · TypeRegistry · TypeFreezeSession · XaiopTypeError
  control/                ControlDemux · ControlPlaneHost · ResumeWireLog · …
  stream/                 DotCheckpointEngine · ParseHistory · XaiopStream · LineIntercept
                          AnnotationSpan · PhaseEncode · Materialize · Transport
  ws/                     XaiopWs · XaiopWsConnection · XaiopWsHub · Rfc6455*
  internal/               Parser · Encoder · LabelEscape
```

---
## Java idioms

The port keeps observable semantics, not JavaScript shapes. See also [ALIGNMENT.md §3](ALIGNMENT.md#3-api-idiom-mapping-node--java).

| Node.js | Java |
| --- | --- |
| `async` first, `*Sync` mirrors | **Sync first**; `Parse.parseAsync` / `Encode.encodeAsync` return `CompletableFuture`, and `DotCheckpointEngine` adds real (coalescing) `pushAsync` / `finishAsync` |
| Plain objects / arrays | `LinkedHashMap<String,Object>` / `ArrayList<Object>` trees; scalars are `String`, `Integer` / `Long` / `Double`, `Boolean`, `null` |
| `undefined` vs `null` | Java has **no `undefined`** — only `null` exists, so `undefinedPolicy` is inert (kept for option-table parity) |
| Annotation Span keep (`return undefined`) | Return **`AnnotationSpan.KEEP`** (sentinel); `null` means drop / replace with null JSON |
| `for await (... of stream.chunks())` | Blocking **`ChunkPull`** / `for (Object d : stream.chunks())` |
| `AbortSignal` | `stream.abort()` · `SendOptions.timeoutMs` |
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
  <version>0.15.1</version>
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
`mergeChunkWindow=true`, `streamProcessing=true`. Options pass through to the per-`send`
`DotCheckpointEngine` and `ControlPlaneHost`: `cover`, `historySnapshot` / `historyRealtime`,
`typeCheck` / `typeSchema`, `lineIntercept`, `annotationSpan`, `session` / `autoAck`, and control
callbacks. Inbound text is control-demuxed before checkpoint push.

```java
XaiopStream stream = Xaiop.stream("https://example.com/feed.xaiop");
stream.onChunk(diff -> { /* phase Diff; empty phase → null */ });
stream.onChunkWithMeta((diff, meta) -> { /* optional ChunkMeta (seq / escapes) */ });
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

// Async-iterator pull (blocking ChunkPull; no extra deps)
XaiopStream pull = new XaiopStream("raw://x",
    XaiopStream.Options.defaults().modes(StreamMode.ASYNC_ITERATOR));
pull.sendRaw(List.of(">\na:1\n.\n"));
for (Object diff : pull.chunks()) { /* ... */ }
```

| Transport | Notes |
| --- | --- |
| `HTTP` | `java.net.http.HttpClient` streaming body (default) |
| `SSE` | `Accept: text/event-stream`; multi-line `data:` joined with `\n`; trailing newline appended so phases do not glue |
| `RAW` | `Iterable` of `CharSequence`/`byte[]`, or `InputStream` (UTF-8 across reads) |
| `WEBSOCKET` | Via `Transport` / `XaiopStream`; long-lived sessions prefer `XaiopWs` |

### WebSocket sessions (`XaiopWs`)

```java
import io.xaiop.ws.*;

XaiopWsHub hub = XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1")).join();
hub.onConnection(conn -> {
  conn.pushJson("title", "hello", false);
  conn.end();
});
XaiopWs.ConnectOptions opts = new XaiopWs.ConnectOptions();
opts.onPhase(diff -> { /* phase Diff */ });
XaiopWsConnection client = XaiopWs.connect(hub.url(), opts).join();
hub.close().join();
```

Zero runtime deps: listen uses a minimal RFC6455 `ServerSocket` stack; connect uses JDK
`HttpClient` WebSocket. Handlers must be registered in connect options (locked after open).
Phase push uses `PhaseEncode` (force `dotPolicy: none`; non-`final` appends `.\n`).

Advanced listen/connect options:

```java
// Subprotocol negotiation (no match → handshake 400)
XaiopWs.listen(new XaiopWsHub.ListenOptions()
    .port(0).host("127.0.0.1").protocols("xaiop-a"));
XaiopWs.connect(url, new XaiopWs.ConnectOptions().protocols("xaiop-b", "xaiop-a"));

// maxPayload (inbound frame limit; default 100 MiB)
XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).maxPayload(1 << 20));

// Attach to a pre-bound ServerSocket + path; same socket serves GET /health
ServerSocket ss = new ServerSocket();
ss.bind(new InetSocketAddress("127.0.0.1", 0));
XaiopWsHub hub = XaiopWs.listen(
    new XaiopWsHub.ListenOptions().serverSocket(ss).path("/xaiop")).join();
// hub.url() → ws://127.0.0.1:<port>/xaiop
```

JDK `com.sun.net.httpserver.HttpServer` attach is **not** supported (no raw-socket upgrade).
Use `serverSocket` + path multiplex instead of Node `listen({ server, path })`.

### Stream advanced options

```java
XaiopStream.Options opts = XaiopStream.Options.defaults()
    .cover(true)
    .historySnapshot(true)
    .historyRealtime(false)
    .typeCheck(true)
    .typeSchema(schema)          // CanonicalType / Map / surface string
    .session(true)               // or Map session-init
    .autoAck(true)
    .symbolKeys(false)
    .lineIntercept((line, ctx) -> line)           // return null to drop
    .annotationSpan((cap, view) -> AnnotationSpan.KEEP);  // KEEP ↔ Node undefined

XaiopStream stream = new XaiopStream("raw://x", opts);
stream.send(new XaiopStream.SendOptions()
    .transport(TransportKind.RAW)
    .source(List.of(">\na:1\n.\n"))
    .timeoutMs(15_000L));
stream.abort();   // AbortSignal equivalent
```

| Option | Default | Role |
| --- | --- | --- |
| `cover` | `false` | Cover Diff on consecutive `&` runs |
| `historySnapshot` / `historyRealtime` | `false` | Opt-in parse history |
| `typeCheck` / `typeSchema` | off | Freeze / registry checks (forced off while compat on) |
| `lineIntercept` | none | Per-line rewrite / drop before parse |
| `annotationSpan` | none | `#` span capture → JSON / `KEEP` / `null` |
| `session` / `autoAck` | off | Control Root demux + ack |
| `symbolKeys` | `false` | U+001F label-escape dialect |
| `modes` | callback | Also `PROMISE` · `ASYNC_ITERATOR` (`chunks()`) |

### Types (`io.xaiop.types`)

```java
import io.xaiop.types.*;

CanonicalType schema = Types.objectType(Map.of(
    "id", Types.TYPE.INT,
    "name", Types.TYPE.STRING));
TypeFreezeSession session = new TypeFreezeSession(schema);
session.observeTree(Map.of("id", 1, "name", "a"), true, List.of());
```

Canonical leaf kinds follow PROT-CONTENT (`int` · `float` · `bool` · `null` · `string`); structural `object` / `array`; meta `any`. Schema frames use `Types.TYPE_SCHEMA_FRAME_PREFIX` (`#!xaiop/types/v1`).

### Control Root (`io.xaiop.control`)

`ControlPlaneHost` demuxes `#!` frames (session / ack / resume / snapshot / seq / types) ahead of checkpoint ingest. Wire through `XaiopStream.Options.session(...)` / control callbacks, or host directly for custom transports. Resume replay uses `ResumeWireLog`.

### Encode options

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
mvn test                  # full suite incl. StreamAdvancedTest
mvn -DskipTests package   # target/xaiop-0.15.1.jar
mvn test                  # includes StreamTest / StreamConsistencyTest / StreamHttpTest / StreamAdvancedTest
```
