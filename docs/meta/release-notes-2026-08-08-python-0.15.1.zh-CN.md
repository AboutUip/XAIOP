# 发行说明 — 2026-08-08 · Python SDK 0.15.1

[English](release-notes-2026-08-08-python-0.15.1.md) · [简体中文](release-notes-2026-08-08-python-0.15.1.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Python `xaiop` | **0.15.1** |
| 协议 | **0.6.0** Frozen |
| 参考 | Node.js `xaiop` **0.15.1** · Java `io.xaiop:xaiop` **0.15.1** |
| 类型 | 稳定官方端口（退出 alpha） |

## 摘要

将 Python 从 **0.15.0a1** alpha 晋升为稳定版 **0.15.1**，与 Node/Java tip 对齐。产品面此前已齐；本次去掉 alpha 标签，硬化 CI（Python 3.10–3.12 矩阵 + mutation fuzz），并完成打包 / 文档 / demo 清理。

对等矩阵：[../sdk/python/ALIGNMENT.zh-CN.md](../sdk/python/ALIGNMENT.zh-CN.md)

## 亮点

- 包版本 **0.15.1**；分类器 `Development Status :: 5 - Production/Stable`
- 分发包含 `py.typed` 与 `LICENSE`
- CI：pytest 覆盖 **3.10 / 3.11 / 3.12**（约 **479** 例）；`golden-python`；`core-wire`；Python fuzz（`fuzz/fuzz-python.py`）
- 文档/索引：去掉 alpha /「pending」表述；声明强度 = pytest + golden + core-wire + fuzz
- 最小演示：[`demos/python/`](../../demos/python/)
- 阶段计时：[`xaiop-sdk/timing/python/bench.py`](../../xaiop-sdk/timing/python/bench.py)（与 Node `timing/node/bench.mjs` 阶段名一致）

## 验证

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

## 建议标签

`sdk-python-v0.15.1`
