# XAIOP Go SDK

[English](README.md) · [简体中文](README.zh-CN.md)

官方产品端口：**0.15.1** · 协议 **0.6.0**。对等矩阵：[ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) · API：[API.zh-CN.md](API.zh-CN.md)。

**已实现：** 与 Node tip 对齐的产品面（parse · Compat ×8 · encode · merge · engine · stream · WS · control · typeCheck · 拦截 / Annotation Span · `symbolKeys`）。**范围外：** browser（同 Java / Python）。

## 验证

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go && npm run core-wire
```

| 门禁 | 结果 |
| --- | --- |
| `go test ./...` | 包级对等 |
| `golden:go` | Node ↔ Go 产品 NDJSON — **50** 例 |
| `core-wire` | Python ↔ Go STRICT — **46** 例 |

发行说明：[../../meta/release-notes-2026-08-08-go-0.15.1.zh-CN.md](../../meta/release-notes-2026-08-08-go-0.15.1.zh-CN.md) · Demo：[../../../demos/go/](../../../demos/go/)
