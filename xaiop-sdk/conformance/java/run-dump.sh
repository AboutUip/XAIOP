#!/usr/bin/env bash
# Optional shell wrapper (prefer run-dump.mjs for Windows+Linux).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/java/run-dump.mjs"
