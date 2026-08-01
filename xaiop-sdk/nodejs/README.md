# XAIOP Node.js SDK

Official Node.js SDK for XAIOP v0.1.0 (Frozen).  
**Docs (authoritative for API):** [../../docs/sdk/nodejs/](../../docs/sdk/nodejs/)

## Status

| Item | State |
| --- | --- |
| Parser (Core) | Implemented |
| Engine APIs (`new` / `upload`+`get` / static `parse`) | Implemented (async + sync) |
| Streaming Snapshot/Diff | Not yet |
| Emit | Not yet |

## Quick start

```bash
npm test
```

```js
import { XaiopEngine } from "xaiop";

const engine = new XaiopEngine();
const id = await engine.upload(`>
>meta
name:demo
`);
console.log(await engine.get(id));

console.log(await XaiopEngine.parse(`>\nx:1`));
```

## Build / pack

Pure ESM — no transpile step. `npm run build` runs tests and packs an npm tarball:

```bash
cd xaiop-sdk/nodejs
npm run build
# → dist/xaiop-0.1.0.tgz
```

Install the tarball elsewhere:

```bash
npm install /path/to/xaiop-sdk/nodejs/dist/xaiop-0.1.0.tgz
```
