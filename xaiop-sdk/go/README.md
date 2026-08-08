# XAIOP Go SDK

Module for the **core protocol track** (wire **v0.6.0 Frozen**, STRICT).

Guide: [../../docs/sdk/go/README.md](../../docs/sdk/go/README.md) · Simplified Chinese: [../../docs/sdk/go/README.zh-CN.md](../../docs/sdk/go/README.zh-CN.md)  
Scope map: [../../docs/sdk/go/ALIGNMENT.md](../../docs/sdk/go/ALIGNMENT.md) · Track: [../../docs/sdk/notes/core-sdk-track.md](../../docs/sdk/notes/core-sdk-track.md)

## Status

| Item | State |
| --- | --- |
| Layout / module | **Active** |
| `ProtocolVersion` | **0.6.0** |
| `SDKVersion` | **0.6.0-alpha.2** |
| Parse / Encode / Live / Materialize | **Implemented** (STRICT) |
| Fuzz | Native `FuzzParse` / `FuzzLiveFeed` + `cmd/fuzz-go` |
| Product surface (stream · WS · control · ...) | **Out of scope** |

Aligned peer: [../python/](../python/). Corpus: [../conformance/core-wire/](../conformance/core-wire/).

## Test

```bash
cd xaiop-sdk/go
go test ./...
go run ./cmd/fuzz-go -max=100 -seed=1
```

## Cross-check (Python ↔ Go)

```bash
cd ../conformance
npm run core-wire
```

## Layout

```text
go.mod
xaiop/                    # parse · encode · live · materialize · fuzz_test
cmd/dump-core-wire/       # NDJSON dump for CI compare
cmd/fuzz-go/              # budgeted mutation fuzz (CI)
```
