# XAIOP Python SDK

Official product SDK (`xaiop` **0.15.1**, protocol **0.7.0** Draft).

Guide: [../../docs/sdk/python/README.md](../../docs/sdk/python/README.md)
Parity: [../../docs/sdk/python/ALIGNMENT.md](../../docs/sdk/python/ALIGNMENT.md)
Demo: [../../demos/python/](../../demos/python/)

## Setup

```bash
python -m pip install -e ".[dev,http,ws]"
pytest
```

## Golden

```bash
cd ../conformance && npm run golden:python
```

## Timing

```bash
cd ../timing && python python/bench.py --quick
# Parse ↔ JSON: npm run bench:python:json-gate (from timing/)
```

Hub: [../../docs/performance.md](../../docs/performance.md). Extreme-perf tip (**2026-08-09**): [../../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md). Prior: [../../docs/meta/release-notes-2026-08-08-python-0.15.1-internal.md](../../docs/meta/release-notes-2026-08-08-python-0.15.1-internal.md).
