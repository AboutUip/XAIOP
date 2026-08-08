# Go core-wire alignment

[English](ALIGNMENT.md) · [简体中文](ALIGNMENT.zh-CN.md)

| Field | Value |
| --- | --- |
| Document | Thin scope map (not product parity) |
| Module | `github.com/AboutUip/XAIOP/xaiop-sdk/go` |
| SDK | **0.6.0-alpha.2** |
| Protocol | **0.6.0** Frozen (`xaiop.ProtocolVersion`) |
| Track | [../notes/core-sdk-track.md](../notes/core-sdk-track.md) |

**This is not** a Node/Java/Python **0.15.1** product ALIGNMENT. Go stays on the **core-protocol track**.

## In scope

| Surface | Notes |
| --- | --- |
| `Parse` | STRICT full-document |
| `LiveParser` | `FeedLine` / `FeedText` / `Value` / `CursorRestoreLines` |
| `Encode` | Object / array / fragment roots; sorted key order for cross dumps |
| `Materialize` / `Fragment` | Deep copy · fragment entries |
| Operators | `>` `<` `-` `=` `@` `!` `&` `#` `.` · content typing · forced-string |

## Out of scope

Stream / Diff checkpoint · WS · Control Root · typeCheck · history · merge · browser · product golden (32 cases).

## How verified

```bash
cd xaiop-sdk/go && go test ./...
cd xaiop-sdk/conformance && npm run core-wire
# mutation fuzz (CI budget)
cd xaiop-sdk/go && go run ./cmd/fuzz-go -max=100 -seed=1
# optional native fuzz
go test ./xaiop/ -run FuzzParse -fuzz=FuzzParse -fuzztime=10s
```

Shared fixtures: [../../../xaiop-sdk/conformance/core-wire/](../../../xaiop-sdk/conformance/core-wire/).  
Peer on the same wire corpus: Python (also product SDK — see [../python/ALIGNMENT.md](../python/ALIGNMENT.md)).
