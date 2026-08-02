# XAIOP

<p align="center">
  <img src="resources/xaiop-mark.svg" width="96" height="96" alt="XAIOP mark" />
</p>

<p align="center">
  <strong>eXtensible AI Output Protocol</strong><br/>
  <sub>Models write lines. Programs parse them deterministically.</sub>
</p>

<p align="center">
  <a href="https://github.com/AboutUip/XAIOP"><img alt="Protocol" src="https://img.shields.io/badge/protocol-v0.1.0_Frozen-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="AI-native" src="https://img.shields.io/badge/output-AI--native-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="Node SDK" src="https://img.shields.io/badge/SDK-Node.js-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="Line-oriented" src="https://img.shields.io/badge/wire-line--oriented-94a3b8?style=flat-square&labelColor=0b1220" />
</p>

<p align="center">
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/lang-English-0ea5e9?style=flat-square&labelColor=0b1220" /></a>
  <a href="README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/protocol/syntax.md"><img alt="Protocol docs" src="https://img.shields.io/badge/docs-Protocol-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/sdk/nodejs/"><img alt="SDK docs" src="https://img.shields.io/badge/docs-SDK-22c55e?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/performance.md"><img alt="Metrics" src="https://img.shields.io/badge/docs-Metrics-f59e0b?style=flat-square&labelColor=0b1220" /></a>
</p>

---

<p align="center">
  <img alt="LLM" src="https://img.shields.io/badge/LLM-0b1220?style=for-the-badge&logoColor=white" />
  <img alt="to" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="XAIOP" src="https://img.shields.io/badge/XAIOP-14b8a6?style=for-the-badge&labelColor=0b1220" />
  <img alt="to" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="Parser" src="https://img.shields.io/badge/Parser-0ea5e9?style=for-the-badge&labelColor=0b1220" />
  <img alt="to" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="JSON · App" src="https://img.shields.io/badge/JSON%20·%20App-22c55e?style=for-the-badge&labelColor=0b1220" />
</p>

<p align="center">
  Not a service-to-service JSON replacement — the bridge from <em>generation</em> to <em>software</em>.
</p>

---

### The problem with JSON-shaped generation

Traditional JSON/XML ask the model for a finished, globally correct structure in one pass — a **memory** test of braces and depth. XAIOP asks for a sequence of cursor moves; the SDK materializes JSON. **Memory → logic.**

### What XAIOP changes

Structure is **line-oriented**. Position is a **cursor**. There is **no brace pairing**, no model-side hashing, and — by default — **no silent repair**. The wire stays honest.

Gains are **conditional** on the model’s JSON strength — not a universal replacement story.

→ [Positioning](docs/overview/positioning.md) · [Design principles](docs/overview/design-principles.md) · [Introduction](docs/overview/introduction.md)

---

### On the wire

```text
>
>meta
name:demo
version:1
.
>tags-
:alpha
:beta
.
>users-
>
id:1
name:alice
<
```

Materializes as:

```json
{
  "meta": { "name": "demo", "version": 1 },
  "tags": ["alpha", "beta"],
  "users": [{ "id": 1, "name": "alice" }]
}
```

[Syntax](docs/protocol/syntax.md) · [Full fixture](docs/examples/complex.xaiop) · [Node demo](demos/nodejs/)

---

### Paths

- **Grammar** — [docs/protocol/](docs/protocol/)
- **Node.js SDK** — [docs/sdk/nodejs/](docs/sdk/nodejs/) · [xaiop-sdk/nodejs/](xaiop-sdk/nodejs/)
- **Teach the model** — [classic Skill](skills/xaiop/SKILL.md) · [allowlist Skill](skills/xaiop-allowlist/SKILL.md)
- **Metrics package** — [JSON](docs/metrics/bench-metrics-gpt-gemini-compat-2026-08-02.json) · [guide](docs/metrics/bench-metrics-gpt-gemini-compat-2026-08-02.md)

Java and Python SDKs are pending update. English docs are authoritative; `*.zh-CN.md` mirrors ship throughout.

---

### Evidence

Native dual channel · no JSON→XAIOP translation · structure rate among non-empty completions  
Definitions: [docs/performance.md](docs/performance.md)

<p align="center">
  <img alt="GPT classic JSON" src="https://img.shields.io/badge/GPT%20classic%20·%20JSON-86.1%25-ef4444?style=flat-square&labelColor=0b1220" />
  <img alt="GPT classic XAIOP" src="https://img.shields.io/badge/GPT%20classic%20·%20XAIOP-94.4%25-14b8a6?style=flat-square&labelColor=0b1220" />
  <br/>
  <img alt="GPT allowlist JSON" src="https://img.shields.io/badge/GPT%20allowlist%20·%20JSON-80.6%25-ef4444?style=flat-square&labelColor=0b1220" />
  <img alt="GPT allowlist XAIOP" src="https://img.shields.io/badge/GPT%20allowlist%20·%20XAIOP-88.9%25-14b8a6?style=flat-square&labelColor=0b1220" />
  <br/>
  <img alt="Gemini classic JSON" src="https://img.shields.io/badge/Gemini%20classic%20·%20JSON-91.7%25-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="Gemini classic XAIOP" src="https://img.shields.io/badge/Gemini%20classic%20·%20XAIOP-97.2%25-14b8a6?style=flat-square&labelColor=0b1220" />
  <br/>
  <img alt="Gemini allowlist JSON" src="https://img.shields.io/badge/Gemini%20allowlist%20·%20JSON-91.7%25-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="Gemini allowlist XAIOP" src="https://img.shields.io/badge/Gemini%20allowlist%20·%20XAIOP-100%25-22c55e?style=flat-square&labelColor=0b1220" />
</p>

<p align="center">
  <img alt="DEEPWIDE JSON" src="https://img.shields.io/badge/DEEPWIDE%20·%20JSON-0%25-ef4444?style=for-the-badge&labelColor=0b1220" />
  <img alt="DEEPWIDE XAIOP" src="https://img.shields.io/badge/DEEPWIDE%20·%20XAIOP-100%25-22c55e?style=for-the-badge&labelColor=0b1220" />
  <br/>
  <sub>Deep trees; JSON left braces unclosed — all four runs.</sub>
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <p align="center"><sub>GPT · allowlist · compatibility</sub></p>
      <img src="resources/ChatGPT模型对于XAIOP兼容模式的白名单SKILL测试.png" alt="GPT allowlist compatibility suite" />
    </td>
    <td width="50%" valign="top">
      <p align="center"><sub>GPT · classic · compatibility</sub></p>
      <img src="resources/ChatGPT模型对于XAIOP兼容模式的非白名单SKILL测试.png" alt="GPT classic compatibility suite" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <p align="center"><sub>Gemini · allowlist · compatibility</sub></p>
      <img src="resources/Gemini模型对于XAIOP兼容模式的白名单SKILL测试.png" alt="Gemini allowlist compatibility suite" />
    </td>
    <td width="50%" valign="top">
      <p align="center"><sub>Gemini · classic · compatibility</sub></p>
      <img src="resources/Gemini模型对于XAIOP兼容模式的非白名单SKILL测试.png" alt="Gemini classic compatibility suite" />
    </td>
  </tr>
</table>

<p align="center">
  <sub>Additional screenshots (native mode, DeepSeek) → <a href="resources/">resources/</a></sub>
</p>

---

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="Frozen" src="https://img.shields.io/badge/protocol-Frozen_v0.2.0-14b8a6?style=flat-square&labelColor=0b1220" />
  <a href="docs/"><img alt="Docs" src="https://img.shields.io/badge/docs-index-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>
