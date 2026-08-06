# XAIOP Go SDK

[English](README.md) · Simplified Chinese: [README.zh-CN.md](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Module | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| Track | **Core protocol** (not full product SDK) |
| Protocol | **0.6.0** Frozen (`xaiop.ProtocolVersion`) |
| SDK | `0.6.0-alpha.1` (`xaiop.SDKVersion`) |
| Code | [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/) |

**Implemented:** STRICT `Parse` · `LiveParser` · `Encode` · `Materialize` · Fragment / Content / `&` `#` `.` `=` `@` `!`.  
**Out of scope:** Node/`0.15.1` product surface (stream · WS · history · Control Root · typeCheck · ...).

Peer: [../python/](../python/). Policy: [../notes/core-sdk-track.md](../notes/core-sdk-track.md).  
Fixtures: [../../../xaiop-sdk/conformance/core-wire/](../../../xaiop-sdk/conformance/core-wire/).

## Status

**Wire-complete** on the core-protocol track — protocol-conformant, not Node product parity.

## Public API

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"

v, err := xaiop.Parse(source)
wire, err := xaiop.Encode(v, xaiop.EncodeOptions{})
```

## Verify

```bash
cd xaiop-sdk/go && go test ./...
```

## Cross-check / CI

```bash
cd xaiop-sdk/conformance && npm run core-wire
```

CI jobs: see `.github/workflows/ci.yml` (`python` / `go` / `core-wire`).
