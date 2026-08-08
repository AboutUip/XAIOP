# XAIOP Go SDK API

[English](API.md) · [简体中文](API.zh-CN.md)

| Field | Value |
| --- | --- |
| Module | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| SDK | **0.15.1** |
| Protocol | **0.6.0** Frozen |
| Parity | [ALIGNMENT.md](ALIGNMENT.md) |

Import the facade:

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
```

## Core

| API | Notes |
| --- | --- |
| `ProtocolVersion` / `SDKVersion` | `"0.6.0"` / `"0.15.1"` |
| `Parse` | STRICT ingest only |
| `ParseWithOptions` | `Compat` from `compat.Resolve` (×8 fixes) · `SymbolKeys` U+001F decode |
| `ParseCompat` | Convenience: `ParseWithOptions` + `compat.Resolve(arg)` |
| `Encode` / `EncodeOptions` | Product defaults: `style=reset`, `dotPolicy=perTopLevelKey`; ES float tokens |
| `LiveParser` | Incremental feed (STRICT live) |
| `Materialize` / `MaterializeSnapshot` | Fragment → entries |
| `MergeJSON` / `MergeToJSON` / `MergeToXAIOP` | Offline merge |
| `Engine` | Upload / Get / InjectJSON / InjectXAIOP · CompatMode setters |
| `PhaseEncodeJSON` / `PhaseEncodeKeyValue` | Skeleton phase push |
| `AnnotationSpanKeep` | Span keep sentinel |
| `EncodeWireLabel` / `DecodeWireLabel` / `KeyNeedsSymbolEscape` | `symbolKeys` helpers |

## Subpackages

| Package | Role |
| --- | --- |
| `xaiop/compat` | CompatPolicy ×8 IDs / defaults / `Resolve` |
| `xaiop/stream` | DotCheckpointEngine · ParseHistory · XaiopStream · Annotation Span |
| `xaiop/control` | Control Root `#!` demux / ingest / resume log |
| `xaiop/types` | TypeRegistry / typeCheck / freeze |
| `xaiop/ws` | Listen / Connect (stdlib RFC6455 subset) |

## Verification

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go   # Node↔Go · 50 product cases
cd xaiop-sdk/conformance && npm run core-wire   # Python↔Go · 46 STRICT cases
```

English Node API remains the narrative reference: [../nodejs/API.md](../nodejs/API.md).
