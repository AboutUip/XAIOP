# XAIOP Lab (views)

Vue 3 + Vite developer documentation preview — layout inspired by
**Microsoft Learn** (sidebar TOC + on-this-page rail + scannable API tables)
and **Apple Developer** (spacious light canvas, product-first hero, floating
translucent nav, restrained accent). Light / dark theme supported.

**Try it → Stream lab** mimics Stream Inspector / Response Player patterns:
scenario environments, chunk delay/size, phase ribbon, live diff + history + final.

## Run

```bash
cd views
npm install
npm run dev
```

Catalog: `src/data/xaiop-catalog.js` (keep aligned with `xaiop-sdk/nodejs/src/index.d.ts` — encode, merge, history, `XaiopWs`, package **0.7.0**)  
Stream scenarios: `src/data/stream-scenarios.js`  
Playground simulator: `src/lib/stream-sim.js` enables `historySnapshot` (per-`.` before/after)  
Practice docs: `docs/practice/skeleton-stream.md` for WS skeleton path.  
History note: `docs/sdk/nodejs/notes/history.md`
