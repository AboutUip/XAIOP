# SDK stage timing (`xaiop-sdk/timing`)

[English](#english) · [简体中文](#简体中文)

Harness **0.2.0** · targets Node / Python SDK **0.15.1+** / protocol **0.6.0**.

---

## English

**What this is:** wall-clock micro-benchmarks for the **Node.js and Python XAIOP SDKs**, plus a **cross-scheme** compare (Node) against other wire styles. Primary use: **same-machine before/after** after engine work (`emitDiff`, Diff isolation, `compactCommitted`, …). Stage **names match** across `bench.mjs` and `bench.py` for cross-runtime comparison.

**What this is not:** racing `JSON.parse`; LLM structured-output evaluation in [`docs/performance.md`](../../docs/performance.md).

### Run

```bash
cd xaiop-sdk/timing
npm install

# Node regression harness
npm run bench:save-baseline   # once, before your change
# … optimize …
npm run bench                 # prints Δ% vs baseline-bench.json

npm run bench:quick

# Python (same stage names; separate baseline file)
npm run bench:python:save-baseline
npm run bench:python
npm run bench:python:quick
# or: python bench.py --quick

npm run compare               # five-scheme dimensional compare (Node)
```

From the Node SDK package: `npm run bench` / `npm run compare` in `xaiop-sdk/nodejs`.

Env: `BENCH_ITERS`, `BENCH_WARMUP`, `BENCH_LONG_PHASES`.  
Flags: `--quick`, `--json`, `--save-baseline`, `--no-baseline`.  
Optional: `BENCH_FAIL_SLOWER=1` exits non-zero if any stage is ≥3% slower than baseline.

Artifacts (gitignored):

| Runtime | Last run | Baseline |
| --- | --- | --- |
| Node | `last-bench.json` | `baseline-bench.json` |
| Python | `last-bench-python.json` | `baseline-bench-python.json` |
| Compare | `last-report.json` | — |

### Stage microbench (`bench.mjs` / `bench.py`)

| Area | Stages |
| --- | --- |
| Encode / parse | `encodeSync/*`, `parseSync/*`, materialize |
| Checkpoint | streamOn / streamOff / dense |
| Diff tax | `emitDiffOn` vs `emitDiffOff` (dense) |
| D1 / D2 | `>name` after `.` split push; `@` into named array |
| Locate | `!` / `=` |
| Long session | grow buffer vs `compactCommitted` each phase |
| Stream | PROMISE (no Diff) vs CALLBACK+`onChunk` (Diff on) |

Same-run **totals** and optional **vs baseline** table (negative % = faster).

### Compare schemes (`compare.mjs`)

| Scheme | Dimension |
| --- | --- |
| **Full JSON** | Atomic document — usable only at EOF |
| **NDJSON** | Line records merged into one tree |
| **JSON Patch** | RFC 6902 ops applied from `{}` |
| **Protobuf** | Schema binary — atomic decode |
| **XAIOP** | Nested IR — parseSync / checkpoint streamOn·Off·emitDiffOff |

Parity checks rebuild the **same logical JSON tree**.

---

## 简体中文

**本目录：** Node.js / Python SDK 墙钟耗时 +（Node）五方案横向对比。主用途：**同机优化前/后**对比（不是和 JSON 解析抢冠军）。`bench.mjs` 与 `bench.py` **阶段名一致**，便于跨运行时对照。

**不是：** [`docs/performance.md`](../../docs/performance.md) 的 LLM 评测。

```bash
cd xaiop-sdk/timing
npm install
npm run bench:save-baseline        # Node 优化前基线
npm run bench
npm run bench:python:save-baseline # Python 基线
npm run bench:python
npm run compare
```

| 场景 | 说明 |
| --- | --- |
| `emitDiffOn/Off` | Diff 税 |
| D1 / D2 | Diff 隔离、`@` 累积 Diff |
| long grow / compact | 长会话缓冲 vs `compactCommitted` |
| PROMISE vs CALLBACK+onChunk | Stream 是否跑相位 Diff |

产物：`last-bench.json` · `baseline-bench.json` · `last-bench-python.json` · `baseline-bench-python.json`（均 gitignore）。
