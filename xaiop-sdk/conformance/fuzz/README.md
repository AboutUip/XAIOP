# XAIOP fuzz harness

Mutation fuzz for `parseSync` / `DotCheckpointEngine` (Node) and Java equivalents.
Budgeted iterations; syntax errors are expected; process crash / unexpected Error fails.

## Run

```bash
# from xaiop-sdk/conformance
node fuzz/fuzz-node.mjs --max=200
node fuzz/fuzz-java/run-fuzz.mjs --max=200

# shorter CI budget
node fuzz/fuzz-node.mjs --max=100
node fuzz/fuzz-java/run-fuzz.mjs --max=100
```

Optional `--seed=N` for reproducibility.

## Mutations

- Flip a random character
- Insert a random line (`>`, `a:1`, `.`, `&x`, `#note`, `@a`, `!a`, …)
- Truncate the buffer
- Duplicate a random line

Seeds live in `seeds/`.
