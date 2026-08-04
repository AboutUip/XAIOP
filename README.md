# XAIOP

<p align="center">
  <img src="resources/xaiop-mark.svg" width="96" height="96" alt="XAIOP mark" />
</p>

<p align="center">
  <strong>XAIOP</strong><br/>
  <sub>Streaming, line-oriented <em>cursor-construction</em> wire · programs <em>materialize</em> JSON deterministically.</sub><br/>
  <sub><em>Legacy naming:</em> "eXtensible AI Output Protocol" — not the definition of scope or primary use case.</sub>
</p>

<p align="center">
  <a href="https://github.com/AboutUip/XAIOP"><img alt="Protocol" src="https://img.shields.io/badge/protocol-v0.6.0_Frozen-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="Cursor IR" src="https://img.shields.io/badge/wire-cursor--IR-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="Streaming" src="https://img.shields.io/badge/stream-phase--native-0ea5e9?style=flat-square&labelColor=0b1220" />
  <img alt="Node SDK" src="https://img.shields.io/badge/SDK-Node.js_0.15.0-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="Line-oriented" src="https://img.shields.io/badge/wire-line--oriented-94a3b8?style=flat-square&labelColor=0b1220" />
</p>

<p align="center">
  <sub>Sealed protocol versions are <strong>immutable</strong> — <a href="docs/meta/releases.md">releases</a> · <a href="docs/meta/status-and-versioning.md">META-VER</a></sub>
</p>

<p align="center">
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/lang-English-0ea5e9?style=flat-square&labelColor=0b1220" /></a>
  <a href="README.zh-CN.md"><img alt="Simplified Chinese" src="https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/overview/introduction.md"><img alt="Introduction" src="https://img.shields.io/badge/docs-Introduction-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/protocol/syntax.md"><img alt="Protocol docs" src="https://img.shields.io/badge/docs-Protocol-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/practice/"><img alt="Practice docs" src="https://img.shields.io/badge/docs-Practice-f59e0b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/sdk/nodejs/API.md"><img alt="SDK docs" src="https://img.shields.io/badge/docs-SDK-22c55e?style=flat-square&labelColor=0b1220" /></a>
</p>

---

<p align="center">
  Any conforming <strong>Generator</strong> emits enter / leave / locate / reset / delete instructions.<br/>
  Programs materialize JSON — including mid-stream <code>.</code> phases.<br/>
  <sub>Not a service-to-service JSON bus · not a universal JSON evolution layer (prefer keyed / named paths — <a href="docs/practice/keyed-state-modeling.md">keyed modeling</a>).</sub><br/>
  <sub>Tools · WS sessions · encode pipelines are <em>usage scenarios</em>, not the wire definition.</sub>
</p>

---

### The problem with one-shot finished structures

Traditional JSON/XML ask a writer for a finished, globally correct tree in one pass — brace pairing and depth bookkeeping. That is a **memory** test for long or incremental output.

XAIOP asks for a sequence of **cursor construction** steps. The SDK **materializes** JSON. Structure is line-oriented; position is a cursor; `.` bounds stream phases. By default there is **no silent repair**.

Writers are any conforming Generator — programs, `encode` tooling, skeleton WebSocket push.

→ [Introduction](docs/overview/introduction.md) · [Design principles](docs/overview/design-principles.md) · [Separation](docs/SEPARATION.md)

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

- **Introduction** — [docs/overview/introduction.md](docs/overview/introduction.md)
- **Protocol (wire only)** — [docs/protocol/](docs/protocol/) · [separation](docs/SEPARATION.md) · [releases](docs/meta/releases.md) · [META-VER](docs/meta/status-and-versioning.md)
- **Practice** — [docs/practice/](docs/practice/) · [streaming](docs/practice/streaming-transport.md) · [skeleton WS](docs/practice/skeleton-stream.md)
- **Node.js SDK** — **[docs/sdk/nodejs/API.md](docs/sdk/nodejs/API.md)** (§6.4 line intercept · §6.5 Annotation Span · §7.7 Control Root) · [notes](docs/sdk/nodejs/notes/) · [`XaiopWs`](docs/sdk/nodejs/notes/ws-session.md) · [parity](docs/sdk/behavioral-contract.md) · [code](xaiop-sdk/nodejs/) · [SDK timing](dev/sdk-timing/)
- **Java SDK** — [docs/sdk/java/](docs/sdk/java/) · [code](xaiop-sdk/java/)
- **Preview docs** — same origin as lab: `cd views && npm run dev` → [http://127.0.0.1:5173/docs/](http://127.0.0.1:5173/docs/) (Docsify over `docs/`; shared dark theme)
- **Lab UI** — [views/](views/) → [http://127.0.0.1:5173/](http://127.0.0.1:5173/) — playground / live stream / API markdown render
- **Sealed archives** — [docs/archive/](docs/archive/) (LLM emit / metrics recipes deliberately out of live hubs)

Java SDK is active (`io.xaiop:xaiop` **0.5.0** — parse · encode · merge · checkpoint · **XaiopStream** HTTP/SSE/RAW; wire still **0.4.0**; WS / cover / typeCheck later). Node.js `xaiop` **0.15.0** implements protocol **0.6.0**. Python is still pending. English docs are authoritative; `*.zh-CN.md` mirrors ship throughout.

**Announcement (2026-08-04):** Skills are **no longer provided** as an official product; source remains downloadable from [`skills/`](skills/). Full notes: [docs/meta/release-notes-2026-08-04.md](docs/meta/release-notes-2026-08-04.md).

---

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="Frozen" src="https://img.shields.io/badge/protocol-Frozen_v0.6.0-14b8a6?style=flat-square&labelColor=0b1220" />
  <a href="docs/meta/releases.md"><img alt="Releases" src="https://img.shields.io/badge/docs-releases-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/"><img alt="Docs" src="https://img.shields.io/badge/docs-index-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>
