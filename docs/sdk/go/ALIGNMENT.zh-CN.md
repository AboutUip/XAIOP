# Go ↔ Node SDK 对齐

[English](ALIGNMENT.md) · [简体中文](ALIGNMENT.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 | 现行对等矩阵（Go 官方端口） |
| Go 模块 | `github.com/AboutUip/XAIOP/xaiop-sdk/go` · SDK **0.16.0** |
| Node 包 | `@bylan280/xaiop` **0.16.0** 本树（上次 npm **0.15.1**） |
| 协议线文 | **0.7.0** Draft（`xaiop.ProtocolVersion`） |
| 规范性 | **否** — 产品对等清单 |
| 权威 | Node 参考实现 + [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) |

**指南：** [README.zh-CN.md](README.zh-CN.md) · **API：** [API.zh-CN.md](API.zh-CN.md) · **代码：** [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/)  
**无** browser 入口（同 Java / Python）。

---

## 1. 目的与版本

| 栈 | 包 / 模块 | SDK | 协议 | 状态 |
| --- | --- | --- | --- | --- |
| Node.js（主） | `@bylan280/xaiop` | **0.16.0** | **0.7.0** Draft | 参考 |
| Java（官方） | `io.github.aboutuip:xaiop` | **0.16.0** | **0.7.0** Draft | 已对齐 |
| Python（官方） | `xaiop` | **0.16.0** | **0.7.0** Draft | 已对齐 |
| Go（官方端口） | `github.com/AboutUip/XAIOP/xaiop-sdk/go` | **0.16.0** | **0.7.0** Draft | 已对齐 |

---

## 2. 功能对等矩阵

| 功能 | Node | Go | 说明 |
| --- | --- | --- | --- |
| Parse（strict / compat） | ✅ | ✅ | `Parse` STRICT；`ParseWithOptions` · Compat ×8 + `symbolKeys` 已接线 |
| Fragment | ✅ | ✅ | `Fragment` |
| Compat ×8 | ✅ | ✅ | `xaiop/compat` + ingest 改写 / pop-and-retry / locate 重试 |
| Encode（dotPolicy + 路径切点） | ✅ | ✅ | ES `Number#toString` · OrderedObject 插入序 |
| Merge / inject | ✅ | ✅ | `MergeJSON` · Engine inject |
| Engine 存储 | ✅ | ✅ | `Engine` sync-first |
| Live parse | ✅ | ✅ | `LiveParser` |
| `&` 删除 / `#` 忽略 | ✅ | ✅ | Cursor 链禁止 · cover 墓碑 |
| Checkpoint Diff / cover / history | ✅ | ✅ | `xaiop/stream` |
| Diff 隔离（D1）/ `@` Diff（D2） | ✅ | ✅ | |
| Buffer compact | ✅ | ✅ | `CompactCommitted` |
| `XaiopStream` HTTP / SSE / RAW | ✅ | ✅ | |
| Stream 选项接线 | ✅ | ✅ | |
| typeCheck / TypeRegistry | ✅ | ✅ | `xaiop/types` |
| 行拦截 / Annotation Span | ✅ | ✅ | `AnnotationSpanKeep` |
| 控制根（`#!`） | ✅ | ✅ | `xaiop/control` |
| Phase encode | ✅ | ✅ | `PhaseEncodeJSON` / KeyValue |
| `symbolKeys` | ✅ | ✅ | U+001F 编码 + 解析解码 |
| `XaiopWs` listen / connect | ✅ | ✅ | 标准库 RFC6455 子集 · `xaiop/ws` |
| Browser 入口 | ✅ | ❌ | 范围外 |

完整 Node→Go 惯用法与包映射见英文 [ALIGNMENT.md](ALIGNMENT.md) §3–4。`Encode` 对应 Node `encodeSync`；**没有** `EncodeAsync`（与 Python 无 `encode_async` 相同）。

---

## 5. 验证与交叉验证

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run golden:go
cd xaiop-sdk/conformance && npm run core-wire
cd xaiop-sdk/go && go run ./cmd/fuzz-go -max=100 -seed=1
```

| 门禁 | 证明内容 | 规模 |
| --- | --- | --- |
| `go test ./...` | 包级行为对齐 | Compat ×8 · `&`/`!`/`@`/`#` · encode/merge · D1/D2 · cover · stream framing · control · WS |
| `npm run golden:go` | Node ↔ Go **产品** NDJSON | **60** 例（encode **40** + parse **10** + stream **10**） |
| `npm run core-wire` | Python ↔ Go **STRICT** 线文 | **152** 例 |
| `cmd/fuzz-go` | 变异崩溃预算 | CI / 本地 |

**声明强度：** Go 包测 + Node↔Go 产品黄金（**60**）+ Python↔Go STRICT core-wire（**152**）+ fuzz。CI：`golden-go`。

**计时：** 与 Node / Python / Java 同阶段名 — [`xaiop-sdk/timing/go`](../../../xaiop-sdk/timing/go/)（`npm run bench:go`）。

**Parse ↔ JSON 门槛**（STRICT 一次性 `Parse` vs 同机 JSON，同一嵌套 fixture）：

```bash
cd xaiop-sdk/timing
npm run bench:go:json-gate:quick
npm run bench:go:json-gate
```

| 门槛 | 目标 | 说明 |
| --- | --- | --- |
| 主门槛 | `Parse / Node JSON.parse ≤ 1.2` | V8 ≈ 浏览器级 JSON 引擎 |
| 次门槛 | `Parse / encoding/json`（报告；宜 ≤1.2） | 同进程 Go 公平对照 |

**优化前后**（同机嵌套 fixture）：

| Fixture | Parse/Node | Parse/GoJSON |
| --- | ---: | ---: |
| 优化前 quick / full | **~3.8×** / **~5.3×** | **~1.5×** / **~1.5×** |
| 优化后 quick / full | **~1.3–1.5×** / **~1.7–2.1×** | **~0.45–0.55×** / **~0.55–0.62×** |

热路径：无 broadcast 直调、手写 float、content 首字节快路径、one-shot 扫行、typed frames、数组 sync-on-pop、`sync.Pool`、容量提示、STRICT `assertName` ASCII 快路径；encode 原生浮点快路径 + 手写 `needsForcedString`；checkpoint `[]byte` 摄取、demux carry、merge 扫行免每 Push 拷贝 `phaseLines`。产物：`timing/go/last-json-gate.json`。

阶段计时（相对基线 · **2026-08-09**）：encode ~−33%；`long/grow-buffer` ~−58%；`chunked-3B` ~−98.5%。说明：[../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md) · 枢纽：[../../performance.zh-CN.md](../../performance.zh-CN.md)。

主门槛 ≤1.2× Node 受 Go `encoding/json`→`map[string]any` 相对 V8 的运行时下限约束（同 fixture 上 `encoding/json` 常为 Node 的 **~2.5–3.5×**）；次门槛（同进程击败 `encoding/json`）为可复现的同运行时条，当前 **通过**（约 **0.5–0.6×**）。

行为契约清单见英文版 §8；本清单已勾选完成。
