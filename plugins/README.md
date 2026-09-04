# Plugins

[English](README.md) · [简体中文](README.zh-CN.md)

Optional **editor / host tooling** for the XAIOP wire.

**This tree does not define the protocol.** It is not a sealed package, not a fourth normative docs tree, and not evidence of wire meaning. Isolation: [../docs/SEPARATION.md](../docs/SEPARATION.md) §0–§2.

| Path | Host | Status | Surface (UX only) |
| --- | --- | --- | --- |
| [vscode-xaiop/](vscode-xaiop/) | VS Code · Cursor · VSCodium (VS Code-compatible) | **Active** | Language id · highlight · hover · lint UI · live JSON inspect · encode UX |

## Status

| Item | Value |
| --- | --- |
| Product | Optional editor hosts |
| Protocol target (cited) | **0.7.0** Draft |
| Wire authority | [../docs/protocol/](../docs/protocol/) only — sealed package for a cited version wins |
| SDK coupling | Identification / TextMate / outline: **no** live SDK. Lint + encode: **pinned** bundled Node parse/encode core matching SDK **0.16.0** (not a live npm dependency) |
| Normative docs under `plugins/` | **None** — READMEs / changelogs only |

## Authority order (host work)

1. Cited **sealed** protocol package (when arguing a sealed version).  
2. Tip [../docs/protocol/syntax.md](../docs/protocol/syntax.md) §3 while Draft.  
3. Product SDK `classifyLine` / `parseSync` / `encodeSync` for the cited SDK version (or this tree’s verbatim vendor bundle of that core).  
4. Host UX (highlight, hover copy, Quick Fix, live path) — **last**, and wrong if it disagrees with 1–3.

## Rules (MUST)

1. **MUST NOT** invent wire operators, Label / Content / streaming rules, or later-wins exceptions.  
2. **MUST NOT** change line classification vs syntax §3 / SDK `classifyLine`. Editor-only illegal marks (`>>`, leading whitespace, empty line) are diagnostics of bad wire, not new primitives.  
3. **MUST NOT** treat TextMate scopes, outline/fold, Go to Definition, Rename, status-bar trails, or live-inspect JSON paths as Cursor / tree semantics. Authoritative materialization = full parse only.  
4. **MUST NOT** default lint to SDK compatibility / silent repair. Compat, if exposed, **MUST** be labeled non-strict.  
5. **MUST NOT** cite plugin UI as wire evidence in protocol reviews.  
6. `#` on the wire is **custom annotation transmission**. Comment-scope mapping is UX only.

Grammar (authoritative tables): [../docs/protocol/syntax.md](../docs/protocol/syntax.md) §3.  
Conflict policy: [../docs/SEPARATION.md](../docs/SEPARATION.md) §3.
