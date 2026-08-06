# XAIOP Python SDK

面向 **核心协议轨**（线文 **v0.6.0 Frozen**，STRICT）的可安装包 `xaiop`。

指南：[../../docs/sdk/python/README.zh-CN.md](../../docs/sdk/python/README.zh-CN.md) · English: [../../docs/sdk/python/README.md](../../docs/sdk/python/README.md)  
范围说明：[../../docs/sdk/notes/core-sdk-track.zh-CN.md](../../docs/sdk/notes/core-sdk-track.zh-CN.md)

## 状态

| 项 | 状态 |
| --- | --- |
| 布局 / 包 | **进行中** |
| `PROTOCOL_VERSION` | **0.6.0** |
| `SDK_VERSION` | **0.6.0a1** |
| Parse / encode / Live / materialize | **已实现**（STRICT） |
| 产品面（stream · WS · control · ...） | **不在范围** |

对齐同伴：[../go/](../go/)。

## 安装

```bash
python -m pip install -e ".[dev]"
pytest
```

## 布局

```text
pyproject.toml
src/xaiop/          # parse · encode · Live · materialize
tests/
```
