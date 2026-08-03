# SDK stage timing (`dev/sdk-timing`)

[English](#english) · [简体中文](#简体中文)

---

## English

**What this is:** wall-clock micro-benchmarks for the **Node.js XAIOP SDK**, plus a **cross-scheme** compare against other wire styles.

**What this is not:** LLM structured-output evaluation in [`docs/performance.md`](../../docs/performance.md) (`PERF-METRICS`).

### Run

```bash
cd dev/sdk-timing
npm install
npm run compare          # Full JSON / NDJSON / JSON Patch / Protobuf / XAIOP
npm run bench            # XAIOP-only stage microbench
npm run compare:quick
```

`compare.mjs` writes `last-report.json`.

Env: `BENCH_ITERS`, `BENCH_WARMUP`. Flags: `--quick`, `--json`.

### Compare schemes (different dimensions)

| Scheme | Dimension |
| --- | --- |
| **Full JSON** | Atomic document — usable only at EOF |
| **NDJSON** | Line records merged into one tree |
| **JSON Patch** | RFC 6902 ops applied from `{}` |
| **Protobuf** | Schema binary — atomic decode (protobufjs) |
| **XAIOP** | Nested IR — `parseSync` / checkpoint streamOn·Off |

Parity checks rebuild the **same logical JSON tree** (Protobuf uses a repeated-section shape then maps back by `id`).

### Stage microbench (`bench.mjs`)

XAIOP-only encode / parse / checkpoint / stream / engine timings.
---

## 简体中文

**本目录：** Node.js SDK 墙钟耗时 + 五方案横向对比。

**不是：** [`docs/performance.md`](../../docs/performance.md) 的 LLM 评测。

```bash
cd dev/sdk-timing
npm install
npm run compare   # Full JSON / NDJSON / JSON Patch / Protobuf / XAIOP
npm run bench
```

| 方案 | 维度 |
| --- | --- |
| Full JSON | 整包原子 |
| NDJSON | 行记录合并 |
| JSON Patch | RFC 6902 增量 apply |
| Protobuf | Schema 二进制整包 |
| XAIOP | 嵌套 IR / 相位流 |
