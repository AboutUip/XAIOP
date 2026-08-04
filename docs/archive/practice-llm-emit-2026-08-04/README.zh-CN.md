# 封存 — LLM 发射实践包

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `ARCHIVE-LLM-EMIT` |
| 状态 | **目标封存快照**（信息性） |
| 封存日 | 2026-08-04 |
| 封存时 tip | 协议 **0.6.0** · Node SDK **0.13.0** |
| 规范性 | **否** — 非线文；非现行实践索引 |

---

## 1. 目的

本目录**封存**曾放在现行 `docs/practice/` 与 `docs/performance*` 的可选 LLM / 模型发射指引与结构化输出**评测口径**。

现行产品文档（根 README、`docs/README`、实践索引）**不再**把 LLM 输出优化作为主路径推广。身份仍是协议 + SDK。

---

## 2. 内容

| 文件 | 原路径 | Doc ID |
| --- | --- | --- |
| [model-output.zh-CN.md](model-output.zh-CN.md) / [EN](model-output.md) | `docs/practice/model-output*` | `PRACTICE-MODEL` |
| [performance.zh-CN.md](performance.zh-CN.md) / [EN](performance.md) | `docs/performance*` | `PERF-METRICS` |
| [SEAL.md](SEAL.md) | — | 封存记录 |

相关（未迁入，仅引用）：

- Skills：[`../../../skills/xaiop/`](../../../skills/xaiop/) · [`../../../skills/xaiop-allowlist/`](../../../skills/xaiop-allowlist/)
- 指标快照：[`../../metrics/`](../../metrics/)
- 截图：[`../../../resources/`](../../../resources/)

---

## 3. 现行占位

| 占位 | 指向 |
| --- | --- |
| [`../../practice/model-output.zh-CN.md`](../../practice/model-output.zh-CN.md) | → 本封存包 |
| [`../../performance.zh-CN.md`](../../performance.zh-CN.md) | → 本封存包 |

---

## 4. 校验

仓库根目录：

```bash
python docs/archive/validate-docs.py
```

检查枢纽 tip 版本、相对链接、已删除路径残留、根 README LLM 证据墙回潮。

---

## 5. 上级索引

[../README.zh-CN.md](../README.zh-CN.md)
