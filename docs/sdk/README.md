# SDK Documentation

[English](README.md) · [简体中文](README.zh-CN.md)

Official **SDK** docs. Wire grammar: [../protocol/](../protocol/) (protocol-only).  
Model output & streaming transport: [../practice/](../practice/).  
Architecture: [../SEPARATION.md](../SEPARATION.md).  
**Product catalog (optional):** [behavioral-contract.md](behavioral-contract.md) (protocol conformant ≠ official SDK equivalent).

| Stack | Status | Docs |
| --- | --- | --- |
| [Node.js](nodejs/) | **Primary / official focus** — `xaiop` **0.15.1** (TS) ↔ protocol **0.6.0**; buffer compact · `@` Diff · Diff isolation · Control Root `#!` / `meta.logSeq` / resume; **2026-08-09** extreme hot-path | **[API.md](nodejs/API.md)** (primary) · [notes/](nodejs/notes/) · [performance](nodejs/notes/performance.md) |
| [Java](java/) | **Official** (`io.xaiop:xaiop` **0.15.1** — protocol **0.6.0**, Node-aligned product surface) | **[API.md](java/API.md)** · [Guide](java/README.md) · [ALIGNMENT.md](java/ALIGNMENT.md) |
| [Python](python/) | **Official** (`xaiop` **0.15.1** — protocol **0.6.0**, Node-aligned product surface) | **[API.md](python/API.md)** · [Guide](python/README.md) · [ALIGNMENT.md](python/ALIGNMENT.md) |
| [Go](go/) | **Official** (`…/xaiop-sdk/go` **0.15.1** — protocol **0.6.0**, Node-aligned product surface) | **[API.md](go/API.md)** · [Guide](go/README.md) · [ALIGNMENT](go/ALIGNMENT.md) |

**Stage timing (all runtimes):** [../performance.md](../performance.md) · harness [`../../xaiop-sdk/timing/`](../../xaiop-sdk/timing/) · [2026-08-09 extreme-perf notes](../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md).

Cross-stack: [behavioral-contract.md](behavioral-contract.md) · [notes/](notes/)

Code: [../../xaiop-sdk/](../../xaiop-sdk/)
