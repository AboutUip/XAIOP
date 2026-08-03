# XAIOP Node.js SDK

Official Node.js SDK for XAIOP v0.4.0 (Frozen). Package **0.7.0** — parse history (snapshot + realtime).  
**Docs:** [API](../../docs/sdk/nodejs/) · [Stream](../../docs/sdk/nodejs/stream.md) · [Encode](../../docs/sdk/nodejs/encode.md) · [Merge](../../docs/sdk/nodejs/merge.md) · [Notes](../../docs/sdk/nodejs/notes/) · [Parity](../../docs/sdk/behavioral-contract.md)  
**Practice:** [model output](../../docs/practice/model-output.md) · [streaming transport](../../docs/practice/streaming-transport.md) · [skeleton stream](../../docs/practice/skeleton-stream.md)  
**Protocol (wire only):** [../../docs/protocol/](../../docs/protocol/) · [Separation](../../docs/SEPARATION.md)

## Status

| Item | State |
| --- | --- |
| Parser (Core) | Implemented |
| Engine APIs (`new` / `upload`+`get` / static `parse`) | Implemented (async + sync) |
| Root fragment (`XaiopFragment`) | Implemented (strict mode) |
| Compatibility mode (forced root + pop-and-retry + …) | Implemented (default off; all fixes on when enabled) |
| Streaming Snapshot/Diff | Implemented (`XaiopStream`, `.` checkpoints; `mergeChunkWindow` default on; `pushAsync` / `asyncParse`) |
| Parse history (snapshot + realtime) | Implemented (`historySnapshot` / `historyRealtime`; default off; SDK **0.7.0+**) |
| WebSocket sessions (listen/push + connect/consume) | Implemented (`XaiopWs`, SDK 0.4.0+) |
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

console.log(await XaiopEngine.parse(`>\nx:1`));

// JSON → XAIOP (strict wire; default `.` per top-level key)
const wire = XaiopEngine.encodeSync(
  { meta: { name: "demo" }, n: 1 },
  { dotPolicy: "perTopLevelKey" },
);
const id2 = await engine.uploadJson({ a: 1, b: "2" }, { dotPolicy: "none" });
console.log(await engine.get(id2));

// Strict root fragment (no leading > / -)
const frag = XaiopEngine.parseSync(`>a\n`);
console.log(frag instanceof XaiopFragment, frag.notation()); // true, "a":{}

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

**Default: off.** Opt-in recovery for imperfect LLM output. Enabling it without further calls turns **all** fixes on. Each fix has an instance API (`setCompat…`) that returns `boolean` — succeeds only while compatibility mode is on. Details: [EN](../../docs/sdk/nodejs/README.md#fine-grained-fix-apis) · [中文](../../docs/sdk/nodejs/README.zh-CN.md#细粒度修正-api).

```js
const engine = new XaiopEngine({ compatibilityMode: true });
engine.setCompatPopAndRetry(false); // true — other fixes stay on
```

| Path | Default |
| --- | --- |
| `new XaiopEngine()` / `{ compatibilityMode: false }` | off |
| `{ compatibilityMode: true }` / `setCompatibilityMode(true)` | on; **all** per-fix flags remain at default `true` until toggled |
| `XaiopEngine.parse(text)` / `parseSync(text)` | off |
| `parse(text, true)` / `parseSync(text, true)` | on for that call — all fixes |

Typical case: finished `>tags-` then wrote `>users-` without `<` — strict fails; compatibility pops out of the array and continues.

Does **not** invent bare names without `-`, or rewrite `=meta-` onto an object key. Full algorithm, fragment / `@` / `!` notes: [EN](../../docs/sdk/nodejs/README.md) · [中文](../../docs/sdk/nodejs/README.zh-CN.md).

## `XaiopStream`

Independent streaming client. Chunks are **per-`.` phase parses** (protocol
later-wins — not cumulative JSON diffs). Default: stream processing on,
compatibility **off**, mode `callback`.

```js
import { XaiopStream, TRANSPORT_KIND } from "xaiop";

const stream = new XaiopStream("https://example.com/out");
stream.onChunk(console.log);
stream.onDone(console.log);
stream.send({ method: "GET" });

// tests / custom sources
stream.send({ transport: TRANSPORT_KIND.RAW, source: async function* () { yield ">\nx:1\n.\n"; }() });
```

Modes: `setModes` / `enableMode` — `callback` · `promise` · `asyncIterator` · `events`.  
Status: `getStatus()` · `getSnapshot()` · `abort()` · `setUrl()` (rejected while busy).

### WebSocket sessions (`XaiopWs`) — skeleton stream

Preferred for long-lived fixed-key push (listen + connect in one package):

```js
import { XaiopWs } from "xaiop";

const hub = await XaiopWs.listen({ port: 0, host: "127.0.0.1" });
hub.onConnection(async (conn) => {
  conn.pushJson("skeleton1", { title: "A" });
  conn.pushJson("mod1", { ok: true }, { final: true });
  await conn.end();
});

const client = await XaiopWs.connect(hub.url(), {
  onPhase: (diff) => {
    /* that phase only — not a patch; use getCommittedSnapshot() for UI */
  },
});
console.log(await client.done);
await hub.close();
```

Details: [ws-session note](../../docs/sdk/nodejs/notes/ws-session.md) · [skeleton practice](../../docs/practice/skeleton-stream.md).

API preview UI: [../../views/](../../views/) (`cd views && npm run dev`).

## Build / pack

Pure ESM — no transpile step. `npm run build` runs tests and packs an npm tarball:

```bash
cd xaiop-sdk/nodejs
npm run build
# → dist/xaiop-0.7.0.tgz
```

Install the tarball elsewhere:

```bash
npm install /path/to/xaiop-sdk/nodejs/dist/xaiop-0.7.0.tgz
```
