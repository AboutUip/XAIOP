# Changelog

## 0.6.2

- Docs only: harden host isolation (META-SEP §0 authority cascade; plugins are non-normative). No wire change.

## 0.6.1

- Live inspect type: UI chrome uses the workbench font; JSON uses the editor mono stack with CJK fallbacks (avoid SimSun next to Consolas). Ligatures off in JSON.

## 0.6.0

- Live JSON inspect beside the editor: auto-open, updates as you type, follows the cursor, highlights the JSON node at that path. Hover also shows the materialized value. Parse errors keep the last good JSON.

## 0.5.0

- JSON → XAIOP: **Paste JSON as XAIOP**, **Encode JSON as XAIOP**, **Copy as XAIOP** (bundled `encodeSync`; default one relative tree).
- Wrap a root fragment with `>` (Quick Fix, CodeLens, command) so it becomes a JSON document.
- Go to Definition / Find All References / Rename for Labels and path segments; status bar shows the structure path.
- Completions pick up paths already in the file (`=meta`, `@users`).
- Content type inlays (int / float / bool / null / forced-string). Expand selection walks token → line → enclosing block.
- **XAIOP: New File**.

## 0.4.0

- Outline + folding from matched `>` / `<` (`.` returns nested frames to the document root; unclosed whole-file roots are not folded).
- Completions and snippets for native line forms; typing a bare name offers `>name` / `>name-`.
- More Quick Fixes: `>>x` → `>x`, bare `data` → `>data`, empty line delete, leading whitespace trim, `>key:value` → Content.
- Status bar (JSON / fragment / error line) and live **Preview Materialized JSON** webview; copy JSON; go to matching enter/leave.

## 0.3.1

- Explain `>name -` (space before array postfix): underline the gap, spell out `>name-`, offer Quick Fix.

## 0.3.0

- Automatic linter: strict SDK parse on edit, syntax errors in Problems, JSON materialization check.
- Warning when the stream is a root fragment (valid wire, not a standalone JSON document).
- Command **XAIOP: Show Materialized JSON**.

## 0.2.0

- Hover on native operators (`>` `<` `-` `.` `=` `@` `!` `?` `&` `#`) with usage from protocol 0.7.0 Draft.
- Hover on Content values (and `?` predicate payloads) with typed result: int / float / bool / null / string / forced-string, plus escape errors.

## 0.1.0

- Identify `*.xaiop` as language `xaiop` (MIME `text/x-xaiop`).
- TextMate highlighting for protocol **0.7.0** Draft line forms.
- Highlight fenced `xaiop` blocks in Markdown.
- Editor defaults that preserve forced-string leading spaces after `:`.
