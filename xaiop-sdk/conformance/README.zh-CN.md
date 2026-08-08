# XAIOP 黄金一致性

跨 SDK 的 encode / parse / stream Diff 黄金转储与比对。  
Fuzz：[`fuzz/`](fuzz/)。  
Python ↔ Go **核心线文**（STRICT 协议轨，**非**产品黄金）：[`core-wire/`](core-wire/)。

## 布局

| 路径 | 职责 |
| --- | --- |
| `fixtures/` | 共享 `.xaiop` / JSON 语料（Node ↔ Java ↔ Python ↔ Go） |
| `node/dump-goldens.mjs` | Node NDJSON |
| `java/run-dump.mjs` | Java NDJSON |
| `python/dump-goldens.py` | Python 产品 NDJSON |
| `../go/cmd/dump-goldens` | Go 产品 NDJSON |
| `compare.mjs` | 树/Diff 深相等；线文字节相等 |
| `core-wire/` | Python ↔ Go STRICT 语料 |
| `fuzz/` | 变异 fuzz |
| `out/` | 生成物（gitignore） |

## NDJSON 格式

```json
{"case":"encode:0","kind":"encode","wire":"..."}
{"case":"parse:complex","kind":"parse","tree":{...}}
{"case":"stream:phases","kind":"stream","diffs":[...],"snapshot":{...}}
```

流式用例使用 `DotCheckpointEngine` 且 `mergeChunkWindow: false`。

**产品黄金覆盖（现行）：** encode 语料（**30**）+ 十个 fixture 的 parse/stream → **50** 例：

`complex` · `stream-phases`（`stream:phases`）· `overwrite-id` · `delete-phases` · `at-array-d2` · `bang-broadcast` · `d1-named-enter` · `locate-equals` · `hash-ignore` · `at-exact`

## 本地运行

### Node ↔ Java

```bash
npm run golden
```

### Node ↔ Python

```bash
npm run golden:python
```

### Node ↔ Go

```bash
npm run golden:go
```

### Python ↔ Go core-wire

```bash
npm run core-wire
```

STRICT 语料：**46** 例。

## CI

`.github/workflows/ci.yml`：`node`、`java`、`python`、`go`、`golden`（Node↔Java）、`golden-python`、`golden-go`（Node↔Go）、`core-wire`、`fuzz`。
