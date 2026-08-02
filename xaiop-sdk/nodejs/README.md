# XAIOP Node.js SDK

Official Node.js SDK for XAIOP v0.1.0 (Frozen).  
**Docs (authoritative for API):** [../../docs/sdk/nodejs/](../../docs/sdk/nodejs/)

## Status

| Item | State |
| --- | --- |
| Parser (Core) | Implemented |
| Engine APIs (`new` / `upload`+`get` / static `parse`) | Implemented (async + sync) |
| Compatibility mode (forced root + pop-and-retry) | Implemented (default off) |
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

// Compatibility: recover omitted leave-array before next >name-
console.log(
  XaiopEngine.parseSync(
    `>
>tags-
:a
>users-
>
id:1
<
`,
    true,
  ),
);
```

## Compatibility mode

**Default: off.** Opt-in recovery for imperfect LLM output: (1) if the first line is not `>` / `-`, force an empty object root; (2) on `=path not found`, retry after trim, strip-all-whitespace, then `name-`→array-key when the value is an array; (3) on other `XaiopSyntaxError`, pop Cursor and retry the same line while the error key is unchanged. Content is never rewritten otherwise. Recovery is **per line** — after fixing one slip, the parser continues and will recover later slips in the same document.

| Path | Default |
| --- | --- |
| `new XaiopEngine()` / `{ compatibilityMode: false }` | off |
| `{ compatibilityMode: true }` / `setCompatibilityMode(true)` | on for `upload` / `uploadSync` |
| `XaiopEngine.parse(text)` / `parseSync(text)` | off |
| `parse(text, true)` / `parseSync(text, true)` | on for that call |

Typical case: finished `>tags-` then wrote `>users-` without `<` — strict fails; compatibility pops out of the array and continues.

Does **not** invent bare names without `-`, or rewrite `=meta-` onto an object key. Algorithm, when-to-use, and error semantics: [EN](../../docs/sdk/nodejs/README.md#compatibility-mode) · [中文](../../docs/sdk/nodejs/README.zh-CN.md#兼容模式compatibility-mode).

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
