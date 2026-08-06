# Release notes — 2026-08-06 · Java SDK 0.15.1

[English](release-notes-2026-08-06-java-0.15.1.md) · [简体中文](release-notes-2026-08-06-java-0.15.1.zh-CN.md)

| Field | Value |
| --- | --- |
| Java `io.xaiop:xaiop` | **0.15.1** |
| Protocol | **0.6.0** Frozen |
| Reference | Node.js `xaiop` **0.15.1** |

## Summary

Closes the remaining stream-consumer gap vs Node: `XaiopStream` now wires the same product options already present on `DotCheckpointEngine` / `XaiopWs`.

- Options: `cover`, history*, `typeCheck`/`typeSchema`, line intercept, Annotation Span, control `session` / callbacks
- Ingest: `ControlPlaneHost` demux → remaining wire → checkpoint
- `chunks()` blocking pull for `ASYNC_ITERATOR` mode
- Session helpers + `bufferStats` / `compactCommitted` / `jumpTo` on the stream surface
- `StreamAdvancedTest` covers the wired path

Suggested Git tag: `sdk-java-v0.15.1`
