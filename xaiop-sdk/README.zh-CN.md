# XAIOP SDK

> 官方多运行时 **SDK** — Node `xaiop` **0.15.1**（协议 **0.6.0**）· Java `io.xaiop:xaiop` **0.15.1** · Python `xaiop` **0.15.1** · Go 模块 **0.15.1**

[English](README.md) · [简体中文](README.zh-CN.md)

| 文档 | 链接 |
| --- | --- |
| 极限性能 tip（2026-08-09 · 全运行时） | [../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md) |
| SDK 阶段计时枢纽 | [../docs/performance.zh-CN.md](../docs/performance.zh-CN.md) · [timing/](timing/) |
| 发行说明（2026-08-08 · Go 0.15.1） | [../docs/meta/release-notes-2026-08-08-go-0.15.1.zh-CN.md](../docs/meta/release-notes-2026-08-08-go-0.15.1.zh-CN.md) |
| 发行说明（2026-08-08 · Python 0.15.1） | [../docs/meta/release-notes-2026-08-08-python-0.15.1.zh-CN.md](../docs/meta/release-notes-2026-08-08-python-0.15.1.zh-CN.md) |
| 发行说明（2026-08-07 · Python 0.15.0a1） | [../docs/meta/release-notes-2026-08-07-python-0.15.0a1.zh-CN.md](../docs/meta/release-notes-2026-08-07-python-0.15.0a1.zh-CN.md) |
| 发行说明（2026-08-06 · 核心 SDK） | [../docs/meta/release-notes-2026-08-06-core-sdk.zh-CN.md](../docs/meta/release-notes-2026-08-06-core-sdk.zh-CN.md) |
| 发行说明（2026-08-05 · 0.15.1） | [../docs/meta/release-notes-2026-08-05-0.15.1.zh-CN.md](../docs/meta/release-notes-2026-08-05-0.15.1.zh-CN.md) |
| 发行说明（2026-08-05 · 0.14.3） | [../docs/meta/release-notes-2026-08-05-0.14.3.zh-CN.md](../docs/meta/release-notes-2026-08-05-0.14.3.zh-CN.md) |
| 发行说明（2026-08-05 · 0.14.2） | [../docs/meta/release-notes-2026-08-05-0.14.2.zh-CN.md](../docs/meta/release-notes-2026-08-05-0.14.2.zh-CN.md) |
| 发行说明（2026-08-05 · 0.14.1） | [../docs/meta/release-notes-2026-08-05-0.14.1.zh-CN.md](../docs/meta/release-notes-2026-08-05-0.14.1.zh-CN.md) |
| 发行说明（2026-08-05 · 0.14.0） | [../docs/meta/release-notes-2026-08-05.zh-CN.md](../docs/meta/release-notes-2026-08-05.zh-CN.md) |
| 发行说明（2026-08-04） | [../docs/meta/release-notes-2026-08-04.zh-CN.md](../docs/meta/release-notes-2026-08-04.zh-CN.md) |
| SDK | [../docs/sdk/](../docs/sdk/) |
| 行为契约（第三方对等） | [../docs/sdk/behavioral-contract.zh-CN.md](../docs/sdk/behavioral-contract.zh-CN.md) |
| Java <-> Node 对等矩阵 | [../docs/sdk/java/ALIGNMENT.zh-CN.md](../docs/sdk/java/ALIGNMENT.zh-CN.md) |
| Python <-> Node 对等矩阵 | [../docs/sdk/python/ALIGNMENT.zh-CN.md](../docs/sdk/python/ALIGNMENT.zh-CN.md) |
| Go <-> Node 对等矩阵 | [../docs/sdk/go/ALIGNMENT.zh-CN.md](../docs/sdk/go/ALIGNMENT.zh-CN.md) |
| 一致性（golden / core-wire） | [conformance/](conformance/) |
| 协议（仅线格式） | [../docs/protocol/](../docs/protocol/) |
| 实践（模型 · 流式） | [../docs/practice/](../docs/practice/) |
| 隔离说明 | [../docs/SEPARATION.zh-CN.md](../docs/SEPARATION.zh-CN.md) |

| 目录 | 状态 |
| --- | --- |
| [nodejs/](nodejs/) | **进行中** — `xaiop` **0.15.1** <-> 协议 **0.6.0**（parse · stream · encode · merge · history · WS · 控制根 / logSeq · Diff 隔离 / `@` Diff · buffer compact；**2026-08-09** 极限热路径 tip） |
| [java/](java/) | **进行中** — `io.xaiop:xaiop` **0.15.1** — 协议 **0.6.0**（与 Node 对齐的完整产品面；[ALIGNMENT](../docs/sdk/java/ALIGNMENT.zh-CN.md)） |
| [python/](python/) | **进行中** — `xaiop` **0.15.1** — 协议 **0.6.0**（[ALIGNMENT](../docs/sdk/python/ALIGNMENT.zh-CN.md)） |
| [go/](go/) | **官方** — `ProtocolVersion` **0.6.0** · module **0.15.1**（[ALIGNMENT](../docs/sdk/go/ALIGNMENT.zh-CN.md) · [API](../docs/sdk/go/API.zh-CN.md)） |
| [timing/](timing/) | SDK 阶段微基准 + Parse↔JSON 门槛（Node + Python + Java + **Go**）— 非产品包 |
