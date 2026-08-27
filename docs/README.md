# XAIOP documentation

[English](README.md) · [简体中文](README.zh-CN.md)

Hub for three **coupled but isolated** trees — see **[SEPARATION.md](SEPARATION.md)**.  
**What XAIOP is:** [overview/introduction.md](overview/introduction.md).  
**Frozen / sealed** = immutable protocol package versions — [meta/releases.md](meta/releases.md) · [meta/status-and-versioning.md](meta/status-and-versioning.md) (`META-VER`).  
**Latest tip:** Official product SDKs **Node · Java · Python · Go** `0.16.0` ↔ protocol **0.7.0** Draft (**this tree**; registries still **0.15.1** until publish). Go parity: [sdk/go/ALIGNMENT.md](sdk/go/ALIGNMENT.md) (product golden **60** · core-wire **152**).  
**Node npm:** last published [`@bylan280/xaiop@0.15.1`](https://www.npmjs.com/package/@bylan280/xaiop) — this tree **0.16.0**. [release-notes-2026-08-27-sdk-0.16.0.md](meta/release-notes-2026-08-27-sdk-0.16.0.md) · [nodejs-npm 0.15.1](meta/release-notes-2026-08-09-nodejs-npm.md).  
**Java Maven:** last on Central [`io.github.aboutuip:xaiop:0.15.1`](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop) — this tree **0.16.0**. [install](sdk/java/README.md#install).  
**Go module:** last tagged [`…/xaiop-sdk/go@v0.15.1`](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1) — this tree **0.16.0**. [install](sdk/go/README.md#install).  
**SDK stage timing / extreme-perf (2026-08-09):** [performance.md](performance.md) · [meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md).  
**Prior release notes:** [meta/release-notes-2026-08-27-sdk-0.16.0.md](meta/release-notes-2026-08-27-sdk-0.16.0.md) (SDK **0.16.0** this tree) · [meta/release-notes-2026-08-08-go-0.15.1.md](meta/release-notes-2026-08-08-go-0.15.1.md) (Go **0.15.1**) · [meta/release-notes-2026-08-08-python-0.15.1.md](meta/release-notes-2026-08-08-python-0.15.1.md) (Python **0.15.1**) · [meta/release-notes-2026-08-05-0.15.1.md](meta/release-notes-2026-08-05-0.15.1.md) (Node **0.15.1**) · [meta/release-notes-2026-08-05-0.15.0.md](meta/release-notes-2026-08-05-0.15.0.md) (Node **0.15.0**) · [meta/release-notes-2026-08-05-0.14.3.md](meta/release-notes-2026-08-05-0.14.3.md) (Node **0.14.3**) · [meta/release-notes-2026-08-05-0.14.2.md](meta/release-notes-2026-08-05-0.14.2.md) (Node **0.14.2**) · [meta/release-notes-2026-08-05-0.14.1.md](meta/release-notes-2026-08-05-0.14.1.md) (Node **0.14.1**) · [meta/release-notes-2026-08-05.md](meta/release-notes-2026-08-05.md) (Node **0.14.0** Control Root) · [meta/release-notes-2026-08-04.md](meta/release-notes-2026-08-04.md) (Node **0.13.0** · Java **0.5.0** · Skills discontinued as a product; source remains under [`../skills/`](../skills/)).

**Browse live:** `cd views && npm run dev` → [http://127.0.0.1:5173/docs/](http://127.0.0.1:5173/docs/) ([Docsify](https://docsify.js.org) over this tree, same origin as the lab). Sidebar: `python docs/archive/gen-sidebar.py`.

```text
protocol  →  practice  →  sdk  →  meta
                ↘ archive (target seals; not the live path)
```

| Layer | Path | Role |
| --- | --- | --- |
| **Protocol** | [protocol/](protocol/) | Sealed streaming line wire (Cursor IR) |
| **Practice** | [practice/](practice/) | Live usage scenarios (transport, sessions) |
| **SDK** | [sdk/](sdk/) | Language APIs |
| **Meta** | [meta/](meta/) | Releases, seal rules, revisions |
| **Archive** | [archive/](archive/) | Target-sealed snapshots (not live hubs) |

---

## Protocol

Entry: **[protocol/syntax.md](protocol/syntax.md)**  
Index: [protocol/README.md](protocol/README.md) · wire notes: [protocol/notes/](protocol/notes/)  
Fixtures: [examples/](examples/)

---

## Practice

Index: [practice/README.md](practice/README.md)

| Guide | Topic |
| --- | --- |
| [practice/streaming-transport.md](practice/streaming-transport.md) | Network streaming, framing, product Snapshot/Diff |
| [practice/skeleton-stream.md](practice/skeleton-stream.md) | Fixed-key WebSocket push (SDK `XaiopWs`) |
| [practice/keyed-state-modeling.md](practice/keyed-state-modeling.md) | Keyed maps / repeated names for locate·broadcast·delete |

LLM emit / metrics recipes moved to sealed archive: [archive/practice-llm-emit-2026-08-04/](archive/practice-llm-emit-2026-08-04/) (stubs remain at [practice/model-output.md](practice/model-output.md) · [performance.md](performance.md)).

---

## SDK

Index: [sdk/README.md](sdk/README.md) · catalog: [sdk/behavioral-contract.md](sdk/behavioral-contract.md) · notes: [sdk/notes/](sdk/notes/)

| Stack | Docs | Code |
| --- | --- | --- |
| **Node.js** | **[sdk/nodejs/API.md](sdk/nodejs/API.md)** (primary · §6.4 line intercept · §6.5 Annotation Span · §7.7 Control Root; Node ≥ 18; browser phase consume via `@bylan280/xaiop/browser`) · [sdk/nodejs/](sdk/nodejs/) | [../xaiop-sdk/nodejs/](../xaiop-sdk/nodejs/) — npm **`@bylan280/xaiop`** **0.16.0** ↔ protocol **0.7.0** Draft |
| Java | [sdk/java/](sdk/java/) · **[ALIGNMENT](sdk/java/ALIGNMENT.md)** · [install](sdk/java/README.md#install) | [../xaiop-sdk/java/](../xaiop-sdk/java/) — Maven Central **`io.github.aboutuip:xaiop`** **0.16.0** — protocol **0.7.0** Draft |
| Python | [sdk/python/](sdk/python/) · **[ALIGNMENT](sdk/python/ALIGNMENT.md)** | [../xaiop-sdk/python/](../xaiop-sdk/python/) — `xaiop` **0.16.0** — protocol **0.7.0** Draft |
| Go | [sdk/go/](sdk/go/) · **[ALIGNMENT](sdk/go/ALIGNMENT.md)** · [install](sdk/go/README.md#install) | [../xaiop-sdk/go/](../xaiop-sdk/go/) — `github.com/AboutUip/XAIOP/xaiop-sdk/go` **0.16.0** — protocol **0.7.0** Draft |

---

## Other

[meta/](meta/) · [overview/](overview/) · [terminology/](terminology/) · [requirements/](requirements/) · [conformance/](conformance/) · [archive/](archive/) · [metrics/](metrics/) (data snapshots; recipes in sealed archive)

**Browse this tree locally:** `cd views && npm run dev` → http://127.0.0.1:5173/docs/ (Docsify; edit markdown, refresh).

---

## Language pairs

| English (default) | Chinese |
| --- | --- |
| `path/name.md` | `path/name.zh-CN.md` |
