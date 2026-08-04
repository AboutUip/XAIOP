# Node notes — line intercept (buffer layer)

[English](line-intercept.md) · [简体中文](line-intercept.zh-CN.md)

| Field | Value |
| --- | --- |
| Doc ID | `SDK-NODE-NOTE-LINE` |
| Status | Informative |
| Last updated | 2026-08-04 |
| Normative | **No** — SDK product feature; not wire grammar |
| Package | `xaiop` **0.12.0+** |

Primary entry: [../API.md](../API.md) §6.4 · §6.2 · §7.2.  
Tests: `xaiop-sdk/nodejs/test/line.intercept.test.js`.

---

## 1. Layers

| Layer | When | Capability |
| --- | --- | --- |
| **Line intercept** | After `readLine` → before phase lines / `feedLine` | Observe · rewrite · skip with `null` |
| **`onPhase` / `onChunk`** | After `.` phase Diff parse + Commit | Read-only Diff; **cannot** rewrite wire |
| **Type freeze / `typeCheck`** | Post-parse tree | Orthogonal to line intercept |

Hook point: `DotCheckpointEngine` (forwarded by `XaiopStream` / `XaiopWsConnection` / `XaiopBrowserWsConnection`).

---

## 2. Contract

1. **Registration order = call order**; any `null` **short-circuits** later handlers.
2. Three `null` meanings:

| Meaning | Source |
| --- | --- |
| Skip this line | Handler returns `null` |
| Content null value | Wire `key:null` (real data) |
| Empty-phase Diff | `onPhase`/`onChunk` gets `null` (empty `.` phase or `emitDiff: false`) |

3. `view` is a **fixed template** minimal classify (`LINE_KIND`), **not** a type system / `typeCheck`.
4. When interceptors are registered, Diff owned-parse uses the **effective** line wire (may differ from the transport buffer).
5. Only the `streamProcessing: true` (default on bare `DotCheckpointEngine`, same as `XaiopStream` / WS) line-scan path; `streamProcessing: false` whole-buffer parse does **not** run interceptors.
6. `jumpTo` rebuild **re-runs** the chain on the retained prefix when interceptors remain.
7. Phase close uses the **post-intercept** text: skipping `.` keeps the phase open; rewriting a line to `.` closes early.

---

## 3. `LINE_KIND` / template fields

| `kind` | Typical wire | Filled slots |
| --- | --- | --- |
| `phase` | `.` | — |
| `annotation` | `#…` | `annotationText` |
| `pop` / `pop_enter` | `<` / `<name` | `name` |
| `locate` / `exact` / `broadcast` / `delete` | `=` / `@` / `!` / `&` + path | `path` |
| `object_anon` / `array_anon` | `>` / `-` | — |
| `array_named` / `object_named` | `>name-` / `>name` | `name` |
| `content` | `k:v` / `:v` | `key` · `valueText` |
| `unknown` | other | — |

Fixed fields always present: `kind` · `raw` · `name` · `path` · `key` · `valueText` · `annotationText` (unused → `null`).  
Exports: `LINE_KIND` · `classifyLine` · `emptyLineView` · `runLineInterceptChain`.

---

## 4. Surfaces

| Surface | How to register |
| --- | --- |
| `DotCheckpointEngine` | ctor `lineIntercept` · `onLineIntercept` · `clearLineIntercepts` |
| `XaiopStream` | same (queued until engine exists) |
| `XaiopWs` / `XaiopBrowserWs` connect | option `lineIntercept`; connection `onLineIntercept` |

---

## 5. Example

```js
import { LINE_KIND, XaiopWs } from "xaiop";

const client = await XaiopWs.connect(url, {
  lineIntercept: ({ view }) => {
    if (view.kind === LINE_KIND.CONTENT && view.key === "secret") return null;
    return undefined;
  },
  onPhase: (diff) => { /* post-parse Diff — cannot rewrite wire */ },
});
```

---

## 6. Related

- API §6.4 · [streaming-parse.md](streaming-parse.md) · [ws-session.md](ws-session.md) · [typecheck.md](typecheck.md) · [annotation-span.md](annotation-span.md)
