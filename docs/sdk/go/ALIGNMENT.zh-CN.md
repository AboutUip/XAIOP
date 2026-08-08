# Go 核心线文对齐

[English](ALIGNMENT.md) · [简体中文](ALIGNMENT.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 | 薄范围说明（非产品对等） |
| 模块 | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| SDK | **0.6.0-alpha.2** |
| 协议 | **0.6.0** Frozen（`xaiop.ProtocolVersion`） |
| 轨道 | [../notes/core-sdk-track.zh-CN.md](../notes/core-sdk-track.zh-CN.md) |

**不是** Node/Java/Python **0.15.1** 产品 ALIGNMENT。Go 仍在 **核心协议轨**。

## 范围内

| 表面 | 说明 |
| --- | --- |
| `Parse` | STRICT 全文 |
| `LiveParser` | `FeedLine` / `FeedText` / `Value` / `CursorRestoreLines` |
| `Encode` | object / array / fragment；跨 dump 用 sorted 键序 |
| `Materialize` / `Fragment` | 深拷贝 · fragment entries |
| 算子 | `>` `<` `-` `=` `@` `!` `&` `#` `.` · Content 分型 · 强制字符串 |

## 范围外

Stream / Diff checkpoint · WS · Control Root · typeCheck · history · merge · browser · 产品 golden（32 cases）。

## 如何验证

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run core-wire
cd xaiop-sdk/go && go run ./cmd/fuzz-go -max=100 -seed=1
```

共享语料：[../../../xaiop-sdk/conformance/core-wire/](../../../xaiop-sdk/conformance/core-wire/)。
