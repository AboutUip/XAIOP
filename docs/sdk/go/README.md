# XAIOP Go SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Module | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| Track | **Official product port** |
| Protocol | **0.7.0** Draft |
| SDK | **0.16.0** |
| Parity | [ALIGNMENT.md](ALIGNMENT.md) · [API.md](API.md) |

**Implemented:** Node-aligned product surface (parse · Compat ×8 · encode · merge · engine · stream · WS · control · typeCheck · intercept / Annotation Span · `symbolKeys`). **Out of scope:** browser (same as Java / Python).

## Install

Until this cut is tagged, last published module is `@v0.15.1`. This tree is **0.16.0**.

```bash
go get github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.16.0
```

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"

v, err := xaiop.Parse(source)
wire, err := xaiop.Encode(v, xaiop.EncodeOptions{TrailingNewline: true})
```

Module: last tagged [pkg.go.dev@v0.15.1](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1). Intended tag: `xaiop-sdk/go/v0.16.0`.

## Verify

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go && npm run core-wire
```

| Gate | Result |
| --- | --- |
| `go test ./...` | Package parity (Compat · delete/bang/at/hash · encode/merge · stream · control · WS) |
| `golden:go` | Node ↔ Go product NDJSON — **60** cases |
| `core-wire` | Python ↔ Go STRICT — **152** cases |
| `bench:go` | Stage timing (same names as Node/Python/Java) — [`timing/go`](../../../xaiop-sdk/timing/go/) |
| `bench:go:json-gate` | Parse ↔ JSON gate — see [ALIGNMENT.md](ALIGNMENT.md) §5 |

Hub: [../../performance.md](../../performance.md). Extreme-perf tip (**2026-08-09**): [../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md). Release: [../../meta/release-notes-2026-08-08-go-0.15.1.md](../../meta/release-notes-2026-08-08-go-0.15.1.md) · Demo: [../../../demos/go/](../../../demos/go/)
