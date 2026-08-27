# Core protocol SDK track · Go promoted

[English](core-sdk-track.md) · Simplified Chinese: [core-sdk-track.zh-CN.md](core-sdk-track.zh-CN.md)

| Field | Value |
| --- | --- |
| Document | Track policy |
| Wire target | Draft protocol **0.7.0** |
| Status | **Go is an official product SDK** (SDK **0.16.0**); **Python is an official product SDK** |

## Purpose

**Python** and **Go** are official product ports (SDK **0.16.0**, protocol **0.7.0** Draft).  
STRICT core-wire fixtures still gate Python ↔ Go wire dumps in CI as a protocol regression (**152** cases — not a substitute for product golden). Node / Java / Python / Go unit tests also load `cases.json`.

## Go (official)

| Item | Value |
| --- | --- |
| Code | [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/) |
| SDK | **0.16.0** |
| Scope map | [../go/ALIGNMENT.md](../go/ALIGNMENT.md) |
| Product golden | `npm run golden:go` — Node ↔ Go **60** NDJSON |
| STRICT gate | `npm run core-wire` — Python ↔ Go **152** |
| Verify | `go test ./...` · `golden:go` · `core-wire` · fuzz |

## Python (official)

See [../python/](../python/) and [../python/ALIGNMENT.md](../python/ALIGNMENT.md). Product golden: `npm run golden:python` (**60**).
