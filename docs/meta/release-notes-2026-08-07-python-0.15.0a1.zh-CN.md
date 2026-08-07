# 发行说明 — 2026-08-07 · Python SDK 0.15.0a1

[English](release-notes-2026-08-07-python-0.15.0a1.md) · [简体中文](release-notes-2026-08-07-python-0.15.0a1.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Python `xaiop` | **0.15.0a1** |
| 协议 | **0.6.0** Frozen |
| 参考 | Node.js `xaiop` **0.15.1** |
| 类型 | 官方端口 alpha（完整产品面） |

## 摘要

Python 从核心线文轨 **晋级** 为官方 SDK alpha，对齐 Node 0.15.1 产品面（无 browser）：compat · merge · engine · types · checkpoint · control · stream · WS。

对等矩阵：[../sdk/python/ALIGNMENT.zh-CN.md](../sdk/python/ALIGNMENT.zh-CN.md)

## 要点

- STRICT + CompatPolicy ×8 · `symbolKeys` · 完整 encode（ES 浮点 token）
- `XaiopEngine` · merge/inject · `DotCheckpointEngine` · history / compact
- typeCheck · 行拦截 · `AnnotationSpan.KEEP` · Control Root
- `XaiopStream`（http/sse/raw）· `XaiopWs` connect/listen
- Node ↔ Python golden：encode / parse / stream Diff NDJSON（**32** 例）
- 扩展 pytest 面（约 **296** 方法），见 ALIGNMENT §5

## 验证

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev,http,ws]"
python -m pytest -q
```

```bash
cd xaiop-sdk/conformance
npm run golden:python
```

## 建议标签

`sdk-python-v0.15.0a1`
