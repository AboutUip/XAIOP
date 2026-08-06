# Release notes — 2026-08-06 · Core protocol SDKs (Python · Go)

[English](release-notes-2026-08-06-core-sdk.md) · Simplified Chinese: [release-notes-2026-08-06-core-sdk.zh-CN.md](release-notes-2026-08-06-core-sdk.zh-CN.md)

| Field | Value |
| --- | --- |
| Date | **2026-08-06** |
| Protocol | **0.6.0** Frozen (unchanged) |
| Python `xaiop` | **0.6.0a1** (core-protocol track) |
| Go module | **0.6.0-alpha.1** (core-protocol track) |
| Node `xaiop` | **0.15.1** (rebuild verified; no version bump) |
| Java `io.xaiop:xaiop` | **0.15.1** (rebuild verified; no version bump) |
| Kind | Core-wire SDKs + cross-language CI |

## Summary

Ships **STRICT Frozen 0.6.0** wire cores for **Python** and **Go** on the core-protocol track: parse / encode / Live / materialize.  
Adds shared `cases.json` corpus, Python ↔ Go NDJSON compare, and CI jobs.  
Does **not** claim Node/`0.15.1` or Java product parity.

Policy: [../sdk/notes/core-sdk-track.md](../sdk/notes/core-sdk-track.md) · Fixtures: [../../xaiop-sdk/conformance/core-wire/](../../xaiop-sdk/conformance/core-wire/)

## What shipped

### Python (`xaiop-sdk/python`)

- `parse_sync`, `LiveParser`, `encode_sync`, `materialize`, `XaiopFragment`
- STRICT operators: `>` `<` `-` `=` `@` `!` `&` `#` `.` · Content typing · forced-string
- Package **0.6.0a1** (PEP 440); protocol **0.6.0**
- Tests: unit + shared corpus (**86** passed locally)

### Go (`xaiop-sdk/go`)

- `Parse`, `LiveParser`, `Encode`, `Materialize`, `Fragment`
- Same STRICT wire surface as Python
- Module version **0.6.0-alpha.1**; `cmd/dump-core-wire` for CI dumps
- Tests: unit + shared corpus

### Conformance & CI

- `conformance/core-wire/cases.json` — **38** shared cases
- `npm run core-wire` — dump Python + Go, compare trees/wire
- GitHub Actions: `python`, `go`, `core-wire` (alongside existing `node` / `java` / `golden` / `fuzz`)
- Repository `.gitignore` expanded for Go / Python / conformance dumps

## Clarifications

| Topic | Decision |
| --- | --- |
| Authority | `docs/protocol/` (Frozen **0.6.0**) |
| vs Node/Java | Protocol-conformant core only; **not** product golden |
| Encode key order | Cross dumps use `key_order: sorted` (deterministic vs Go maps) |
| Numbers | Compare with numeric equivalence (`1` == `1.0`) |
| Error text | Need not match across languages; case outcomes must |

## Build artifacts (local verify)

| Stack | Artifact |
| --- | --- |
| Node | `xaiop-sdk/nodejs/dist/xaiop-0.15.1.tgz` |
| Java | `xaiop-sdk/java/target/xaiop-0.15.1.jar` |
| Python | `xaiop-sdk/python/dist/xaiop-0.6.0a1-py3-none-any.whl` (+ sdist) |
| Go | library package (no single binary publish); `go test ./...` |

## Verify

Node:

```bash
cd xaiop-sdk/nodejs
npm ci
npm run build:ts
npm test
npm run pack
```

Java:

```bash
cd xaiop-sdk/java
mvn -B package
```

Python:

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev]"
python -m pytest -q
python -m build
```

Go:

```bash
cd xaiop-sdk/go
go test ./...
go build ./cmd/dump-core-wire
```

Python ↔ Go core-wire:

```bash
cd xaiop-sdk/conformance
npm run core-wire
```

## Suggested tags

- Python alpha: `sdk-python-v0.6.0a1`
- Go alpha: `sdk-go-v0.6.0-alpha.1`
