# SDK stage timing (`xaiop-sdk/timing`)

[English](#english) · [简体中文](#简体中文)

Harness **0.2.1** · targets Node / Python / Java / Go SDK **0.15.1+** / protocol **0.6.0**.

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

**What this is not:** LLM structured-output evaluation in [`docs/performance.md`](../../docs/performance.md). (There *is* a dedicated Go Parse ↔ JSON gate — see below — separate from stage timing.)

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
| Go JSON gate | `go/last-json-gate.json` | — |

### Parse ↔ JSON gate

Fair fixture: one nested tree → JSON via stringify/marshal; XAIOP via `Encode(DotPolicy:"none")`.

| Gate | Ratio | Target |
| --- | --- | --- |
| Primary | Go `Parse` / Node `JSON.parse` | ≤ 1.2 |
| Secondary | Go `Parse` / `encoding/json.Unmarshal` | report (≤ 1.2 preferred) |

Before→after (representative same-machine runs; ±~0.2× noise): primary **~3.8× → ~1.3–1.5×** (quick) and **~5.3× → ~1.7–1.9×** (full); secondary **~1.5× → ~0.5–0.6×** (beats `encoding/json`). Details: [`docs/sdk/go/ALIGNMENT.md`](../../docs/sdk/go/ALIGNMENT.md) §5.

### Stage microbench

Encode/parse · checkpoint streamOn/Off · emitDiff tax · D1/D2 · locate · long-session compact · stream PROMISE/CALLBACK — **same names** on every runtime.

---

## 简体中文

**本目录：** SDK 墙钟测速（Node / Python / Java / **Go**）+ Node 五方案横向对比。阶段名一致，便于跨运行时对照。Go 适合 ingest / checkpoint 吞吐对比。

```bash
cd xaiop-sdk/timing
npm run bench:go:quick
npm run bench:go:save-baseline
npm run bench:go
npm run bench:go:json-gate:quick
npm run bench:go:json-gate
```

| 目录 | 说明 |
| --- | --- |
| `go/` | Go 阶段计时（`go run` · replace → `../go`）+ `json_gate.mjs` / `jsongate/` |
| `go/last-json-gate.json` | Parse ↔ JSON 门槛最近一次结果 |

**Parse ↔ JSON 门槛：** 主门槛 `Parse / Node JSON.parse ≤ 1.2`（当前约 **1.3–1.9×**，受 V8/`map[string]any` 下限约束）；次门槛相对 `encoding/json`（约 **0.5–0.6×**，已击败）。见 [`docs/sdk/go/ALIGNMENT.zh-CN.md`](../../docs/sdk/go/ALIGNMENT.zh-CN.md) §5。
