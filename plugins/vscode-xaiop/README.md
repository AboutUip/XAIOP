# XAIOP for VS Code / Cursor

[English](README.md) · [简体中文](README.zh-CN.md)

Language identification, highlighting, hover docs, a wire linter, outline/folding, live JSON inspect, and JSON→XAIOP encode for XAIOP (protocol **0.7.0** Draft).

Hover is line-local. The linter runs the bundled Node parse core (SDK **0.16.0**): syntax errors plus JSON materialization. Outline/folding follow enter/leave lines, not a second parser. The wire definition stays [docs/protocol](../../docs/protocol/).

## What it does

| Surface | Behavior |
| --- | --- |
| File id | `*.xaiop` → language `xaiop` · MIME `text/x-xaiop` |
| Highlighting | Line-oriented TextMate grammar aligned with `classifyLine` |
| Hover | Native operators → usage; Content values → typed result; materialized JSON at the cursor |
| Linter | Strict parse on edit; Problems for syntax errors; warning if the stream is a **root fragment** (not a standalone JSON document); `JSON.stringify` of the materialized value |
| Quick Fix | Common illegal forms (`>name -`, `>>x`, bare Label, empty line, leading space) |
| Outline / fold | Named `>` / `>name-` blocks; jump to matching `<` |
| Complete | Line-start operators, snippets (`root`, `obj`, `arr`, `elem`, `phase`) |
| Preview | **Live JSON inspect** beside the editor (auto-open; follows cursor; last-good JSON on parse error) · untitled JSON · copy |
| Encode | **Paste JSON as XAIOP** · **Encode JSON as XAIOP** (from a `.json` editor) · wrap root fragment with `>` |
| Navigation | Go to Definition / Rename on Labels; status bar shows `{} > meta > author` |
| Inlay | Content types (int / float / bool / null / forced-string) |
| Status bar | Valid JSON / root fragment / first error line (click to preview) |
| Markdown | Fenced `xaiop` code blocks |
| Editor defaults | Do not trim trailing spaces (forced-string marker) · LF · no auto-indent |

`#` is **custom annotation transmission** on the wire. The editor maps it to a comment scope so themes dim it, and **Toggle Line Comment** inserts a `#` line.

## Install (this repository)

1. Open the folder `plugins/vscode-xaiop`.
2. Press **F5** (Extension Host) — opens `examples/highlight.xaiop`.
3. Or from the XAIOP repo root:

```text
cursor --extensionDevelopmentPath=plugins/vscode-xaiop docs/examples/complex.xaiop
```

(`code` works the same for VS Code.)

Pack a VSIX when you want to install without the debugger:

```text
cd plugins/vscode-xaiop
npx --yes @vscode/vsce package
```

Then **Extensions: Install from VSIX…**

## Grammar

[syntaxes/xaiop.tmLanguage.json](syntaxes/xaiop.tmLanguage.json) is the TextMate source for this host. Line order matches [syntax.md](../../docs/protocol/syntax.md) §3 / SDK `classifyLine`.

```text
cd plugins/vscode-xaiop
npm test
```

## Not included yet

A language server, or SDK compatibility repairs (those are off unless `xaiop.lint.compat` is enabled). Encode uses the bundled Node core, not a live npm dependency.
