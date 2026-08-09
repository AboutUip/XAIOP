# XAIOP Go SDK

Official product Go port (`xaiop` module **0.15.1**, protocol **0.6.0** Frozen).

Guide: [../../docs/sdk/go/README.md](../../docs/sdk/go/README.md) · [ALIGNMENT](../../docs/sdk/go/ALIGNMENT.md) · [API](../../docs/sdk/go/API.md)

## Status

| Item | State |
| --- | --- |
| `ProtocolVersion` | **0.6.0** |
| `SDKVersion` | **0.15.1** |
| Product surface | **Aligned** with Node tip (no browser) |
| Verify | `go test ./...` · `npm run golden:go` (**50**) · `npm run core-wire` (**46**) · fuzz · `npm run bench:go` · `npm run bench:go:json-gate` |

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
