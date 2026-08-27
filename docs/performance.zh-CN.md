# 性能

[English](performance.md) · [简体中文](performance.zh-CN.md)

XAIOP 有两套**不可混用**的「性能」叙事：

| 面 | 测什么 | 在哪 |
| --- | --- | --- |
| **SDK 阶段计时**（现行） | 同机 encode / parse / checkpoint / stream 墙钟（Node · Python · Java · Go） | [`../xaiop-sdk/timing/`](../xaiop-sdk/timing/) · [2026-08-09 说明](meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md) |
| **LLM 结构化输出指标**（已封存） | 模型发射质量 / 双通道评测 | [archive/practice-llm-emit-2026-08-04/performance.zh-CN.md](archive/practice-llm-emit-2026-08-04/performance.zh-CN.md) · [SEAL](archive/practice-llm-emit-2026-08-04/SEAL.md) |

历史 LLM 数据快照：[metrics/](metrics/)。

---

## 1. SDK 阶段计时（引擎改动的权威口径）

**用途：** Parse / Encode / checkpoint / stream 改完后，**同机** before/after。阶段名跨运行时一致。

```bash
cd xaiop-sdk/timing
npm install
npm run bench:node:save-baseline && npm run bench:node
npm run bench:python:save-baseline && npm run bench:python
npm run bench:java:save-baseline && npm run bench:java
npm run bench:go:save-baseline && npm run bench:go

npm run bench:node:json-gate
npm run bench:python:json-gate
npm run bench:java:json-gate
npm run bench:go:json-gate
```

说明见 [`../xaiop-sdk/timing/README.md`](../xaiop-sdk/timing/README.md)。

### Parse ↔ JSON 门槛（同一嵌套 fixture）

| 门槛 | 比值 | 政策 |
| --- | --- | --- |
| 主门槛 | `Parse` / Node `JSON.parse` | 目标 ≤ **1.2**（报告；受运行时下限约束） |
| 次门槛 | `Parse` / 同进程 JSON | 报告；宜 ≤ 1.2 |

| 运行时 | Full（depth=3 · breadth=8） | 说明 |
| --- | --- | --- |
| Node | Parse / `JSON.parse` **~2.21×** | 同进程 V8 |
| Go | Parse / Node **~2.13×** · Parse / `encoding/json` **~0.61×**（过） | 快于同进程 Go JSON |
| Java | Parse / Node **~1.38×** · Parse / `Json.parse` **~1.24×** | 接近次门槛 |
| Python | Parse / Node **~39×** · Parse / `json.loads` **~17×** | CPython / `dict` 下限 |

对等矩阵 §5：[sdk/go/ALIGNMENT.zh-CN.md](sdk/go/ALIGNMENT.zh-CN.md) · [sdk/java/ALIGNMENT.zh-CN.md](sdk/java/ALIGNMENT.zh-CN.md) · [sdk/python/ALIGNMENT.zh-CN.md](sdk/python/ALIGNMENT.zh-CN.md) · [sdk/nodejs/notes/performance.zh-CN.md](sdk/nodejs/notes/performance.zh-CN.md)。

### 极限性能轮（2026-08-09 · tip `0.16.0`，不升版本号）

纯同语言热路径；**Encode 字节一致**；golden **50/50** ×3 + core-wire **46/46**。

| 运行时 | 阶段亮点（相对同机基线） |
| --- | --- |
| Node | `parseSync` ~**−28–30%**；encode ~**−9–15%**；checkpoint streamOff ~**−40%** |
| Go | encode ~**−33%**；`long/grow-buffer` ~**−58%**；`chunked-3B` ~**−98.5%** |
| Java | encode ~**−27–64%**；CALLBACK stream ~**−69%** |
| Python | 长会话 / D1–D2 ~**−20–32%**；encode 小幅加快 |

全文：[meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)。

**约束（后续仍适用）：** 零新依赖；产品树类型不变；不动 Compat×8 / WS 深逻辑。

---

## 2. LLM 指标（已封存）

根枢纽不再主推 LLM 结构化输出优化计分。

**权威副本：** [archive/practice-llm-emit-2026-08-04/performance.zh-CN.md](archive/practice-llm-emit-2026-08-04/performance.zh-CN.md)
