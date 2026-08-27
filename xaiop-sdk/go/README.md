# XAIOP Go SDK

Official product Go port (`xaiop` module **0.16.0**, protocol **0.7.0** Draft).

Guide: [../../docs/sdk/go/README.md](../../docs/sdk/go/README.md) · [ALIGNMENT](../../docs/sdk/go/ALIGNMENT.md) · [API](../../docs/sdk/go/API.md)

## Install

Until tagged, last published module is `@v0.15.1`. This tree is **0.16.0**.

```bash
go get github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.16.0
```

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
```

Last tagged: [pkg.go.dev@v0.15.1](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1). Intended tag: `xaiop-sdk/go/v0.16.0`.

## Status

| Item | State |
| --- | --- |
| `ProtocolVersion` | **0.7.0** |
| `SDKVersion` | **0.16.0** |
| Product surface | **Aligned** with Node tip (no browser) |
| Verify | `go test ./...` · `npm run golden:go` (**60**) · `npm run core-wire` (**152**) · fuzz · `npm run bench:go` · `npm run bench:go:json-gate` |

Timing hub: [../../docs/performance.md](../../docs/performance.md). Extreme-perf tip (**2026-08-09**): [../../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md).

## Test

```bash
cd xaiop-sdk/go
go test ./...
go run ./cmd/fuzz-go -max=100 -seed=1

cd ../conformance
npm run golden:go
npm run core-wire
```

## Layout

```text
xaiop/                 # facade + wire + engine + phase encode
xaiop/compat|stream|control|types|ws/
cmd/dump-core-wire/    # STRICT corpus dump
cmd/dump-goldens/      # product golden dump (Node ↔ Go)
cmd/fuzz-go/
```
