import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

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
  plugins: [vue(), liveStreamMiddleware()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "xaiop/parse": path.resolve(root, "../xaiop-sdk/nodejs/src/parse.js"),
      "xaiop/materialize": path.resolve(
        root,
        "../xaiop-sdk/nodejs/src/stream/materialize.js",
      ),
      "xaiop/checkpoint": path.resolve(
        root,
        "../xaiop-sdk/nodejs/src/stream/checkpoint.js",
      ),
      "xaiop/clone": path.resolve(root, "../xaiop-sdk/nodejs/src/clone.js"),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(root, "..")],
    },
  },
});
