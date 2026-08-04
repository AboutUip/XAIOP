# XAIOP Node.js SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | `xaiop` |
| SDK | **0.14.0** (TypeScript) |
| Protocol package | **0.6.0** Frozen (sealed) |
| Runtime | Node.js ≥ 18 (default entry); browsers → `xaiop/browser` |
| Code | [../../../xaiop-sdk/nodejs/](../../../xaiop-sdk/nodejs/) (`src/` → `dist/`) |

**Full API:** [API.md](API.md)

**Entrypoints:**

```js
import { parseSync, XaiopWs } from "xaiop";                 // full Node surface
import { parseSync, XaiopBrowserWs } from "xaiop/browser"; // browser client
import { parseSync, encodeSync } from "xaiop/core";        // isomorphic core
```

**Protocol:** [../../protocol/](../../protocol/) · [../../meta/releases.md](../../meta/releases.md)  
**Product catalog:** [../behavioral-contract.md](../behavioral-contract.md)  
**Runtime details:** [API §0](API.md#0-runtime-scope-and-entrypoints)

---

## Install

```bash
cd xaiop-sdk/nodejs
npm install
npm test   # tsc then tests
```

---

## Optional deep notes (`notes/`)

| Note | Topic |
| --- | --- |
| [notes/streaming-parse.md](notes/streaming-parse.md) | `.`-phase Diff / Commit, `mergeChunkWindow`, `cover` |
| [notes/history.md](notes/history.md) | Optional parse history and `jumpTo` |
| [notes/encode-attention.md](notes/encode-attention.md) | Encode pitfalls and path-array cuts |
| [notes/ws-session.md](notes/ws-session.md) | `XaiopWs` + **browser phases** (`xaiop/browser` · §9) + **type push** (§10) |
| [notes/typecheck.md](notes/typecheck.md) | Type registry / freeze / `pushTypeConsistency` |
| [notes/line-intercept.md](notes/line-intercept.md) | Buffer line intercept (`onLineIntercept`) |
| [notes/annotation-span.md](notes/annotation-span.md) | Phase Annotation Span (typeCheck escape; **0.13.0+**) |
| [notes/control-plane.md](notes/control-plane.md) | SDK Control Root `#!` · session / resume (**0.14.0+**) |
| [notes/adjustment-policy.md](notes/adjustment-policy.md) | Compat fixes: by design vs carefully adjustable |
