# Node.js — 性能（阶段计时）

[English](performance.md) · [简体中文](performance.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-PERF` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-09 |
| 规范性 | **否** |

枢纽：[../../../performance.zh-CN.md](../../../performance.zh-CN.md) · 计时：[`../../../../xaiop-sdk/timing/`](../../../../xaiop-sdk/timing/) · 内部说明：[../../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](../../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)

---

## 1. 怎么测

```bash
cd xaiop-sdk/timing
npm run bench:node:save-baseline
npm run bench:node
npm run bench:node:json-gate
npm run bench:node:json-gate:quick
```

产物（gitignore）：`timing/node/last-bench.json` · `last-json-gate.json` · `baseline-bench.json`。

---

## 2. Parse ↔ JSON 门槛

| 门槛 | Full（depth=3 · breadth=8） | 目标 |
| --- | ---: | --- |
| `parseSync` / `JSON.parse` | **~2.21×** | ≤ 1.2（报告；受 V8 对象模型下限约束） |

主门槛仍难硬过：XAIOP 从线文建 Cursor/产品树；`JSON.parse` 为原生路径。

---

## 3. 极限性能轮（2026-08-09 · tip 0.15.1）

### Parse

content 首字节快路径 · 手写 float · 无 broadcast 直调 · STRICT one-shot 扫行。

### Encode

手写数字/强制串/键扫描（浮点格式化仍原生）。

### Checkpoint

无 `onChunk` 时跳过 snapshot 克隆。

### 阶段计时（相对基线）

| 族 | Δ%（约） |
| --- | --- |
| `parseSync/*` | **−28–30%** |
| `encodeSync/*` | **−9–15%** |
| `checkpoint/streamOff/phased` | **~−40%** |
| 干净复跑 | 最多 **20 faster / 0 slower** |

正确性：单测 **901** · 产品黄金 **60/60**。

---

## 相关

- 跨运行时：[../../../performance.zh-CN.md](../../../performance.zh-CN.md)  
- 编码注意：[encode-attention.zh-CN.md](encode-attention.zh-CN.md)  
- 流式解析：[streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)
