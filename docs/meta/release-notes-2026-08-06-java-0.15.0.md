# Release notes — 2026-08-06 · Java SDK 0.15.0

[English](release-notes-2026-08-06-java-0.15.0.md) · [简体中文](release-notes-2026-08-06-java-0.15.0.zh-CN.md)

| Field | Value |
| --- | --- |
| Java `io.xaiop:xaiop` | **0.15.0** |
| Protocol | **0.6.0** Frozen |
| Reference | Node.js `xaiop` **0.15.x** |

## Summary

Java SDK reaches **full observable-semantics parity** with the Node.js reference for the protocol **0.6.0** product surface (zero runtime dependencies, JDK 17+).

### Wire (0.4 → 0.6)

- `&path` delete (absolute / broadcast-relative; Cursor-chain protection)
- Standalone `#…` annotation lines ignored
- `cursorRestoreLines()` for cover-mode restore

### Checkpoint / stream product

- `cover` Diff tombstones
- Diff isolation after `.` + `@` cumulative Diff
- `ParseHistory` (`historySnapshot` / `historyRealtime`)
- `bufferStats` / `compactCommitted`
- Line intercept · Annotation Span
- Optional `onChunk` + phase / logSeq meta

### Types · Control · WebSocket

- `io.xaiop.types` — registry / freeze / typeCheck / schema frames
- `io.xaiop.control` — `#!` demux, session / ack / resume / snapshot / seq, `ResumeWireLog`, `ControlPlaneHost`
- `io.xaiop.ws` — `XaiopWs.listen` (RFC6455) + `XaiopWs.connect` (JDK HttpClient); `TransportKind.WEBSOCKET`

### Gaps vs Node (intentional)

- No `xaiop/browser` subpath (JDK-only)
- Listen does not attach to an existing `HttpServer`; no `perMessageDeflate` / subprotocol negotiation surface
- No automated Node↔Java CI golden byte-diff (ported JUnit suite)

## Build

```bash
cd xaiop-sdk/java
mvn test
mvn -DskipTests package   # → target/xaiop-0.15.0.jar
```

Suggested Git tag: `sdk-java-v0.15.0`
