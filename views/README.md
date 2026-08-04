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

(`site/` still has the optional standalone Docsify CLI; not required for day-to-day use.)

## Lab contents

| Area | Path |
| --- | --- |
| Stream scenarios | `src/data/stream-scenarios.js` |
| Playground sim | `src/lib/stream-sim.js` |
| Live server | `npm run live-server` / `scripts/live-stream-server.mjs` |
| Operator cheat-sheet (lab UI only) | `src/data/xaiop-catalog.js` — **not** a substitute for `docs/sdk/nodejs/API.md` |
| SDK wire (browser) | Vite aliases `xaiop/parse|materialize|checkpoint|clone` → `../xaiop-sdk/nodejs/dist/core/*.js` (run `npm run build:ts` in the SDK package after core changes) |
