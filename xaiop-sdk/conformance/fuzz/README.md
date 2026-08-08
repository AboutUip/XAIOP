# XAIOP fuzz harness

Mutation fuzz for `parseSync` / `DotCheckpointEngine` (Node), Java equivalents, and Python
`parse_sync` / `DotCheckpointEngine`. Budgeted iterations; syntax errors are expected;
process crash / unexpected Error fails.

## Run

```bash
# from xaiop-sdk/conformance
node fuzz/fuzz-node.mjs --max=200
node fuzz/fuzz-java/run-fuzz.mjs --max=200
python fuzz/fuzz-python.py --max=200

# shorter CI budget
node fuzz/fuzz-node.mjs --max=100
node fuzz/fuzz-java/run-fuzz.mjs --max=100
python fuzz/fuzz-python.py --max=100 --seed=1
```

Optional `--seed=N` for reproducibility.

## Mutations

- Flip a random character
- Insert a random line (`>`, `a:1`, `.`, `&x`, `#note`, `@a`, `!a`, …)
- Truncate the buffer
- Duplicate a random line

Seeds live in `seeds/`.
