# XAIOP Go SDK API

[English](API.md) · [简体中文](API.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 模块 | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| SDK | **0.16.0** |
| 协议 | **0.7.0** Draft |
| 安装 | 打标签后 `go get …/xaiop-sdk/go@v0.16.0` · 上次标签 [pkg.go.dev@v0.15.1](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1) |
| 对等 | [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) |

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"
```

## 核心

| API | 说明 |
| --- | --- |
| `ProtocolVersion` / `SDKVersion` | `"0.7.0"` / `"0.16.0"` |
| `Parse` | 仅 STRICT |
| `ParseWithOptions` | Compat ×8（`compat.Resolve`）· `SymbolKeys` |
| `Encode` / `EncodeOptions` | 产品默认；ES 浮点线文。对应 Node `encodeSync`。**没有** `EncodeAsync`（CPU 绑定）。Label 安全 JSON 子集，不是完整 RFC 8259 键（`symbolKeys` 只逃逸行类首字符）。`ParseJSONPath` / `FormatJSONPath`：JSON 路径（`items[0]`）；线上 `@` 用 `>`（`@items>it_1`）。 |
| `LiveParser` | 增量 STRICT。`FeedLine` 吃完整逻辑行（`""` 语法错误）；encode 尾 `\n` 走 `FeedText` / `Parse`，不要 `strings.Split` 再喂最后一个空串 |
| `MergeJSON` / `Engine` | 离线合并 / 存储。overlay **单独** parse；`@` + `:value` 追加走 `LiveParser` / 拼接 parse，不是 inject |
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
cd xaiop-sdk/conformance && npm run golden:go   # Node↔Go · 60 例
cd xaiop-sdk/conformance && npm run core-wire   # Python↔Go · 152 例
```

叙事参考仍以 Node API 为准：[../nodejs/API.zh-CN.md](../nodejs/API.zh-CN.md)。完整表见英文 [API.md](API.md)。
