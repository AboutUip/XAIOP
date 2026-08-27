# 核心协议 SDK 轨 · Go 已晋级

[English](core-sdk-track.md) · [简体中文](core-sdk-track.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 状态 | **Go 为官方产品 SDK**（**0.16.0**）；**Python 为官方产品 SDK** |
| 线文目标 | Draft 协议 **0.7.0** |

**Python** 与 **Go** 均为官方产品端口（SDK **0.16.0**）。  
STRICT core-wire（**152** 例）仍作协议回归门禁；产品对等用 `npm run golden:go` / `golden:python`（各 **60** NDJSON）。

| 项 | 值 |
| --- | --- |
| Go 代码 | [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/) |
| 对等矩阵 | [../go/ALIGNMENT.zh-CN.md](../go/ALIGNMENT.zh-CN.md) |
| 验证 | `go test ./...` · `golden:go`（**60**）· `core-wire`（**152**）· fuzz |

详见英文 [core-sdk-track.md](core-sdk-track.md)。
