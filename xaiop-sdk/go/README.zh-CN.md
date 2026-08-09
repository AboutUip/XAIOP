# XAIOP Go SDK

官方 Go 产品端口（模块 **0.15.1**，协议 **0.6.0** Frozen）。

指南：[../../docs/sdk/go/README.zh-CN.md](../../docs/sdk/go/README.zh-CN.md) · [ALIGNMENT](../../docs/sdk/go/ALIGNMENT.zh-CN.md) · [API](../../docs/sdk/go/API.zh-CN.md)

| 项 | 状态 |
| --- | --- |
| `ProtocolVersion` | **0.6.0** |
| `SDKVersion` | **0.15.1** |
| 产品面 | 与 Node tip **已对齐**（无 browser） |
| 验证 | `go test ./...` · `golden:go`（**50**）· `core-wire`（**46**）· fuzz · `bench:go` · `bench:go:json-gate` |

计时枢纽：[../../docs/performance.zh-CN.md](../../docs/performance.zh-CN.md)。极限性能 tip（**2026-08-09**）：[../../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](../../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)。

```bash
cd xaiop-sdk/go && go test ./...
cd ../conformance && npm run golden:go && npm run core-wire
```
