# Core protocol SDK track · Go promoted

[English](core-sdk-track.md) · Simplified Chinese: [core-sdk-track.zh-CN.md](core-sdk-track.zh-CN.md)

| Field | Value |
| --- | --- |
| Document | Track policy |
| Wire target | Frozen protocol **0.6.0** |
| Status | **Go is an official product SDK** (SDK **0.15.1**); **Python is an official product SDK** |

## Purpose

**Python** and **Go** are official product ports (SDK **0.15.1**, protocol **0.6.0**).  
STRICT core-wire fixtures still gate Python ↔ Go wire dumps in CI as a protocol regression (**46** cases — not a substitute for product golden).

## Go (official)

| Item | Value |
| --- | --- |
| Code | [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/) |
| SDK | **0.15.1** |
| Scope map | [../go/ALIGNMENT.md](../go/ALIGNMENT.md) |
| Product golden | `npm run golden:go` — Node ↔ Go **50** NDJSON |
| STRICT gate | `npm run core-wire` — Python ↔ Go **46** |
| Verify | `go test ./...` · `golden:go` · `core-wire` · fuzz |

## Python (official)

See [../python/](../python/) and [../python/ALIGNMENT.md](../python/ALIGNMENT.md). Product golden: `npm run golden:python` (**50**).
