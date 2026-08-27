# XAIOP Python SDK

[English](README.md) · Simplified Chinese: [README.zh-CN.md](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | `xaiop` |
| Track | **Official product SDK** |
| Protocol | **0.7.0** Draft (`PROTOCOL_VERSION`) |
| SDK | `0.15.1` (`SDK_VERSION`) |
| Code | [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/) |
| **API reference** | **[API.md](API.md)** (authoritative surface) |
| Parity | **[ALIGNMENT.md](ALIGNMENT.md)** |

Official port of Node `xaiop` **0.15.1** product surface (no browser). Protocol wire is **0.7.0** Draft.

For the full Python API (parse / encode / engine / stream / WS / control / types), see **[API.md](API.md)**.

## Status

**0.15.1** — stable. Full product surface aligned with Node **0.15.1** at observable-semantics level (see [ALIGNMENT.md](ALIGNMENT.md)).

## Public API (selected)

```python
from xaiop import (
    parse_sync, encode_sync, LiveParser, materialize,
    XaiopEngine, DotCheckpointEngine, XaiopStream, XaiopWs,
    CompatPolicy, TypeRegistry, AnnotationSpan,
)
```

Optional extras: `pip install "xaiop[http,ws]"` (`httpx`, `websockets`).

## Verify

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev,http,ws]"
pytest
```

≈ **487** unit tests under `tests/`. Parity matrix: [ALIGNMENT.md](ALIGNMENT.md).

## Golden / CI

```bash
cd xaiop-sdk/conformance && npm run golden:python
```

**60** Node↔Python golden cases (encode corpus **40** + ten parse/stream fixtures). Jobs: `python`, `golden-python` in `.github/workflows/ci.yml`.

## Timing

[`xaiop-sdk/timing`](../../../xaiop-sdk/timing/) — `npm run bench:python` · `bench:python:json-gate`. Hub: [../../performance.md](../../performance.md). Extreme-perf tip (**2026-08-09**): [../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md).
