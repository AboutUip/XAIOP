# XAIOP SDK

> Official multi-runtime **SDK** — Node npm **`@bylan280/xaiop`** **0.15.1** (protocol **0.6.0**) · Java `io.xaiop:xaiop` **0.15.1** · Python `xaiop` **0.15.1** · Go module **0.15.1**

[English](README.md) · Simplified Chinese: [README.zh-CN.md](README.zh-CN.md)

| Docs | Link |
| --- | --- |
| Node npm publish (2026-08-09) | [../docs/meta/release-notes-2026-08-09-nodejs-npm.md](../docs/meta/release-notes-2026-08-09-nodejs-npm.md) · [npm](https://www.npmjs.com/package/@bylan280/xaiop) |
| Extreme-perf tip (2026-08-09 · all runtimes) | [../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md](../docs/meta/release-notes-2026-08-09-sdk-extreme-perf-internal.md) |
| SDK stage timing hub | [../docs/performance.md](../docs/performance.md) · [timing/](timing/) |
| Release notes (2026-08-08 · Go 0.15.1) | [../docs/meta/release-notes-2026-08-08-go-0.15.1.md](../docs/meta/release-notes-2026-08-08-go-0.15.1.md) |
| Release notes (2026-08-08 · Python 0.15.1) | [../docs/meta/release-notes-2026-08-08-python-0.15.1.md](../docs/meta/release-notes-2026-08-08-python-0.15.1.md) |
| Release notes (2026-08-07 · Python 0.15.0a1) | [../docs/meta/release-notes-2026-08-07-python-0.15.0a1.md](../docs/meta/release-notes-2026-08-07-python-0.15.0a1.md) |
| Release notes (2026-08-06 · core SDKs) | [../docs/meta/release-notes-2026-08-06-core-sdk.md](../docs/meta/release-notes-2026-08-06-core-sdk.md) |
| Release notes (2026-08-05 · 0.15.1) | [../docs/meta/release-notes-2026-08-05-0.15.1.md](../docs/meta/release-notes-2026-08-05-0.15.1.md) |
| Release notes (2026-08-05 · 0.14.3) | [../docs/meta/release-notes-2026-08-05-0.14.3.md](../docs/meta/release-notes-2026-08-05-0.14.3.md) |
| Release notes (2026-08-05 · 0.14.2) | [../docs/meta/release-notes-2026-08-05-0.14.2.md](../docs/meta/release-notes-2026-08-05-0.14.2.md) |
| Release notes (2026-08-05 · 0.14.1) | [../docs/meta/release-notes-2026-08-05-0.14.1.md](../docs/meta/release-notes-2026-08-05-0.14.1.md) |
| Release notes (2026-08-05 · 0.14.0) | [../docs/meta/release-notes-2026-08-05.md](../docs/meta/release-notes-2026-08-05.md) |
| Release notes (2026-08-04) | [../docs/meta/release-notes-2026-08-04.md](../docs/meta/release-notes-2026-08-04.md) |
| SDK | [../docs/sdk/](../docs/sdk/) |
| Behavioral contract (third-party parity) | [../docs/sdk/behavioral-contract.md](../docs/sdk/behavioral-contract.md) |
| Java <-> Node parity matrix | [../docs/sdk/java/ALIGNMENT.md](../docs/sdk/java/ALIGNMENT.md) |
| Python <-> Node parity matrix | [../docs/sdk/python/ALIGNMENT.md](../docs/sdk/python/ALIGNMENT.md) |
| Go <-> Node parity matrix | [../docs/sdk/go/ALIGNMENT.md](../docs/sdk/go/ALIGNMENT.md) |
| Conformance (golden / core-wire) | [conformance/](conformance/) |
| Protocol (wire only) | [../docs/protocol/](../docs/protocol/) |
| Practice (model · streaming) | [../docs/practice/](../docs/practice/) |
| Separation | [../docs/SEPARATION.md](../docs/SEPARATION.md) |

| Directory | Status |
| --- | --- |
| [nodejs/](nodejs/) | **Active** — npm **`@bylan280/xaiop`** **0.15.1** <-> protocol **0.6.0** (parse · stream · encode · merge · history · WS · Control Root / logSeq · Diff isolation / `@` Diff · buffer compact; **2026-08-09** extreme hot-path tip) |
| [java/](java/) | **Active** — `io.xaiop:xaiop` **0.15.1** — protocol **0.6.0** (full Node-aligned surface; [ALIGNMENT](../docs/sdk/java/ALIGNMENT.md)) |
| [python/](python/) | **Active** — `xaiop` **0.15.1** — protocol **0.6.0** ([ALIGNMENT](../docs/sdk/python/ALIGNMENT.md)) |
| [go/](go/) | **Official** — `ProtocolVersion` **0.6.0** · module **0.15.1** ([ALIGNMENT](../docs/sdk/go/ALIGNMENT.md) · [API](../docs/sdk/go/API.md)) |
| [timing/](timing/) | SDK stage microbench + Parse↔JSON gates (Node + Python + Java + **Go**) — not a product package |
