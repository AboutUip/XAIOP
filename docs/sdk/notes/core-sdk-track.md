# Core protocol SDK track (Go) · Python promoted

[English](core-sdk-track.md) · Simplified Chinese: [core-sdk-track.zh-CN.md](core-sdk-track.zh-CN.md)

| Field | Value |
| --- | --- |
| Document | Thin / core-wire policy |
| Wire target | Frozen protocol **0.6.0** |
| Status | **Go remains on core-wire track**; **Python is an official product SDK** (see [../python/ALIGNMENT.md](../python/ALIGNMENT.md)) |

## Purpose

**Python** has been promoted to the official product port (SDK **0.15.1**, protocol **0.6.0**).  
**Go** remains on the core-protocol track (STRICT wire only).

Shared core-wire fixtures still gate Python ↔ Go wire dumps in CI.

## Go (core track)

| Item | Value |
| --- | --- |
| Code | [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/) |
| SDK | `0.6.0-alpha.1` |
| In scope | STRICT parse / encode / Live / materialize |
| Out of scope | Stream · WS · Control Root · typeCheck · Diff checkpoint product surface |

## Python (official)

See [../python/](../python/) and [../python/ALIGNMENT.md](../python/ALIGNMENT.md).
