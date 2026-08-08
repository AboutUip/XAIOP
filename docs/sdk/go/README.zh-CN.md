# XAIOP Go SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Module | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| 轨道 | **核心协议**（非完整产品 SDK） |
| 协议 | **0.6.0** Frozen（`xaiop.ProtocolVersion`） |
| SDK | `0.6.0-alpha.2`（`xaiop.SDKVersion`） |
| 代码 | [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/) |
| 范围图 | [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) |

**已实现：** STRICT `Parse` · `LiveParser` · `Encode` · `Materialize` · Fragment / Content / `&` `#` `.` `=` `@` `!`。  
**不在范围：** Node/`0.15.1` 产品面（stream · WS · history · Control Root · typeCheck · ...）。

同伴：[../python/](../python/)。策略：[../notes/core-sdk-track.zh-CN.md](../notes/core-sdk-track.zh-CN.md)。  
Fixture：[../../../xaiop-sdk/conformance/core-wire/](../../../xaiop-sdk/conformance/core-wire/)。

## 状态

**线文完成**（核心协议轨）— 协议符合，非 Node 产品对等。  
**0.6.0-alpha.2：** 变异 + 原生 fuzz；扩展 core-wire 语料。

## 公共 API

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"

v, err := xaiop.Parse(source)
wire, err := xaiop.Encode(v, xaiop.EncodeOptions{})
```

## 验证

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/go && go run ./cmd/fuzz-go -max=100 -seed=1
```

## 交叉校验 / CI

```bash
cd xaiop-sdk/conformance && npm run core-wire
```

CI：.github/workflows/ci.yml（python / go / core-wire / fuzz）。
