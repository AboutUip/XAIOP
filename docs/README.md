# XAIOP documentation

[English](README.md) · [简体中文](README.zh-CN.md)

Hub for three **coupled but isolated** trees — see **[SEPARATION.md](SEPARATION.md)**.  
**What XAIOP is:** [overview/introduction.md](overview/introduction.md).  
**Frozen / sealed** = immutable protocol package versions — [meta/releases.md](meta/releases.md) · [meta/status-and-versioning.md](meta/status-and-versioning.md) (`META-VER`).  
**Latest tip:** Node.js `xaiop` **0.15.0** ↔ protocol **0.6.0** (buffer compact · `@` Diff · Diff isolation · Control Root `#!` / `meta.logSeq` / resume).
**Prior release notes:** [meta/release-notes-2026-08-05-0.15.0.md](meta/release-notes-2026-08-05-0.15.0.md) (Node **0.15.0**) · [meta/release-notes-2026-08-05-0.14.3.md](meta/release-notes-2026-08-05-0.14.3.md) (Node **0.14.3**) · [meta/release-notes-2026-08-05-0.14.2.md](meta/release-notes-2026-08-05-0.14.2.md) (Node **0.14.2**) · [meta/release-notes-2026-08-05-0.14.1.md](meta/release-notes-2026-08-05-0.14.1.md) (Node **0.14.1**) · [meta/release-notes-2026-08-05.md](meta/release-notes-2026-08-05.md) (Node **0.14.0** Control Root) · [meta/release-notes-2026-08-04.md](meta/release-notes-2026-08-04.md) (Node **0.13.0** · Java **0.5.0** · Skills discontinued as a product; source remains under [`../skills/`](../skills/)).

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
| **Node.js** | **[sdk/nodejs/API.md](sdk/nodejs/API.md)** (primary · §6.4 line intercept · §6.5 Annotation Span · §7.7 Control Root; Node ≥ 18; browser phase consume via `xaiop/browser`) · [sdk/nodejs/](sdk/nodejs/) | [../xaiop-sdk/nodejs/](../xaiop-sdk/nodejs/) — `xaiop` **0.15.0** ↔ protocol **0.6.0** |
| Java | [sdk/java/](sdk/java/) | [../xaiop-sdk/java/](../xaiop-sdk/java/) — `io.xaiop:xaiop` **0.5.0** (stream consumer) · protocol **0.4.0** subset |
| Python | [sdk/python/](sdk/python/) | [../xaiop-sdk/python/](../xaiop-sdk/python/) — pending |

---

## Other

[meta/](meta/) · [overview/](overview/) · [terminology/](terminology/) · [requirements/](requirements/) · [conformance/](conformance/) · [archive/](archive/) · [metrics/](metrics/) (data snapshots; recipes in sealed archive)

**Browse this tree locally:** `cd views && npm run dev` → http://127.0.0.1:5173/docs/ (Docsify; edit markdown, refresh).

---

## Language pairs

| English (default) | Chinese |
| --- | --- |
| `path/name.md` | `path/name.zh-CN.md` |
