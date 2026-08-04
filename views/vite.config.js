import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, "..");
const docsRoot = path.resolve(repoRoot, "docs");
const resourcesRoot = path.resolve(repoRoot, "resources");
const sdkCore = path.resolve(root, "../xaiop-sdk/nodejs/dist/core");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xaiop": "text/plain; charset=utf-8",
};

/**
 * Serve repo docs/ + resources/ on the same Vite origin as the Lab.
 * → http://localhost:5173/docs/   (Docsify)
 * → http://localhost:5173/        (Vue lab)
 */
function findUniqueByBasename(diskRoot, basename) {
  if (!basename || basename.includes("..") || basename.includes("/") || basename.includes("\\")) {
    return null;
  }
  /** @type {string[]} */
  const matches = [];
  const skip = new Set(["node_modules", "themes", "vendor", ".vitepress", "metrics"]);
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (skip.has(ent.name)) continue;
        walk(full);
      } else if (ent.name === basename) {
        matches.push(full);
        if (matches.length > 1) return;
      }
    }
  }
  walk(diskRoot);
  return matches.length === 1 ? matches[0] : null;
}

function resolveStaticFile(diskRoot, rel) {
  let normalized = rel.replace(/\\/g, "/");
  // Docsify may double-prefix basePath → /docs/docs/_sidebar.md
  while (normalized.startsWith("/docs/")) {
    normalized = normalized.slice("/docs".length);
  }
  if (!normalized.startsWith("/")) normalized = "/" + normalized;

  const primary = path.resolve(diskRoot, "." + normalized);
  const candidates = [primary];

  // Docsify hash routes strip ".md". Chinese pages become
  // `/docs/sdk/nodejs/API.zh-CN` → must map to `API.zh-CN.md`.
  const lower = normalized.toLowerCase();
  const hasKnownExt =
    lower.endsWith(".md") ||
    lower.endsWith(".html") ||
    lower.endsWith(".js") ||
    lower.endsWith(".css") ||
    lower.endsWith(".json") ||
    lower.endsWith(".svg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".ico") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".xaiop");
  if (!hasKnownExt) {
    candidates.push(primary + ".md");
  }

  for (const filePath of candidates) {
    if (
      filePath !== diskRoot &&
      !filePath.startsWith(diskRoot + path.sep)
    ) {
      continue;
    }
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return filePath;
      }
    } catch {
      /* ignore */
    }
  }

  // Bare filename requests (e.g. /docs/annotation-span.zh-CN.md) from
  // broken relative hashes — resolve uniquely under docs/.
  const only = normalized.replace(/^\//, "");
  if (only && !only.includes("/")) {
    const names = hasKnownExt ? [only] : [only, `${only}.md`];
    for (const name of names) {
      const hit = findUniqueByBasename(diskRoot, name);
      if (hit) return hit;
    }
  }

  return null;
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", "no-store");
  fs.createReadStream(filePath).pipe(res);
}

/**
 * Docsify + basePath=/docs/ + absolute sidebar hrefs (/sdk/...) fetch
 * markdown from the site root (basePath is skipped for absolute paths).
 * Map those onto docs/ without colliding with Vue HTML routes.
 */
function docsRootMdFallback() {
  return function serveDocsMdAtRoot(req, res, next) {
    try {
      const raw = req.url || "";
      const q = raw.indexOf("?");
      const pathname = decodeURIComponent(q >= 0 ? raw.slice(0, q) : raw);
      if (
        !pathname ||
        pathname === "/" ||
        pathname.startsWith("/docs") ||
        pathname.startsWith("/resources") ||
        pathname.startsWith("/src") ||
        pathname.startsWith("/api") ||
        pathname.startsWith("/node_modules") ||
        pathname.startsWith("/@") ||
        pathname.startsWith("/favicon")
      ) {
        return next();
      }

      const looksMd =
        /\.md$/i.test(pathname) ||
        /\.zh-CN$/i.test(pathname) ||
        pathname === "/_sidebar" ||
        pathname === "/_navbar" ||
        pathname === "/_404";
      if (!looksMd) return next();

      const filePath = resolveStaticFile(docsRoot, pathname);
      if (!filePath) return next();
      sendFile(res, filePath);
    } catch (err) {
      next(err);
    }
  };
}

function staticTreeMiddleware(urlPrefix, diskRoot) {
  const prefix = urlPrefix.endsWith("/") ? urlPrefix.slice(0, -1) : urlPrefix;
  return function serveTree(req, res, next) {
    try {
      const raw = req.url || "";
      const q = raw.indexOf("?");
      const pathname = decodeURIComponent(q >= 0 ? raw.slice(0, q) : raw);
      if (pathname !== prefix && !pathname.startsWith(prefix + "/")) {
        return next();
      }

      let rel = pathname.slice(prefix.length);
      // /docs → /docs/ ; /docs/ serves index.html (do not redirect again)
      if (rel === "") {
        res.statusCode = 302;
        res.setHeader("Location", prefix + "/");
        res.end();
        return;
      }
      if (rel === "/") rel = "/index.html";
      else if (rel.endsWith("/")) rel += "index.html";

      const filePath = resolveStaticFile(diskRoot, rel);
      if (!filePath) {
        // Never fall through to the Vue SPA — Docsify would render
        // views/index.html as markdown (raw <script>/<meta> soup).
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(`Not found: ${pathname}`);
        return;
      }

      sendFile(res, filePath);
    } catch (err) {
      next(err);
    }
  };
}

function docsSiteMiddleware() {
  return {
    name: "xaiop-docs-site",
    configureServer(server) {
      // Before Vite SPA fallback so /docs/* is not swallowed by index.html
      server.middlewares.use(staticTreeMiddleware("/docs", docsRoot));
      server.middlewares.use(
        staticTreeMiddleware("/resources", resourcesRoot),
      );
      server.middlewares.use(docsRootMdFallback());
    },
    configurePreviewServer(server) {
      server.middlewares.use(staticTreeMiddleware("/docs", docsRoot));
      server.middlewares.use(
        staticTreeMiddleware("/resources", resourcesRoot),
      );
      server.middlewares.use(docsRootMdFallback());
    },
  };
}

function liveStreamMiddleware() {
  return {
    name: "xaiop-live-stream-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!req.url?.startsWith("/api/live")) return next();
          const { handleLiveApi } = await import(
            "./scripts/live-stream-server.mjs"
          );
          const handled = await handleLiveApi(req, res);
          if (!handled) next();
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), docsSiteMiddleware(), liveStreamMiddleware()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "@docs": path.resolve(root, "../docs"),
      "xaiop/parse": path.join(sdkCore, "parse.js"),
      "xaiop/materialize": path.join(sdkCore, "materialize.js"),
      "xaiop/checkpoint": path.join(sdkCore, "checkpoint.js"),
      "xaiop/clone": path.join(sdkCore, "clone.js"),
    },
  },
  server: {
    host: true,
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
  },
  optimizeDeps: {
    include: [],
    exclude: [],
  },
});
