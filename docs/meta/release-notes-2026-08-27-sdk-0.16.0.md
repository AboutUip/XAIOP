# Release notes — SDK 0.16.0 (2026-08-27)

[English](release-notes-2026-08-27-sdk-0.16.0.md) · [简体中文](release-notes-2026-08-27-sdk-0.16.0.zh-CN.md)

| Field | Value |
| --- | --- |
| SDK | **0.16.0** (Node · Java · Python · Go) |
| Protocol | **0.7.0** Draft (unsealed; not a protocol bump) |
| Kind | Product cut — additive surface already on the tree |
| Registries | **Not published yet.** Last immutable artifacts remain **0.15.1** (npm / Maven Central / PyPI / Go module tags) |

## Summary

First honest product number for protocol **0.7.0** Draft work that landed under the previous **0.15.1** label. Published **0.15.1** packages stay protocol **0.6.0** and are not rewritten (`META-VER`). This tree is **0.16.0**. Protocol package stays **0.7.0** Draft — not Frozen, not 0.8.

## Changes

- **Array element select:** `?2` / `?id:A2` / `?*` / `?*k:v` from an array Cursor. Zero matches → syntax error. `?*` starts broadcast. Intercept kind `LINE_KIND.SELECT`.
- **Bare `&`:** deletes the current direct array element (`viaIndex`); lands on the parent array. `&path` is unchanged (no index segment).
- **Content escapes (always on):** `\\` `\n` `\r`. Physical `LF`/`CRLF` still ends a line. Breaking vs **0.6.0** payloads that used literal `\n`.
- **Label escape (opt-in):** `symbolKeys` / U+001F dialect; does not change standalone `#…`.
- **History / `jumpTo`:** lockstep tests across cover, intercept, window, stream. Go engine `jumpTo` rebuild re-runs line intercept when interceptors exist (was feed-only).
- **Cover constraint:** cover injects `.` before `&`, which resets Cursor to Root. Cover then `?` then bare `&` **cannot** restore an array-element Cursor. Cover + `&orders` after select still matches `parseSync`.

`@` still does not address array indices (`@arr` / `@array-` stay object-spine / create `{}`). Use `>name-` to open/reenter arrays and `?` to select elements.

## Verify

```bash
cd xaiop-sdk/nodejs && npm test
cd ../python && python -m pytest tests/test_version.py tests/test_array_select.py tests/test_content_escape.py tests/test_array_select_history.py
cd ../java && mvn -q test
cd ../go && go test ./...
```

Do not treat npm / Maven / PyPI / `pkg.go.dev@v0.16.0` as live until this cut is tagged and deployed.
