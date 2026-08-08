# XAIOP Go SDK API

[English](API.md) · [简体中文](API.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 模块 | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| SDK | **0.15.1** |
| 协议 | **0.6.0** Frozen |
| 对等 | [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) |

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
```

## 核心

| API | 说明 |
| --- | --- |
| `ProtocolVersion` / `SDKVersion` | `"0.6.0"` / `"0.15.1"` |
| `Parse` | 仅 STRICT |
| `ParseWithOptions` | Compat ×8（`compat.Resolve`）· `SymbolKeys` |
| `Encode` / `EncodeOptions` | 产品默认；ES 浮点线文 |
| `MergeJSON` / `Engine` | 离线合并 / 存储 |
| `PhaseEncodeJSON` / `PhaseEncodeKeyValue` | 相位推送 |

## 子包

| 包 | 职责 |
| --- | --- |
| `xaiop/compat` | CompatPolicy ×8 |
| `xaiop/stream` | Checkpoint · History · XaiopStream |
| `xaiop/control` | 控制根 `#!` |
| `xaiop/types` | typeCheck / freeze |
| `xaiop/ws` | Listen / Connect |

## 验证

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go   # Node↔Go · 50 例
cd xaiop-sdk/conformance && npm run core-wire   # Python↔Go · 46 例
```

叙事参考仍以 Node API 为准：[../nodejs/API.zh-CN.md](../nodejs/API.zh-CN.md)。完整表见英文 [API.md](API.md)。
