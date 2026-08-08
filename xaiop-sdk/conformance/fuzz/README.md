# XAIOP fuzz harness

Mutation fuzz for `parseSync` / `DotCheckpointEngine` (Node), Java equivalents, Python
`parse_sync` / `DotCheckpointEngine`, and Go STRICT `Parse` / `LiveParser`. Budgeted
iterations; syntax errors are expected; process crash / unexpected Error fails.

## Run

```bash
# from xaiop-sdk/conformance
node fuzz/fuzz-node.mjs --max=200
node fuzz/fuzz-java/run-fuzz.mjs --max=200
python fuzz/fuzz-python.py --max=200

# Go (from xaiop-sdk/go)
go run ./cmd/fuzz-go -max=200 -seed=1

# shorter CI budget
node fuzz/fuzz-node.mjs --max=100
node fuzz/fuzz-java/run-fuzz.mjs --max=100
python fuzz/fuzz-python.py --max=100 --seed=1
cd ../go && go run ./cmd/fuzz-go -max=100 -seed=1
```

Optional `--seed=N` for reproducibility.

## Mutations

- Flip a random character
- Insert a random line (`>`, `a:1`, `.`, `&x`, `#note`, `@a`, `!a`, …)
- Truncate the buffer
- Duplicate a random line

Seeds live in `seeds/`.

Go also has native `go test -fuzz=FuzzParse` / `FuzzLiveFeed` under `xaiop-sdk/go/xaiop`.
