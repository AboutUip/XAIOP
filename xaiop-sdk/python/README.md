# XAIOP Python SDK

Official product SDK (`xaiop` **0.15.1**, protocol **0.6.0**).

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
cd ../timing && python bench.py --quick
```
