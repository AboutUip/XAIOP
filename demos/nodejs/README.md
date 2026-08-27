# XAIOP Node.js demo

Interactive (or piped) demo: input XAIOP → parse → pretty-print JSON.

Source is TypeScript; this demo loads the compiled `dist/` entry (same as the unit tests). `dist/` is not in git. Build the SDK once per clone before running:

```bash
cd xaiop-sdk/nodejs
npm install
npm run build:ts
```

Then:

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

Uses `XaiopEngine` from `xaiop-sdk/nodejs/dist` (`upload` → `get`). Published consumers: `npm install @bylan280/xaiop`.
