# Optional PowerShell wrapper (prefer run-dump.mjs).
$Root = Split-Path -Parent $PSScriptRoot
node "$Root\java\run-dump.mjs"
