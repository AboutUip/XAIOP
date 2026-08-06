# XAIOP Python SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包名 | `xaiop` |
| 轨道 | **核心协议**（非完整产品 SDK） |
| 协议 | **0.6.0** Frozen（`PROTOCOL_VERSION`） |
| SDK | `0.6.0a1`（`SDK_VERSION`，PEP 440） |
| 代码 | [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/) |

**已实现：** STRICT `parse_sync` · `LiveParser` · `encode_sync` · `materialize` · Fragment / Content / `&` `#` `.` `=` `@` `!`。  
**不在范围：** Node/`0.15.1` 产品面（stream · WS · history · Control Root · typeCheck · ...）。

同伴：[../go/](../go/)。策略：[../notes/core-sdk-track.zh-CN.md](../notes/core-sdk-track.zh-CN.md)。  
Fixture：[../../../xaiop-sdk/conformance/core-wire/](../../../xaiop-sdk/conformance/core-wire/)。

## 状态

**线文完成**（核心协议轨）— 协议符合，非 Node 产品对等。

## 公共 API

```python
from xaiop import parse_sync, encode_sync, LiveParser, materialize, XaiopFragment
```

## 验证

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev]"
pytest
```

## 交叉校验 / CI

```bash
cd xaiop-sdk/conformance && npm run core-wire
```

CI：.github/workflows/ci.yml（python / go / core-wire）。
