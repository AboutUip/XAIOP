# XAIOP Python SDK

[English](README.md) · Simplified Chinese: [README.zh-CN.md](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | `xaiop` |
| Track | **Core protocol** (not full product SDK) |
| Protocol | **0.6.0** Frozen (`PROTOCOL_VERSION`) |
| SDK | `0.6.0a1` (`SDK_VERSION`, PEP 440) |
| Code | [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/) |

**Implemented:** STRICT `parse_sync` · `LiveParser` · `encode_sync` · `materialize` · Fragment / Content / `&` `#` `.` `=` `@` `!`.  
**Out of scope:** Node/`0.15.1` product surface (stream · WS · history · Control Root · typeCheck · ...).

Peer: [../go/](../go/). Policy: [../notes/core-sdk-track.md](../notes/core-sdk-track.md).  
Fixtures: [../../../xaiop-sdk/conformance/core-wire/](../../../xaiop-sdk/conformance/core-wire/).

## Status

**Wire-complete** on the core-protocol track — protocol-conformant, not Node product parity.

## Public API

```python
from xaiop import parse_sync, encode_sync, LiveParser, materialize, XaiopFragment
```

## Verify

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev]"
pytest
```

## Cross-check / CI

```bash
cd xaiop-sdk/conformance && npm run core-wire
```

CI jobs: see `.github/workflows/ci.yml` (`python` / `go` / `core-wire`).
