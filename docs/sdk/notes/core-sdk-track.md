# Core protocol SDK track (Python · Go)

[English](core-sdk-track.md) · Simplified Chinese: [core-sdk-track.zh-CN.md](core-sdk-track.zh-CN.md)

| Field | Value |
| --- | --- |
| Document | Informative policy for thin SDKs |
| Wire target | Frozen protocol **0.6.0** |
| Product reference | Node.js `xaiop` **0.15.1** / Java `io.xaiop:xaiop` **0.15.1** (reference only) |
| Status | **Wire-complete** + CI gate (STRICT parse / encode / Live / materialize) |

## Purpose

Official **full** SDKs (Node · Java) implement the entire product surface.  
**Python** and **Go** implement a **core protocol track**:

1. Declare `PROTOCOL_VERSION = 0.6.0`.
2. Implement STRICT Frozen wire (protocol-authoritative).
3. **Do not** claim Node/`0.15.1` product parity.

Authority: [../../protocol/](../../protocol/). Node `parse.ts` / `encode.ts` may be consulted for ambiguity only.

## In scope (implemented)

- Strict parse / fragment / Content typing  
- Encode defaults (finite numbers; forced-string refuse SPACE-leading strings)  
- `&` delete · `#` annotation ignore · `.` reset · `=` / `@` / `!`  
- Live line parser · `materialize` (Fragment → object)  
- Shared corpus + **Python ↔ Go** NDJSON compare in CI

Shared fixtures: [../../../xaiop-sdk/conformance/core-wire/](../../../xaiop-sdk/conformance/core-wire/)

## Out of scope

- Full `XaiopStream` · WebSocket · Control Root · typeCheck · line intercept · Annotation Span · history / buffer compact · Diff checkpoint  
- Node/Java product golden as a gate for this track  
- Draft 0.7.0 label-escape (U+001F)

## Clarifications

See [core-wire README](../../../xaiop-sdk/conformance/core-wire/README.md) for encode key-order, numeric compare, fragment/materialize, and Live feed rules.

## Layout peers

| Language | Code | Docs | SDK version |
| --- | --- | --- | --- |
| Python | [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/) | [../python/](../python/) | `0.6.0a1` |
| Go | [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/) | [../go/](../go/) | `0.6.0-alpha.1` |

## Versioning

| Constant | Meaning |
| --- | --- |
| `PROTOCOL_VERSION` | Must be **0.6.0** while on this track |
| Package / module version | Python `0.6.0a1` (PEP 440). Go `0.6.0-alpha.1`. |

This track is **protocol-conformant core**, not official Node/Java product equivalence.

## CI

GitHub Actions (`.github/workflows/ci.yml`):

- `python` / `go` — unit tests (including `cases.json` corpus)  
- `core-wire` — dump + compare Python ↔ Go  
- Separate from Node ↔ Java `golden` / `fuzz` jobs  
