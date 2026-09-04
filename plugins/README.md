# Plugins

[English](README.md) · [简体中文](README.zh-CN.md)

Editor and host tooling for the XAIOP wire. This tree **does not** define the protocol.

| Path | Host | Status | First surface |
| --- | --- | --- | --- |
| [vscode-xaiop/](vscode-xaiop/) | VS Code · Cursor · VSCodium (and other VS Code-compatible editors) | **Active** | Language id `xaiop` · highlighting · hover · linter · live JSON inspect · encode |

## Status

| Item | Value |
| --- | --- |
| Product | Editor plugins (optional hosts) |
| Protocol target | **0.7.0** Draft |
| Authority | Normative wire = [../docs/protocol/](../docs/protocol/) only |
| SDK coupling | Identification / hover: none. Linter + encode: bundled Node parse/encode core **0.16.0** (not a live npm dependency) |

## Rules

1. Plugins **MUST NOT** invent wire operators or change line classification.
2. Highlighting is **best-effort presentation**. Lint diagnostics and JSON→XAIOP encode use a bundled Node parse/encode core; the product SDK remains the API surface.
3. `#` lines are **custom annotation transmission** on the wire. Editor hosts may map them to comment scopes / comment-toggle so themes dim them and `Toggle Line Comment` inserts a `#` line.

Grammar (authoritative tables): [../docs/protocol/syntax.md](../docs/protocol/syntax.md) §3.
