/**
 * Smoke-check the unified docs surface on http://localhost:5173
 * Run: node docs/archive/audit-docs-server.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, "..");
const BASE = process.env.DOCS_BASE || "http://localhost:5173";

const mustExist = [
  "index.html",
  "theme-boot.js",
  "_sidebar.md",
  "_navbar.md",
  "_404.md",
  "themes/dark.css",
  "themes/vue.css",
  "vendor/lib/docsify.min.js",
  "vendor/plugins/search.min.js",
  "vendor/plugins/docsify-pagination.min.js",
  "vendor/prism/prism-bash.min.js",
  "README.md",
  "README.zh-CN.md",
  "sdk/nodejs/API.md",
  "sdk/nodejs/API.zh-CN.md",
  "sdk/nodejs/notes/annotation-span.zh-CN.md",
  "protocol/README.zh-CN.md",
];

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warns = [];

function ok(msg) {
  console.log("  OK  ", msg);
}
function bad(msg) {
  errors.push(msg);
  console.log("  FAIL", msg);
}
function warn(msg) {
  warns.push(msg);
  console.log("  WARN", msg);
}

console.log("\n== Local files ==");
for (const rel of mustExist) {
  const p = path.join(DOCS, rel);
  if (fs.existsSync(p)) ok(rel);
  else bad(`missing file: ${rel}`);
}

const indexHtml = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
if (/cdn\.jsdelivr\.net|fonts\.googleapis\.com|unpkg\.com/.test(indexHtml)) {
  bad("index.html still references external CDN/fonts");
} else ok("index.html has no CDN/fonts URLs");

if (!indexHtml.includes('nameLink: mount + "#/README"')) {
  warn("nameLink may not point at #/README");
} else ok("nameLink → #/README");

if (!indexHtml.includes('alias: {\n            "/.*/_sidebar.md": "_sidebar.md"')) {
  // loose check
  if (!indexHtml.includes('"/.*/_sidebar.md": "_sidebar.md"')) {
    bad("sidebar alias should be relative _sidebar.md (avoid /docs/docs/)");
  } else ok("sidebar alias is relative");
} else ok("sidebar alias is relative");

for (const theme of ["themes/dark.css", "themes/vue.css"]) {
  const css = fs.readFileSync(path.join(DOCS, theme), "utf8");
  if (css.includes("fonts.googleapis")) bad(`${theme} still imports Google Fonts`);
  else ok(`${theme} has no Google Fonts`);
}

const sidebar = fs.readFileSync(path.join(DOCS, "_sidebar.md"), "utf8");
const navbar = fs.readFileSync(path.join(DOCS, "_navbar.md"), "utf8");
if (sidebar.includes("(#/)") || navbar.includes("(#/)")) {
  bad("sidebar/navbar still contain (#/) hub links");
} else ok("no (#/) hub links");

const hrefRe = /\]\((\/[^)#]+\.md)\)/g;
/** @type {string[]} */
const sidebarHrefs = [];
let m;
while ((m = hrefRe.exec(sidebar))) sidebarHrefs.push(m[1]);
while ((m = hrefRe.exec(navbar))) sidebarHrefs.push(m[1]);

console.log(`\n== Disk check ${sidebarHrefs.length} absolute .md links =="`);
for (const href of [...new Set(sidebarHrefs)]) {
  const rel = href.replace(/^\//, "");
  if (!fs.existsSync(path.join(DOCS, rel))) bad(`sidebar/nav missing on disk: ${href}`);
}

console.log(`\n== HTTP ${BASE} ==`);

async function probe(urlPath, opts = {}) {
  const url = BASE + urlPath;
  try {
    const res = await fetch(url, { redirect: "manual" });
    const text = await res.text();
    if (opts.expectStatus && res.status !== opts.expectStatus) {
      bad(`${urlPath} → ${res.status} (want ${opts.expectStatus})`);
      return null;
    }
    if (!opts.expectStatus && res.status >= 400) {
      bad(`${urlPath} → ${res.status}`);
      return null;
    }
    if (opts.includes && !text.includes(opts.includes)) {
      bad(`${urlPath} missing content «${opts.includes}»`);
      return null;
    }
    if (opts.excludes && opts.excludes.some((s) => text.includes(s))) {
      bad(`${urlPath} contains forbidden «${opts.excludes.find((s) => text.includes(s))}»`);
      return null;
    }
    ok(`${urlPath} → ${res.status}${opts.includes ? ` («${opts.includes}»)` : ""}`);
    return { res, text };
  } catch (e) {
    bad(`${urlPath} network: ${e.message}`);
    return null;
  }
}

const httpPaths = [
  ["/docs/", { includes: "vendor/lib/docsify.min.js" }],
  ["/docs/index.html", { includes: "theme-boot.js" }],
  ["/docs/theme-boot.js", {}],
  ["/docs/themes/dark.css", { excludes: ["fonts.googleapis"] }],
  ["/docs/vendor/lib/docsify.min.js", {}],
  ["/docs/vendor/plugins/docsify-pagination.min.js", {}],
  ["/docs/_sidebar.md", { includes: "Hub" }],
  ["/docs/_navbar.md", {}],
  ["/docs/_404.md", {}],
  ["/docs/README.md", { includes: "XAIOP" }],
  ["/docs/README.zh-CN.md", { includes: "文档" }],
  ["/docs/sdk/nodejs/API.md", { includes: "Annotation Span" }],
  ["/docs/sdk/nodejs/API.zh-CN.md", { includes: "Annotation Span" }],
  ["/docs/sdk/nodejs/API.zh-CN", { includes: "Annotation Span" }],
  ["/docs/sdk/nodejs/notes/annotation-span.zh-CN.md", { includes: "Annotation Span" }],
  ["/docs/annotation-span.zh-CN.md", { includes: "Annotation Span" }], // basename fallback
  ["/docs/docs/_sidebar.md", { includes: "Hub" }], // double-prefix normalize
  ["/docs/protocol/README.zh-CN.md", {}],
  ["/resources/xaiop-mark.svg", {}],
  ["/sdk/nodejs/API.zh-CN.md", { includes: "Annotation Span" }], // root absolute fetch
  ["/docs/no-such-page-ever.md", { expectStatus: 404 }],
];

for (const [p, opts] of httpPaths) {
  await probe(p, opts);
}

console.log(`\n== Sidebar HTTP (${sidebarHrefs.length} links) ==`);
let sideFail = 0;
for (const href of [...new Set(sidebarHrefs)]) {
  const r = await probe(`/docs${href}`, {});
  if (!r) sideFail++;
  // also root-absolute form Docsify may request
  const r2 = await probe(href, {});
  if (!r2) sideFail++;
}

console.log("\n== Summary ==");
console.log(`errors=${errors.length} warns=${warns.length} sidebarHttpFails≈${sideFail}`);
if (errors.length) {
  console.log("FAILURES:");
  for (const e of errors) console.log(" -", e);
  process.exit(1);
}
console.log("All critical checks passed.");
