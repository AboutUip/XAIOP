# XAIOP Java SDK

Maven project producing a publishable **JAR** (`io.xaiop:xaiop` **0.15.1**) for XAIOP protocol **v0.6.0 Frozen**, aligned with the Node.js reference (`xaiop` **0.15.1**).

Guide: [../../docs/sdk/java/README.md](../../docs/sdk/java/README.md) · 简体中文: [../../docs/sdk/java/README.zh-CN.md](../../docs/sdk/java/README.zh-CN.md)  
**Parity matrix:** [../../docs/sdk/java/ALIGNMENT.md](../../docs/sdk/java/ALIGNMENT.md) · [中文](../../docs/sdk/java/ALIGNMENT.zh-CN.md)  
Behavioral contract: [../../docs/sdk/behavioral-contract.md](../../docs/sdk/behavioral-contract.md)

## Status

**Active** — full Node-aligned product surface (zero runtime dependencies, JDK 17+):

| Area | State |
| --- | --- |
| Parse / Encode / Merge / Engine / Compat×8 | Done |
| `&` delete · `#` annotation ignore (protocol **0.6.0**) | Done |
| `DotCheckpointEngine` (cover · history · Diff isolation · `@` Diff · buffer compact) | Done |
| `XaiopStream` (HTTP / SSE / RAW / WebSocket; cover · history · typeCheck · intercept · Annotation Span · control · `chunks()`) | Done |
| typeCheck / TypeRegistry / freeze | Done |
| Line intercept · Annotation Span | Done |
| Control Root (`#!` session / ack / resume / snapshot / seq) | Done |
| `XaiopWs` listen + connect (RFC6455 server + JDK HttpClient client) | Done |
| Phase encode · `symbolKeys` | Done |

Parity is asserted by a JUnit suite that ports Node reference scenarios. Encode output is
byte-identical to Node's for shared fixtures (ECMAScript `Number::toString` float surface).
There is no automated Node↔Java golden comparison in CI. See
[ALIGNMENT.md](../../docs/sdk/java/ALIGNMENT.md) and
[How parity is verified](../../docs/sdk/java/README.md#how-parity-is-verified).

**Note:** Java has no browser subpath (unlike `xaiop/browser`); listen and connect share one JDK package.

### Test inventory (ported suite)

| Area | Classes |
| --- | --- |
| Core | `ParseTest` · `LiveParseTest` · `XaiopTest` · `CompatTest` · `EncodeTest` · `EncodeRobustTest` · `MergeTest` · `MergeRobustTest` · `EngineTest` · `SymbolKeysTest` |
| Protocol ops | `BangAtTest` · `AmpDeleteTest` · `HashAnnotationTest` |
| Checkpoint | `CheckpointTest` · `CheckpointRobustTest` · `HistoryTest` · `CheckpointDiffIsolationTest` · `CheckpointBufferCompactTest` |
| Stream | `StreamTest` · `StreamHttpTest` · `StreamConsistencyTest` · `StreamAdvancedTest` · `StreamControlTest` |
| Advanced | `TypeCheckTest` · `WsTypeCheckTest` · `LineInterceptTest` · `AnnotationSpanTest` · `ControlPlaneTest` · `ControlCoverageTest` · `ControlResumeTest` · `WsSessionTest` · `WsDeepTest` · `PhaseEncodeTest` · `SdkSurfaceTest` |

## Build

```bash
mvn test                  # full suite
mvn -DskipTests package
```

Artifact: `target/xaiop-0.15.1.jar` · Requires JDK 17+.

## Layout

```text
src/main/java/io/xaiop/
  Xaiop.java             facade: parse · encode · merge · checkpoint · stream · ws
  Parse.java             parse / LiveXaiopParser (+ cursorRestoreLines)
  Encode.java / Merge.java / XaiopEngine.java / …
  types/                 TYPE · TypeRegistry · TypeFreezeSession · XaiopTypeError
  control/               ControlDemux · ControlPlaneHost · ResumeWireLog · …
  stream/                DotCheckpointEngine · ParseHistory · XaiopStream · LineIntercept
                         AnnotationSpan · PhaseEncode · Materialize · Transport · …
  ws/                    XaiopWs · XaiopWsConnection · XaiopWsHub · Rfc6455*
  compat/ · internal/
```

## Minimal examples

```java
import io.xaiop.Xaiop;
import io.xaiop.stream.*;

// Stream consumer (RAW)
XaiopStream s = Xaiop.stream("raw://demo");
s.onChunk(diff -> System.out.println("diff=" + diff));
s.onDone(snap -> System.out.println("done=" + snap));
s.sendRaw(java.util.List.of(">\na:1\n.\n", ">b\nc:2\n.\n"));
```

```java
import io.xaiop.ws.*;

// WebSocket listen + connect
XaiopWsHub hub = XaiopWs.listen(new XaiopWsHub.ListenOptions().port(0).host("127.0.0.1")).join();
hub.onConnection(conn -> {
  conn.pushJson("title", "hello", false);
  conn.end();
});
XaiopWs.ConnectOptions opts = new XaiopWs.ConnectOptions();
opts.onPhase(diff -> System.out.println(diff));
XaiopWsConnection client = XaiopWs.connect(hub.url(), opts).join();
hub.close().join();
```

Advanced WS options: `ListenOptions.protocols` / `maxPayload` / `serverSocket` / `path` (same-port
`GET /health` multiplex); `ConnectOptions.protocols`. JDK `HttpServer` attach is not supported —
use `serverSocket` instead of Node `listen({ server })`. See
[ALIGNMENT.md](../../docs/sdk/java/ALIGNMENT.md) §6.
