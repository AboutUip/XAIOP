# XAIOP Node.js SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| Field | Value |
| --- | --- |
| Package | `xaiop` |
| Protocol | v0.1.0 Frozen |
| Runtime | Node.js ≥ 18 (ESM) |
| Code | [../../../xaiop-sdk/nodejs/](../../../xaiop-sdk/nodejs/) |

---

## Install

```bash
cd xaiop-sdk/nodejs
npm install
npm test
npm run build
# → dist/xaiop-0.1.0.tgz
```

```js
import { XaiopEngine, PROTOCOL_VERSION } from "xaiop";
```

---

## Three APIs

All primary methods are **async**. Matching **sync** methods are provided.

### 1. `new XaiopEngine()` — create engine

```js
const engine = new XaiopEngine();
```

Holds an in-memory store of uploaded documents keyed by runtime **data id**.

### 2. `upload` / `get` — instance APIs

Upload a **complete** (non-streaming) XAIOP string; receive a data id.  
Pass the data id to get parsed JSON.

```js
const dataId = await engine.upload(xaiopText);
const json = await engine.get(dataId);

// sync
const dataId2 = engine.uploadSync(xaiopText);
const json2 = engine.getSync(dataId2);
```

### 3. `XaiopEngine.parse` — static API

Parse without an engine instance / without storing an id.

```js
const json = await XaiopEngine.parse(xaiopText);
const jsonSync = XaiopEngine.parseSync(xaiopText);
```

---

## API reference

### `new XaiopEngine()`

Creates a standard XAIOP engine instance.

### `engine.upload(source): Promise<string>`

- **source** — full XAIOP document text  
- **returns** — runtime data id (string)  
- Parses deterministically; throws `XaiopSyntaxError` on invalid input  
- Does **not** stream; entire `source` is required  

### `engine.uploadSync(source): string`

Synchronous counterpart of `upload`.

### `engine.get(dataId): Promise<unknown>`

- **dataId** — id from `upload` / `uploadSync`  
- **returns** — JSON-compatible value (`object` / `array` / …), cloned  
- Throws if id is unknown  

### `engine.getSync(dataId): unknown`

Synchronous counterpart of `get`.

### `XaiopEngine.parse(source): Promise<unknown>`

Static parse → JSON-compatible value.

### `XaiopEngine.parseSync(source): unknown`

Static sync parse.

### Helpers

| Member | Meaning |
| --- | --- |
| `PROTOCOL_VERSION` | `"0.1.0"` |
| `engine.has(dataId)` | whether id exists |
| `engine.delete(dataId)` | drop one entry |
| `engine.clear()` | drop all |
| `XaiopSyntaxError` | parse error class (`.line`) |

Low-level exports: `parseSync`, `parseAsync` (same as static parse).

---

## Errors

- Invalid wire → `XaiopSyntaxError` (deterministic; **no** silent repair)  
- Unknown data id → `Error`  
- Bad argument types → `TypeError`  

---

## Example

```js
import { XaiopEngine } from "xaiop";

const text = `>
>meta
name:demo
count: 2
`;

const engine = new XaiopEngine();
const id = await engine.upload(text);
console.log(await engine.get(id));
// { meta: { name: "demo", count: "2" } }

console.log(await XaiopEngine.parse(text));
```

---

## Fixtures

Must match: [../../examples/complex.xaiop](../../examples/complex.xaiop) → [../../examples/complex.expected.json](../../examples/complex.expected.json)

---

## Out of scope (this release)

- Streaming Snapshot / Diff APIs (protocol `PROT-STREAM` — later)  
- Emitter (JSON → XAIOP)  
