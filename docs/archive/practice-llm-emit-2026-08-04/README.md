# Archive — LLM emit practice seal

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `ARCHIVE-LLM-EMIT` |
| Status | **Sealed snapshot** (informative) |
| Sealed on | 2026-08-04 |
| Tip at seal | Protocol **0.6.0** · Node SDK **0.13.0** |
| Normative | **No** — not wire; not live practice index |

---

## 1. Purpose

This directory **seals** optional LLM / model-emit guidance and LLM structured-output **metrics recipes** that used to live under live `docs/practice/` and `docs/performance*`.

Live product docs (root README, `docs/README`, practice index) **no longer** promote LLM-output optimization as a primary path. Wire identity remains protocol + SDK.

---

## 2. Contents

| File | Former path | Doc ID |
| --- | --- | --- |
| [model-output.md](model-output.md) / [zh-CN](model-output.zh-CN.md) | `docs/practice/model-output*` | `PRACTICE-MODEL` |
| [performance.md](performance.md) / [zh-CN](performance.zh-CN.md) | `docs/performance*` | `PERF-METRICS` |
| [SEAL.md](SEAL.md) | — | seal record |

Related (not moved; cited only):

- Skills: [`../../../skills/xaiop/`](../../../skills/xaiop/) · [`../../../skills/xaiop-allowlist/`](../../../skills/xaiop-allowlist/)
- Metrics snapshots: [`../../metrics/`](../../metrics/)
- Screenshots: [`../../../resources/`](../../../resources/)

---

## 3. Live stubs

| Stub | Points here |
| --- | --- |
| [`../../practice/model-output.md`](../../practice/model-output.md) | → this seal |
| [`../../performance.md`](../../performance.md) | → this seal |

---

## 4. Validation

From repo root:

```bash
python docs/archive/validate-docs.py
```

Checks tip SDK/protocol badges in hubs, broken relative links, deleted-path leftovers, and root README LLM-evidence regressions.

---

## 5. Parent index

[../README.md](../README.md)
