# Positioning — What XAIOP Is

[English](positioning.md) · [简体中文](positioning.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `OV-POS` |
| Status | Informative |
| Version | 0.2.0 |
| Last updated | 2026-08-03 |
| Normative | **No** — product stance and evidence narrative |
| Depends on | `OV-INTRO`, `OV-PRIN`, `PERF-METRICS` |
| Related | [performance.md](../performance.md) · [introduction.md](introduction.md) |

---

## 1. What it is

XAIOP is a line-oriented **cursor construction** protocol.

Writers emit enter / leave / locate / reset instructions. Programs **materialize** that sequence into JSON deterministically — including mid-stream **`.` phases** (Snapshot / Diff on the SDK surface).

**In one line:** writers walk a cursor; software owns the tree.

It is **not** a service-to-service JSON bus. It is the bridge from *incremental construction* to *consumable JSON*.

---

## 2. Two layers

| Layer | Owns | Who |
| --- | --- | --- |
| **Wire IR** | Cursor ops, later-wins, phase reset, honest parse (no silent repair by default) | Any conforming writer |
| **Product wedge** | Unreliable or incremental writers where one-shot finished trees fail | LLMs (primary evidence); also `encode`, skeleton WS push |

Wire meaning is Frozen protocol. Product APIs (stream Diff boundary, compat ingest, WS sessions) live under SDK / practice — [../SEPARATION.md](../SEPARATION.md).

```text
Writer (LLM · tool · WS push)
        │
        ▼
   XAIOP wire (cursor IR)
        │
        ▼
   SDK / Parser (materialize · phases)
        │
        ▼
   JSON Snapshot / Diff → application
```

---

## 3. Generative wedge — verified LLM evidence

One-shot JSON/XML ask for a finished, globally correct structure — a **memory** test of braces and depth. On that wedge, XAIOP turns **memory → logic** (local next-step cursor moves).

Seven real benches (GPT-5.6-terra / Gemini-3.6-flash / DeepSeek-v4, native + compatibility) show:

**Structural gain is inversely related to the model’s own JSON strength.**

| Model profile | Observed pattern |
| --- | --- |
| Weaker JSON baseline (e.g. GPT) | Larger structure-success lift (native **+23.8 pp**; some tasks **0% → 100%**), cost relatively controllable |
| Strong JSON baseline (e.g. DeepSeek) | Lift approaches **zero**; token cost can rise **2–3×**, latency **3×+** |

This is **not** “XAIOP always beats JSON.” It is conditional engineering guidance for the generative wedge. Formal metrics: [performance.md](../performance.md). Screenshots: [`resources/`](../../resources/).

---

## 4. Product surfaces beyond the LLM Skill

The same wire powers non-LLM writers and progressive delivery:

| Surface | Role |
| --- | --- |
| SDK `encode` | Tools / adapters emit strict wire for tests and streams |
| `XaiopStream` / `.` checkpoints | Mid-stream phase Diff + committed / final Snapshot |
| `XaiopWs` skeleton sessions | Fixed-key phase push over WebSocket |
| Practice transport | HTTP / SSE / WS / RAW framing recipes |

These are **first-class product paths**, not side effects of “helping models write JSON.” Third-party parity: [../sdk/behavioral-contract.md](../sdk/behavioral-contract.md).

---

## 5. Bottlenecks outside protocol design

On the LLM wedge, models also **refuse to stay on rails** under pressure (long output, deep nesting): fall back to JSON/YAML habits, or pick brittle forms inside the protocol. That is instruction-following discipline — format design alone cannot fix it.

---

## 6. Current stance

| In scope | Out of scope / not claimed |
| --- | --- |
| Progressive structured streams (cursor IR → materialize → Snapshot/Diff) | Replacing service-to-service JSON |
| Generative / incremental writers (LLM wedge with published conditional gains) | Universal token or latency wins |
| Honest publication of weak / regressing LLM cases | “Always better than JSON” |
| Tool and session writers on the same wire | Treating XAIOP as only an AI prompt format |

→ [Introduction](introduction.md) · [Design principles](design-principles.md) · Root [README](../../README.md)
