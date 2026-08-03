# Performance evaluation (metrics)

[English](performance.md) · [简体中文](performance.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `PERF-METRICS` |
| Status | Informative |
| Last updated | 2026-08-03 |
| Normative | **No** — evaluation methodology & published snapshot |
| Depends on | Protocol Frozen v0.2.0 · Node.js SDK compatibility mode |

---

## 1. Purpose

This page documents **how we measure** XAIOP vs JSON for LLM structured output, and points to a **published metrics snapshot** suitable for teaching and external review.

It does **not** redefine the wire protocol. Grammar remains in [protocol/](../protocol/).

---

## 2. What is measured (definitions)

| Metric | Definition |
| --- | --- |
| **Structure success** | Eligible (non-empty completion) **and** HTTP OK **and** (`JSON.parse` OK **or** `XaiopEngine.parseSync(text, compatibilityMode)` OK) |
| **Structure rate** | `structSuccess / (structSuccess + structFail)` — **excludes** `networkSkip` |
| **networkSkip** | HTTP OK but **empty** completion body → treated as gateway/network; **not** counted in the structure-rate denominator |
| **Token / latency / size means** | Averaged **only over structure-successful** rounds |
| **XAIOP fair prompt / total** | Comparison prompt tokens **exclude Skill body**; only short emit system + task user. API raw totals may appear as `*_api` in source benches |
| **gains.\*_pct** | Relative to JSON: `(json_mean - xaiop_mean) / json_mean * 100` — **positive ⇒ XAIOP better** (fewer tokens / chars / ms) |
| **speed_ratio** | `json_ms_mean / xaiop_ms_mean` — **>1 ⇒ XAIOP faster** |

### Methodology constraints (accuracy)

1. **Native dual channel** — For **LLM bench metrics**, JSON and XAIOP are generated separately; the evaluation **must not** score a model by translating JSON→XAIOP after the fact.  
   *(The Node.js SDK **does** ship `encode` / `uploadJson` for tools, tests, and adapters — see [sdk/nodejs/encode.md](./sdk/nodejs/encode.md). That API is out of scope for these dual-channel model scores.)*  
2. **Same task prompts** (format-neutral task text + mode-specific output tail).  
3. **Skill in system** for XAIOP (not user); warmup excluded from timed task metrics.  
4. **Compatibility mode** may be enabled for structure checks (stated per snapshot).  
5. Artifacts may keep the **last successful** body when some rounds fail — failed-round payloads are not always retained; trust `structErrors` on the metrics export for failure reasons.

---

## 3. Published snapshot (GPT + Gemini, compatibility mode)

| File | Role |
| --- | --- |
| [`metrics/bench-metrics-gpt-gemini-compat-2026-08-02.json`](./metrics/bench-metrics-gpt-gemini-compat-2026-08-02.json) | Full metrics (no raw model payloads) |
| [`metrics/bench-metrics-gpt-gemini-compat-2026-08-02.md`](./metrics/bench-metrics-gpt-gemini-compat-2026-08-02.md) | Teacher-oriented field guide |

### Headline structure rates

| Run | Model | Skill | JSON | XAIOP | Δ (pp) |
| --- | --- | --- | --- | --- | --- |
| `gpt_xaiop_compat` | GPT-5.6 Terra | `xaiop` | 86.1% | **94.4%** | +8.3 |
| `gpt_allowlist_compat` | GPT-5.6 Terra | `xaiop-allowlist` | 80.6% | **88.9%** | +8.3 |
| `gemini_xaiop_compat` | Gemini 3.6 Flash | `xaiop` | 91.7% | **97.2%** | +5.5 |
| `gemini_allowlist_compat` | Gemini 3.6 Flash | `xaiop-allowlist` | 91.7% | **100%** | +8.3 |

### Where XAIOP helps most (this snapshot)

- **DEEPWIDE**: JSON **0%** / XAIOP **100%** on all four runs (deep nesting / unclosed braces in JSON).  
- Long / dirty / truncated JSON tasks fail more often; XAIOP is **line-oriented** and avoids brace pairing.  
- XAIOP is **not** free: long GPT runs may still fail on junk Labels; STREAM (forced low `max_tokens`) can fail both sides.

### Efficiency (when both succeed)

- **Characters**: XAIOP usually shorter.  
- **Completion tokens**: mixed — do **not** claim “always fewer tokens”; use per-task `gains` in the JSON.

Render charts yourself from `comparison_matrix` in the metrics JSON.

---

## 4. Screenshots (legend)

Terminal / suite screenshots live under [`resources/`](../../resources/). Compatibility-mode runs in the snapshot map to:

| Run id | Image |
| --- | --- |
| `gpt_allowlist_compat` | [ChatGPT · compat · allowlist Skill](../../resources/ChatGPT模型对于XAIOP兼容模式的白名单SKILL测试.png) |
| `gpt_xaiop_compat` | [ChatGPT · compat · classic Skill](../../resources/ChatGPT模型对于XAIOP兼容模式的非白名单SKILL测试.png) |
| `gemini_allowlist_compat` | [Gemini · compat · allowlist Skill](../../resources/Gemini模型对于XAIOP兼容模式的白名单SKILL测试.png) |
| `gemini_xaiop_compat` | [Gemini · compat · classic Skill](../../resources/Gemini模型对于XAIOP兼容模式的非白名单SKILL测试.png) |

Related (not in this four-run export): native-mode and DeepSeek shots in the same folder — listed in the metrics JSON under `resources.related_screenshots_not_in_this_export`.

---

## 5. Applicability (what this evidence supports)

| Suitable | Not a claim from this suite |
| --- | --- |
| LLM → app structured extraction where JSON braces break | Replacing JSON between microservices |
| Deep / wide trees, dirty strings, long scripts (with Skill + optional compat) | “Always fewer tokens than JSON” |
| Teaching / demos with reproducible **metric** packages | Byte-identical reproduction without the same gateway models |

**Product stance:** gains are **conditional on model profile** (often larger when JSON baseline is weaker; can be near-zero gain with higher cost when JSON is already strong). Full narrative — problem framing, seven-bench pattern, bottlenecks outside the protocol, current positioning: **[overview/positioning.md](overview/positioning.md)**.

Skills: [`skills/xaiop/`](../../skills/xaiop/) · [`skills/xaiop-allowlist/`](../../skills/xaiop-allowlist/).
