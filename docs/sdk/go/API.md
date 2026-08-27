# XAIOP Go SDK API

[English](API.md) · [简体中文](API.zh-CN.md)

| Field | Value |
| --- | --- |
| Module | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| SDK | **0.16.0** |
| Protocol | **0.7.0** Draft |
| Install | `go get …/xaiop-sdk/go@v0.16.0` after tag · last tagged [pkg.go.dev@v0.15.1](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1) |
| Parity | [ALIGNMENT.md](ALIGNMENT.md) |

Import the facade:

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
```

## Core

| API | Notes |
| --- | --- |
| `ProtocolVersion` / `SDKVersion` | `"0.7.0"` / `"0.16.0"` |
| `Parse` | STRICT ingest only |
| `ParseWithOptions` | `Compat` from `compat.Resolve` (×8 fixes) · `SymbolKeys` U+001F decode |
| `ParseCompat` | Convenience: `ParseWithOptions` + `compat.Resolve(arg)` |
| `Encode` / `EncodeOptions` | Product defaults: `style=reset`, `dotPolicy=perTopLevelKey`; ES float tokens. This is Node `encodeSync`. **No** `EncodeAsync` (CPU-bound). Label-safe JSON subset, not full RFC 8259 keys (`symbolKeys` = leading line-class only). `ParseJSONPath` / `FormatJSONPath`: JSON-path (`items[0]`); wire `@` uses `>` (`@items>it_1`). |
| `LiveParser` | Incremental feed (STRICT live). `FeedLine` = complete logical line (`""` is a syntax error). Encode trailing `\n` → `FeedText` / `Parse`, not `strings.Split` + `FeedLine` on the last empty |
| `Materialize` / `MaterializeSnapshot` | Fragment → entries |
| `MergeJSON` / `MergeToJSON` / `MergeToXAIOP` | Offline merge. Overlay parsed **alone**; `@` + `:value` append is `LiveParser` / concat parse, not merge/inject |
| `Engine` | Upload / Get / InjectJSON / InjectXAIOP · CompatMode setters. Inject = merge, not live feed |
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
cd xaiop-sdk/conformance && npm run golden:go   # Node↔Go · 60 product cases
cd xaiop-sdk/conformance && npm run core-wire   # Python↔Go · 152 STRICT cases
```

English Node API remains the narrative reference: [../nodejs/API.md](../nodejs/API.md).
