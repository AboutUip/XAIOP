import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(root)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => join(root, f))
  .sort();

const r = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: join(root, ".."),
});
process.exit(r.status ?? 1);
