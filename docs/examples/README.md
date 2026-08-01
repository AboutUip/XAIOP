# Complex fixture

| File | Role |
| --- | --- |
| [complex.xaiop](complex.xaiop) | Input XAIOP (package 0.1.0 Frozen) |
| [complex.expected.json](complex.expected.json) | Expected JSON after deterministic parse |

Covers: anonymous root `>`, named objects, `<` pop, named/anonymous arrays, fillable array object elements, one-line object elements (`a:solo`), nested array element, forced string (`count: 2`, `score: 10`), int/bool/string typing.

Authoritative grammar: [../protocol/syntax.md](../protocol/syntax.md).
