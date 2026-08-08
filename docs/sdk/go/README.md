# XAIOP Go SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Module | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| Track | **Official product port** |
| Protocol | **0.6.0** Frozen |
| SDK | **0.15.1** |
| Parity | [ALIGNMENT.md](ALIGNMENT.md) · [API.md](API.md) |

**Implemented:** Node-aligned product surface (parse · Compat ×8 · encode · merge · engine · stream · WS · control · typeCheck · intercept / Annotation Span · `symbolKeys`). **Out of scope:** browser (same as Java / Python).

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"

v, err := xaiop.Parse(source)
wire, err := xaiop.Encode(v, xaiop.EncodeOptions{TrailingNewline: true})
```

## Verify

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go && npm run core-wire
```

| Gate | Result |
| --- | --- |
| `go test ./...` | Package parity (Compat · delete/bang/at/hash · encode/merge · stream · control · WS) |
| `golden:go` | Node ↔ Go product NDJSON — **50** cases |
| `core-wire` | Python ↔ Go STRICT — **46** cases |
| `bench:go` | Stage timing (same names as Node/Python/Java) — [`timing/go`](../../../xaiop-sdk/timing/go/) |

Release: [../../meta/release-notes-2026-08-08-go-0.15.1.md](../../meta/release-notes-2026-08-08-go-0.15.1.md) · Demo: [../../../demos/go/](../../../demos/go/)
