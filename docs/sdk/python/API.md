# XAIOP Python SDK API Reference

[English](API.md) · [简体中文](API.zh-CN.md)

**Protocol**: v0.6.0 Frozen (sealed)  
**SDK**: **0.15.0a1** (alpha toward **0.15.1**)  
**Runtime**: **Python ≥ 3.10**  
**Package**: `xaiop`  
**Code**: [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/) (`src/xaiop/`)  
**Parity matrix**: [ALIGNMENT.md](ALIGNMENT.md) · **Node product-choice catalog**: [../behavioral-contract.md](../behavioral-contract.md) (optional guide; not a cross-language mandate) · **Releases**: [../../meta/releases.md](../../meta/releases.md)

> **Alpha note:** The public surface is **complete** (aligned at observable-semantics level with Node). Do **not** claim full Node **0.15.1** *release* parity until the package bumps to **0.15.1** after soak. See [ALIGNMENT.md](ALIGNMENT.md).

---

## 0. Runtime scope and entrypoints

| Entry | Environment | Surface |
| --- | --- | --- |
| `import xaiop` | **Python ≥ 3.10** (primary) | Full facade: parse / encode / engine / checkpoint / history / merge / types / control helpers; re-exports stream + WS |
| `xaiop.stream` | Network consumer | `XaiopStream`, `TRANSPORT_KIND`, `chunks_of`, `open_transport` |
| `xaiop.ws` | WebSocket session | `XaiopWs`, `XaiopWsConnection`, `XaiopWsHub` (optional `[ws]` extra) |
| `xaiop.types` | Type registry / freeze | `TYPE`, `TypeRegistry`, `TypeFreezeSession`, … |
| `xaiop.control` | Control Root (`#!`) | frames, demux, `ResumeWireLog`, session helpers |

| Claim | |
| --- | --- |
| Browser package (`xaiop/browser`) | **No** — out of scope (same as Java) |
| Sync-first public API | **Yes** — blocking defaults; async is explicit (`push_async`, `Future` from `send` / `done`) |
| Optional extras | `[http]` → `httpx`; `[ws]` → `websockets` |
| Wire semantics | Same protocol package **0.6.0** as Node / Java |

### Idioms (Node → Python)

| Topic | Python |
| --- | --- |
| Naming | `snake_case`: `parse_sync`, `encode_sync`, `jump_to`, `get_after`, `view_range`, `export_time_root` |
| Annotation Span keep | `AnnotationSpan.KEEP` (Node `undefined`) |
| Option dicts / hooks | Accept **camelCase** keys (`mergeChunkWindow`, `streamProcessing`, …) as well as snake_case |
| History range errors | `xaiop.RangeError` (`ValueError` subclass) |
| Phase iteration | Sync iterator `chunks()` / helper `chunks_of` (not native `async for`) |
| Live parser class | `LiveParser` (Node `LiveXaiopParser`) |

This repository’s **SDK focus remains Node.js** for product choices; Python is the official port. Normative parity inventory: [ALIGNMENT.md](ALIGNMENT.md).

---

## Contents

0. [Runtime scope and entrypoints](#0-runtime-scope-and-entrypoints)
1. [Quick start](#1-quick-start)
2. [Core concepts](#2-core-concepts)
3. [Parse API](#3-parse-api)
4. [Encode API](#4-encode-api)
5. [Engine API](#5-engine-api) (incl. [§5.5 Type checking](#55-type-checking-instance))
6. [Streaming API](#6-streaming-api) (incl. [§6.4 Line intercept](#64-line-intercept-on_line_intercept) · [§6.5 Annotation Span](#65-annotation-span-on_annotation_span) · phase `meta.seq`)
7. [WebSocket API](#7-websocket-api) (incl. [§7.5 connect ordering](#75-connect-future-vs-callback-ordering-attention) · [§7.6 Control Root](#76-sdk-control-root----session--resume))
8. [Merge and inject](#8-merge-and-inject)
9. [Compatibility mode](#9-compatibility-mode)
10. [Types and constants](#10-types-and-constants)
11. [Error handling](#11-error-handling)

---

## 1. Quick start

### Install

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev,http,ws]"
pytest
```

Published / editable package name: **`xaiop`**. Optional extras: `httpx` (`[http]`), `websockets` (`[ws]`).

### Basics

```python
from xaiop import (
    parse_sync,
    encode_sync,
    XaiopEngine,
    XaiopStream,
    PROTOCOL_VERSION,
    SDK_VERSION,
)

# XAIOP → JSON
parse_sync(">\na:1\n")  # → {"a": 1}

# JSON → XAIOP (default: one phase per top-level key, with `.`)
encode_sync({"a": 1, "b": 2})

# Engine store (sync-first)
engine = XaiopEngine()
data_id = engine.upload_json_sync({"meta": {"name": "demo"}})
json_doc = engine.get_sync(data_id)

# Streaming consume (`cover` defaults to False)
stream = XaiopStream(url, cover=False)
stream.on_chunk(lambda diff, meta=None: None)
fut = stream.send(transport="http")  # Future when promise mode enabled
```

WebSocket (optional `[ws]`):

```python
from xaiop import XaiopWs

hub = XaiopWs.listen(host="127.0.0.1", port=0)

def on_conn(conn, _req):
    conn.push_json("a", 1)
    conn.push_json("b", {"x": 2}, final=True)
    conn.end()

hub.on_connection(on_conn)

client = XaiopWs.connect(
    hub.url(),
    on_phase=lambda diff, meta=None: None,  # may fire before connect returns — see §7.5
)
final = client.done.result()
hub.close()
```

Primary methods are **synchronous**. Network `send` / WS `done` / `closed` expose `concurrent.futures.Future` where a completion handle is useful.

---

## 2. Core concepts

**XAIOP wire** is a streaming, line-oriented **cursor-construction protocol**. The legacy name “eXtensible AI Output Protocol” is **not** the definition. These SDK docs describe the Python implementation of **sealed protocol package 0.6.0** (SDK **0.15.0a1** alpha).

- Full grammar: [../../protocol/syntax.md](../../protocol/syntax.md)
- Seal and release index: [../../meta/releases.md](../../meta/releases.md)
- Node reference API: [../nodejs/API.md](../nodejs/API.md)

### 2.1 Wire lines (Labels)

| Form | Role |
| --- | --- |
| `>` / `>name` / `>name-` / `<` | Enter / leave structure (object, named object, named array) |
| `-` | Enter anonymous array element |
| `key:value` / `:value` | Content (keyed value / array element) |
| `.` | Reset Cursor to Root; exit broadcast; bound a **phase** |
| `=path` | Fuzzy locate (no create; zero hits → syntax error) |
| `@path` | Exact path from Root; **create** missing object segments and enter |
| `!path` | Broadcast: match all full path fragments; later lines run on each Cursor |
| `&path` | Delete deepest key; does **not** move Cursor |

Path segments use `>` (e.g. `@a>b`, `&a>b`). Bare Labels, bare `&`, bare `<` at Root, and newlines inside values are forbidden.

**Example:**

```text
>
>user
name:Alice
<
.
&user
>user
name:Bob
<
```

Full grammar: [../../protocol/syntax.md](../../protocol/syntax.md)

### 2.2 Phase

`.` resets Cursor to Root and is the streaming **Diff boundary** (SDK policy: phase on `.`, not on Blocks).  
Phases that contain `=` / `!` / `&` must see the **cumulative tree so far**; the official streamer parses a cumulative prefix for those phases.

### 2.3 Root shapes

| Opening | Result |
| --- | --- |
| `>` | Complete anonymous **object** root |
| `-` | Complete anonymous **array** root |
| `>name` / Root Content, etc. | Strict mode → **`XaiopFragment`** (no outer `{}`) |

Empty source → `{}`. Compat `forcedRoot` injects an object root for fragment openings and never returns a fragment.

### 2.4 `&` delete (protocol semantics)

| Rule | Behavior |
| --- | --- |
| Deepest key | `&a>b` deletes only `b`; parent may remain as `{}` |
| Single Cursor | Path is **absolute** from Root |
| Missing | Silent **no-op** (never creates) |
| Document root | **Object only**; array root / fragment root → syntax error |
| Cursor chain | Deleting current Cursor or an ancestor → **syntax error** |
| Broadcast | `&path` is **relative** to each Cursor; missing on that Cursor → no-op for it; any chain conflict → whole line fails |
| Arrays | May delete an entire named array value; **no** element-index delete |
| Cursor | **Unchanged** by `&`; later Content still writes at the prior Cursor |

### 2.5 `#` custom annotation transmission (protocol)

A standalone line beginning with `#` is **custom annotation transmission** (official name; not a “comment”). Position unrestricted; protocol does not interpret text after `#`; parsers ignore it (no Cursor / tree effect). `note:#x` remains Content. A line with leading whitespace before `#` is **not** this primitive.

### 2.6 Cover vs non-cover (streaming Diff only)

`cover` is an **SDK streaming option** (default `False`). It does not change the final key set: after `finish`, Snapshot ≡ `parse_sync(wire)`.

| `cover` | Diff behavior |
| --- | --- |
| `False` (default) | `&` updates the live / Commit tree; **already-emitted Diffs are not rewritten** |
| `True` | Consecutive `&` → forced `.` → deepest-key **`None` tombstone Diff** → restore Cursor with a `>` chain → continue |

Do **not** confuse three kinds of null:

| Kind | Meaning |
| --- | --- |
| Diff tombstone `None` | Cover-mode delete-phase Diff value (key present, value `None`) |
| Content typed `null` | Wire `key:null` / `:null` (protocol Content) |
| Empty-phase chunk `None` | Delivery value for an empty streaming phase / no Diff |

---

## 3. Parse API

### 3.1 `parse_sync`

```python
parse_sync(source, compat_or_options=False) -> Any | XaiopFragment
```

Parse full XAIOP text to JSON or a Fragment (sync). There is **no** public `parse_async` on the Python facade (sync-first).

**Parameters:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `source` | `str` | — | Full XAIOP text; non-str → `TypeError` |
| `compat_or_options` | `bool \| CompatPolicy \| dict` | `False` | `False` strict; `True` all eight fixes; `CompatPolicy` / partial dict overrides; options dict may include `compat` / `symbolKeys` (`symbol_keys`) |

**Returns:**

- Complete document → plain `dict` / `list`
- Root fragment (strict mode) → `XaiopFragment` (use `.entries`)
- Empty source → `{}`

```python
from xaiop import parse_sync, CompatPolicy

parse_sync(">\na:1\n")
parse_sync(text, True)
parse_sync(text, {"forcedRoot": False})  # other fixes stay default True
parse_sync(text, CompatPolicy({"popAndRetry": False}))
parse_sync(text, {"compat": True, "symbolKeys": True})
```

**Asymmetry:** free `parse_sync` accepts fine-grained compat / options; `XaiopEngine.parse_sync` (static) accepts **boolean only**.

### 3.2 `LiveParser`

Incremental parser: feed lines / text; semantics ≡ `parse_sync` over the concatenation. Used by streaming checkpoints to avoid re-scanning the whole prefix on every `.`.

```python
LiveParser(compat_or_options=False)
feed_line(line) -> LiveParser
feed_text(text) -> LiveParser
feed_lines(lines) -> LiveParser
value() -> Any | XaiopFragment   # live reference — clone before exposing
cursor_restore_lines() -> list[str]  # `>` / `>name-` chain for cover restore; at Root → []
```

| Method | Notes |
| --- | --- |
| `feed_line` | Complete logical line (no trailing LF/CRLF) |
| `feed_text` | Split like `parse_sync` — **no half-line buffer across calls**; a trailing segment without LF is a full line. For arbitrary network chunks use `DotCheckpointEngine.push` / `XaiopStream` |
| `value` | Current document (further feeds mutate in place) |
| `cursor_restore_lines` | Unavailable while broadcast is active; anonymous / array-element frames on stack → syntax error |

```python
from xaiop import LiveParser

live = LiveParser()
# OK: complete lines (trailing incomplete segment without LF is still one line)
live.feed_text(">\n>a\nx:1\n.\n>b\ny:2\n")
live.cursor_restore_lines()  # → [">b"]
live.value()                 # → {"a": {"x": 1}, "b": {"y": 2}}
# NOT for TCP/WS byte slices: feed_text(">me") then feed_text("ta\n") ≠ feed_text(">meta\n")
```

### 3.3 `XaiopFragment`

Returned in strict mode when there is no anonymous root and the document opens with `>name` / Root Content.

| Member | Meaning |
| --- | --- |
| `entries` | Named bindings at Root |
| `is_fragment` | Always `True` |
| `notation()` | Debug string, e.g. `'"a":{}'` |

Streaming / WS JSON surfaces run `materialize_snapshot`: fragment → clone of `entries`. Engine `get_sync` keeps the fragment.

Helpers: `materialize` / `materialize_owned` / `materialize_snapshot`.

---

## 4. Encode API

### 4.1 `encode_sync`

```python
encode_sync(
    value,
    *,
    root="auto",
    style="reset",
    dot_policy=DOT_POLICY["PER_TOP_LEVEL_KEY"],  # "perTopLevelKey"
    phase_every=None,
    max_phases=None,
    final_dot=False,
    key_order="insertion",
    null_policy="encode",
    undefined_policy="omit",
    should_phase=None,
    symbol_keys=False,
    trailing_newline=True,
) -> str
```

Encodes **plain JSON** to **strict** XAIOP (compatibility mode **never** changes encode output).  
Free function / `XaiopEngine.encode_sync` produce the same wire for the same `(value, options)`.

**Guarantees:** for accepted values, `parse_sync(encode_sync(value, …))` deep-equals `value`; wire ends with exactly one `\n` when `trailing_newline=True` (default).  
**Not guaranteed:** byte-identical `encode(parse(handwritten wire))`.  
**Float tokens:** wire formatting matches ECMAScript `Number#toString` for shared fixtures / golden CI.

**Rejected string values (raise `XaiopEncodeError`):** containing CR/LF; **beginning with U+0020 SPACE** (forced-string markers after `:` are not payload — emitting such values would silently strip leading spaces on parse). Tab (`U+0009`) and trailing spaces remain encodable.

```python
from xaiop import encode_sync, DOT_POLICY

encode_sync({"a": 1, "b": 2})  # default perTopLevelKey
encode_sync({"a": 1, "b": 2}, dot_policy=DOT_POLICY["NONE"])
encode_sync({"a": 1, "b": 2, "c": 3}, dot_policy="perNKeys", phase_every=2)
encode_sync(obj, dot_policy=["meta", "items[0]"])  # path cuts
```

Engine convenience (options dict; keys may be snake_case kwargs when unpacked):

```python
engine.encode_sync(value, {"dot_policy": "none"})
```

### 4.2 Encode options

| Option | Default | Notes |
| --- | --- | --- |
| `root` | `"auto"` | `"object"` \| `"array"` \| `"auto"` \| `"fragment"` |
| `style` | `"reset"` | `"reset"` inserts `.` between phases; `"relative"` only with `dot_policy: "none"` |
| `dot_policy` | `"perTopLevelKey"` | `"none"` \| `"perTopLevelKey"` \| `"perNKeys"` \| `"custom"` \| `list[str]` (JSON paths; `.` after each listed node) |
| `phase_every` | `None` (`1` when `perNKeys`) | Keys per phase when `perNKeys` |
| `max_phases` | — | Cap phase count (merge the tail) |
| `final_dot` | `False` | Append a trailing `.` |
| `key_order` | `"insertion"` | or `"sorted"` |
| `null_policy` | `"encode"` | `"encode"` typed null; `"omit"` drop object null keys (arrays still encode); `"error"` raise on null |
| `undefined_policy` | `"omit"` | `"omit"` \| `"error"` (Python has no `undefined`; reserved for parity / sparse hooks) |
| `should_phase` | — | Required when `dot_policy: "custom"` |
| `symbol_keys` | `False` | Opt-in U+001F label-escape dialect so keys may begin with `#` `@` `>` `<` `=` `!` `&` or U+001F; **both encode and parse must enable**; see [label-escape](../../protocol/notes/label-escape.md) |
| `trailing_newline` | `True` | Finalize with `\n` |

Path-list overload is **mutually exclusive** with `phase_every` / `max_phases` / `should_phase`; requires `style: "reset"`; array index must be the **final** path segment. Helpers: `parse_json_path` / `format_json_path` (in `xaiop.encode`; used by type paths / Annotation Span).

### 4.3 Rejected keys

These keys raise `XaiopEncodeError` (no silent reshape):

| Form | Why |
| --- | --- |
| Empty / whitespace / contains `:` | Illegal Label name |
| Ends with `-` | Conflicts with `>name-` array enter |
| Contains `>` `<` `=` `!` **`&`** (in the key body) | Cursor / locate / delete operator ambiguity |
| **Begins with** `#` `@` `>` `<` `=` `!` `&` or **U+001F** | Line-class / reserved escape introducer — unless `symbol_keys=True` |

Constants: `DOT_POLICY` · `LABEL_ESCAPE_INTRODUCER` (`"\u001f"`).

---

## 5. Engine API

`XaiopEngine`: in-memory store (runtime data ids) plus parse / encode / merge-inject. Compatibility mode is **off** by default. **Sync-first** method names (`*_sync`).

```python
from xaiop import XaiopEngine

engine = XaiopEngine()
engine_compat = XaiopEngine(compatibility_mode=True)
```

### 5.1 Store

| API | Returns | Notes |
| --- | --- | --- |
| `upload_sync(source)` | `data_id` | Parse full XAIOP → store; follows instance compat |
| `upload_json_sync(value, encode_options?)` | `data_id` | Strict encode → upload |
| `get_sync(data_id)` | JSON or `XaiopFragment` (clone) | Unknown id → `ValueError` |
| `has` / `delete` / `clear` | — | Store management |

### 5.2 Instance encode / merge

| API | Notes |
| --- | --- |
| `encode_sync` | Same as free function; **ignores** compat switch |
| `merge_to_json_sync` | Base JSON + XAIOP → JSON (parse uses instance compat; override via `options["compat"]`) |
| `merge_to_xaiop_sync` | → XAIOP wire |
| `inject_xaiop_sync` | Inject XAIOP into existing `data_id` (mutates store) |
| `inject_json_sync` | Inject JSON into existing `data_id` |

### 5.3 Static methods

| API | Notes |
| --- | --- |
| `XaiopEngine.parse_sync` | Second arg **boolean only** |
| `XaiopEngine.encode_sync_static` | Same as free `encode_sync` |
| `XaiopEngine.merge_to_json_static` / `merge_to_xaiop_static` | Same as free functions |

### 5.4 Compatibility switches (instance)

| API | Notes |
| --- | --- |
| `compatibility_mode` / `set_compatibility_mode` | Master switch; does **not** reset per-fix flags; turning compat **on** clears `type_check` |
| `compat_forced_root` … `set_compat_locate_path_array_suffix` | Eight fine-grained fixes; if mode is off or arg is not bool, setter returns `False` and leaves state unchanged |

Fix IDs (camelCase attributes on `CompatPolicy`): `forcedRoot`, `rewriteBareNameArray`, `rewriteEnterLine`, `ignoreBareLeaveAtRoot`, `popAndRetry`, `locatePathTrim`, `locatePathStripSpaces`, `locatePathArraySuffix`.

### 5.5 Type checking (instance)

**Not protocol:** registry / freeze / push are **SDK** product features; they do not rewrite the wire grammar. Module: `xaiop.types`.

| API | Notes |
| --- | --- |
| `type_check` / `set_type_check(enabled)` | Master switch (default `False`); **strict mode only**; turning compat **on** clears it; when on, `upload_*` / `inject_*` run registry checks |
| `TYPE` | Leaf/structure constants: `INT` `FLOAT` `BOOL` `STRING` `NULL` `OBJECT` `ARRAY` `ANY` |
| `object_type(fields)` / `array_type(element)` | Builders; surface sugar strings also accepted |
| `register_type(path, type_, options?)` | Bind a JSON path; `polarity`: `"allow"` (default) \| `"deny"`; **immutable once set** (re-register → `False`) |
| `register_types(map\|entries, options?)` | Batch |
| `register_type_deny(path, type_)` | Deny helper |
| `get_registered_type` / `type_registry` / `export_type_schema` | Query and snapshot |
| `encode_type_schema_frame()` | Encode control frame (prefer `push_type_consistency` on the connection) |
| `on_type_violation(fn\|None)` | Violation hook (called **before** raising `XaiopTypeError`) |

**Path house style:** `data.fork`, `items[0]` (same as encode `parse_json_path`; **not** wire `data>fork`).

**Optional surface sugar:** `string`, `array<int>`, `object<name:string,old:int>` → compared as **canonical** types.

**Server checks (`type_check` + registry):**

| Rule | |
| --- | --- |
| Scope | **Registered paths only**; unregistered paths are ignored by the registry |
| `allow` | Value must match; `int` ≠ `float` (same split as encode) |
| `deny` | Value must **not** match that type |
| `any` | Explicit ignore (cannot combine `deny` + `any`) |
| Empty registry | Enabling checks is a no-op |
| When | `upload_sync` / `upload_json_sync` / `inject_xaiop_sync` / `inject_json_sync` |

```python
from xaiop import XaiopEngine, TYPE, object_type, array_type

eng = XaiopEngine()
eng.register_type("data.fork", TYPE["STRING"])
eng.register_type("user", object_type({"name": TYPE["STRING"], "old": TYPE["INT"]}))
eng.register_type("items", array_type(TYPE["INT"]))
eng.register_type_deny("data.bad", TYPE["STRING"])
eng.register_type("meta.note", TYPE["ANY"])
eng.set_type_check(True)
eng.upload_sync(">\n>data\nfork:ok\n")  # OK
```

**Client (`XaiopWs` / `XaiopStream`, `type_check=True` / `typeCheck=True`):**

| Rule | |
| --- | --- |
| Freeze | First **non-`None`** observation at a path locks the type; later values must be compatible |
| `None` / wire null | **Skipped** on the client (no refresh, no error) so delete/clear primitives are not broken |
| Arrays | Element types must be **homogeneous** when checking is on |
| Refresh | Key absent from commit (delete) clears subtree freeze; recreate after delete may change type |
| No schema push | First-seen freeze still enforces consistency |
| Schema push / preload | `allow` / `deny` / `any` apply first; **schema-violating observations do not write freeze**; `any` does **not** lock freeze |
| Options | `type_check` / `typeCheck`, `type_schema` / `typeSchema`; with compatibility mode on, **typeCheck is ignored** |

**Type-consistency push (WS):** `conn.push_type_consistency(engine|registry|snapshot)`

| Prerequisite | |
| --- | --- |
| Connection | **Strict** (`compatibility_mode is False`) |
| Payload | Non-empty registry; if passing `XaiopEngine`, its **`type_check` must be True** |
| Shape | Control frame (**not** XAIOP wire): prefix `#!xaiop/types/v1\n` + JSON snapshot; demuxed by Control Root before parse / Span |
| Failure | Bad prerequisites → `TypeError`; socket not open → `False` |

Deep-dive (Node notes apply semantically): [../nodejs/notes/typecheck.md](../nodejs/notes/typecheck.md).

---

## 6. Streaming API

### 6.1 `XaiopStream`

HTTP / SSE / RAW **consumer** (`xaiop.stream`). Text feeds `DotCheckpointEngine`, emits Diffs on `.`, and parses the final Snapshot at EOF.  
**WebSocket sessions** use `XaiopWs` (§7), not `TRANSPORT_KIND` on the stream client.

```python
from xaiop import XaiopStream, STREAM_MODES, TRANSPORT_KIND

stream = XaiopStream(
    url,
    stream_processing=True,      # default
    compatibility_mode=False,    # default
    merge_chunk_window=True,     # or mergeChunkWindow=True
    async_parse=False,
    history_snapshot=False,
    history_realtime=False,
    retain_wire_history=True,
    cover=False,
    modes=[STREAM_MODES["CALLBACK"]],
)

stream.on_chunk(lambda diff, meta=None: None)
stream.on_done(lambda json_doc: None)
fut = stream.send(transport=TRANSPORT_KIND["HTTP"])
```

#### Constructor options

| Option | Default | Notes |
| --- | --- | --- |
| `stream_processing` / `streamProcessing` | `True` | Mid-stream phase Diffs; `False` → one chunk at finish |
| `merge_chunk_window` / `mergeChunkWindow` | `True` | All complete `.` in the window → **one** Diff |
| `async_parse` / `asyncParse` | `False` | Transport uses `push_async` |
| `history_snapshot` / `historySnapshot` | `False` | Read-only `.` history |
| `history_realtime` / `historyRealtime` | `False` | Forward `jump_to` |
| `retain_wire_history` / `retainWireHistory` | `True` | Keep wire slices when history is on |
| `cover` | `False` | Cover Diff for `&` (§2.6) |
| `compatibility_mode` / `compatibilityMode` | `False` | Same as Engine |
| `type_check` / `typeCheck` | `False` | Client freeze / schema checks (§5.5); ignored if compatibility mode is also on |
| `type_schema` / `typeSchema` | — | Preload type snapshot or `TypeRegistry` |
| `symbol_keys` / `symbolKeys` | `False` | Label-escape dialect |
| `line_intercept` / `lineIntercept` | — | Initial line-intercept handler or list (§6.4) |
| `annotation_span` / `annotationSpan` | — | Initial Annotation Span handler or list (§6.5) |
| `session` / control callbacks | — | Optional Control Root inbound cursor (§7.6) |
| `modes` | `["callback"]` | Multi-select allowed |

#### Snapshot / chunk

| API | When | Value |
| --- | --- | --- |
| `on_chunk` / `chunks()` | Phase / window boundary | Diff JSON; empty phase may be `None`; second arg `meta` may include `seq` / `seqs` and `typeCheckEscapePaths` |
| `get_committed_snapshot()` | After each commit | Cumulative later-wins through last `.` / EOF |
| `buffer_stats()` / `compact_committed(drop_history=…)` | Mid-stream | Receive-buffer sizes / discard committed wire (keep live tree) |
| `get_snapshot()` / `on_done` | After finish | Full-buffer parse; empty → `{}` |
| Mid-stream `get_snapshot()` | `streaming` | Usually `None` |

Fragments are materialized to plain objects on these surfaces (`materialize_snapshot`).

#### Delivery modes

| Mode | Surface |
| --- | --- |
| `callback` (floor) | `on_chunk` / `on_done` / `on_error`; also line intercept / Annotation Span |
| `promise` | `send()` → `Future` of final Snapshot |
| `asyncIterator` | Sync iterator `chunks()` (mode name kept for Node parity) |
| `events` | `on("chunk"\|"done"\|"error"\|"status")` |

`set_modes` never leaves an empty set (keeps `callback`). Busy `send` again: promise mode → failed `Future`; otherwise raise.

#### `send` essentials

| Item | Rule |
| --- | --- |
| Default transport | `http` (`TRANSPORT_KIND["HTTP"]`) |
| SSE | Sets `Accept: text/event-stream`; joins multi-line `data:` with `\n` |
| RAW | Requires `source` (iterable of text chunks) — or `send_raw(chunks)` |
| Binary | Streaming UTF-8 decode across chunks |
| `abort()` | Status `aborted` |
| HTTP client | stdlib by default; optional `httpx` via `[http]` extra when available |

State machine: `idle → connecting → streaming → completing → completed` (or `aborted` / `error`). Constants: `STREAM_STATUS`, `TRANSPORT_KIND` (`http` / `sse` / `raw`), `STREAM_MODES`; `is_stream_busy(status)`.

```python
# Sync phase iterator
stream = XaiopStream(url, modes=["callback", "asyncIterator"])
# start send in a thread / enable promise as needed
for diff in stream.chunks():
    ...
```

### 6.2 `DotCheckpointEngine`

Low-level `.`-phase parser (used inside `XaiopStream` / WS; usable directly). Construct with a **hooks dict** (camelCase or snake_case keys).

```python
from xaiop import DotCheckpointEngine

eng = DotCheckpointEngine({
    "streamProcessing": True,   # default
    "mergeChunkWindow": True,   # default
    "emitDiff": True,           # default; False → Commit/final only
    "cover": False,
    "historySnapshot": False,
    "historyRealtime": False,
    "retainWireHistory": True,
    "compat": False,
    "lineIntercept": None,      # or handler / list
    "annotationSpan": None,     # or handler / list
    "onChunk": lambda diff, meta=None: None,
})
eng.push(chunk)
eng.buffer_stats()       # {length, committedAt, pendingBytes, openPhase}
eng.compact_committed()  # drop committed wire; keep live tree
eng.finish()
eng.snapshot             # final
eng.committed_snapshot   # last commit
eng.history              # ParseHistory | None
eng.on_line_intercept(fn)
eng.on_annotation_span(fn)
```

| Option | Default | Notes |
| --- | --- | --- |
| `streamProcessing` | `True` | Mid-stream `.` phases + line-scan path (intercept / Span). Bare ctor without the flag is **on**. |
| `mergeChunkWindow` | `True` | Batch complete `.` in the buffer window → one Diff |
| `emitDiff` | `True` | Set `False` when only Commit / final snapshot is needed |
| `cover` | `False` | Cover-mode Diff for `&` |

| Method | Notes |
| --- | --- |
| `push` / `push_async` | Sync ingest / thread-scheduled coalesced scan |
| `finish` / `finish_async` | Flush tail |
| `buffer_stats()` | `{length, committedAt, pendingBytes, openPhase}`. `pendingBytes` **MUST** equal `length - committedAt` |
| `compact_committed(drop_history=False)` | Discard `buffer[0..committedAt)`; keep live tree. **MUST** raise on closed engine; on `historyRealtime`+`retainWireHistory`; on non-empty history — unless `drop_history=True` |
| `jump_to(index)` | Requires `historyRealtime`; discards nodes after the index |
| `on_line_intercept` / `clear_line_intercepts` | After complete line split, before parse; see §6.4 |
| `on_annotation_span` / `clear_annotation_spans` | Phase `#` span; see §6.5 |
| `stream_processing` / `merge_chunk_window` | Read-only properties for the resolved defaults |
| `note_log_seq(seq)` | Queue session-log seq for Diff `meta` (§7.6) |

### 6.3 `ParseHistory` / Snapshot helpers

History is built by the checkpoint when `history_snapshot` and/or `history_realtime` is on.

| API | Notes |
| --- | --- |
| `info()` / `export_time_root()` | Metadata / node list (snapshot mode) |
| `get_node` / `get_diff` / `get_before` / `get_after` | Read by index |
| `compare` / `view_range` | Compare / range view (snapshot) |
| `jump_to` / `can_jump_to` | Realtime **forward-only** jump |
| `set_source` / `release` | Associate source key / release |
| Out of range / backward jump | Raises `xaiop.RangeError` |

`materialize_snapshot(parsed)`: Fragment → plain object (JSON surface).

Deep notes (Node, semantics apply): [../nodejs/notes/streaming-parse.md](../nodejs/notes/streaming-parse.md) · [../nodejs/notes/history.md](../nodejs/notes/history.md).

### 6.4 Line intercept (`on_line_intercept`)

**SDK product feature** (not wire grammar): after the checkpoint **receive buffer** splits a complete logical line and **before** `LiveParser` feed, run handlers in **registration order**.

| Contrast | Line intercept | `on_phase` / `on_chunk` |
| --- | --- | --- |
| Layer | Buffer line boundary (post-split) | Phase Diff (after parse + Commit) |
| Grain | Each complete line | `.` phase (may window-merge) |
| Rewrite / skip | **Yes** (return `str` or `None`) | **No** |

```python
from xaiop import LINE_KIND, DotCheckpointEngine

def intercept(ctx):
    view = ctx["view"]
    if view.kind == LINE_KIND["ANNOTATION"]:
        return None  # skip line
    if view.kind == LINE_KIND["CONTENT"] and view.key == "x":
        return "x:42"  # rewrite
    return ctx["raw"]  # keep (Python has no `undefined`; return current text)

eng = DotCheckpointEngine({"onChunk": lambda d, m=None: None})
eng.on_line_intercept(intercept)
```

Handler contract (aligned with Node):

| Return | Meaning |
| --- | --- |
| `str` | Text fed downstream; next handler sees it (use `ctx["raw"]` to **keep**) |
| `None` | **Skip this line** (short-circuit; later handlers not called) |

**Three nulls (do not conflate):** intercept skip ≠ Content `key:null` ≠ empty-phase Diff `None`.

**Fixed template `LineView`:** `kind` · `raw` · `name` · `path` · `key` · `value_text` · `annotation_text`. Also exported: `LINE_KIND` / `classify_line` / `run_line_intercept_chain`.

| Edge | Behavior |
| --- | --- |
| `stream_processing=False` | Whole-buffer parse; interceptors **do not** run |
| Skip `.` / rewrite to `.` | Phase close follows **post-intercept** text |
| `merge_chunk_window` / `cover` / `push_async` | Existing phase rules after effective lines |
| `jump_to` (`history_realtime`) | Rebuild **re-runs** the intercept chain |
| Interceptors present → Diff owned-parse | Uses **effective** line wire (may differ from transport buffer) |

Surfaces: `DotCheckpointEngine` · `XaiopStream` · `XaiopWsConnection` (ctor `line_intercept` / `lineIntercept` and/or `on_line_intercept` / `clear_line_intercepts`).

Deep dive: [../nodejs/notes/line-intercept.md](../nodejs/notes/line-intercept.md).

### 6.5 Annotation Span (`on_annotation_span`)

**SDK product feature** (not wire grammar): wire `#…` still has no tree side effects. After **this phase’s** lines are ready and **before Diff / Commit / `typeCheck`**, on `#` collect **forward same-level** siblings (+ subtrees), call handlers with **annotation text + template JSON**, and remount / drop / keep. Lines starting with `#!` are Control Root: demuxed before Span; Span **hard-skips** any remaining `#!`.

| Contrast | Line intercept §6.4 | Annotation Span §6.5 |
| --- | --- | --- |
| Layer | Buffer line split | Phase lines (JSON-facing capture) |
| Trigger | Every complete line | `#` + forward same-level region |
| Handler input | Wire `view` | `annotation` + materialized `json` (no `=`/`@`/`!` forms) |
| Keep sentinel | — | **`AnnotationSpan.KEEP`** (Node `undefined`) |
| vs typeCheck | Orthogonal | **Before typeCheck**; processed region **escapes** type check |

```python
from xaiop import AnnotationSpan

def on_span(annotation, view):
    if "tag" not in annotation:
        return AnnotationSpan.KEEP  # keep wire; still escape capture keys
    if "drop" in annotation:
        return None  # drop # + capture
    return {**view.json, "rewritten": True}  # remount

eng.on_annotation_span(on_span)
```

| Return | Meaning |
| --- | --- |
| `AnnotationSpan.KEEP` | Keep `#` + capture wire; **still** record escape paths for capture keys |
| `None` | Drop `#` + capture |
| object / list / JSON text | Encode as sibling wire replacing capture |

**TypeCheck escape (must understand):** once this phase **invokes** the Span handler chain for a `#`, the region handlers process and the same-level keys covered by that forward region enter `meta.typeCheckEscapePaths`; later `observeTree` **skips** those paths (and descendants). Same-level keys **before** `#` are **not** escaped.

Surfaces: ctor `annotation_span` / `annotationSpan` · `on_annotation_span` · `clear_annotation_spans`. Helpers: `apply_annotation_spans` / `encode_as_sibling_lines` / `path_escapes_type_check`.

Deep dive: [../nodejs/notes/annotation-span.md](../nodejs/notes/annotation-span.md).

---

## 7. WebSocket API

Prefer `XaiopWs` for long-lived skeleton sessions (push + consume on one connection). Keep using `XaiopStream` for HTTP/SSE/RAW.  
Requires optional extra: `pip install "xaiop[ws]"` (`websockets`).  
The **wire** does not define `connect` / Futures / callback order; the following is **locked Python SDK** behavior aligned with Node. Deep dive: [../nodejs/notes/ws-session.md](../nodejs/notes/ws-session.md).

### 7.1 `XaiopWs`

```python
from xaiop import XaiopWs

hub = XaiopWs.listen(host="127.0.0.1", port=0)
hub.on_connection(lambda conn, _req: (
    conn.push_json("a", 1),
    conn.push_json("b", {"x": 2}, final=True),
    conn.end(),
) and None)

client = XaiopWs.connect(
    hub.url(),
    on_phase=lambda diff, meta=None: None,  # may run before connect returns — §7.5
)
json_doc = client.done.result()  # may already be settled when connect returns
hub.close()
```

| API | Notes |
| --- | --- |
| `XaiopWs.listen(**options)` | → `XaiopWsHub` |
| `XaiopWs.connect(url, **options)` | → `XaiopWsConnection` (handlers locked); raises `ImportError` if `websockets` missing |
| `XaiopWs.encode_phase_json` / `encode_phase_object` | Encode only (no send); also free functions |

**Connect options:** `stream_processing`, `merge_chunk_window`, `async_parse`, `cover`, `compatibility_mode`, `type_check`, `type_schema`, `symbol_keys`, `line_intercept`, `annotation_span`, **`session`**, **`auto_session`**, **`auto_ack`**, **`retain_outbound`**, `protocols`, `handshake_timeout_ms` / `handshakeTimeoutMs` (default **15000**), `headers`, and construction-time `on_phase` / `on_chunk` / `on_done` / `on_error` / **`on_control_error`** / **`on_session`** / **`on_resume`** / **`on_ack`** / **`on_snapshot`**. CamelCase aliases accepted.

**Listen options:** parse/control-related options above + `host` / `port` / …

### 7.2 `XaiopWsConnection`

| Member | Notes |
| --- | --- |
| `push_json(key, value, final=False, …)` | One key per phase; non-final ensures trailing `.\n`; not open → `False` |
| `push_object(obj, final=False, …)` | Multiple keys in one phase |
| `push_wire(text)` | Raw wire **as-is** (no auto `\n`); consecutive frames must already be line-safe |
| `push_wire_ln(text)` | Like `push_wire`, but appends `\n` when `text` does not already end with LF |
| `push_type_consistency(engine\|registry\|snapshot)` | Push registered type schema (control frame); prerequisites in §5.5 |
| `session_id` / `auto_session` / `auto_ack` / outbound log | Control session / hello / auto-ack / outbound log (§7.6) |
| `send_session` / `send_ack` / `send_resume` / `send_snapshot` | Outbound control frames |
| `get_resume_state()` / `phase_seq` / `outbound_seq` / `acked_seq` / `log_seq` | Resume cursors |
| `outbound_log` / `replay_outbound_after` / `note_outbound_phase` | Producer outbound phase log |
| `ResumeWireLog` | App-owned durable log across reconnects |
| `type_check` | Read-only; whether client type checking is on |
| `on_phase` / `on_chunk` | Diff callback; **`(diff, meta?)`** with `seq` / `seqs`; **locked after `connect`** |
| `on_line_intercept` / `clear_line_intercepts` | Buffer-line intercept (§6.4); **locked after `connect`** |
| `on_annotation_span` / `clear_annotation_spans` | Phase Annotation Span (§6.5); **locked after `connect`** |
| `on_done` / `on_error` / control callbacks | Final / error / control; **locked after `connect`** |
| `handlers_locked` | `True` after successful `XaiopWs.connect` |
| `get_committed_snapshot` / `get_snapshot` | Same as Stream: committed mid-stream; `get_snapshot()` is `None` until final |
| `done` | `Future` of final Snapshot after peer close + `finish` |
| `closed` | `Future` — socket teardown finished |
| `end` / `abort` | Drain-close / abort |

### 7.3 `XaiopWsHub`

| Member | Notes |
| --- | --- |
| `url(host?)` | Connect URL |
| `on_connection` / `on_error` | Accept callbacks (may **sync** `push_*` here) |
| `connections` | Current connections |
| `close()` | Close the hub |
| `port` | Bound port |

Listen-accept connections stay **unlocked** so a producer/consumer can still attach handlers in `hub.on_connection` if needed.

### 7.4 `encode_phase_json` / `encode_phase_object`

```python
encode_phase_json(key, value, *, final=False, encode_options=None) -> str
encode_phase_object(obj, *, final=False, encode_options=None) -> str
```

Uses `encode_sync` internally (default `dot_policy: "none"`); `final=True` omits the phase `.`. Illegal keys still raise `XaiopEncodeError`.

### 7.5 `connect` Future vs callback ordering (attention)

Internal `connect` order: **open socket → construct `XaiopWsConnection` (bind reader + option callbacks) → return**.

| Explicit semantics | |
| --- | --- |
| `connect` return means | Handshake OK; usable connection object returned |
| `connect` return does **not** mean | “No `on_phase` / `on_done` yet” or “`done` is unsettled” |
| SDK does **not** buffer phases until after return | Deliberate — avoids dropping sync first frames on accept |

Therefore **`on_phase` / `on_done` / `on_error` and settlement of `done` may all happen before `XaiopWs.connect(...)` returns** (especially when the accept side pushes synchronously in `on_connection`).

**Required:** put **`on_phase` / `on_chunk` / `on_done` / `on_error` / `line_intercept` / `annotation_span` / control callbacks** in **`connect` kwargs**.  
After `connect` returns, mutators (`on_phase`, `on_line_intercept`, …) **raise** when `handlers_locked` — there is **no replay** of early frames.  
If the app needs “process only after connect returns”: queue in the application layer; do not ask the SDK to defer delivery.

### 7.6 SDK Control Root (`#!`) — session / resume

Product convention (not a Frozen 0.6.0 grammar change): lines starting with `#!` are the **SDK control plane**. They are demuxed **before** parse / Annotation Span. Module: `xaiop.control`. Full note: **[../nodejs/notes/control-plane.md](../nodejs/notes/control-plane.md)**.

| Item | Summary |
| --- | --- |
| Official frames | `#!xaiop/types/v1`, `session/v1`, `ack/v1`, `resume/v1`, `snapshot/v1`, **`seq/v1`** |
| Unknown `#!` | Discard + `XaiopControlError` (`on_control_error`); never enter the wire pipeline |
| **Two seq spaces** | `meta.seq` = **connection-local** (resets each socket); `meta.logSeq` = **session-log** for `fromSeq` / ack. **Never** assign `resumeCursor = meta.seq` after reconnect — use `meta.logSeq` / `get_resume_state()` |
| Stamp | `#!xaiop/seq/v1` before each phase; `push_json`/`push_object` auto-stamp when `session`/`retain_outbound`; `ResumeWireLog.wires_after` stamps |
| Window merge | Default `merge_chunk_window=True` may merge resume catch-up into one chunk (`meta.logSeqs` still lists units) — not a bug; use `False` for per-phase callbacks |
| Resume | `send_resume({"sessionId", "fromSeq"})` → continue from `fromSeq+1` in **log** space; **no** historical Diff replay; optional `send_snapshot` |
| Connect options | `session`, `auto_session`, `auto_ack`, `retain_outbound`, `on_session`, `on_resume`, `on_ack`, `on_snapshot`, `on_control_error` |
| Producer log | auto-record + stamp when `session`/`retain_outbound`; durable: app-owned `ResumeWireLog` by `session_id` |
| Stream | `on_chunk(diff, meta)` may include `seq`/`seqs` and `logSeq`/`logSeqs` |

Exports include: `CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY`, `ControlDemux` / `ControlIngest` / `ControlPlaneHost` / `ControlSessionState`, `encode_*_frame`, `stamp_wire_with_log_seq`, `ResumeWireLog`, `XaiopControlError`, `XaiopResumeLogError`.

---

## 8. Merge and inject

**Pre/post-processing**, not streaming. Conflict policy applies only to **conflicting keys** (deep objects recurse; arrays / scalars conflict as a whole).

| `conflict` | Behavior |
| --- | --- |
| `overwrite` (default) | Take overlay **at conflicting keys** |
| `keep` | Keep base; non-conflicting keys still merge in |

**Not a Diff applicator:** `merge_json` / `merge_to_json` **do not delete** keys that are absent from the overlay. Example: `merge_json({"cart": {"a": 1, "b": 2}}, {"cart": {"a": 1}})` keeps `b`. Phase Diffs from `on_chunk` / `on_phase` are **subtree replacement** (or cumulative commit) surfaces — to apply a Diff locally, replace by path (or take `get_committed_snapshot()`); **do not** pipe Diffs into `merge_json`.

Constants: `MERGE_CONFLICT["OVERWRITE"]` / `MERGE_CONFLICT["KEEP"]`.

| API | Returns |
| --- | --- |
| `merge_json(base, overlay, conflict?)` | JSON ← JSON+JSON |
| `merge_to_json(base_json, xaiop_source, options?)` | JSON |
| `merge_to_xaiop(base_json, xaiop_source, options?)` | XAIOP (default encode `dot_policy: "none"`) |

`options`: `conflict`, `compat` (parse overlay); `merge_to_xaiop` may add `encode_options` / encode kwargs.

Engine inject (mutates store):

| API | Overlay |
| --- | --- |
| `inject_xaiop_sync(data_id, xaiop, options?)` | XAIOP |
| `inject_json_sync(data_id, json, options?)` | JSON |

```python
from xaiop import merge_to_json, MERGE_CONFLICT, XaiopEngine

merge_to_json({"a": 1}, ">\nb:2\n", {"conflict": MERGE_CONFLICT["KEEP"]})

engine = XaiopEngine()
data_id = engine.upload_json_sync({"a": 1})
engine.inject_xaiop_sync(data_id, ">\nb:2\n")
```

---

## 9. Compatibility mode

Optional parse path for imperfect model output. Does **not** change the sealed wire protocol; only changes ingest recovery. **Off** by default.

| Entry | Form |
| --- | --- |
| Free `parse_sync` | `bool \| CompatPolicy \| partial dict` |
| `XaiopEngine.parse_sync` | **boolean only** |
| Engine / Stream instance | `compatibility_mode` + `set_compat_*` |

When enabled with no overrides: **all eight** fixes on. Plain dicts override defaults (omitted keys stay `True`).

| Fix ID | Summary |
| --- | --- |
| `forcedRoot` | Inject anonymous object root when opening is not `>`/`-` |
| `rewriteBareNameArray` | `name-` → `>name-` |
| `rewriteEnterLine` | Rewrite `>` whitespace / glued `>key:value` |
| `ignoreBareLeaveAtRoot` | Ignore bare `<` at Root |
| `popAndRetry` | Pop Cursor and retry the failing line |
| `locatePathTrim` | Retry `=` after trimming path whitespace |
| `locatePathStripSpaces` | Retry `=` after stripping all whitespace |
| `locatePathArraySuffix` | Treat trailing `-` on `=` segment as array key when value is array |

Exports: `CompatPolicy`, `COMPAT_FIX_IDS`, `COMPAT_FIX_DEFAULTS`, `resolve_compat_options`.

```python
from xaiop import parse_sync, CompatPolicy

parse_sync(text, CompatPolicy({"forcedRoot": False}))
engine.set_compatibility_mode(True)
engine.set_compat_forced_root(False)  # returns False if mode is off
```

Recovery does **not** invent field names; still raises `XaiopSyntaxError` when recovery fails or the error changes. Deep notes: [../nodejs/notes/adjustment-policy.md](../nodejs/notes/adjustment-policy.md).

---

## 10. Types and constants

| Export | Value / notes |
| --- | --- |
| `PROTOCOL_VERSION` | `"0.6.0"` |
| `SDK_VERSION` | `"0.15.0a1"` |
| `__version__` | `"0.15.0a1"` |
| `DOT_POLICY` | `NONE` · `PER_TOP_LEVEL_KEY` · `PER_N_KEYS` · `CUSTOM` |
| `MERGE_CONFLICT` | `OVERWRITE` · `KEEP` |
| `STREAM_MODES` | `CALLBACK` · `PROMISE` · `ASYNC_ITERATOR` · `EVENTS` |
| `STREAM_STATUS` | `IDLE` … `ERROR` |
| `STREAM_IDLE_LIKE` | Idle-like status tuple |
| `TRANSPORT_KIND` | `HTTP` · `SSE` · `RAW` (WS via `XaiopWs`, not Stream transport) |
| `HISTORY_NODE_KIND` | `DOT` · `TAIL` |
| `LINE_KIND` / `classify_line` / `run_line_intercept_chain` | Line-intercept classify + chain helpers (§6.4) |
| `AnnotationSpan` / `AnnotationSpanView` | Span keep sentinel + view (§6.5) |
| `apply_annotation_spans` / `encode_as_sibling_lines` / `path_escapes_type_check` | Annotation Span helpers |
| `CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY` | SDK Control Root constants (§7.6) |
| `encode_seq_frame` / `stamp_wire_with_log_seq` | Session-log seq stamp (`#!xaiop/seq/v1`) |
| `ControlDemux` / `ControlIngest` / `ControlPlaneHost` / `ControlSessionState` | Control demux / session helpers |
| `ResumeWireLog` / `XaiopResumeLogError` | Durable outbound phase log for resume |
| `encode_control_frame` / `encode_session_frame` / `encode_ack_frame` / `encode_resume_frame` / `encode_snapshot_frame` | Control frame codecs |
| `is_sdk_control_line` / `parse_control_header` / `dispatch_control_frame` | Control classify / route |
| `XaiopControlError` | Soft control-plane errors |
| `COMPAT_FIX_IDS` / `COMPAT_FIX_DEFAULTS` | Eight-fix list and defaults |
| `TYPE` / `object_type` / `array_type` | Type-check constants and builders (§5.5) |
| `TypeRegistry` / `TypeChecker` / `TypeFreezeSession` | Registry / server check / client freeze |
| `TYPE_SCHEMA_FRAME_PREFIX` / `encode_type_schema_frame` / `try_parse_type_schema_frame` | Type-consistency control frames |
| `canonicalize_type` / `parse_type_surface` / `classify_value` / `value_matches_type` | Normalize and match helpers |
| `RangeError` | History index / jump errors (`ValueError` subclass) |
| `LABEL_ESCAPE_INTRODUCER` / `encode_wire_label` / `decode_wire_label` | Symbol-keys dialect |
| `chunks_of` / `open_transport` | RAW helper / transport opener |
| `schedule_immediate` | Thread schedule used by `push_async` |
| `XaiopWs` / `XaiopWsConnection` / `XaiopWsHub` | WebSocket API (`xaiop.ws`; needs `[ws]`) |

Package map (modules): see [ALIGNMENT.md](ALIGNMENT.md) §4.

---

## 11. Error handling

| Error | When |
| --- | --- |
| `XaiopSyntaxError` | Illegal wire; optional `.line`. Strict: fail immediately. Compat: still raises when recovery fails or the error changes |
| `XaiopEncodeError` | Illegal encode input / options / rejected keys; optional `.path` (e.g. `$.meta.name`) |
| `XaiopTypeError` | Type registry / freeze / schema check failure; optional `.path` / `.expected` / `.actual` / `.polarity` |
| `XaiopControlError` | Unknown / malformed control frame (soft by default; see §7.6) |
| `XaiopResumeLogError` | Resume outbound log errors |
| `RangeError` | History index out of range; backward / illegal `jump_to` |
| `ValueError` | Unknown `data_id`; related store errors |
| `RuntimeError` | Stream busy; compact/history gates; etc. |
| `TypeError` | Bad argument types (non-string source, illegal `conflict`, `push_type_consistency` prerequisites, etc.) |
| `ImportError` | Missing optional `websockets` for `XaiopWs.connect` / `listen` |

```python
from xaiop import parse_sync, encode_sync, XaiopSyntaxError, XaiopEncodeError

try:
    parse_sync(">\n&\n")  # bare & → XaiopSyntaxError
except XaiopSyntaxError as e:
    print(e.line, e)

try:
    encode_sync({"a&b": 1})
except XaiopEncodeError as e:
    print(e.path, e)
```

---

## Related

| Doc | Purpose |
| --- | --- |
| [README.md](README.md) | Package landing |
| [ALIGNMENT.md](ALIGNMENT.md) | Python ↔ Node parity matrix (**authoritative for version claims**) |
| [../behavioral-contract.md](../behavioral-contract.md) | Node product-choice catalog (optional) |
| [../nodejs/API.md](../nodejs/API.md) | Node.js API reference |
| [../java/API.md](../java/API.md) | Java API reference |
| [../../protocol/syntax.md](../../protocol/syntax.md) | Protocol grammar |
| [../../meta/releases.md](../../meta/releases.md) | Seal / releases |
| [../nodejs/notes/](../nodejs/notes/) | Streaming parse, history, encode pitfalls, WS, type check, line intercept, Annotation Span, **Control Root**, adjustment policy |
