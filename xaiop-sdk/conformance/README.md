# XAIOP golden conformance

Cross-SDK golden dumps and comparison for encode / parse / stream Diff parity.  
Fuzz harness: [`fuzz/`](fuzz/).  
Python ↔ Go **core-wire** (STRICT protocol track, **not** product golden): [`core-wire/`](core-wire/) — **152** cases, also loaded by Node / Java / Python / Go unit tests.

## Layout

| Path | Role |
| --- | --- |
| `fixtures/` | Shared `.xaiop` / JSON corpus (Node ↔ Java ↔ Python ↔ Go) |
| `node/dump-goldens.mjs` | Node NDJSON dump |
| `java/run-dump.mjs` | Compiles Java test main and dumps NDJSON |
| `python/dump-goldens.py` | Python product NDJSON dump |
| `../go/cmd/dump-goldens` | Go product NDJSON dump |
| `compare.mjs` | Deep-equal trees/diffs; byte-equal wire |
| `core-wire/` | Python ↔ Go STRICT corpus (`cases.json`) + dump/compare |
| `fuzz/` | Mutation fuzz (Node + Java) |
| `out/` | Generated NDJSON dumps (gitignored) |

## Dump format (NDJSON)

Each line:

```json
{"case":"encode:0","kind":"encode","wire":"..."}
{"case":"parse:complex","kind":"parse","tree":{...}}
{"case":"stream:phases","kind":"stream","diffs":[...],"snapshot":{...}}
```

Case ids must match across runtimes. Stream cases use `DotCheckpointEngine` with `mergeChunkWindow: false`.

**Product golden coverage (current):** encode corpus (**40**) + parse/stream for ten fixtures → **60** cases:

`complex` · `stream-phases` (`stream:phases`) · `overwrite-id` · `delete-phases` · `at-array-d2` · `bang-broadcast` · `d1-named-enter` · `locate-equals` · `hash-ignore` · `at-exact`

## Run locally

### Node ↔ Java golden

```bash
npm run golden
```

Prerequisites: Node ≥ 18, JDK 17+, Maven 3.9+, and a built Node SDK (`cd ../nodejs && npm run build:ts` — dump-goldens builds if `dist/` is missing).

### Node ↔ Python golden

```bash
# once:
cd ../python && python -m pip install -e ".[dev,http,ws]"

cd ../conformance
npm run golden:python
```

### Node ↔ Go golden

```bash
npm run golden:go
```

Prerequisites: Go ≥ 1.22, Node ≥ 18, built Node SDK.

### Python ↔ Go core-wire

```bash
npm run core-wire
```

Prerequisites: Python ≥ 3.10, Go ≥ 1.22, Node (for `compare-core.mjs` only). STRICT corpus: **152** cases.

## Fuzz

```bash
node fuzz/fuzz-node.mjs --max=200
node fuzz/fuzz-java/run-fuzz.mjs --max=200
```

Unexpected crashes (non-`XaiopSyntaxError`) fail the process.

## CI

`.github/workflows/ci.yml` jobs: `node`, `java`, `python`, `go`, `golden` (Node↔Java), `golden-python` (Node↔Python), `golden-go` (Node↔Go), `core-wire` (Python↔Go), `fuzz`.
