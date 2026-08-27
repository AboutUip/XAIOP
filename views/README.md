# XAIOP Lab (views)

Vue 3 + Vite — **one origin** for the interactive lab **and** the Docsify docs browser.

## Run

```bash
cd views
npm install
npm run dev
```

| Surface | URL |
| --- | --- |
| Lab (playground / live) | http://127.0.0.1:5173/ |
| Full docs tree (`docs/`) | http://127.0.0.1:5173/docs/ |

Theme preference is shared (`localStorage` key `xaiop-docs-theme`).

Regenerate the docs sidebar after adding folders/files:

```bash
npm run sidebar
# or: python ../docs/archive/gen-sidebar.py
```

## Lab contents

| Area | Path |
| --- | --- |
| Stream scenarios | `src/data/stream-scenarios.js` |
| Playground sim | `src/lib/stream-sim.js` |
| Live server | `npm run live-server` / `scripts/live-stream-server.mjs` |
| Operator cheat-sheet (lab UI only) | `src/data/xaiop-catalog.js` — versions tip: protocol **0.6.0** · Node/Java/Python **0.16.0**; **not** a substitute for `docs/sdk/*/API.md` |
| SDK API pages | `/sdk/nodejs` · `/sdk/java` · `/sdk/python` render live `docs/sdk/<stack>/API.md` (?raw); Go stays core-wire track |
| SDK wire (browser) | Vite aliases `xaiop/parse|materialize|checkpoint|clone` → `../xaiop-sdk/nodejs/dist/core/*.js` (run `npm run build:ts` in the SDK package after core changes) |
