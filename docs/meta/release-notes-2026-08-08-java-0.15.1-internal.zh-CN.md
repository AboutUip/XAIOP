# 发行说明 — 2026-08-08 · Java SDK 0.15.1（内部维护）

[English](release-notes-2026-08-08-java-0.15.1-internal.md) · [简体中文](release-notes-2026-08-08-java-0.15.1-internal.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Java `io.xaiop:xaiop` | **0.15.1**（不升版本 — 内部维护） |
| 协议 | **0.6.0** Frozen |
| 参考 | Node.js `xaiop` **0.15.1** |

## 摘要

对官方 Java 端口做了一轮**内部性能与结构**整理。**对外 API 与可观测 Node 对等语义不变。**

### 性能

- **流式 Diff 投递：** `XaiopStream` 不再对引擎已隔离的 phase Diff 二次 `deepClone` 再交给回调 / 事件 / `chunks()` — 与 Node `_deliverChunk`（按引用传递）对齐。Snapshot / done 取值仍 clone。
- **History（可选）：** 引擎走所有权移交（`recordOwned`）与 emit 用 `peekDiff`；相邻 phase 可共享 `after[i]` ≡ `before[i+1]` 存储；公开 getter / export 仍 deep-clone；`viewRange` 返回路径只 clone 一次。
- **`Json.deepClone`：** `LinkedHashMap` 按源 map 容量预分配。
- **Parser / Encoder：** 路径分段不再用 `String.split`；浮点 token 判定避免每次 `Matcher`；编码线文用 `StringBuilder`；路径切割编码复用可变 path 缓冲。

同机阶段计时见 [`xaiop-sdk/timing`](../../xaiop-sdk/timing/)：相对改前 baseline，主路径 ingest / checkpoint / PROMISE stream 有提升；极短微基准仍有噪声。

### 结构

`io.xaiop.stream` 下 package-private 协作类（**非**对外 API）：

| 协作类 | 职责 |
| --- | --- |
| `CheckpointDiffBuild` | Diff 构建 / owned parse / 空 phase / 前导 `.` |
| `CheckpointCover` | cover 墓碑 / 线文拼接 |
| `CheckpointScan` | 行读取 / 关闭 phase 记录 |
| `CheckpointAsync` | 合并调度的 drain 线程 |

公开的 `DotCheckpointEngine` / `ParseHistory` / `XaiopStream` 类型不变。

### 验证

- `mvn test` — 移植套件全绿  
- `npm run bench:java` — 对照 `java/baseline-bench.json`  
- Diff 隔离 / history / encode robust 覆盖 clone 与路径切割路径  

可选维护标签：`sdk-java-v0.15.1` tip；Maven 坐标不变。
