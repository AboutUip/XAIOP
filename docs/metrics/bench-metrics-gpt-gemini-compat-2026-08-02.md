# Bench metrics guide — gpt-gemini-compat-2026-08-02

Companion to [`bench-metrics-gpt-gemini-compat-2026-08-02.json`](./bench-metrics-gpt-gemini-compat-2026-08-02.json).

## Snapshot

| Run | Model | Skill | JSON struct rate | XAIOP struct rate | Δ (pp) |
| --- | --- | --- | ---: | ---: | ---: |
| `gpt_xaiop_compat` | openai/gpt-5.6-terra | `xaiop` | 86.1% | **94.4%** | +8.3 |
| `gpt_allowlist_compat` | openai/gpt-5.6-terra | `xaiop-allowlist` | 80.6% | **88.9%** | +8.3 |
| `gemini_xaiop_compat` | google/gemini-3.6-flash | `xaiop` | 91.7% | **97.2%** | +5.5 |
| `gemini_allowlist_compat` | google/gemini-3.6-flash | `xaiop-allowlist` | 91.7% | **100%** | +8.3 |

## Field map (JSON)

| Path | Meaning |
| --- | --- |
| `runs[].suite` | Aggregate structure counts / rates |
| `runs[].tasks[].json|xaiop.structRate` | Per-task structure success rate |
| `runs[].tasks[].gains` | Relative to JSON (`*_pct` positive ⇒ XAIOP better; `speed_ratio` >1 ⇒ faster) |
| `runs[].tasks[].*.structErrors` | Structure failure reasons (no payloads) |
| `runs[].tasks[].*.shardRuns` | XXL shard timing/usage only |
| `comparison_matrix.overview` | Suite-level table for charts |
| `comparison_matrix.by_task` | Per-task matrix across four runs |

## Screenshots

| Run | Image |
| --- | --- |
| `gpt_xaiop_compat` | [`resources/ChatGPT模型对于XAIOP兼容模式的非白名单SKILL测试.png`](../../resources/ChatGPT模型对于XAIOP兼容模式的非白名单SKILL测试.png) |
| `gpt_allowlist_compat` | [`resources/ChatGPT模型对于XAIOP兼容模式的白名单SKILL测试.png`](../../resources/ChatGPT模型对于XAIOP兼容模式的白名单SKILL测试.png) |
| `gemini_xaiop_compat` | [`resources/Gemini模型对于XAIOP兼容模式的非白名单SKILL测试.png`](../../resources/Gemini模型对于XAIOP兼容模式的非白名单SKILL测试.png) |
| `gemini_allowlist_compat` | [`resources/Gemini模型对于XAIOP兼容模式的白名单SKILL测试.png`](../../resources/Gemini模型对于XAIOP兼容模式的白名单SKILL测试.png) |

## Methodology (short)

See [../performance.md](../performance.md). This package is the **published evidence**; local harness code is not part of the documentation tree.
