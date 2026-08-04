# Node notes — Annotation Span (phase `#` span)

[English](annotation-span.md) · [简体中文](annotation-span.zh-CN.md)

| Field | Value |
| --- | --- |
| Doc ID | `SDK-NODE-NOTE-ANNSPAN` |
| Status | Informative |
| Last updated | 2026-08-04 |
| Normative | **No** — SDK product feature; wire `#` still has no tree side effects |
| Package | `xaiop` **0.13.0+** |

Primary entry: [../API.md](../API.md) §6.5 · §5.5 · §7.2.  
Tests: `xaiop-sdk/nodejs/test/annotation.span.test.js`.

---

## 1. Layers (not line intercept)

| Layer | When | Capability |
| --- | --- | --- |
| **Line intercept** §6.4 | After buffer split → before phase lines / `feedLine` | Per-line observe · rewrite · skip with `null` |
| **Annotation Span** §6.5 | Phase lines ready → **before Diff / Commit / typeCheck** | On `#`: collect **forward same-level** siblings (+ subtrees) as JSON; remount / drop / keep |
| **`onPhase` / `onChunk`** | After Diff parse + Commit | Read-only Diff |
| **Type freeze / `typeCheck`** | Post-parse tree | **After** Span; paths marked by Span **escape** checks |

Hook point: `DotCheckpointEngine` (forwarded by Stream / WS surfaces).

Wire `#…`: parsers ignore; no tree change. Annotation Span is an SDK product that **actively consumes** `#` at phase scope.

---

## 2. Contract

1. **Runs strictly before typeCheck**: within a phase, Span → feed / Diff → then `TypeFreezeSession.observeTree` (when enabled).
2. **TypeCheck escape (hard product rule):** once this phase **invokes** the Span handler chain for a `#` (whether the return is `undefined`, JSON, or `null`):
   - the **region the handlers process** (forward-collected same-level siblings and their subtrees, or remounted keys), and
   - those **same-level keys covered by that forward region** (by definition: after `#` until leaving the level),
   - enter `typeCheckEscapePaths` and are **skipped** in later `observeTree(..., { escapePaths })`.
   - Same-level keys **before** `#`, and other non-escaped paths: **still** type-checked.
3. Handler: `(annotation, view) => unknown`. `annotation` = text after `#` (including leading spaces). `view` carries template-wrapped JSON — **not** wire `=` / `@` / `!` forms at handler time.
4. Returns:

| Return | Meaning |
| --- | --- |
| `undefined` | Keep `#` + capture wire; **still report escape paths** |
| `null` | Drop `#` + capture (not fed); no escape (keys gone) |
| object / array / JSON text | Remount as sibling wire replacing capture; escape remount keys |

5. Multiple handlers: **registration order**; **first non-`undefined` wins** (`null` counts); later handlers skipped.
6. Capture ends at: leave with `<` / `<name`, relocate `=` / `@` / `!`, or phase `.`.
7. Current phase only. Like line intercept: only `streamProcessing: true` (default on bare `DotCheckpointEngine`, same as `XaiopStream` / WS) line-scan / phase-close paths; `streamProcessing: false` whole-buffer parse does **not** run Span.

---

## 3. `view` fields

| Field | Meaning |
| --- | --- |
| `annotation` | Text after `#` |
| `annotationRaw` | Full `#…` line |
| `path` | Parent path at `#` (JSON-path style) |
| `depth` | Stack depth |
| `json` | Materialized capture JSON |
| `jsonText` | Stable `JSON.stringify(json)` |

Helpers: `applyAnnotationSpans` · `encodeAsSiblingLines` · `pathEscapesTypeCheck`.

---

## 4. Surfaces

| Surface | Registration |
| --- | --- |
| `DotCheckpointEngine` | ctor `annotationSpan` · `onAnnotationSpan` · `clearAnnotationSpans` |
| `XaiopStream` | same |
| `XaiopWs` / `XaiopBrowserWs` connect | option `annotationSpan`; connection `onAnnotationSpan` |

`onChunk(diff, meta?)` may carry `meta.typeCheckEscapePaths`. Stream / WS accumulate them into `observeTree` when `typeCheck` is on.

---

## 5. Example

```js
import { TYPE, TypeRegistry, XaiopWs } from "xaiop";

const schema = new TypeRegistry();
schema.register("ok", TYPE.INT);
schema.register("flex", TYPE.INT);

const client = await XaiopWs.connect(url, {
  typeCheck: true,
  typeSchema: schema,
  // Runs before typeCheck; returned flex path escapes freeze
  annotationSpan: (ann, view) => {
    if (!ann.includes("loose")) return undefined;
    return { flex: String(view.json.flex) }; // not INT, but escaped
  },
});
```

---

## 7. Pitfall: `#` as an application “mini-protocol”

Wire `#` = **custom annotation transmission** (no tree side effects). With Annotation Span registered, the **same line** can remount the tree / escape typeCheck — SDK product behavior, not protocol semantics.

| Pitfall | Notes |
| --- | --- |
| Two meanings | No Span → tree unchanged; Span remount → tree changes |
| `#` before payload / `>` | Swallows forward siblings (can be the whole phase); later `#` commands **do not** get their own Span |
| `#` after `.` | Becomes the **next phase’s first line**, not “between-phase bypass” |
| `ignore`/`undefined` | Wire kept; capture keys **still** typeCheck-escaped |
| `#` inside Content | `note:#x` is **not** an annotation line; Span does not run |
| Leading whitespace | ` #cmd` is not the primitive; if the line also has `:`, it may parse as **Content** (dirty key) and Span never runs |
| Narrow capture | Use `@path` / `=` / `!` to cut; keep typed keys **before** `#` |

Tests: `test/annotation.span.test.js` (`pitfalls — custom annotation protocol`) · `test/hash.annotation.test.js`.

---

## 8. Related

- API §6.5 · [line-intercept.md](line-intercept.md) · [typecheck.md](typecheck.md) · [ws-session.md](ws-session.md) · protocol [wire-attention §7.1](../../../protocol/notes/wire-attention.md)
