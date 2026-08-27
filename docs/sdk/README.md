# SDK Documentation

[English](README.md) · [简体中文](README.zh-CN.md)

Official **SDK** docs. Wire grammar: [../protocol/](../protocol/) (protocol-only).  
Model output & streaming transport: [../practice/](../practice/).  
Architecture: [../SEPARATION.md](../SEPARATION.md).  
**Product catalog (optional):** [behavioral-contract.md](behavioral-contract.md) (protocol conformant ≠ official SDK equivalent).

| Stack | Status | Docs |
| --- | --- | --- |
| [Node.js](nodejs/) | **Primary / official focus** — npm **`@bylan280/xaiop`** **0.15.1** (TS) ↔ protocol **0.7.0** Draft; buffer compact · `@` Diff · Diff isolation · Control Root `#!` / `meta.logSeq` / resume; **2026-08-09** extreme hot-path · [npm](https://www.npmjs.com/package/@bylan280/xaiop) | **[API.md](nodejs/API.md)** (primary) · [notes/](nodejs/notes/) · [performance](nodejs/notes/performance.md) |
| [Java](java/) | **Official** (`io.github.aboutuip:xaiop` **0.15.1** on [Maven Central](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop) — protocol **0.7.0** Draft, Node-aligned product surface; packages `io.xaiop.*`) | **[API.md](java/API.md)** · [Guide](java/README.md#install) · [ALIGNMENT.md](java/ALIGNMENT.md) |
| [Python](python/) | **Official** (`xaiop` **0.15.1** — protocol **0.7.0** Draft, Node-aligned product surface) | **[API.md](python/API.md)** · [Guide](python/README.md) · [ALIGNMENT.md](python/ALIGNMENT.md) |
| [Go](go/) | **Official** (`github.com/AboutUip/XAIOP/xaiop-sdk/go` **0.15.1** on [pkg.go.dev](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1) — protocol **0.7.0** Draft, Node-aligned product surface) | **[API.md](go/API.md)** · [Guide](go/README.md#install) · [ALIGNMENT](go/ALIGNMENT.md) |

**Stage timing (all runtimes):** [../performance.md](../performance.md) · harness [`../../xaiop-sdk/timing/`](../../xaiop-sdk/timing/) · [2026-08-09 extreme-perf notes](../meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md).

Cross-stack: [behavioral-contract.md](behavioral-contract.md) · [notes/](notes/)

Code: [../../xaiop-sdk/](../../xaiop-sdk/)
