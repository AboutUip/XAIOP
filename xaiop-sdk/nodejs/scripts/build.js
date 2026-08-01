/**
 * Build / pack the xaiop npm package into ./dist
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(root, "..");
const dist = path.join(pkgRoot, "dist");

fs.mkdirSync(dist, { recursive: true });

// clean previous tarballs
for (const name of fs.readdirSync(dist)) {
  if (name.endsWith(".tgz")) fs.unlinkSync(path.join(dist, name));
}

execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["pack", "--pack-destination", dist],
  {
    cwd: pkgRoot,
    stdio: "inherit",
  },
);

const tgz = fs.readdirSync(dist).filter((f) => f.endsWith(".tgz"));
console.log("");
console.log("Build OK. Artifacts:");
for (const f of tgz) {
  const full = path.join(dist, f);
  const { size } = fs.statSync(full);
  console.log(`  ${full}  (${size} bytes)`);
}
console.log("");
console.log("Install locally:");
console.log(`  npm install ${path.join("dist", tgz[0] ?? "xaiop-0.1.0.tgz")}`);
