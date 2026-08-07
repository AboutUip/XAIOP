# -*- coding: utf-8 -*-
from pathlib import Path
import re

ROOT = Path(r"D:\Project\Algorithm\XAIOP")
p = ROOT / "docs/meta/releases.md"
t = p.read_text(encoding="utf-8")
t2 = re.sub(
    r"\| Python \*\*0\.15\.0a1\*\* \| `0\.6\.0` \|[^\n]+\n",
    "| Python **0.15.0a1** | `0.6.0` | Official product port (alpha); [../sdk/python/ALIGNMENT.md](../sdk/python/ALIGNMENT.md) |\n",
    t,
    count=1,
)
p.write_text(t2, encoding="utf-8", newline="\n")

text = """# XAIOP Python SDK

Official product SDK alpha (`xaiop` **0.15.0a1**, protocol **0.6.0**).

Guide: [../../docs/sdk/python/README.md](../../docs/sdk/python/README.md)
Parity: [../../docs/sdk/python/ALIGNMENT.md](../../docs/sdk/python/ALIGNMENT.md)

## Setup

```bash
python -m pip install -e ".[dev,http,ws]"
pytest
```

## Golden

```bash
cd ../conformance && npm run golden:python
```
"""
(ROOT / "xaiop-sdk/python/README.md").write_text(text, encoding="utf-8", newline="\n")
print("ok")
