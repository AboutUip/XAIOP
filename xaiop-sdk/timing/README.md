# SDK stage timing (`xaiop-sdk/timing`)

[English](#english) · [简体中文](#简体中文)

Harness **0.2.1** · targets Node / Python / Java / Go SDK **0.16.0+** / protocol **0.7.0**.

One folder per runtime — stage **names match** across harnesses for cross-runtime compare.

```text
timing/
  README.md · package.json     # facade entry
  node/     bench.mjs · compare.mjs
  python/   bench.py
  java/     StageTimingMain (+ thin pom)
  go/       main.go (stage timing)
```

---

## English

**What this is:** wall-clock micro-benchmarks for the **Node.js, Python, Java, and Go XAIOP SDKs**, plus a **cross-scheme** compare (Node) against other wire styles. Primary use: **same-machine before/after** after engine work. Go is the natural runtime for ingest / checkpoint throughput comparisons.

**What this is not:** LLM structured-output evaluation (archived under [`docs/archive/practice-llm-emit-2026-08-04/`](../../docs/archive/practice-llm-emit-2026-08-04/)). Hub for this harness: [`docs/performance.md`](../../docs/performance.md). Parse ↔ JSON gates (below) are separate from stage timing.

### Run (from this directory)

```bash
cd xaiop-sdk/timing
npm install

# Node / Python / Java / Go
npm run bench:save-baseline && npm run bench
npm run bench:python:save-baseline && npm run bench:python
npm run bench:java:save-baseline && npm run bench:java
npm run bench:go:save-baseline && npm run bench:go
npm run bench:go:quick

# Go Parse ↔ JSON gate (Node JSON.parse + encoding/json)
npm run bench:go:json-gate:quick
npm run bench:go:json-gate

# Node / Python / Java Parse ↔ JSON gates
npm run bench:node:json-gate:quick
npm run bench:node:json-gate
npm run bench:python:json-gate:quick
npm run bench:python:json-gate
npm run bench:java:json-gate:quick
npm run bench:java:json-gate

npm run compare
```

Direct Go:

```bash
go run -C go . -quick
go run -C go . -save-baseline
node go/json_gate.mjs --quick
```

Env: `BENCH_ITERS`, `BENCH_WARMUP`, `BENCH_LONG_PHASES`, `BENCH_FAIL_SLOWER=1`, `BENCH_FAIL_GATE=1` (exit 2 if primary Parse/NodeJSON > 1.2).

### Artifacts (gitignored)

| Runtime | Last run | Baseline |
| --- | --- | --- |
| Node | `node/last-bench.json` | `node/baseline-bench.json` |
| Python | `python/last-bench.json` | `python/baseline-bench.json` |
| Java | `java/last-bench.json` | `java/baseline-bench.json` |
| Go | `go/last-bench.json` | `go/baseline-bench.json` |
| Node JSON gate | `node/last-json-gate.json` | — |
| Go JSON gate | `go/last-json-gate.json` | — |
| Python JSON gate | `python/last-json-gate.json` | — |
| Java JSON gate | `java/last-json-gate.json` | — |

### Parse ↔ JSON gate

Fair fixture: one nested tree → JSON via stringify/marshal; XAIOP via `Encode(DotPolicy:"none")`.

| Gate | Ratio | Target |
| --- | --- | --- |
| Primary | `Parse` / Node `JSON.parse` | ≤ 1.2 (report; hard-fail only if `BENCH_FAIL_GATE=1`) |
| Secondary | `Parse` / in-process JSON | report (≤ 1.2 preferred) |

| Runtime | Secondary JSON | Notes (full fixture, same machine) |
| --- | --- | --- |
| Node | same-process `JSON.parse` | Parse/~2.2× JSON.parse (V8 rope / object model floor) |
| Go | `encoding/json.Unmarshal` | often **beats** Go JSON (~0.6×); primary ~2.1× Node |
| Python | `json.loads` | improved vs pre-tune (~59×→~39×); still loses to C `json` |
| Java | `io.xaiop.Json.parse` (not Jackson) | secondary ~1.2×; primary ~1.4× Node |

### Stage microbench (extreme-perf round)

Same stage names on every runtime. Same-machine Δ% vs saved baseline (negative = faster); tiny rows can jitter ±10%.

| Runtime | Highlights |
| --- | --- |
| Node | `parseSync` ~−28–30%; encode ~−9–15%; checkpoint streamOff ~−40% |
| Go | encode ~−33%; `long/grow-buffer` ~−58%; `chunked-3B` ~−98.5% (demux + merge-scan fix) |
| Java | encode ~−27–64%; stream CALLBACK ~−69%; re-run 20/20 faster |
| Python | encode slight win; checkpoint/stream long-session ~−20–32%; parse wall-clock noisy |

Details: [`docs/performance.md`](../../docs/performance.md) · [`docs/sdk/nodejs/notes/performance.md`](../../docs/sdk/nodejs/notes/performance.md) · ALIGNMENT §5 (Go / Java / Python).


---

## 简体中文

**本目录：** SDK 墙钟测速（Node / Python / Java / **Go**）+ Node 五方案横向对比。阶段名一致，便于跨运行时对照。Go 适合 ingest / checkpoint 吞吐对比。枢纽：[`docs/performance.zh-CN.md`](../../docs/performance.zh-CN.md)。LLM 结构化输出评测已归档，见 [`docs/archive/practice-llm-emit-2026-08-04/`](../../docs/archive/practice-llm-emit-2026-08-04/)。

```bash
cd xaiop-sdk/timing
npm run bench:go:quick
npm run bench:go:save-baseline
npm run bench:go
npm run bench:go:json-gate:quick
npm run bench:go:json-gate
npm run bench:node:json-gate:quick
npm run bench:python:json-gate:quick
npm run bench:java:json-gate:quick
```

| 目录 | 说明 |
| --- | --- |
| `go/` | Go 阶段计时（`go run` · replace → `../go`）+ `json_gate.mjs` / `jsongate/` |
| `node/json_gate.mjs` | Node 同进程 Parse ↔ `JSON.parse` 门槛 |
| `python/json_gate.py` | Python Parse ↔ JSON 门槛 |
| `java/.../JsonGateMain` | Java Parse ↔ JSON 门槛（`exec:java@json-gate`） |
| `*/last-json-gate.json` | 各运行时门槛最近一次结果 |

**Parse ↔ JSON 门槛：** 主门槛 `Parse / Node JSON.parse ≤ 1.2`（报告；`BENCH_FAIL_GATE=1` 才硬失败）；次门槛为同进程 JSON。见各语言 ALIGNMENT §5。

**本轮阶段计时：** Node `parseSync` ~−30%；Go `chunked-3B` ~−98.5% / `long/grow` ~−58%；Java encode 大幅下降；Python checkpoint 长会话明显加快。