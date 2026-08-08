# 核心协议 SDK 轨 · Go 已晋级

[English](core-sdk-track.md) · [简体中文](core-sdk-track.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 状态 | **Go 为官方产品 SDK**（**0.15.1**）；**Python 为官方产品 SDK** |
| 线文目标 | Frozen 协议 **0.6.0** |

**Python** 与 **Go** 均为官方产品端口（SDK **0.15.1**）。  
STRICT core-wire（**46** 例）仍作协议回归门禁；产品对等用 `npm run golden:go` / `golden:python`（各 **50** NDJSON）。

| 项 | 值 |
| --- | --- |
| Go 代码 | [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/) |
| 对等矩阵 | [../go/ALIGNMENT.zh-CN.md](../go/ALIGNMENT.zh-CN.md) |
| 验证 | `go test ./...` · `golden:go`（**50**）· `core-wire`（**46**）· fuzz |

详见英文 [core-sdk-track.md](core-sdk-track.md)。
