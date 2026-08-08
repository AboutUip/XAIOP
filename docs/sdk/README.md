# SDK Documentation

[English](README.md) · [简体中文](README.zh-CN.md)

Official **SDK** docs. Wire grammar: [../protocol/](../protocol/) (protocol-only).  
Model output & streaming transport: [../practice/](../practice/).  
Architecture: [../SEPARATION.md](../SEPARATION.md).  
**Product catalog (optional):** [behavioral-contract.md](behavioral-contract.md) (protocol conformant ≠ official SDK equivalent).

| Stack | Status | Docs |
| --- | --- | --- |
| [Node.js](nodejs/) | **Primary / official focus** — `xaiop` **0.15.1** (TS) ↔ protocol **0.6.0**; buffer compact · `@` Diff · Diff isolation · Control Root `#!` / `meta.logSeq` / resume; entries `xaiop` · `xaiop/browser` · `xaiop/core` | **[API.md](nodejs/API.md)** (primary) · [notes/](nodejs/notes/) |
| [Java](java/) | **Active** (`io.xaiop:xaiop` **0.15.1** — protocol **0.6.0**: full Node-aligned surface) | **[API.md](java/API.md)** · [Guide](java/README.md) · [ALIGNMENT.md](java/ALIGNMENT.md) |
| [Python](python/) | **Official** — `xaiop` **0.15.1** (protocol **0.6.0**) | **[API.md](python/API.md)** · [Guide](python/README.md) · [ALIGNMENT.md](python/ALIGNMENT.md) |
| [Go](go/) | **Core-protocol wire-complete** (`ProtocolVersion` **0.6.0**, SDK `0.6.0-alpha.1`) | [Guide](go/README.md) · [track](notes/core-sdk-track.md) |

Cross-stack: [behavioral-contract.md](behavioral-contract.md) · [notes/](notes/)

Code: [../../xaiop-sdk/](../../xaiop-sdk/)
