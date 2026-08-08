# SDK stage timing (`xaiop-sdk/timing`)

[English](#english) · [简体中文](#简体中文)

Harness **0.2.1** · targets Node / Python / Java SDK **0.15.1+** / protocol **0.6.0**.

One folder per runtime — stage **names match** across harnesses for cross-runtime compare.

```text
timing/
  README.md · package.json     # facade entry
  node/     bench.mjs · compare.mjs
  python/   bench.py
  java/     StageTimingMain (+ thin pom)
```

---

## English

**What this is:** wall-clock micro-benchmarks for the **Node.js, Python, and Java XAIOP SDKs**, plus a **cross-scheme** compare (Node) against other wire styles. Primary use: **same-machine before/after** after engine work (`emitDiff`, Diff isolation, `compactCommitted`, …).

**What this is not:** racing `JSON.parse`; LLM structured-output evaluation in [`docs/performance.md`](../../docs/performance.md).

### Run (from this directory)

```bash
cd xaiop-sdk/timing
npm install                    # installs node/ deps

# Node
npm run bench:save-baseline    # once, before your change
npm run bench                  # Δ% vs node/baseline-bench.json
npm run bench:quick

# Python
npm run bench:python:save-baseline
npm run bench:python
npm run bench:python:quick

# Java (JDK 17+ · Maven; installs ../java into local .m2 first)
npm run bench:java:save-baseline
npm run bench:java
npm run bench:java:quick

npm run compare                # five-scheme dimensional compare (Node)
```

Direct (no facade):

```bash
npm --prefix node run bench
python python/bench.py --quick
mvn -f ../java/pom.xml -q -DskipTests install && mvn -f java/pom.xml -q compile exec:java -Dexec.args=--quick
```

From the Node SDK package: `npm run bench` / `npm run compare` in `xaiop-sdk/nodejs`.

Env: `BENCH_ITERS`, `BENCH_WARMUP`, `BENCH_LONG_PHASES`, `BENCH_FAIL_SLOWER=1`.  
Flags: `--quick`, `--json`, `--save-baseline`, `--no-baseline`.

### Artifacts (gitignored, per runtime)

| Runtime | Last run | Baseline | Other |
| --- | --- | --- | --- |
| Node | `node/last-bench.json` | `node/baseline-bench.json` | `node/last-report.json` |
| Python | `python/last-bench.json` | `python/baseline-bench.json` | — |
| Java | `java/last-bench.json` | `java/baseline-bench.json` | — |

### Stage microbench

| Area | Stages |
| --- | --- |
| Encode / parse | `encodeSync/*`, `parseSync/*`, materialize |
| Checkpoint | streamOn / streamOff / dense |
| Diff tax | `emitDiffOn` vs `emitDiffOff` (dense) |
| D1 / D2 | `>name` after `.` split push; `@` into named array |
| Locate | `!` / `=` |
| Long session | grow buffer vs `compactCommitted` each phase |
| Stream | PROMISE (no Diff) vs CALLBACK+`onChunk` (Diff on) |

### Compare schemes (`node/compare.mjs`)

| Scheme | Dimension |
| --- | --- |
| **Full JSON** | Atomic document — usable only at EOF |
| **NDJSON** | Line records merged into one tree |
| **JSON Patch** | RFC 6902 ops applied from `{}` |
| **Protobuf** | Schema binary — atomic decode |
| **XAIOP** | Nested IR — parseSync / checkpoint streamOn·Off·emitDiffOff |

---

## 简体中文

**本目录：** 按运行时分目录的 SDK 墙钟测速 +（Node）五方案横向对比。主用途：**同机优化前/后**。`node/bench.mjs`、`python/bench.py`、`java/StageTimingMain` **阶段名一致**。

```bash
cd xaiop-sdk/timing
npm install
npm run bench:save-baseline / npm run bench
npm run bench:python:save-baseline / npm run bench:python
npm run bench:java:save-baseline / npm run bench:java
npm run compare
```

| 目录 | 说明 |
| --- | --- |
| `node/` | Node 阶段计时 + `compare.mjs` |
| `python/` | Python 阶段计时 |
| `java/` | Java 阶段计时（先 `mvn install` `../java`） |

产物写在各自目录的 `last-bench.json` / `baseline-bench.json`（gitignore）。
