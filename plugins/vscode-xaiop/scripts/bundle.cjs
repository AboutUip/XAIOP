"use strict";

const { spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const root = join(dirname(__filename), "..");
const entry = join(root, "scripts", "vendor-entry.js");
const out = join(root, "vendor", "xaiop-core.cjs");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(
  npx,
  [
    "--yes",
    "esbuild",
    entry,
    "--bundle",
    "--format=cjs",
    "--platform=node",
    "--target=node18",
    `--outfile=${out}`,
    "--legal-comments=none",
  ],
  { stdio: "inherit", shell: process.platform === "win32" },
);

if (r.status !== 0) process.exit(r.status ?? 1);

const banner = `/* generated — XAIOP Node parse + encode core (protocol 0.7.0 Draft / SDK 0.16.0)
 * source: scripts/vendor-entry.js → xaiop-sdk/nodejs/src/core/{parse,encode}.ts
 * regenerate: node scripts/bundle.cjs
 */
`;
writeFileSync(out, banner + readFileSync(out, "utf8"));
console.log("wrote", out);
