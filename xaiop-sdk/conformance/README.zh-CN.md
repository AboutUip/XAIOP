# XAIOP 黄金对等

跨 SDK 的 encode / parse / 流式 Diff 黄金转储与比对。  
模糊测试：[`fuzz/`](fuzz/)。  
Python ↔ Go **核心线文**（STRICT 协议轨，**非**产品黄金）：[`core-wire/`](core-wire/)。

## 布局

| 路径 | 作用 |
| --- | --- |
| `fixtures/` | 共享 `.xaiop` / JSON 语料（Node ↔ Java ↔ Python） |
| `node/dump-goldens.mjs` | Node NDJSON 转储 |
| `java/run-dump.mjs` | 编译 Java test main 并转储 NDJSON |
| `python/dump-goldens.py` | Python 产品 NDJSON 转储 |
| `compare.mjs` | 树 / Diff 深相等；线文字节相等 |
| `core-wire/` | Python ↔ Go STRICT 语料（`cases.json`）+ dump/compare |
| `fuzz/` | 变异模糊测试（Node + Java） |
| `out/` | 生成的 NDJSON（gitignore） |

## 转储格式（NDJSON）

每行：

```json
{"case":"encode:0","kind":"encode","wire":"..."}
{"case":"parse:complex","kind":"parse","tree":{...}}
{"case":"stream:phases","kind":"stream","diffs":[...],"snapshot":{...}}
```

两侧 case id 必须一致。流式用例使用 `mergeChunkWindow: false` 的 `DotCheckpointEngine`。

**产品黄金覆盖：** encode 语料（**20**）+ parse/stream（`complex` · `stream-phases` · `overwrite-id` · `delete-phases` · `at-array-d2` · `bang-broadcast`）→ **32** 例。

## 本地运行

### Node ↔ Java

```bash
npm run golden
```

依赖：Node ≥ 18、JDK 17+、Maven 3.9+，以及已构建的 Node SDK（`dist/` 缺失时 dump 会自动 `tsc`）。

### Node ↔ Python

```bash
# 安装一次：
cd ../python && python -m pip install -e ".[dev,http,ws]"

cd ../conformance
npm run golden:python
```

### Python ↔ Go 核心线文

```bash
npm run core-wire
```

依赖：Python ≥ 3.10、Go ≥ 1.22、Node（仅用于 `compare-core.mjs`）。

## 模糊测试

```bash
node fuzz/fuzz-node.mjs --max=200
node fuzz/fuzz-java/run-fuzz.mjs --max=200
```

非 `XaiopSyntaxError` 的意外崩溃会导致进程失败。

## CI

`.github/workflows/ci.yml` 任务：`node`、`java`、`python`、`go`、`golden`（Node↔Java）、`golden-python`（Node↔Python）、`core-wire`（Python↔Go）、`fuzz`。
