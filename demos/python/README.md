# XAIOP Python demo

Offline demo: input XAIOP → parse / encode / LiveParser / materialize → pretty-print JSON.

```bash
# from repo root
python demos/python/demo.py

# from this directory
python demo.py

# file
python demo.py ../../docs/examples/complex.xaiop

# pipe
Get-Content ../../docs/examples/complex.xaiop | python demo.py
```

Interactive mode: paste lines, then type `END` alone to finish.

Uses `xaiop` from `xaiop-sdk/python` (`parse_sync` · `encode_sync` · `LiveParser` · `materialize` · `XaiopEngine`).
Install optional: `python -m pip install -e ../../xaiop-sdk/python` (demo also falls back to `src/` on `sys.path`).
