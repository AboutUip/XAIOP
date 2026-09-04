import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { inspectLine } = require(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "explain.js"),
);

let failed = 0;
function fail(msg) {
  failed += 1;
  console.error(`FAIL  ${msg}`);
}

function first(line) {
  const issues = inspectLine(line);
  if (!issues.length) {
    fail(`no issue for ${JSON.stringify(line)}`);
    return null;
  }
  return issues[0];
}

{
  const i = first("data");
  if (i.kind !== "bare-label") fail("bare kind");
  if (i.edit?.newText !== ">data") fail(`bare fix ${i.edit?.newText}`);
}

{
  const i = first(">>x");
  if (i.kind !== "stacked-enter") fail("stacked kind");
  if (i.start !== 1 || i.end !== 2) fail(`stacked span ${i.start}-${i.end}`);
  if (i.edit?.newText !== ">x") fail(`stacked fix ${i.edit?.newText}`);
}

{
  const i = first(">>>foo");
  if (i.edit?.newText !== ">foo") fail(`>>> fix ${i.edit?.newText}`);
  if (i.end !== 3) fail(`>>> underline extra > ${i.end}`);
}

{
  const i = first("");
  if (i.kind !== "empty-line") fail("empty kind");
  if (!i.edit?.deleteLine) fail("empty should delete line");
}

{
  const i = first("  >a");
  if (i.kind !== "leading-whitespace") fail("ws kind");
  if (i.edit?.newText !== ">a") fail(`ws fix ${i.edit?.newText}`);
}

{
  const i = first(">foo:bar");
  if (i.kind !== "label-colon") fail("colon kind");
  if (i.edit?.newText !== "foo:bar") fail(`colon fix ${i.edit?.newText}`);
}

{
  const i = first(">editor.pasteAs.preferences -");
  if (i.edit?.newText !== ">editor.pasteAs.preferences-") {
    fail(`array gap fix ${i.edit?.newText}`);
  }
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("ok  inspectLine / quick fixes");
