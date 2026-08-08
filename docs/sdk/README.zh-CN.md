# SDK 文档

[English](README.md) · [简体中文](README.zh-CN.md)

官方 **SDK** 文档。线文法：[../protocol/](../protocol/)（仅协议）。  
模型写出与流式传输：[../practice/](../practice/)。  
架构：[../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)。  
**产品目录（可选对照）：** [behavioral-contract.zh-CN.md](behavioral-contract.zh-CN.md)（协议符合 ≠ 官方 SDK 等价）。

| 技术栈 | 状态 | 文档 |
| --- | --- | --- |
| [Node.js](nodejs/) | **主实现 / 官方重心** — `xaiop` **0.15.1**（TS）↔ 协议 **0.6.0**；buffer compact · `@` Diff · Diff 隔离 · 控制根 `#!` / `meta.logSeq` / 续传；入口 `xaiop` · `xaiop/browser` · `xaiop/core` | **[API.zh-CN.md](nodejs/API.zh-CN.md)**（主入口） · [notes/](nodejs/notes/) |
| [Java](java/) | **官方**（`io.xaiop:xaiop` **0.15.1** — 协议 **0.6.0**，与 Node 对齐的产品面） | **[API.zh-CN.md](java/API.zh-CN.md)** · [指南](java/README.zh-CN.md) · [ALIGNMENT.zh-CN.md](java/ALIGNMENT.zh-CN.md) |
| [Python](python/) | **官方**（`xaiop` **0.15.1** — 协议 **0.6.0**，与 Node 对齐的产品面） | **[API.zh-CN.md](python/API.zh-CN.md)** · [指南](python/README.zh-CN.md) · [ALIGNMENT.zh-CN.md](python/ALIGNMENT.zh-CN.md) |
| [Go](go/) | **核心协议线文完成**（`ProtocolVersion` **0.6.0**，SDK `0.6.0-alpha.2`） | [指南](go/README.zh-CN.md) · [ALIGNMENT](go/ALIGNMENT.zh-CN.md) · [轨道](notes/core-sdk-track.zh-CN.md) |

跨栈：[behavioral-contract.zh-CN.md](behavioral-contract.zh-CN.md) · [notes/](notes/)

代码：[../../xaiop-sdk/](../../xaiop-sdk/)
