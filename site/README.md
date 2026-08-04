# XAIOP docs preview (optional Docsify CLI)

**Preferred:** run the lab — Docsify is served from the **same** Vite origin:

```bash
cd ../views
npm run dev
```

→ **http://127.0.0.1:5173/docs/**

Theme toggle shares Lab’s `localStorage` key (`xaiop-docs-theme`).

## Standalone (optional)

If you still want a docs-only process:

```bash
cd site
npm install
npm run sidebar   # optional: regenerate docs/_sidebar.md
npm run dev
```

→ **http://127.0.0.1:5174/**

## Files

| Path | Role |
| --- | --- |
| [`docs/index.html`](../docs/index.html) | Docsify shell (dark by default) |
| [`docs/_sidebar.md`](../docs/_sidebar.md) | Left nav (`npm run sidebar`) |
| [`docs/_navbar.md`](../docs/_navbar.md) | Top nav |
| [`docs/**/*.md`](../docs/) | Source of truth |
