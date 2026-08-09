# Release notes — 2026-08-09 · Node.js npm publish

[English](release-notes-2026-08-09-nodejs-npm.md) · [简体中文](release-notes-2026-08-09-nodejs-npm.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | **`@bylan280/xaiop@0.15.1`** |
| Registry | [npmjs.com/package/@bylan280/xaiop](https://www.npmjs.com/package/@bylan280/xaiop) |
| Protocol | **0.6.0** Frozen |
| Org | `bylan280` |

## Summary

First public npm publish of the Node.js product SDK under the scoped name **`@bylan280/xaiop`**. Version **0.15.1** (same tip as the repo; includes the 2026-08-09 extreme hot-path work). Wire semantics unchanged.

## Install

```bash
npm install @bylan280/xaiop
```

```js
import { parseSync, XaiopWs } from "@bylan280/xaiop";
import { XaiopBrowserWs } from "@bylan280/xaiop/browser";
import { encodeSync } from "@bylan280/xaiop/core";
```

## Notes

- Historical docs / older tags may still say unscoped `xaiop`; **consumers must use `@bylan280/xaiop`**.
- Subpaths: `@bylan280/xaiop/browser` · `@bylan280/xaiop/core`.
- Related tip: [release-notes-2026-08-09-sdk-extreme-perf-internal.md](release-notes-2026-08-09-sdk-extreme-perf-internal.md).
- Guide: [../sdk/nodejs/README.md](../sdk/nodejs/README.md) · API: [../sdk/nodejs/API.md](../sdk/nodejs/API.md).
