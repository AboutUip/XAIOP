# 发布说明 — 2026-08-09 · SDK 极限性能（内部）

[English](release-notes-2026-08-09-sdk-extreme-perf-internal.md) · [简体中文](release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Node `xaiop` · Java · Python · Go | **0.15.1** tip（不升版本号 — 内部维护） |
| 协议 | **0.6.0** Frozen |
| 范围 | 纯同语言热路径；**零新依赖** |

## 摘要

跨运行时极限性能轮：Parse · Encode · checkpoint/stream 摄取。**公开 API、线文语义、产品树类型不变。** Encode 输出保持与 Node 参考 **字节一致**（golden **50/50** ×3 + core-wire **46/46**）。

计时：[`../../xaiop-sdk/timing/`](../../xaiop-sdk/timing/) · 枢纽：[../performance.zh-CN.md](../performance.zh-CN.md)。

---

## 硬约束

- 线文语义与产品树类型不变  
- Encode 相对 Node 字节一致  
- 无新依赖；不动 Compat×8 / WS 深逻辑  

---

## 改动分区

### Parse

| 运行时 | 改动 |
| --- | --- |
| **Node** | content 首字节快路径；手写 `isFloatToken`；无 broadcast 直调；STRICT one-shot 扫行 |
| Python / Java / Go | 此前快路径保留 |

### Encode

| 运行时 | 改动 |
| --- | --- |
| Python | `repr` 浮点快路径 + Decimal fallback；首字符 `_needs_forced_string`；插入序 key 视图 |
| Java | `Double.toString` 快路径 + BigDecimal fallback；手写分类 / `assertKey` |
| Go | `FormatFloat` 快路径 + `big.Float` fallback；手写分类；定容 `Builder` |
| Node | 手写数字/强制串/键校验（浮点格式化仍走原生） |

### Checkpoint / stream

| 运行时 | 改动 |
| --- | --- |
| **Go** | `[]byte` 缓冲；demux carry；merge 扫行免每 Push 拷贝 `phaseLines`；`Buffer()` 按需读取 |
| Java | phase 行所有权交换；无 `onChunk` 跳过 snapshot 克隆 |
| Node / Python | 无消费者跳过克隆 |

---

## 结果（同机）

### 阶段计时（相对基线）

| 运行时 | 亮点 | 干净汇总 |
| --- | --- | --- |
| Node | `parseSync` ~−28–30%；encode ~−9–15% | 最多 **20 faster / 0 slower** |
| Go | encode ~−33%；`chunked-3B` ~−98.5% | **19 faster / 0 slower** |
| Java | encode ~−27–64%；CALLBACK ~−69% | **20 faster / 0 slower** |
| Python | 长会话 / D1–D2 ~−20–32% | parse 墙钟有噪声 |

### Parse ↔ JSON 门槛

| 运行时 | Parse / Node JSON | 次门槛 | 主门槛 ≤1.2 |
| --- | ---: | ---: | :---: |
| Node | ~2.21× | — | 未过 |
| Go | ~2.13× | ~0.61× **过** | 未过 |
| Java | ~1.38× | ~1.24× | 未过 |
| Python | ~39× | ~17× | 未过 |

主门槛受各运行时对象模型下限约束；Go **次门槛**（同进程击败 `encoding/json`）为可复现同语言条且已通过。

---

## 验证

Node **688** · Python **487** · Java 全套 · `go test ./...` · golden **50/50** ×3 · core-wire **46/46**。

**不发布新坐标**；仅 tip 提交。
