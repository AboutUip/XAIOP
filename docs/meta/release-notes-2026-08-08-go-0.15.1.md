# Release notes — 2026-08-08 · Go SDK 0.15.1

[English](release-notes-2026-08-08-go-0.15.1.md) · [简体中文](release-notes-2026-08-08-go-0.15.1.zh-CN.md)

| Field | Value |
| --- | --- |
| Go module | **0.15.1** |
| Protocol | **0.6.0** Frozen |
| Reference | Node.js `xaiop` **0.15.1** · Java · Python |
| Type | Stable official port (exit alpha / leave core-only track) |

## Summary

Promotes Go from core-wire **`0.6.0-alpha.*`** / development **`0.15.0-alpha.1`** to stable official product SDK **`0.15.1`**, aligned with Node tip at observable-semantics level.

Parity matrix: [../sdk/go/ALIGNMENT.md](../sdk/go/ALIGNMENT.md)

## Highlights

- Product surface: Compat ×8 (ingest wired) · Encode (dotPolicy / path cuts / ES floats) · Merge · Engine · Checkpoint Diff · History · Stream (HTTP/SSE/RAW) · Control Root · typeCheck · intercept / Annotation Span · phase encode · `symbolKeys` · XaiopWs
- Cross-validation: Node↔Go product golden **50** NDJSON (encode **30** + parse/stream fixtures **10** each) · Python↔Go STRICT core-wire **46** · expanded Go package tests (Compat · `&`/`!`/`@`/`#` · D1/D2 · cover · framing · control · WS)
- CI: `go test ./...` · `golden-go` · `core-wire` · fuzz budget
- Docs: ALIGNMENT · API · track · conformance coverage
- No browser entry (same as Java / Python)

## Verify

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go && npm run core-wire
cd xaiop-sdk/go && go run ./cmd/fuzz-go -max=100 -seed=1
```

## Suggested tag

`sdk-go-v0.15.1`
