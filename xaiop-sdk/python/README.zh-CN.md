# XAIOP Python SDK

官方产品 SDK（`xaiop` **0.15.1**，协议 **0.6.0**）。

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
cd ../../dev/sdk-timing && python bench.py --quick
```
