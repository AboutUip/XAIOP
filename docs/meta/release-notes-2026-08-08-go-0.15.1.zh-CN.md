# 发行说明 — 2026-08-08 · Go SDK 0.15.1

[English](release-notes-2026-08-08-go-0.15.1.md) · [简体中文](release-notes-2026-08-08-go-0.15.1.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Go 模块 | **0.15.1** |
| 协议 | **0.6.0** Frozen |
| 参考 | Node.js `xaiop` **0.15.1** · Java · Python |
| 类型 | 稳定官方端口（退出 alpha / 离开纯 core 轨） |

## 摘要

将 Go 从核心线文 **`0.6.0-alpha.*`** / 开发档 **`0.15.0-alpha.1`** 晋级为与 Node tip 可观察语义对齐的官方产品 SDK **`0.15.1`**。

对等矩阵：[../sdk/go/ALIGNMENT.zh-CN.md](../sdk/go/ALIGNMENT.zh-CN.md)

## 要点

- 产品面：Compat ×8（ingest 已接线）· Encode · Merge · Engine · Checkpoint / History · Stream · 控制根 · typeCheck · 拦截 / Annotation Span · phase encode · `symbolKeys` · XaiopWs
- 交叉验证：Node↔Go 产品黄金 **50** NDJSON · Python↔Go STRICT core-wire **46** · 扩展包级单测
- CI：`go test ./...` · `golden-go` · `core-wire` · fuzz
- **无** browser（同 Java / Python）

## 验证

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go && npm run core-wire
```

建议标签：`sdk-go-v0.15.1`
