# Complex fixture

| File | Role |
| --- | --- |
| [complex.xaiop](complex.xaiop) | Input XAIOP (package 0.2.1 Frozen) |
| [complex.expected.json](complex.expected.json) | Expected JSON after deterministic parse |

Covers: anonymous root `>`, named objects, `<` pop, named/anonymous arrays, fillable array object elements, one-line object elements (`a:solo`), nested array element, forced string (`count: 2`, `score: 10`), int/bool/string typing.

**Encode round-trip:** Node SDK tests assert  
`parseSync(encodeSync(expectedJson, policy)) === expectedJson`  
for `none` / `perTopLevelKey` / `perNKeys` (and the stability suite also does `parse(fixture) → encode → parse`). Guide: [../sdk/nodejs/API.md](../sdk/nodejs/API.md).

Authoritative grammar: [../protocol/syntax.md](../protocol/syntax.md).
