# Release notes — 2026-08-07 · Python SDK 0.15.0a1

[English](release-notes-2026-08-07-python-0.15.0a1.md) · Simplified Chinese: [release-notes-2026-08-07-python-0.15.0a1.zh-CN.md](release-notes-2026-08-07-python-0.15.0a1.zh-CN.md)

| Field | Value |
| --- | --- |
| Python `xaiop` | **0.15.0a1** |
| Protocol | **0.6.0** Frozen |
| Reference | Node.js `xaiop` **0.15.1** |
| Kind | Official port alpha (full product surface) |

## Summary

Promotes Python from the core-wire track to an **official SDK alpha** with the Node 0.15.1 product surface (no browser): compat · merge · engine · types · checkpoint · control · stream · WS.

Parity matrix: [../sdk/python/ALIGNMENT.md](../sdk/python/ALIGNMENT.md)

## Highlights

- STRICT + CompatPolicy ×8 · `symbolKeys` · full encode options (ES float tokens)
- `XaiopEngine` · merge/inject · `DotCheckpointEngine` · history / compact
- typeCheck · line intercept · `AnnotationSpan.KEEP` · Control Root
- `XaiopStream` (http/sse/raw) · `XaiopWs` connect/listen
- Node ↔ Python golden: encode / parse / stream Diff NDJSON (**32** cases)
- Expanded pytest surface (~**296** methods) mapped in ALIGNMENT §5

## Verify

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev,http,ws]"
python -m pytest -q
```

```bash
cd xaiop-sdk/conformance
npm run golden:python
```

## Suggested tag

`sdk-python-v0.15.0a1`
