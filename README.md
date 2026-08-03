# XAIOP

<p align="center">
  <img src="resources/xaiop-mark.svg" width="96" height="96" alt="XAIOP mark" />
</p>

<p align="center">
  <strong>eXtensible AI Output Protocol</strong><br/>
  <sub>Line-oriented <em>cursor construction</em> · programs <em>materialize</em> JSON deterministically.</sub>
</p>

<p align="center">
  <a href="https://github.com/AboutUip/XAIOP"><img alt="Protocol" src="https://img.shields.io/badge/protocol-v0.4.0_Frozen-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="Cursor IR" src="https://img.shields.io/badge/wire-cursor--IR-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="Streaming" src="https://img.shields.io/badge/stream-phase--native-0ea5e9?style=flat-square&labelColor=0b1220" />
  <img alt="Node SDK" src="https://img.shields.io/badge/SDK-Node.js-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="Line-oriented" src="https://img.shields.io/badge/wire-line--oriented-94a3b8?style=flat-square&labelColor=0b1220" />
</p>

<p align="center">
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/lang-English-0ea5e9?style=flat-square&labelColor=0b1220" /></a>
  <a href="README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/overview/positioning.md"><img alt="Positioning" src="https://img.shields.io/badge/docs-Positioning-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/protocol/syntax.md"><img alt="Protocol docs" src="https://img.shields.io/badge/docs-Protocol-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/practice/"><img alt="Practice docs" src="https://img.shields.io/badge/docs-Practice-f59e0b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/sdk/nodejs/"><img alt="SDK docs" src="https://img.shields.io/badge/docs-SDK-22c55e?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/performance.md"><img alt="Metrics" src="https://img.shields.io/badge/docs-Metrics-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>

---

<p align="center">
  <img alt="Writer" src="https://img.shields.io/badge/Writer-0b1220?style=for-the-badge&logoColor=white" />
  <img alt="to" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="XAIOP" src="https://img.shields.io/badge/XAIOP-14b8a6?style=for-the-badge&labelColor=0b1220" />
  <img alt="to" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="SDK" src="https://img.shields.io/badge/SDK%20·%20Parser-0ea5e9?style=for-the-badge&labelColor=0b1220" />
  <img alt="to" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="JSON" src="https://img.shields.io/badge/JSON%20·%20Snapshot-22c55e?style=for-the-badge&labelColor=0b1220" />
</p>

<p align="center">
  Writers emit enter / leave / locate / reset instructions.<br/>
  Programs materialize JSON — including mid-stream <code>.</code> phases.<br/>
  <sub>Not a service-to-service JSON bus. LLM · tools · WS sessions are writers.</sub>
</p>

---

### The problem with one-shot finished structures

Traditional JSON/XML ask a writer for a finished, globally correct tree in one pass — brace pairing and depth bookkeeping. That is a **memory** test for long or incremental output.

XAIOP asks for a sequence of **cursor construction** steps. The SDK **materializes** JSON. Structure is line-oriented; position is a cursor; `.` bounds stream phases. By default there is **no silent repair**.

Writers include LLMs (primary wedge), `encode` tooling, and skeleton WebSocket push — any conforming source of instructions.

→ [Positioning](docs/overview/positioning.md) · [Design principles](docs/overview/design-principles.md) · [Introduction](docs/overview/introduction.md)

### Generative wedge (conditional)

For LLMs, gains track the model’s own JSON strength — not “always beat JSON.” That evidence is a **wedge**, not the whole product story.

→ [Performance](docs/performance.md)

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

- **Positioning** — [docs/overview/positioning.md](docs/overview/positioning.md) (wire IR · generative wedge)
- **Protocol (wire only)** — [docs/protocol/](docs/protocol/) · [separation](docs/SEPARATION.md)
- **Practice** — [docs/practice/](docs/practice/) · [model output](docs/practice/model-output.md) · [streaming](docs/practice/streaming-transport.md) · [skeleton WS](docs/practice/skeleton-stream.md)
- **Node.js SDK** — [docs/sdk/nodejs/](docs/sdk/nodejs/) · [stream](docs/sdk/nodejs/stream.md) · [encode](docs/sdk/nodejs/encode.md) · [merge](docs/sdk/nodejs/merge.md) · [`XaiopWs`](docs/sdk/nodejs/notes/ws-session.md) · [parity](docs/sdk/behavioral-contract.md) · [code](xaiop-sdk/nodejs/) · [SDK timing: JSON/NDJSON/Patch/Protobuf/XAIOP](dev/sdk-timing/)
- **Java SDK** — [docs/sdk/java/](docs/sdk/java/) · [code](xaiop-sdk/java/)
- **Preview UI** — [views/](views/) (`cd views && npm run dev`)
- **Teach writers** — [classic Skill](skills/xaiop/SKILL.md) · [allowlist Skill](skills/xaiop-allowlist/SKILL.md) · [practice guide](docs/practice/model-output.md)
- **Metrics package** — [JSON](docs/metrics/bench-metrics-gpt-gemini-compat-2026-08-02.json) · [guide](docs/metrics/bench-metrics-gpt-gemini-compat-2026-08-02.md)

Java SDK core is active (`io.xaiop:xaiop` 0.4.0 — parse · encode · merge · checkpoint; Stream/WS later). Python is still pending. English docs are authoritative; `*.zh-CN.md` mirrors ship throughout.

---

### Evidence (LLM wedge)

Native dual channel · no JSON→XAIOP translation · structure rate among non-empty completions  
**Wedge evidence — not the only value claim.** Definitions: [docs/performance.md](docs/performance.md)

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
  <img alt="Frozen" src="https://img.shields.io/badge/protocol-Frozen_v0.4.0-14b8a6?style=flat-square&labelColor=0b1220" />
  <a href="docs/"><img alt="Docs" src="https://img.shields.io/badge/docs-index-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>
