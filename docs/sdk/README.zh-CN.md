# SDK 文档

[English](README.md) · [简体中文](README.zh-CN.md)

官方 **SDK** 文档。线文法：[../protocol/](../protocol/)（仅协议）。  
模型写出与流式传输：[../practice/](../practice/)。  
架构：[../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)。  
**产品目录（可选对照）：** [behavioral-contract.zh-CN.md](behavioral-contract.zh-CN.md)（协议符合 ≠ 官方 SDK 等价）。

| 技术栈 | 状态 | 文档 |
| --- | --- | --- |
| [Node.js](nodejs/) | **主实现 / 官方重心** — npm **`@bylan280/xaiop`** **0.16.0** 本树（上次发布 **0.15.1**）↔ 协议 **0.7.0** Draft；buffer compact · `@` Diff · Diff 隔离 · 控制根 `#!` / `meta.logSeq` / 续传 · `?` / Content 转义 · [npm](https://www.npmjs.com/package/@bylan280/xaiop) | **[API.zh-CN.md](nodejs/API.zh-CN.md)**（主入口） · [notes/](nodejs/notes/) · [性能](nodejs/notes/performance.zh-CN.md) |
| [Java](java/) | **官方**（`io.github.aboutuip:xaiop` **0.16.0** 本树 — [Maven Central](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop) 上仍是 **0.15.1**；协议 **0.7.0** Draft，与 Node 对齐的产品面；包名 `io.xaiop.*`） | **[API.zh-CN.md](java/API.zh-CN.md)** · [指南](java/README.zh-CN.md#安装) · [ALIGNMENT.zh-CN.md](java/ALIGNMENT.zh-CN.md) |
| [Python](python/) | **官方**（`xaiop` **0.16.0** 本树 — PyPI 上仍是 **0.15.1**；协议 **0.7.0** Draft，与 Node 对齐的产品面） | **[API.zh-CN.md](python/API.zh-CN.md)** · [指南](python/README.zh-CN.md) · [ALIGNMENT.zh-CN.md](python/ALIGNMENT.zh-CN.md) |
| [Go](go/) | **官方**（`github.com/AboutUip/XAIOP/xaiop-sdk/go` **0.16.0** 本树 — 上次标签 [v0.15.1](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1)；协议 **0.7.0** Draft，与 Node 对齐的产品面） | **[API.zh-CN.md](go/API.zh-CN.md)** · [指南](go/README.zh-CN.md#安装) · [ALIGNMENT](go/ALIGNMENT.zh-CN.md) |

**阶段计时（全运行时）：** [../performance.zh-CN.md](../performance.zh-CN.md) · 计时架 [`../../xaiop-sdk/timing/`](../../xaiop-sdk/timing/) · [2026-08-09 极限性能说明](../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)。

跨栈：[behavioral-contract.zh-CN.md](behavioral-contract.zh-CN.md) · [notes/](notes/)

代码：[../../xaiop-sdk/](../../xaiop-sdk/)
