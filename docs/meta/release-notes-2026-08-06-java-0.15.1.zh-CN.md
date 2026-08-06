# 发行说明 — 2026-08-06 · Java SDK 0.15.1

[English](release-notes-2026-08-06-java-0.15.1.md) · [简体中文](release-notes-2026-08-06-java-0.15.1.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Java `io.xaiop:xaiop` | **0.15.1** |
| 协议 | **0.6.0** Frozen |
| 参考 | Node.js `xaiop` **0.15.1** |

## 摘要

补齐相对 Node 的流式消费端缺口：`XaiopStream` 现已接通此前仅在 `DotCheckpointEngine` / `XaiopWs` 上的产品选项。

- 选项：`cover`、history*、`typeCheck`/`typeSchema`、行拦截、Annotation Span、控制面 `session` / 回调
- 入站：`ControlPlaneHost` demux → 剩余线文 → checkpoint
- `chunks()` 阻塞拉取（`ASYNC_ITERATOR`）
- 流表面提供 session 辅助与 `bufferStats` / `compactCommitted` / `jumpTo`
- `StreamAdvancedTest` 覆盖接线路径

建议 Git 标签：`sdk-java-v0.15.1`
