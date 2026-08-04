# Node.js 注意事项 — 解析历史（快照 + 实时）

[English](history.md) · [简体中文](history.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-HISTORY` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** — Node SDK 行为 |
| 代码 | `xaiop-sdk/nodejs/src/stream/history.js` · 接线于 `checkpoint.js` |
| 包 | `xaiop` **0.7.0+** |

上级：[streaming-parse.zh-CN.md](streaming-parse.zh-CN.md) · [../API.zh-CN.md](../API.zh-CN.md) · 对等：[../../behavioral-contract.zh-CN.md](../../behavioral-contract.zh-CN.md)

---

## 1. 意图

可选的 **`.` 相位飞行记录仪**。默认 **两种模式都关**（零开销）。

| 模式 | 标志 | 作用 |
| --- | --- | --- |
| **快照** | `historySnapshot: true` | 只读、类 git：导出时间根、对比、区间视图、URL 生命周期 |
| **实时** | `historyRealtime: true` | 活游标向前跳：保留定位点，**删除其后全部节点** |

可同时开启：用快照检查，再用实时裁剪活序列。

历史按 **每个物理 `.`**（及 EOF 尾）记账；即使 `mergeChunkWindow` 仍按窗口只交付 **一次** Diff。

---

## 2. 性能 / 场景

| 配置 | 代价 | 典型用途 |
| --- | --- | --- |
| 双关（默认） | 无 | 生产热路径 |
| 仅快照 | 每 `.` 的 before/after/diff/wire 内存 | 审计、差异 UI、区间回放 |
| 仅实时 | 同上 + 跳跃重建 | 服务端回溯、本地预览裁剪 |
| 双开 | 全量成本 | 快照验算 → 实时裁剪 |

不需要回溯/审计时请保持关闭。`retainWireHistory: false` 可不保留线文切片（区间重解析回退到 `after`）。

---

## 3. 快照 API（`ParseHistory`）

需 `historySnapshot`。

| API | 行为 |
| --- | --- |
| `exportTimeRoot()` | 深拷贝节点数组（时间根） |
| `getDiff` / `getBefore` / `getAfter` / `getNode` | 按索引克隆 |
| `compare(a, b)` | `{ a, b }` = 两索引的 `after` 树 |
| `viewRange(from, to)` | 维护只读视图；有线文时拼接再 parse |
| `setSource(url)` | 绑定源键；**不同** URL 释放全部节点与区间视图 |
| `release()` | 清空节点与区间视图 |

`XaiopStream`：在快照模式开启时，`setUrl` / 新 `send` URL 会触发 `setSource`。

---

## 4. 实时 API

需 `historyRealtime`。

| API | 行为 |
| --- | --- |
| `liveCursor` | 初始 `-1`；`jumpTo(i)` 后为 `i` |
| `canJumpTo(i)` | `i > liveCursor` 且在范围内 |
| `jumpTo(i)` / `engine.jumpTo` / `stream.jumpTo` | 保留 `[0..i]`（**定位点保留**）；丢弃 `i+1..`；按前缀重建 buffer + Commit；**仅向前**（不可恢复已丢节点；不可跳到 `≤ liveCursor`） |

跳跃后可继续 `push`，从前缀之后追加。

---

## 5. 双开

```js
const engine = new DotCheckpointEngine({
  streamProcessing: true,
  historySnapshot: true,
  historyRealtime: true,
  onChunk: () => {},
});
engine.history.compare(0, 2); // 只读检查
engine.jumpTo(1);             // 活序列裁到索引 1
```

---

## 6. 清单

- [ ] 默认无 `ParseHistory`（`engine.history === null`）
- [ ] 任一标志开启即按物理 `.` 记账（与 Diff 窗口合并无关）
- [ ] 快照：导出 / 对比 / viewRange / setSource 释放
- [ ] 实时：仅向前跳；定位点保留；尾部丢弃；引擎重建
- [ ] 双开：先快照后 jump；已丢索引不可用
