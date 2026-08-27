# XAIOP Go SDK

[English](README.md) · [简体中文](README.zh-CN.md)

官方产品端口：**0.15.1** · 协议 **0.7.0** Draft。对等矩阵：[ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) · API：[API.zh-CN.md](API.zh-CN.md)。

**已实现：** 与 Node tip 对齐的产品面（parse · Compat ×8 · encode · merge · engine · stream · WS · control · typeCheck · 拦截 / Annotation Span · `symbolKeys`）。**范围外：** browser（同 Java / Python）。

## 安装

```bash
go get github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1
```

```go
import "github.com/AboutUip/XAIOP/xaiop-sdk/go/xaiop"

v, err := xaiop.Parse(source)
wire, err := xaiop.Encode(v, xaiop.EncodeOptions{TrailingNewline: true})
```

模块：[pkg.go.dev](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1)。Git 标签：`xaiop-sdk/go/v0.15.1`。

## 验证

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go && npm run core-wire
```

| 门禁 | 结果 |
| --- | --- |
| `go test ./...` | 包级对等 |
| `golden:go` | Node ↔ Go 产品 NDJSON — **60** 例 |
| `core-wire` | Python ↔ Go STRICT — **152** 例 |
| `bench:go` | 阶段计时 — [`timing/go`](../../../xaiop-sdk/timing/go/) |
| `bench:go:json-gate` | Parse ↔ JSON 门槛 — [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) §5 |

枢纽：[../../performance.zh-CN.md](../../performance.zh-CN.md)。极限性能 tip（**2026-08-09**）：[../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)。发行说明：[../../meta/release-notes-2026-08-08-go-0.15.1.zh-CN.md](../../meta/release-notes-2026-08-08-go-0.15.1.zh-CN.md) · Demo：[../../../demos/go/](../../../demos/go/)
