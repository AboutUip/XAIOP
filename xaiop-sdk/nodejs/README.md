# @bylan280/xaiop

Official Node.js SDK for XAIOP protocol **0.7.0** (Draft). Package **0.16.0** — TypeScript; entries `@bylan280/xaiop` · `@bylan280/xaiop/browser` · `@bylan280/xaiop/core`.

**Docs (repo):** [API](https://github.com/AboutUip/XAIOP/blob/main/docs/sdk/nodejs/API.md) · [Notes](https://github.com/AboutUip/XAIOP/tree/main/docs/sdk/nodejs/notes) · [Behavioral contract](https://github.com/AboutUip/XAIOP/blob/main/docs/sdk/behavioral-contract.md) · [Protocol](https://github.com/AboutUip/XAIOP/tree/main/docs/protocol)

## Install

```bash
npm install @bylan280/xaiop
```

Node.js ≥ 18.

```js
import { parseSync, XaiopWs } from "@bylan280/xaiop";                 // Node (default)
import { parseSync, XaiopBrowserWs } from "@bylan280/xaiop/browser"; // browser client subset
import { parseSync } from "@bylan280/xaiop/core";                    // isomorphic wire core
```

## Quick start

```js
import { XaiopEngine, XaiopFragment } from "@bylan280/xaiop";

const engine = new XaiopEngine();
const id = await engine.upload(`>
>meta
name:demo
`);
console.log(await engine.get(id));

const fragId = await engine.upload(`>meta
name:demo
`);
const frag = await engine.get(fragId);
console.log(frag instanceof XaiopFragment); // true
```

Full surface (stream · WS · types · Control Root · …): [docs/sdk/nodejs/API.md](https://github.com/AboutUip/XAIOP/blob/main/docs/sdk/nodejs/API.md).

## License

MIT — see [LICENSE](./LICENSE).
