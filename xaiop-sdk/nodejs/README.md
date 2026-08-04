# XAIOP Node.js SDK

Official Node.js SDK for XAIOP v0.6.0 (Frozen). Package **0.15.1** — TypeScript; `xaiop` / `xaiop/browser` / `xaiop/core`.
**Docs:** **[API](../../docs/sdk/nodejs/API.md)** · [Notes](../../docs/sdk/nodejs/notes/) · [Node catalog](../../docs/sdk/behavioral-contract.md)  
**Practice:** [streaming transport](../../docs/practice/streaming-transport.md) · [skeleton stream](../../docs/practice/skeleton-stream.md) · [keyed modeling](../../docs/practice/keyed-state-modeling.md) · [sealed LLM archive](../../docs/archive/practice-llm-emit-2026-08-04/)  
**Protocol (wire only):** [../../docs/protocol/](../../docs/protocol/) · [Separation](../../docs/SEPARATION.md)

```js
import { parseSync, XaiopWs } from "xaiop";                 // Node (default)
import { parseSync, XaiopBrowserWs } from "xaiop/browser"; // browser client subset
import { parseSync } from "xaiop/core";                    // isomorphic wire core
```

## Status

| Item | State |
| --- | --- |
| Language | **TypeScript** (`src/` → `dist/` via `tsc`) |
| Parser (Core) | Implemented |
| Engine APIs (`new` / `upload`+`get` / static `parse`) | Implemented (async + sync) |
| Root fragment (`XaiopFragment`) | Implemented (strict mode) |
| Compatibility mode (forced root + pop-and-retry + …) | Implemented (default off; all fixes on when enabled) |
| Streaming Snapshot/Diff | Implemented (`XaiopStream`, `.` checkpoints; `mergeChunkWindow` default on; `pushAsync` / `asyncParse`) |
| Parse history (snapshot + realtime) | Implemented (`historySnapshot` / `historyRealtime`; default off; SDK **0.7.0+**) |
| `&` delete + cover Diff | Implemented (`cover`; default off; protocol **0.6.0** / SDK **0.8.0+**) |
| WebSocket sessions (listen/push + connect/consume) | Implemented (`XaiopWs`, Node); browser: `XaiopBrowserWs.connect` (**`.` phase Diffs**) |
| `#` custom annotation lines | Implemented (standalone `#…` ignored; protocol **0.6.0** / SDK **0.11.0+**) |
| Type registry / freeze / WS type push | Implemented (`TYPE`, `registerType*`, `typeCheck`, `pushTypeConsistency`; SDK **0.10.0+**) |
| Line intercept (buffer rewrite/skip) | Implemented (`onLineIntercept` / `LINE_KIND`; SDK **0.12.0+**) |
| Annotation Span (phase `#`) | Implemented (`onAnnotationSpan`; typeCheck escape; SDK **0.13.0+**) |
| SDK Control Root (`#!`) | Implemented (demux · session / ack / resume / snapshot · `seq` stamp / `meta.logSeq` · `ResumeWireLog`; SDK **0.14.0+**, logSeq **0.14.1+**) |
| Diff isolation after `.` | Implemented (synthetic object root for phase Diff; framing-split ≡ one-shot; SDK **0.14.2+**) |
| `@` cumulative Diff | Implemented (same path as `=`/`!`/`&`; optional `onChunk`; SDK **0.14.3+**) |
| Buffer compact | Implemented (`bufferStats` / `compactCommitted`; SDK **0.15.0+**) |
| Fine-grained compat fix APIs (per correction, returns `boolean`) | Implemented |
| `!path` / `@path` | Implemented (`!` broadcast + outer prune, cross-phase; `@` exact create-or-enter) |
| Emit (`encode` / `uploadJson`, controllable `.`) | Implemented (SDK 0.3.0+) |
| Merge / inject (`mergeToJson` / `mergeToXaiop` / `inject*`) | Implemented (pre/post; not streaming) |
| Content `null` | Implemented (since protocol **0.2.1** / SDK **0.4.1**) |

## Quick start

```bash
npm test
```

```js
import { XaiopEngine, XaiopFragment } from "xaiop";

const engine = new XaiopEngine();
const id = await engine.upload(`>
>meta
name:demo
`);
console.log(await engine.get(id));

// Fragment root
const fragId = await engine.upload(`>meta
name:demo
`);
const frag = await engine.get(fragId);
console.log(frag instanceof XaiopFragment); // true
```

See **[docs/sdk/nodejs/API.md](../../docs/sdk/nodejs/API.md)** for the full surface (stream, WS, types, line intercept, Annotation Span, Control Root).

## Build / pack

```bash
npm run pack
# → dist/xaiop-0.15.1.tgz
```

```bash
npm install /path/to/xaiop-sdk/nodejs/dist/xaiop-0.15.1.tgz
```
