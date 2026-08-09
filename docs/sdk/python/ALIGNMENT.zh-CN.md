# Python ↔ Node SDK 对齐说明

[English](ALIGNMENT.md) · [简体中文](ALIGNMENT.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 | 官方 Python 端口对等矩阵（持续维护） |
| Python 包 | `xaiop` **0.15.1** |
| Node 包 | `@bylan280/xaiop` **0.15.1**（npm） |
| 线文协议 | **0.6.0** Frozen（`PROTOCOL_VERSION`） |
| 是否规范正文 | **否** — 产品可观察语义清单（≠ 仅协议符合） |
| 权威来源 | Node 参考实现 + [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)（若无则见英版） |

**隔离：** 协议 = 线文 · 实践 = 传输场景 · 本页 = **Python ↔ Node 可观察语义映射**。  
**指南：** [README.zh-CN.md](README.zh-CN.md) · **代码：** [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/)  
**无** `xaiop/browser`（与 Java 相同）。

---

## 1. 目的与版本

本文件是 Python 官方端口相对 Node 参考实现的**对等矩阵**。方法名与语言惯用法不同；**可观察语义**（Diff 边界、compat、encode 默认、WS 相推送、Control Root、typeCheck、intercept / Annotation Span、history）必须一致。

| 栈 | 包 | SDK | 协议 | 状态 |
| --- | --- | --- | --- | --- |
| Node.js（主） | `@bylan280/xaiop` | **0.15.1** | **0.6.0** | 参考 |
| Java（官方） | `io.xaiop:xaiop` | **0.15.1** | **0.6.0** | 已对齐 |
| Python（官方端口） | `xaiop` | **0.15.1** | **0.6.0** | 已对齐 |

---

## 2. 功能对等矩阵

| 功能 | Node | Python | 说明 |
| --- | --- | --- | --- |
| Parse（strict / compat） | ✅ | ✅ | `parse_sync` · `CompatPolicy` ×8 |
| Fragment | ✅ | ✅ | 流式面 materialize |
| Compat ×8 | ✅ | ✅ | 同八个 fix ID |
| Encode（全 `dotPolicy`） | ✅ | ✅ | ES `Number#toString` 浮点 |
| Merge / inject | ✅ | ✅ | 仅离线 |
| `XaiopEngine` | ✅ | ✅ | sync-first |
| Live parse | ✅ | ✅ | `LiveParser` |
| `&` 删除 | ✅ | ✅ | + cover 墓碑 Diff |
| `#` 注解忽略 | ✅ | ✅ | |
| Checkpoint Diff | ✅ | ✅ | 默认 window-merge |
| Cover Diff | ✅ | ✅ | |
| Parse history | ✅ | ✅ | snapshot / realtime · `jump_to` 等 |
| Diff 隔离 D1 / `@` D2 | ✅ | ✅ | |
| Buffer compact | ✅ | ✅ | |
| `XaiopStream` HTTP/SSE/RAW | ✅ | ✅ | 可选 `httpx` |
| Stream 选项接线 | ✅ | ✅ | cover · history · typeCheck · intercept · span · control · `chunks()` |
| typeCheck / TypeRegistry | ✅ | ✅ | `xaiop.types` |
| Line intercept / Annotation Span | ✅ | ✅ | `AnnotationSpan.KEEP` |
| Control Root / ResumeWireLog | ✅ | ✅ | `xaiop.control` |
| Phase encode / `symbolKeys` | ✅ | ✅ | |
| `XaiopWs` listen / connect | ✅ | ✅ | 可选 `websockets` |
| Browser 入口 | ✅ | ❌ | 不在范围 |

---

## 3. API 惯用法映射（Node → Python）

| Node.js | Python |
| --- | --- |
| `parseSync` / `encodeSync` | `parse_sync` / `encode_sync` |
| `LiveXaiopParser` | `LiveParser` |
| Annotation Span keep（`undefined`） | `AnnotationSpan.KEEP` |
| `for await (chunks())` | 同步迭代 `chunks()` |
| `jumpTo` / `viewRange` / `getAfter` | `jump_to` / `view_range` / `get_after` |
| `RangeError` | `xaiop.RangeError` |
| Options 对象 | kwargs / dict hooks（接受 camelCase） |

---

## 4. 包映射（Node → Python）

见英版 §4（`xaiop.parse` · `checkpoint` · `history` · `stream` · `ws` · `control` · `types` 等）。无 `xaiop/browser`。

---

## 5. 测试映射（Node → Python）

| Node 测试 | Python 测试模块 |
| --- | --- |
| `history.test.js` | `test_history.py` |
| `amp.delete.test.js` | `test_amp_delete.py` |
| `bang.at.test.js` | `test_bang_at.py` |
| `hash.annotation.test.js` | `test_hash_annotation.py` |
| `encode.stability.test.js` | `test_encode_stability.py` |
| `stream.consistency.test.js` | `test_stream_consistency.py` |
| `checkpoint.buffer-compact*` / window | `test_checkpoint_compact.py` · `test_checkpoint_window.py` |
| `control.resume` / coverage | `test_control_resume.py` · `test_control_coverage.py` |
| compat 线文矩阵 | `test_compat_fixes.py` |
| encode 稳健 / stream HTTP·SSE | `test_encode_robust.py` · `test_stream_http.py` · `test_stream_advanced.py` |
| typeCheck / WS typeCheck | `test_types.py` · `test_ws_typecheck.py` |
| 其余 encode/merge/stream/ws… | 见英版完整表 |

本地规模：`pytest` ≈ **487** 用例。另有 Node↔Python golden CI。  
计时：与 Node 同阶段名 — [`xaiop-sdk/timing/python/bench.py`](../../../xaiop-sdk/timing/python/bench.py)。

**Parse ↔ JSON 门槛**（STRICT 一次性 `parse_sync` vs 同机 JSON）：

```bash
cd xaiop-sdk/timing
npm run bench:python:json-gate:quick
npm run bench:python:json-gate
```

| 门槛 | 目标 | 说明 |
| --- | --- | --- |
| 主门槛 | `Parse / Node JSON.parse ≤ 1.2` | 本轮仅报告（CPython 对 V8 常吃亏） |
| 次门槛 | `Parse / json.loads`（报告； ideally ≤1.2） | 同进程公平对照 |

**Before → after**（同机嵌套 fixture；墙钟；±噪声）：quick/full 主门槛约 **56×/59× → 38×/39×**；次门槛约 **35×/29× → 22×/17×**。热路径：无 broadcast 直调、手写 float、content 首字节快路径、one-shot 扫行、STRICT 名字 ASCII 快路径；encode `repr` 浮点快路径；checkpoint 无消费者跳过克隆。阶段计时（**2026-08-09**）：长会话 / D1–D2 ~−20–32%。说明：[../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)。产物：`timing/python/last-json-gate.json`。

---

## 6. 可接受差异

- sync-first；无 browser；`chunks()` 为同步迭代器  
- extras：`[http]` / `[ws]`  
- `XaiopStream` 仅 HTTP / SSE / RAW；WebSocket 走 `XaiopWs`  
- 无 JS `undefined`；Span keep 用 `AnnotationSpan.KEEP`

---

## 7. 如何验证对等

```bash
cd xaiop-sdk/python && python -m pip install -e ".[dev,http,ws]" && pytest
cd xaiop-sdk/conformance && npm run golden:python
cd xaiop-sdk/conformance && npm run core-wire
python xaiop-sdk/conformance/fuzz/fuzz-python.py --max=100 --seed=1
```

产品 golden：**50** 例（encode 语料 30 + parse/stream 各 10 套 fixture）。
Python↔Go `core-wire` 仍为协议 STRICT 轨，**不能**代替 Node 产品 golden。

---

## 8. 行为契约 §8 checklist

与英版相同，各项均已勾选。包版本 **0.15.1** 与 Node **0.15.1** 发行对等（无 browser）。

---

## 相关

- [README.zh-CN.md](README.zh-CN.md)  
- [../java/ALIGNMENT.zh-CN.md](../java/ALIGNMENT.zh-CN.md)  
- [../../../xaiop-sdk/conformance/](../../../xaiop-sdk/conformance/)
