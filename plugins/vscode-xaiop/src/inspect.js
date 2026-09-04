"use strict";

const { KIND, classifyLine } = require("./classify");
const { frameChain } = require("./nav");

/**
 * Best-effort JSON path at a wire line (structure frames + Content key).
 * Anonymous roots add no segment; array object/array elements use sibling index.
 *
 * @param {string[]} lines
 * @param {import("./structure").Frame[]} frames
 * @param {number} line
 * @returns {Array<string|number>}
 */
function jsonPathAtLine(lines, frames, line) {
  const chain = frameChain(frames, Math.max(0, line));
  /** @type {Array<string|number>} */
  const path = [];
  for (let i = 0; i < chain.length; i++) {
    const f = chain[i];
    const parent = i > 0 ? chain[i - 1] : null;
    if (f.name === "{}" || f.name === "[]") {
      if (parent && parent.kind === "array") {
        const idx = parent.children.indexOf(f);
        if (idx >= 0) path.push(idx);
      }
      continue;
    }
    const key = f.name.endsWith("-") ? f.name.slice(0, -1) : f.name;
    path.push(key);
  }
  const view = classifyLine(lines[line] ?? "");
  if (view.kind === KIND.CONTENT && view.key) {
    path.push(view.key);
  }
  return path;
}

function formatJsonPath(path) {
  const parts = Array.isArray(path) ? path : [];
  if (!parts.length) return "$";
  let out = "$";
  for (const p of parts) {
    if (typeof p === "number") {
      out += `[${p}]`;
    } else if (/^[A-Za-z_$][\w$]*$/.test(p)) {
      out += `.${p}`;
    } else {
      out += `[${JSON.stringify(p)}]`;
    }
  }
  return out;
}

function getAtPath(value, path) {
  let cur = value;
  for (const p of path || []) {
    if (cur == null) return undefined;
    if (typeof p === "number") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[p];
      continue;
    }
    if (typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * Byte offsets of `path` inside `JSON.stringify(value, null, 2)` text.
 * @param {string} pretty
 * @param {Array<string|number>} path
 * @returns {{ start: number, end: number }|null}
 */
function locateInPretty(pretty, path) {
  const s = String(pretty ?? "");
  if (!s) return null;
  const rest = Array.isArray(path) ? path : [];
  let i = 0;
  const n = s.length;

  function skipWs() {
    while (
      i < n &&
      (s[i] === " " || s[i] === "\t" || s[i] === "\n" || s[i] === "\r")
    ) {
      i += 1;
    }
  }

  function parseString() {
    if (s[i] !== '"') return null;
    const start = i;
    i += 1;
    while (i < n) {
      if (s[i] === "\\") {
        i += 2;
        continue;
      }
      if (s[i] === '"') {
        i += 1;
        try {
          return JSON.parse(s.slice(start, i));
        } catch {
          return null;
        }
      }
      i += 1;
    }
    return null;
  }

  function skipValue() {
    skipWs();
    const c = s[i];
    if (c === '"') {
      parseString();
      return;
    }
    if (c === "{") {
      skipContainer("{", "}");
      return;
    }
    if (c === "[") {
      skipContainer("[", "]");
      return;
    }
    while (i < n && s[i] !== "," && s[i] !== "}" && s[i] !== "]" && s[i] !== "\n") {
      i += 1;
    }
  }

  function skipContainer(open, close) {
    if (s[i] !== open) return;
    i += 1;
    skipWs();
    while (i < n && s[i] !== close) {
      if (open === "{") {
        parseString();
        skipWs();
        if (s[i] === ":") i += 1;
      }
      skipValue();
      skipWs();
      if (s[i] === ",") {
        i += 1;
        skipWs();
      }
    }
    if (s[i] === close) i += 1;
  }

  function locate(parts) {
    skipWs();
    const start = i;
    if (!parts.length) {
      skipValue();
      return { start, end: i };
    }
    const head = parts[0];
    const tail = parts.slice(1);
    if (s[i] === "{") {
      i += 1;
      skipWs();
      while (i < n && s[i] !== "}") {
        skipWs();
        const key = parseString();
        skipWs();
        if (s[i] === ":") i += 1;
        skipWs();
        if (key === head) return locate(tail);
        skipValue();
        skipWs();
        if (s[i] === ",") {
          i += 1;
          skipWs();
        }
      }
      return null;
    }
    if (s[i] === "[") {
      if (typeof head !== "number") return null;
      i += 1;
      let idx = 0;
      skipWs();
      while (i < n && s[i] !== "]") {
        skipWs();
        if (idx === head) return locate(tail);
        skipValue();
        idx += 1;
        skipWs();
        if (s[i] === ",") {
          i += 1;
          skipWs();
        }
      }
      return null;
    }
    return null;
  }

  return locate(rest);
}

function prettyValue(value) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateText(text, max) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return s.slice(0, max) + "\n…";
}

/**
 * @param {{
 *   value: unknown,
 *   pretty: string,
 *   path: Array<string|number>,
 *   fragment?: boolean,
 *   error?: boolean,
 *   errorText?: string,
 *   stale?: boolean,
 *   zh?: boolean,
 * }} input
 */
function buildInspectView(input) {
  const zh = input.zh === true;
  const path = input.path || [];
  const focus = path.length ? getAtPath(input.value, path) : input.value;
  const focusPretty =
    prettyValue(focus) ??
    (zh ? "（这条路径上没有对应 JSON）" : "(no JSON at this path)");
  const pretty = input.pretty || "";
  const highlight =
    pretty && input.error !== true && path.length
      ? locateInPretty(pretty, path)
      : null;

  let status = "ok";
  let statusText = zh ? "实时物化" : "Live materialize";
  if (input.error) {
    status = "error";
    statusText = input.stale
      ? zh
        ? "解析失败 · 显示上一份合法 JSON"
        : "Parse failed · showing last good JSON"
      : zh
        ? "解析失败"
        : "Parse failed";
  } else if (input.fragment) {
    status = "fragment";
    statusText = zh ? "根片段 · entries" : "Root fragment · entries";
  }

  return {
    type: "inspect",
    status,
    statusText,
    pathLabel: formatJsonPath(path),
    focusPretty,
    pretty: input.error && !input.stale ? "" : pretty,
    highlight,
    errorText: input.errorText || null,
    stale: input.stale === true,
  };
}

module.exports = {
  jsonPathAtLine,
  formatJsonPath,
  getAtPath,
  locateInPretty,
  prettyValue,
  truncateText,
  buildInspectView,
};
