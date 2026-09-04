"use strict";

const {
  parseSync,
  XaiopFragment,
  XaiopSyntaxError,
} = require("../vendor/xaiop-core.cjs");
const { explainError, lineAt } = require("./explain");

/**
 * Strict-wire lint: parse with the Node SDK, then JSON.stringify the document.
 *
 * @param {string} source
 * @param {{
 *   zh?: boolean,
 *   compat?: boolean,
 *   fragmentSeverity?: "error"|"warning"|"information"|"hint"|"off",
 * }} [options]
 * @returns {{
 *   ok: boolean,
 *   fragment: boolean,
 *   json: string|null,
 *   value: unknown,
 *   diagnostics: Array<{
 *     severity: "error"|"warning"|"information"|"hint",
 *     line: number,
 *     code: string,
 *     message: string,
 *   }>,
 * }}
 */
function lintText(source, options = {}) {
  const zh = options.zh === true;
  const compat = options.compat === true;
  const fragmentSeverity = options.fragmentSeverity ?? "warning";
  const diagnostics = [];

  try {
    const parsed = parseSync(source, compat);
    const fragment = parsed instanceof XaiopFragment || parsed?.isFragment === true;
    const value = fragment ? parsed.entries : parsed;
    const json = stringifyJson(value);

    if (json == null) {
      diagnostics.push({
        severity: "error",
        line: 1,
        code: "xaiop.json",
        message: zh
          ? "物化结果无法序列化为 JSON（JSON.stringify 失败）。"
          : "Materialized value cannot be serialized as JSON (JSON.stringify failed).",
      });
      return { ok: false, fragment, json: null, value, diagnostics };
    }

    try {
      JSON.parse(json);
    } catch (err) {
      diagnostics.push({
        severity: "error",
        line: 1,
        code: "xaiop.json",
        message: zh
          ? `物化结果不是合法 JSON：${err.message}`
          : `Materialized value is not valid JSON: ${err.message}`,
      });
      return { ok: false, fragment, json: null, value, diagnostics };
    }

    if (fragment && fragmentSeverity !== "off") {
      const notation =
        typeof parsed.notation === "function" ? parsed.notation() : "";
      diagnostics.push({
        severity: fragmentSeverity,
        line: 1,
        code: "xaiop.fragment",
        message: zh
          ? `根片段，不能单独作为 JSON 文档。记法 ${notation || '"a":{}'} — 需要先写 \`>\` / \`-\` 开匿名根。`
          : `Root fragment; cannot stand alone as a JSON document. Notation ${notation || '"a":{}'} — open an anonymous root with \`>\` / \`-\` first.`,
        edit: {
          insertAtStart: ">\n",
          title: {
            zh: "在开头加上 `>` 开匿名根",
            en: "Prepend `>` to open an anonymous root",
          },
        },
      });
    }

    const ok = diagnostics.every((d) => d.severity !== "error");
    return { ok, fragment, json, value, diagnostics };
  } catch (err) {
    const line = Number.isInteger(err?.line) && err.line > 0 ? err.line : 1;
    const raw = String(err?.message ?? err);
    const message = raw.replace(/^line \d+:\s*/i, "");
    const isSyntax =
      err instanceof XaiopSyntaxError || err?.name === "XaiopSyntaxError";
    const explained = explainError(message, lineAt(source, line), { zh, line });
    if (!isSyntax) explained.code = "xaiop.parse";
    diagnostics.push(explained);
    return { ok: false, fragment: false, json: null, value: undefined, diagnostics };
  }
}

function stringifyJson(value) {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : null;
  } catch {
    return null;
  }
}

function prettyJson(json) {
  if (typeof json !== "string") return "";
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

module.exports = { lintText, prettyJson };
