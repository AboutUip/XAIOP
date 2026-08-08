# XAIOP Python SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包名 | `xaiop` |
| 轨道 | **官方产品 SDK** |
| 协议 | **0.6.0** Frozen（`PROTOCOL_VERSION`） |
| SDK | `0.15.1`（`SDK_VERSION`） |
| 代码 | [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/) |
| **API 参考** | **[API.zh-CN.md](API.zh-CN.md)**（权威表面） |
| 对等 | **[ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)** |

官方端口对齐 Node `xaiop` **0.15.1** 产品面（无 browser）。线文协议仍为 **0.6.0**。

完整 Python API（parse / encode / engine / stream / WS / control / types）见 **[API.zh-CN.md](API.zh-CN.md)**。

## 状态

**0.15.1** — 稳定版。产品面在可观察语义层面与 Node **0.15.1** 对齐（见 [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)）。

## 公共 API（节选）

```python
from xaiop import (
    parse_sync, encode_sync, LiveParser, materialize,
    XaiopEngine, DotCheckpointEngine, XaiopStream, XaiopWs,
    CompatPolicy, TypeRegistry, AnnotationSpan,
)
```

可选 extras：`pip install "xaiop[http,ws]"`（`httpx`、`websockets`）。

## 验证

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev,http,ws]"
pytest
```

`tests/` 下约 **479** 单测。对等矩阵：[ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)。

## Golden / CI

```bash
cd xaiop-sdk/conformance && npm run golden:python
```

Node↔Python 黄金 **32** 例。CI 任务：`.github/workflows/ci.yml` 中的 `python`、`golden-python`。
