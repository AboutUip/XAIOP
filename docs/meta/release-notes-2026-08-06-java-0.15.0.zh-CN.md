# 发行说明 — 2026-08-06 · Java SDK 0.15.0

[English](release-notes-2026-08-06-java-0.15.0.md) · [简体中文](release-notes-2026-08-06-java-0.15.0.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Java `io.xaiop:xaiop` | **0.15.0** |
| 协议 | **0.6.0** Frozen |
| 参考 | Node.js `xaiop` **0.15.x** |

## 摘要

Java SDK 在协议 **0.6.0** 产品面上达到与 Node.js 参考实现的**可观测语义全面对齐**（零 runtime 依赖，JDK 17+）。

### 线格式（0.4 → 0.6）

- `&path` 删除（绝对 / 广播相对；Cursor 链保护）
- 独立 `#…` 注释行忽略
- `cursorRestoreLines()`（cover 恢复）

### Checkpoint / 流式产品层

- `cover` Diff 墓碑
- `.` 后 Diff 隔离 + `@` 累积 Diff
- `ParseHistory`（`historySnapshot` / `historyRealtime`）
- `bufferStats` / `compactCommitted`
- 行拦截 · Annotation Span
- 可选 `onChunk` + phase / logSeq meta

### 类型 · 控制 · WebSocket

- `io.xaiop.types` — 注册 / 冻结 / typeCheck / schema 帧
- `io.xaiop.control` — `#!` demux、session / ack / resume / snapshot / seq、`ResumeWireLog`、`ControlPlaneHost`
- `io.xaiop.ws` — `XaiopWs.listen`（RFC6455）+ `XaiopWs.connect`（JDK HttpClient）；`TransportKind.WEBSOCKET`

### 相对 Node 的有意差异

- 无 `xaiop/browser` 分包（仅 JDK）
- listen 不挂接到已有 `HttpServer`；未暴露 `perMessageDeflate` / 子协议协商
- 无 Node↔Java CI 黄金字节比对（移植 JUnit 套件）

## 构建

```bash
cd xaiop-sdk/java
mvn test
mvn -DskipTests package   # → target/xaiop-0.15.0.jar
```

建议 Git 标签：`sdk-java-v0.15.0`
