# XAIOP Documentation

[English](README.md) · [简体中文](README.zh-CN.md)

Three **coupled but isolated** trees (see **[SEPARATION.md](SEPARATION.md)**).  
**Stance:** line-oriented **cursor IR** → SDK materialize / phases; generative writers (LLM wedge) are conditional evidence — [overview/positioning.md](overview/positioning.md).

| Tree | Path | Purpose |
| --- | --- | --- |
| **Protocol** | [protocol/](protocol/) | Frozen v0.4.0 wire — cursor IR grammar & semantics only |
| **Practice** | [practice/](practice/) | Writer recipes: **model emit**, **streaming transport**, sessions |
| **SDK** | [sdk/](sdk/) | Runtime APIs per language (materialize · encode · stream · WS) |

Foundation (conventions, glossary, requirements, conformance) supports the protocol package under this `docs/` root.

---

## Protocol

Start: **[protocol/syntax.md](protocol/syntax.md)**  
Index: [protocol/README.md](protocol/README.md) · Wire notes: [protocol/notes/](protocol/notes/)  
Fixtures: [examples/](examples/)

---

## Practice

Index: [practice/README.md](practice/README.md)

| Guide | Topic |
| --- | --- |
| [practice/model-output.md](practice/model-output.md) | LLM / Generator emit, Skills |
| [practice/streaming-transport.md](practice/streaming-transport.md) | Network streaming, framing, product Snapshot/Diff |
| [practice/skeleton-stream.md](practice/skeleton-stream.md) | Fixed-key WebSocket push (SDK `XaiopWs`) |

---

## SDK

Index: [sdk/README.md](sdk/README.md) · Parity: [sdk/behavioral-contract.md](sdk/behavioral-contract.md) · Notes: [sdk/notes/](sdk/notes/)

| Stack | Docs | Code |
| --- | --- | --- |
| **Node.js** | [sdk/nodejs/](sdk/nodejs/) | [../xaiop-sdk/nodejs/](../xaiop-sdk/nodejs/) (`xaiop` 0.6.0+) |
| Java | [sdk/java/](sdk/java/) | [../xaiop-sdk/java/](../xaiop-sdk/java/) — **pending update** |
| Python | [sdk/python/](sdk/python/) | [../xaiop-sdk/python/](../xaiop-sdk/python/) — **pending update** |

---

## Also

[meta/](meta/) · [overview/](overview/) ([positioning](overview/positioning.md) · [introduction](overview/introduction.md) · [principles](overview/design-principles.md)) · [terminology/](terminology/) · [requirements/](requirements/) · [conformance/](conformance/) · [performance.md](performance.md) · [metrics/](metrics/)

---

## Language pairing

| English (default) | Chinese |
| --- | --- |
| `path/name.md` | `path/name.zh-CN.md` |
