# XAIOP SDK

> Official multi-runtime **SDK** — Node npm **`@bylan280/xaiop`** **0.15.1** (protocol **0.7.0** Draft) · Java `io.github.aboutuip:xaiop` **0.15.1** (Maven Central) · Python `xaiop` **0.15.1** · Go `github.com/AboutUip/XAIOP/xaiop-sdk/go` **0.15.1**

[English](README.md) · Simplified Chinese: [README.zh-CN.md](README.zh-CN.md)

| Docs | Link |
| --- | --- |
| Node npm publish (2026-08-09) | [../docs/meta/release-notes-2026-08-09-nodejs-npm.md](../docs/meta/release-notes-2026-08-09-nodejs-npm.md) · [npm](https://www.npmjs.com/package/@bylan280/xaiop) |
| Java Maven Central | [java/MAVEN-CENTRAL.md](java/MAVEN-CENTRAL.md) · [central.sonatype.com](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop) · [install](../docs/sdk/java/README.md#install) |
| Go module | [pkg.go.dev](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1) · [install](../docs/sdk/go/README.md#install) |
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
| [nodejs/](nodejs/) | **Active** — npm **`@bylan280/xaiop`** **0.15.1** <-> protocol **0.7.0** Draft (parse · stream · encode · merge · history · WS · Control Root / logSeq · Diff isolation / `@` Diff · buffer compact; **2026-08-09** extreme hot-path tip) |
| [java/](java/) | **Active** — `io.github.aboutuip:xaiop` **0.15.1** (Maven Central) — protocol **0.7.0** Draft (full Node-aligned surface; [ALIGNMENT](../docs/sdk/java/ALIGNMENT.md) · [install](../docs/sdk/java/README.md#install)) |
| [python/](python/) | **Active** — `xaiop` **0.15.1** — protocol **0.7.0** Draft ([ALIGNMENT](../docs/sdk/python/ALIGNMENT.md)) |
| [go/](go/) | **Official** — `github.com/AboutUip/XAIOP/xaiop-sdk/go` **0.15.1** — protocol **0.7.0** Draft ([ALIGNMENT](../docs/sdk/go/ALIGNMENT.md) · [API](../docs/sdk/go/API.md) · [install](../docs/sdk/go/README.md#install)) |
| [timing/](timing/) | SDK stage microbench + Parse↔JSON gates (Node + Python + Java + **Go**) — not a product package |
