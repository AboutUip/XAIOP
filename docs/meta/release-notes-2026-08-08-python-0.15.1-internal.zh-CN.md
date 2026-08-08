# 发行说明 — 2026-08-08 · Python SDK 0.15.1（内部维护）

[English](release-notes-2026-08-08-python-0.15.1-internal.md) · [简体中文](release-notes-2026-08-08-python-0.15.1-internal.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Python `xaiop` | **0.15.1**（不升版本 — 内部维护） |
| 协议 | **0.6.0** Frozen |
| 参考 | Node.js `xaiop` **0.15.1** |

## 摘要

对官方 Python 端口做了一轮**谨慎的内部性能与结构**整理。**对外 API 与可观测 Node 对等语义不变。**

### 性能 / 稳健

- **`materialize_snapshot` / `materialize_owned`：** Diff / 快照热路径改为手写 `clone_json`（对齐 Node `cloneJson`），不再用 `copy.deepcopy`。
- **`XaiopEngine.get_sync`：** 同样走 `clone_json`。
- **History（可选）：** 引擎用 `record_owned` + `peek_diff` / `peek_after`；相邻 phase 可共享 `after[i]` ≡ `before[i+1]`；公开 getter 仍 deep-clone；`view_range` 返回路径只 clone 一次。

流式 Diff 投递原本已是按引用（对齐 Node），未改。

### 结构

- 新增 package-private 模块 `xaiop._checkpoint_ops` — Diff 线文整形、cover 墓碑、行扫描（从 `checkpoint.py` 抽出）。
- 公开类仍为 `xaiop.checkpoint.DotCheckpointEngine`。

### 验证

- `pytest` — 全绿  
- `npm run bench:python` — 对照 `python/baseline-bench.json`  

可选标签：`sdk-python-v0.15.1` tip；PyPI 版本不变。
