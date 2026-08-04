# Node notes — type check (registry / freeze / WS push)

[English](typecheck.md) · [简体中文](typecheck.zh-CN.md)

| Field | Value |
| --- | --- |
| Doc ID | `SDK-NODE-NOTE-TYPE` |
| Status | Informative |
| Updated | 2026-08-04 |
| Normative | **No** — SDK product feature; not wire grammar |
| Package | `xaiop` **0.10.0+** |

Primary API: [../API.md](../API.md) §5.5 · §7.2 · §11.

---

## 1. Layers

| Layer | Role |
| --- | --- |
| **Canonical type** | Closed kinds: `int` `float` `bool` `string` `null` `object` `array` `any` (+ optional `object` fields / `array` element) |
| **Surface** | `TYPE.*`, `objectType` / `arrayType`, or sugar `object<name:string,old:int>` — always normalized before compare |
| **Registry** | Server map path → `{ type, polarity }`; immutable per path |
| **Freeze** | Client map path → observed type after first non-`null` |
| **Control frame** | `#!xaiop/types/v1\n` + snapshot JSON — out-of-band vs XAIOP wire |

Paths use **JSON-path** house style (`a.b[0]`), same as encode — not wire `a>b`.

---

## 2. Server

1. `registerType` / `registerTypes` / `registerTypeDeny` on `XaiopEngine`.
2. `setTypeCheck(true)` (strict only).
3. `upload*` / `inject*` run `TypeChecker` over **registered paths only**.
4. Optional `onTypeViolation` before `XaiopTypeError`.

Empty registry + `typeCheck` on = no-op.

---

## 3. Client

Enable with `typeCheck: true` on `XaiopWs.connect` / `XaiopStream` / `XaiopBrowserWs.connect` (ignored if `compatibilityMode`).

| Behavior | |
| --- | --- |
| Freeze | First non-`null` at path locks type |
| `null` | Skipped (keeps freeze; no error) |
| Arrays | Homogeneous elements |
| Refresh | Path absent from commit clears freeze subtree |
| Schema | From `typeSchema` option or `pushTypeConsistency`; `any` skips freeze; schema violations do **not** write freeze |

Without a pushed schema, first-seen freeze still enforces consistency on later phases.

**Annotation Span escape:** with `onAnnotationSpan`, Span runs **before** typeCheck; same-level paths processed by that handler are passed to `observeTree(..., { escapePaths })` and skip freeze/consistency. See [annotation-span.md](annotation-span.md) · API §6.5.

---

## 4. `pushTypeConsistency`

```js
hub.onConnection((conn) => {
  conn.pushTypeConsistency(engine); // engine already registered + typeCheck on
  conn.pushJson("k", 1);
});
```

Requires: connection strict · non-empty schema · if `XaiopEngine`, `engine.typeCheck === true`.  
Accepts engine, `TypeRegistry`, or snapshot. Not OPEN → `false`.

---

## 5. Related

- API §5.5 / §7 · tests: `xaiop-sdk/nodejs/test/typecheck.test.js`
- WS notes: [ws-session.md](ws-session.md)
- Protocol content types: [../../../protocol/content.md](../../../protocol/content.md) (leaf kinds only)
