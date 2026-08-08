# Release notes — 2026-08-08 · Python SDK 0.15.1

[English](release-notes-2026-08-08-python-0.15.1.md) · Simplified Chinese: [release-notes-2026-08-08-python-0.15.1.zh-CN.md](release-notes-2026-08-08-python-0.15.1.zh-CN.md)

| Field | Value |
| --- | --- |
| Python `xaiop` | **0.15.1** |
| Protocol | **0.6.0** Frozen |
| Reference | Node.js `xaiop` **0.15.1** · Java `io.xaiop:xaiop` **0.15.1** |
| Kind | Stable official port (exits alpha) |

## Summary

Promotes Python from **0.15.0a1** alpha to stable **0.15.1**, matching Node/Java tip version. Product surface was already complete; this release retires the alpha label, hardens CI (Python 3.10–3.12 matrix + mutation fuzz), and ships packaging/docs/demo cleanup.

Parity matrix: [../sdk/python/ALIGNMENT.md](../sdk/python/ALIGNMENT.md)

## Highlights

- Package version **0.15.1**; classifier `Development Status :: 5 - Production/Stable`
- `py.typed` + `LICENSE` included in the distribution
- CI: pytest on **3.10 / 3.11 / 3.12** (~**479** cases); `golden-python`; `core-wire`; Python fuzz (`fuzz/fuzz-python.py`)
- Docs/indexes: alpha / “pending” wording retired; claim strength = pytest + golden + core-wire + fuzz
- Minimal demo: [`demos/python/`](../../demos/python/)
- Stage timing: [`xaiop-sdk/timing/python/bench.py`](../../xaiop-sdk/timing/python/bench.py) (same stage names as Node `timing/node/bench.mjs`)

## Verify

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev,http,ws]"
python -m pytest -q
python -m build
```

```bash
cd xaiop-sdk/conformance
npm run golden:python
npm run core-wire
python fuzz/fuzz-python.py --max=100 --seed=1
```

```bash
cd xaiop-sdk/timing
python python/bench.py --quick
```

## Suggested tag

`sdk-python-v0.15.1`
