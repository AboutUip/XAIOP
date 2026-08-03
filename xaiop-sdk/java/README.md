# XAIOP Java SDK

Maven project producing a publishable **JAR** (`io.xaiop:xaiop`) for XAIOP protocol **v0.4.0 Frozen**.

Guide: [../../docs/sdk/java/README.md](../../docs/sdk/java/README.md) · 简体中文: [README.zh-CN.md](../../docs/sdk/java/README.zh-CN.md)  
Parity checklist: [../../docs/sdk/behavioral-contract.md](../../docs/sdk/behavioral-contract.md)

## Status

**Active** — `parse` · `encode` · `merge` · `checkpoint`, ported from the Node.js reference
([../nodejs/](../nodejs/)). The streaming **consumer** (`XaiopStream`) and **WebSocket** session
layer (`XaiopWs`) are not ported yet.

Parity is asserted by a JUnit suite that ports the Node reference scenarios (addressing,
compatibility fixes, encode option matrix, merge / inject, checkpoint phasing, seeded random
corpus). Encode output is byte-identical to Node's for those fixtures — float tokens follow the
ECMAScript `Number::toString` surface on any JDK — but there is no automated Node↔Java golden
comparison in CI. See [../../docs/sdk/java/README.md](../../docs/sdk/java/README.md#how-parity-is-verified).

## Build

```bash
mvn test                  # 221 tests
mvn -DskipTests package
```

Artifact: `target/xaiop-0.4.0.jar` · Requires JDK 17+.

## Layout

```text
src/main/java/io/xaiop/
  Xaiop.java             facade: parse · encode · merge · checkpoint
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
  stream/                DotCheckpointEngine · Materialize
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
  EngineTest.java        store, inject, compatibility plumbing
  XaiopTest.java         facade delegation
```

## Usage

```java
import io.xaiop.*;

String wire = Xaiop.encode(Map.of("meta", Map.of("name", "demo")));
Object json = Xaiop.parse(wire);

XaiopEngine engine = new XaiopEngine();
String id = engine.uploadJsonSync(json);
engine.injectXaiopSync(id, ">\nn:1\n");
```

Full option tables, Java-vs-Node idiom notes and streaming details:
[../../docs/sdk/java/README.md](../../docs/sdk/java/README.md).
