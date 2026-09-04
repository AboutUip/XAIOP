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
  <a href="https://github.com/AboutUip/XAIOP"><img alt="Protocol" src="https://img.shields.io/badge/protocol-v0.7.0_Draft-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="Cursor IR" src="https://img.shields.io/badge/wire-cursor--IR-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="Streaming" src="https://img.shields.io/badge/stream-phase--native-0ea5e9?style=flat-square&labelColor=0b1220" />
  <img alt="Node SDK" src="https://img.shields.io/badge/SDK-Node.js_0.16.0-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="Java SDK" src="https://img.shields.io/badge/SDK-Java_0.16.0-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="Python SDK" src="https://img.shields.io/badge/SDK-Python_0.16.0-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="Go SDK" src="https://img.shields.io/badge/SDK-Go_0.16.0-22c55e?style=flat-square&labelColor=0b1220" />
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
  <a href="docs/sdk/"><img alt="SDK docs" src="https://img.shields.io/badge/docs-SDK-22c55e?style=flat-square&labelColor=0b1220" /></a>
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

[Syntax](docs/protocol/syntax.md) · [Full fixture](docs/examples/complex.xaiop) · [Node demo](demos/nodejs/) · [Python demo](demos/python/)

---

### Paths

- **Introduction** — [docs/overview/introduction.md](docs/overview/introduction.md)
- **Protocol (wire only)** — [docs/protocol/](docs/protocol/) · [separation](docs/SEPARATION.md) · [releases](docs/meta/releases.md) · [META-VER](docs/meta/status-and-versioning.md)
- **Practice** — [docs/practice/](docs/practice/) · [streaming](docs/practice/streaming-transport.md) · [skeleton WS](docs/practice/skeleton-stream.md)
- **SDKs** — [docs/sdk/](docs/sdk/) · [parity contract](docs/sdk/behavioral-contract.md) · [code](xaiop-sdk/) · [stage timing](xaiop-sdk/timing/)
  - **Node.js** `xaiop` **0.16.0** — **[API](docs/sdk/nodejs/API.md)** · [notes](docs/sdk/nodejs/notes/) · [`XaiopWs`](docs/sdk/nodejs/notes/ws-session.md) · [code](xaiop-sdk/nodejs/) · [demo](demos/nodejs/)
  - **Java** `io.github.aboutuip:xaiop` **0.16.0** ([Maven Central](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop)) — [API](docs/sdk/java/) · [install](docs/sdk/java/README.md#install) · [ALIGNMENT](docs/sdk/java/ALIGNMENT.md) · [code](xaiop-sdk/java/)
  - **Python** `xaiop` **0.16.0** — [API](docs/sdk/python/API.md) · [ALIGNMENT](docs/sdk/python/ALIGNMENT.md) · [code](xaiop-sdk/python/) · [demo](demos/python/)
  - **Go** `github.com/AboutUip/XAIOP/xaiop-sdk/go` **0.16.0** ([pkg.go.dev](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.16.0)) — [API](docs/sdk/go/API.md) · [install](docs/sdk/go/README.md#install) · [ALIGNMENT](docs/sdk/go/ALIGNMENT.md) · [code](xaiop-sdk/go/) · [demo](demos/go/)
- **Plugins** — [plugins/](plugins/) — **optional, non-authoritative** editor hosts (not the wire; see [docs/SEPARATION.md](docs/SEPARATION.md) §0). First host: [VS Code / Cursor](plugins/vscode-xaiop/) — presentation / lint UI / live inspect / encode UX only
- **Preview docs** — same origin as lab: `cd views && npm run dev` → [http://127.0.0.1:5173/docs/](http://127.0.0.1:5173/docs/) (Docsify over `docs/`; shared dark theme)
- **Lab UI** — [views/](views/) → [http://127.0.0.1:5173/](http://127.0.0.1:5173/) — playground / live stream / API markdown render
- **Sealed archives** — [docs/archive/](docs/archive/) (LLM emit / metrics recipes deliberately out of live hubs)

Official product SDKs (**Node · Java · Python · Go** `0.16.0`, protocol **0.7.0** Draft): parse · stream · encode · merge · history · WS · Control Root · typeCheck · intercept / Annotation Span (no browser package on Java/Python/Go). Node remains the primary reference; Java/Python/Go are aligned at observable-semantics level. English docs are authoritative; `*.zh-CN.md` mirrors ship throughout. Parity: [java/ALIGNMENT](docs/sdk/java/ALIGNMENT.md) · [python/ALIGNMENT](docs/sdk/python/ALIGNMENT.md) · [go/ALIGNMENT](docs/sdk/go/ALIGNMENT.md).

**Announcement (2026-08-04):** Skills are **no longer provided** as an official product; source remains downloadable from [`skills/`](skills/) as a **retained protocol digest** (aligned to **0.6.0**; not a sealed deliverable). Full notes: [docs/meta/release-notes-2026-08-04.md](docs/meta/release-notes-2026-08-04.md).

---

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="Frozen" src="https://img.shields.io/badge/protocol-Draft_v0.7.0-14b8a6?style=flat-square&labelColor=0b1220" />
  <a href="docs/meta/releases.md"><img alt="Releases" src="https://img.shields.io/badge/docs-releases-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/"><img alt="Docs" src="https://img.shields.io/badge/docs-index-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>
