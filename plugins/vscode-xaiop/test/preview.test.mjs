import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { renderInspectorHtml, escapeHtml } = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "preview.js"),
);

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

if (escapeHtml("<&>") !== "&lt;&amp;&gt;") fail("escape");

const html = renderInspectorHtml({
  nonce: "abc123",
  cspSource: "webview:x",
  zh: false,
});

if (!html.includes("nonce-abc123")) fail("csp nonce");
if (!html.includes("script-src 'nonce-abc123'")) fail("script csp");
if (!html.includes("webview:x")) fail("csp source");
if (!html.includes("acquireVsCodeApi")) fail("webview api");
if (!html.includes('id="focus"')) fail("focus pane");
if (!html.includes('id="doc"')) fail("doc pane");
if (!html.includes("--vscode-font-family")) fail("ui font");
if (!html.includes("Cascadia Code")) fail("code font stack");
if (!html.includes("Sarasa Mono SC")) fail("cjk mono fallback");
if (!html.includes("font-variant-ligatures: none")) fail("json ligatures off");

const zh = renderInspectorHtml({
  nonce: "n",
  cspSource: "s",
  zh: true,
});
if (!zh.includes("光标处")) fail("zh chrome");

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("ok  preview html");
