# Positioning — What XAIOP Solves

[English](positioning.md) · [简体中文](positioning.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `OV-POS` |
| Status | Informative |
| Version | 0.1.0 |
| Last updated | 2026-08-02 |
| Normative | **No** — product stance and evidence narrative |
| Depends on | `OV-INTRO`, `OV-PRIN`, `PERF-METRICS` |
| Related | [performance.md](../performance.md) · [introduction.md](introduction.md) |

---

## 1. The problem XAIOP addresses

Traditional formats (JSON / XML) were designed for **deterministic programs**. They ask the generator to emit a finished, globally correct structure in one pass: braces must pair, nesting depth must stay exact, and a single slip can invalidate everything that follows.

That demand is, at root, a **memory** test. While generating, the model must keep tracking how deep it is and how many closers are still owed.

XAIOP replaces that demand. It does **not** ask the model to describe “what the final result looks like.” It asks the model to write a sequence of **construction instructions** — enter / leave / locate / reset — walking a cursor over a data tree. The SDK interprets that sequence into JSON deterministically.

What the model must maintain is no longer “global structural correctness,” but the local judgment of **where to go next**.

**In one line:** turn a *memory* problem into a *logic* problem. Emitting final JSON is, in a sense, generating “assembly of the result.” XAIOP asks the model to write an operation sequence closer to what it is naturally good at: step-by-step, reason-as-you-go generation.

---

## 2. What has been verified

Seven real benches (GPT-5.6-terra / Gemini-3.6-flash / DeepSeek-v4, each with native and compatibility modes) show a clear pattern:

**XAIOP’s structural gain is inversely related to the model’s own JSON strength.**

| Model profile | Observed pattern |
| --- | --- |
| Weaker JSON baseline (e.g. GPT) | Larger structure-success lift from XAIOP (native mode **+23.8 pp**; some tasks from **0% → 100%**), with relatively controllable cost |
| Strong JSON baseline (e.g. DeepSeek) | Structure lift approaches **zero**, while token cost can rise **2–3×** and latency **3×+** |

This is **not** a story that “XAIOP always beats JSON.” It is a more honest, more useful engineering conclusion: **the protocol’s value is conditional** — it depends on the capability profile of the target model.

Formal metric definitions and published snapshots: [performance.md](../performance.md). Screenshots: [`resources/`](../../resources/).

---

## 3. Remaining bottlenecks — outside protocol design

The same tests expose failures the protocol cannot fix. Models do not only “forget”; they also **refuse to stay on rails**. Under pressure (very long output, deep nesting), they take shortcuts: fall back to deeply trained JSON/YAML habits, or pick easier but more brittle forms *inside* the protocol.

That is an **instruction-following discipline** problem. Format design alone cannot solve it.

---

## 4. Current stance

XAIOP is a **forward-looking experiment**, not a JSON replacement. Fit is intentionally narrow:

- cost-sensitive lighter models  
- models with strong instruction-following discipline  
- very long structured-output workloads  

All metrics, costs, and failure cases are published in the repository — including scenes where gains are thin or negative. The goal is not cheerleading; it is to have the protocol **used correctly in the right scenarios**.

| In scope for positioning | Out of scope / not claimed |
| --- | --- |
| LLM → application structured extraction where JSON brackets fail | Replacing service-to-service JSON |
| Conditional gains by model profile | Universal token or latency wins |
| Honest publication of weak / regressing cases | “Always better than JSON” |

---

## 5. Related reading

- [Introduction](introduction.md) — purpose, goals, non-goals  
- [Design principles](design-principles.md) — normative constraints  
- [Performance metrics](../performance.md) — how rates are defined  
- Root [README](../../README.md) — short front-door summary  
