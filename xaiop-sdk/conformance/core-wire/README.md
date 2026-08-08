# Core-wire fixtures (Python ↔ Go)

Shared **Frozen 0.6.0 STRICT** fixtures for the core-protocol track.  
Authority: [docs/protocol/](../../../docs/protocol/).  
**Not** a Node/Java product golden gate.

## Layout

| Path | Role |
| --- | --- |
| `cases.json` | Corpus (parse / parse_error / live / encode / encode_error / roundtrip / parse_file) |
| `complex.xaiop` / `complex.expected.json` | Large fixture (also referenced from `cases.json`) |
| `dump-python.py` | Python NDJSON dump |
| `compare-core.mjs` | Python ↔ Go compare (trees + wire; numeric int/float equivalence) |
| Go dumper | [`../../go/cmd/dump-core-wire`](../../go/cmd/dump-core-wire) |

## Run locally

```bash
cd xaiop-sdk/conformance
npm run core-wire
# or:
python core-wire/dump-python.py --out out/python.ndjson
go run ../go/cmd/dump-core-wire --cases core-wire/cases.json --out out/go.ndjson
node core-wire/compare-core.mjs out/python.ndjson out/go.ndjson
```

Unit tests in each SDK also load `cases.json` directly.

## Clarifications (no ambiguity)

| Topic | Decision |
| --- | --- |
| Product parity | Does **not** claim Node/`0.15.1` or Java product equivalence |
| Encode wire | Py ↔ Go must match under the same options; Node byte-identity is **not** required |
| Encode options | Cross dumps use `key_order: sorted`, `dot_policy: none`, `style: relative` (Go STRICT defaults; product Python default is `perTopLevelKey`) |
| Key order | Cross dumps / corpus encode cases use `key_order: sorted` so Go `map` JSON decode is deterministic |
| Numbers | Compare with numeric equivalence (`1` ≡ `1.0`); Python may keep `int`, Go may keep `int64` / `float64` |
| Empty source | Parses to `{}` |
| Fragment | `parse` returns Fragment; `materialize` yields entries object |
| `#` lines | Standalone `#…` ignored for tree; not a “comment” in protocol terms |
| Live feed | Complete logical lines (same split as sync); trailing segment without LF counts as a line |
| Error messages | Text need not match across languages; both sides must fail/succeed the same cases |
| Out of scope | Diff checkpoint, merge, WS, Control Root, typeCheck, label-escape 0.7.0 |
