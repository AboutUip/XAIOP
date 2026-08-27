# XAIOP Python SDK

官方产品 SDK（`xaiop` **0.15.1**，协议 **0.7.0** Draft）。

指南：[../../docs/sdk/python/README.zh-CN.md](../../docs/sdk/python/README.zh-CN.md) · English: [../../docs/sdk/python/README.md](../../docs/sdk/python/README.md)  
对等：[../../docs/sdk/python/ALIGNMENT.zh-CN.md](../../docs/sdk/python/ALIGNMENT.zh-CN.md)  
演示：[../../demos/python/](../../demos/python/)

## 安装

```bash
python -m pip install -e ".[dev,http,ws]"
pytest
```

## 金标

```bash
cd ../conformance && npm run golden:python
```

## 计时

```bash
cd ../timing && python python/bench.py --quick
# Parse ↔ JSON：在 timing/ 下 npm run bench:python:json-gate
```

枢纽：[../../docs/performance.zh-CN.md](../../docs/performance.zh-CN.md)。极限性能 tip（**2026-08-09**）：[../../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](../../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)。此前：[../../docs/meta/release-notes-2026-08-08-python-0.15.1-internal.zh-CN.md](../../docs/meta/release-notes-2026-08-08-python-0.15.1-internal.zh-CN.md)。
