# SDK 文档

[English](README.md) · [简体中文](README.zh-CN.md)

官方 **SDK** 文档。线文法：[../protocol/](../protocol/)（仅协议）。  
模型写出与流式传输：[../practice/](../practice/)。  
架构：[../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)。  
**产品目录（可选对照）：** [behavioral-contract.zh-CN.md](behavioral-contract.zh-CN.md)（协议符合 ≠ 官方 SDK 等价）。

| 技术栈 | 状态 | 文档 |
| --- | --- | --- |
| [Node.js](nodejs/) | **主实现 / 官方重心** — `xaiop` **0.15.0**（TS）↔ 协议 **0.6.0**；buffer compact · `@` Diff · Diff 隔离 · 控制根 `#!` / `meta.logSeq` / 续传；入口 `xaiop` · `xaiop/browser` · `xaiop/core` | **[API.zh-CN.md](nodejs/API.zh-CN.md)**（主入口） · [notes/](nodejs/notes/) |
| [Java](java/) | **进行中**（`io.xaiop:xaiop` **0.5.0**：parse · encode · merge · checkpoint · stream 消费端；协议 **0.4.0** 子集） | [指南](java/README.zh-CN.md) |
| [Python](python/) | **待更新** | 占位 |

跨栈：[behavioral-contract.zh-CN.md](behavioral-contract.zh-CN.md) · [notes/](notes/)

代码：[../../xaiop-sdk/](../../xaiop-sdk/)
