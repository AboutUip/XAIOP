# XAIOP Node.js demo

Interactive (or piped) demo: input XAIOP → parse → pretty-print JSON.

```bash
# from repo root
node demos/nodejs/demo.js

# from this directory
node demo.js

# file
node demo.js ../../docs/examples/complex.xaiop

# pipe
Get-Content ../../docs/examples/complex.xaiop | node demo.js
```

Interactive mode: paste lines, then type `END` alone to finish.

Uses `XaiopEngine` from `xaiop-sdk/nodejs` (`upload` → `get`).
