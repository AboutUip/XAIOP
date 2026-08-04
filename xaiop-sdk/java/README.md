# XAIOP Java SDK

Maven project producing a publishable **JAR** (`io.xaiop:xaiop` **0.5.0**) for XAIOP protocol **v0.4.0 Frozen**, plus a Node-aligned **stream consumer**.

Guide: [../../docs/sdk/java/README.md](../../docs/sdk/java/README.md) · 简体中文: [../../docs/sdk/java/README.zh-CN.md](../../docs/sdk/java/README.zh-CN.md)  
Parity checklist: [../../docs/sdk/behavioral-contract.md](../../docs/sdk/behavioral-contract.md)

## Status

**Active** — `parse` · `encode` · `merge` · `checkpoint` · **`XaiopStream`** (HTTP / SSE / RAW consumer),
ported from the Node.js reference ([../nodejs/](../nodejs/)). **Not yet:** WebSocket listen/hub,
`cover`, typeCheck, line intercept, Annotation Span (protocol still **0.4.0**).

Parity is asserted by a JUnit suite that ports the Node reference scenarios (addressing,
compatibility fixes, encode option matrix, merge / inject, checkpoint phasing, stream lifecycle /
consistency / HTTP·SSE smoke, seeded random corpus). Encode output is byte-identical to Node's for
those fixtures — float tokens follow the ECMAScript `Number::toString` surface on any JDK — but
there is no automated Node↔Java golden comparison in CI. See
[../../docs/sdk/java/README.md](../../docs/sdk/java/README.md#how-parity-is-verified).

## Build

```bash
mvn test                  # full suite incl. Stream*
mvn -DskipTests package
```

Artifact: `target/xaiop-0.5.0.jar` · Requires JDK 17+.

## Layout

```text
src/main/java/io/xaiop/
  Xaiop.java             facade: parse · encode · merge · checkpoint · stream
  Parse.java             parse / parseAsync / LiveXaiopParser
  Encode.java            encode + JSON path helpers
  EncodeOptions.java     immutable builder (DotPolicy, root/style/keyOrder/nullPolicy)
  DotPolicy.java         none · perTopLevelKey · perNKeys · custom
  Merge.java             mergeJson · mergeToJson · mergeToXaiop · formatInjectResult
  MergeOptions.java      conflict · compat · encodeOptions · as
  MergeConflict.java     overwrite · keep
  XaiopEngine.java       in-memory store: upload / get / inject (sync-first)
  XaiopFragment.java     strict root-fragment parse result
  Json.java              deep clone + compact JSON encoding
  XaiopSyntaxError.java  parse error (line)
  XaiopEncodeError.java  encode error (path)
  compat/                CompatFixId · CompatPolicy · Compat
  internal/              Parser · Encoder (implementation detail, not API)
  stream/                DotCheckpointEngine · Materialize · XaiopStream · Transport · …
src/test/java/io/xaiop/
  Fixtures.java          shared builders + docs/examples/complex.* fixture
  ParseTest.java         wire → tree: typing, roots, fragments, named arrays
  BangAtTest.java        @path · !path broadcast · =path addressing
  CompatTest.java        the eight compatibility fixes, on and off
  EncodeTest.java        exact wire snapshots for the common options
  EncodeRobustTest.java  option matrix, rejection surface, float tokens, random corpus
  MergeTest.java         merge basics
  MergeRobustTest.java   conflicts, isolation, inject, cross-entry-point agreement
  CheckpointTest.java    phase batching basics
  CheckpointRobustTest.java  Diff/Commit isolation, async coalescing, CRLF
  LiveParseTest.java     LiveXaiopParser ≡ Parse.parse
  EngineTest.java        XaiopEngine store
  StreamTest.java        XaiopStream lifecycle / modes / RAW
  StreamConsistencyTest.java  framing ≡ one-shot; UTF-8; SSE block parse
  StreamHttpTest.java    HTTP body + SSE smoke (local HttpServer)
```

## Minimal stream example

```java
import io.xaiop.Xaiop;
import io.xaiop.stream.*;

XaiopStream s = Xaiop.stream("raw://demo");
s.onChunk(diff -> System.out.println("diff=" + diff));
s.onDone(snap -> System.out.println("done=" + snap));
s.sendRaw(java.util.List.of(">\na:1\n.\n", ">b\nc:2\n.\n"));
```
