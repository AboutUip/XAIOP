# XAIOP Python SDK

Installable package `xaiop` on the **core protocol track** (wire **v0.6.0 Frozen**, STRICT).

Guide: [../../docs/sdk/python/README.md](../../docs/sdk/python/README.md) · Simplified Chinese: [../../docs/sdk/python/README.zh-CN.md](../../docs/sdk/python/README.zh-CN.md)  
Shared scope: [../../docs/sdk/notes/core-sdk-track.md](../../docs/sdk/notes/core-sdk-track.md)

## Status

| Item | State |
| --- | --- |
| Layout / package | **Active** |
| `PROTOCOL_VERSION` | **0.6.0** |
| `SDK_VERSION` | **0.6.0a1** |
| Parse / encode / Live / materialize | **Implemented** (STRICT) |
| Product surface (stream · WS · control · ...) | **Out of scope** |

Aligned peer: [../go/](../go/). Corpus: [../conformance/core-wire/](../conformance/core-wire/).

## Setup

```bash
python -m pip install -e ".[dev]"
pytest
```

## Cross-check (Python ↔ Go)

```bash
cd ../conformance
npm run core-wire
```

## Layout

```text
pyproject.toml
src/xaiop/          # parse · encode · Live · materialize
tests/              # includes cases.json corpus
```
