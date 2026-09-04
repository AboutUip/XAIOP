"use strict";

/**
 * Line classification + token spans for editor hover.
 * Line kinds follow SDK `classifyLine`, plus editor-only invalid forms
 * (`>>` stacking, leading whitespace, empty line) that the highlighter marks.
 */

const KIND = Object.freeze({
  PHASE: "phase",
  ANNOTATION: "annotation",
  POP: "pop",
  POP_ENTER: "pop_enter",
  LOCATE: "locate",
  EXACT: "exact",
  BROADCAST: "broadcast",
  DELETE: "delete",
  SELECT: "select",
  OBJECT_ANON: "object_anon",
  ARRAY_ANON: "array_anon",
  ARRAY_NAMED: "array_named",
  OBJECT_NAMED: "object_named",
  CONTENT: "content",
  UNKNOWN: "unknown",
});

/**
 * @param {string} line
 */
function classifyLine(line) {
  const raw = typeof line === "string" ? line : String(line ?? "");
  if (raw === "") return view(raw, KIND.UNKNOWN, { invalid: "empty" });
  if (raw[0] === " " || raw[0] === "\t") {
    return view(raw, KIND.UNKNOWN, { invalid: "leading-whitespace" });
  }
  if (raw.startsWith(">>")) {
    return view(raw, KIND.UNKNOWN, { invalid: "stacked-enter" });
  }
  if (raw === ".") return view(raw, KIND.PHASE);
  if (raw.startsWith("#")) {
    return view(raw, KIND.ANNOTATION, { annotationText: raw.slice(1) });
  }
  if (raw === "<") return view(raw, KIND.POP);
  if (raw.startsWith("<") && raw.length > 1) {
    return view(raw, KIND.POP_ENTER, { name: raw.slice(1) });
  }
  if (raw.startsWith("=")) {
    return view(raw, KIND.LOCATE, { path: raw.slice(1) });
  }
  if (raw.startsWith("@")) {
    return view(raw, KIND.EXACT, { path: raw.slice(1) });
  }
  if (raw.startsWith("!")) {
    return view(raw, KIND.BROADCAST, { path: raw.slice(1) });
  }
  if (raw.startsWith("&")) {
    return view(raw, KIND.DELETE, { path: raw.slice(1) });
  }
  if (raw.startsWith("?")) {
    return view(raw, KIND.SELECT, { path: raw.slice(1) });
  }
  if (raw === ">") return view(raw, KIND.OBJECT_ANON);
  if (raw === "-") return view(raw, KIND.ARRAY_ANON);
  if (raw.startsWith(">") && raw.endsWith("-") && raw.length > 2) {
    return view(raw, KIND.ARRAY_NAMED, { name: raw.slice(1, -1) });
  }
  if (raw.startsWith(">") && raw.length > 1) {
    return view(raw, KIND.OBJECT_NAMED, { name: raw.slice(1) });
  }
  const colon = raw.indexOf(":");
  if (colon !== -1) {
    return view(raw, KIND.CONTENT, {
      key: raw.slice(0, colon),
      valueText: raw.slice(colon + 1),
    });
  }
  return view(raw, KIND.UNKNOWN, { invalid: "bare-label" });
}

/**
 * @param {string} raw
 * @param {string} kind
 * @param {object} [extra]
 */
function view(raw, kind, extra = {}) {
  return {
    kind,
    raw,
    name: extra.name ?? null,
    path: extra.path ?? null,
    key: extra.key ?? null,
    valueText: extra.valueText ?? null,
    annotationText: extra.annotationText ?? null,
    invalid: extra.invalid ?? null,
  };
}

/**
 * Content typing (PROT-CONTENT): forced-string → unescape → int / float / bool / null / string.
 * @param {string} rawValue text after the first `:`
 */
function typeValue(rawValue) {
  const wire = typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
  if (wire.length === 0) {
    return typed("string", false, "", wire);
  }
  let payload = wire;
  let forced = false;
  if (wire.charCodeAt(0) === 32) {
    let i = 1;
    while (i < wire.length && wire.charCodeAt(i) === 32) i++;
    payload = wire.slice(i);
    forced = true;
  }
  const un = unescapeContent(payload);
  if (!un.ok) {
    return {
      type: "error",
      forced,
      value: undefined,
      wire,
      payload,
      error: un.error,
    };
  }
  payload = un.text;
  if (forced) return typed("string", true, payload, wire);
  if (payload === "true") return typed("bool", false, true, wire);
  if (payload === "false") return typed("bool", false, false, wire);
  if (payload === "null") return typed("null", false, null, wire);
  if (isIntToken(payload)) return typed("int", false, Number(payload), wire);
  if (isFloatToken(payload)) return typed("float", false, Number(payload), wire);
  return typed("string", false, payload, wire);
}

function typed(type, forced, value, wire) {
  return { type, forced, value, wire, payload: undefined, error: undefined };
}

function unescapeContent(payload) {
  if (payload.indexOf("\\") === -1) return { ok: true, text: payload };
  let out = "";
  for (let i = 0; i < payload.length; i++) {
    if (payload[i] !== "\\") {
      out += payload[i];
      continue;
    }
    if (i + 1 >= payload.length) {
      return { ok: false, error: "incomplete Content escape (trailing backslash)" };
    }
    const n = payload[i + 1];
    if (n === "n") {
      out += "\n";
      i++;
    } else if (n === "r") {
      out += "\r";
      i++;
    } else if (n === "\\") {
      out += "\\";
      i++;
    } else {
      return { ok: false, error: `unknown Content escape \\${n}` };
    }
  }
  return { ok: true, text: out };
}

function isIntToken(s) {
  if (!s) return false;
  let i = 0;
  if (s[0] === "-" || s[0] === "+") i++;
  if (i >= s.length) return false;
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function isFloatToken(s) {
  return (
    /^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) ||
    /^[+-]?\d+[eE][+-]?\d+$/.test(s)
  );
}

/**
 * @param {string} raw
 * @returns {Array<{ start: number, end: number, role: string, view: object, data?: object }>}
 */
function tokensForLine(raw) {
  const view = classifyLine(raw);
  switch (view.kind) {
    case KIND.PHASE:
    case KIND.OBJECT_ANON:
    case KIND.ARRAY_ANON:
    case KIND.POP:
      return [tok(0, raw.length, "operator", view)];
    case KIND.POP_ENTER:
      return [tok(0, 1, "operator", view), ...pathTokens(1, view.name, view)];
    case KIND.OBJECT_NAMED:
      return [tok(0, 1, "operator", view), ...pathTokens(1, view.name, view)];
    case KIND.ARRAY_NAMED:
      return [
        tok(0, 1, "operator", view),
        ...pathTokens(1, view.name, view),
        tok(raw.length - 1, raw.length, "array-postfix", view),
      ];
    case KIND.LOCATE:
    case KIND.EXACT:
    case KIND.BROADCAST:
      return [tok(0, 1, "operator", view), ...pathTokens(1, view.path, view)];
    case KIND.DELETE:
      if (raw === "&") return [tok(0, 1, "operator", view)];
      return [tok(0, 1, "operator", view), ...pathTokens(1, view.path, view)];
    case KIND.SELECT:
      return selectTokens(raw, view);
    case KIND.ANNOTATION: {
      const head = raw.startsWith("#!") ? 2 : 1;
      const out = [tok(0, head, "operator", view)];
      if (raw.length > head) {
        out.push(tok(head, raw.length, "annotation-body", view));
      }
      return out;
    }
    case KIND.CONTENT:
      return contentTokens(raw, view);
    default:
      return [tok(0, Math.max(raw.length, 0), "invalid", view)];
  }
}

function selectTokens(raw, view) {
  const out = [tok(0, 1, "operator", view)];
  const rest = raw.slice(1);
  if (!rest) return out;
  if (rest[0] === "*") {
    out.push(tok(1, 2, "select-wildcard", view));
    const pred = rest.slice(1);
    if (pred) out.push(...predicateTokens(2, pred, view));
    return out;
  }
  if (/^\d+$/.test(rest)) {
    const illegal = rest.length > 1 && rest[0] === "0";
    out.push(
      tok(1, raw.length, "select-index", view, { text: rest, illegal }),
    );
    return out;
  }
  out.push(...predicateTokens(1, rest, view));
  return out;
}

function predicateTokens(start, pred, view) {
  const colon = pred.indexOf(":");
  if (colon === -1) {
    return [tok(start, start + pred.length, "path-segment", view, { text: pred })];
  }
  const out = [];
  const key = pred.slice(0, colon);
  const val = pred.slice(colon + 1);
  if (key) {
    out.push(tok(start, start + colon, "content-key", view, { text: key }));
  }
  out.push(tok(start + colon, start + colon + 1, "content-colon", view));
  out.push(...valueTokens(start + colon + 1, val, view));
  return out;
}

function contentTokens(raw, view) {
  const colon = raw.indexOf(":");
  const out = [];
  if (colon > 0) {
    out.push(tok(0, colon, "content-key", view, { text: view.key }));
  }
  out.push(tok(colon, colon + 1, "content-colon", view));
  out.push(...valueTokens(colon + 1, view.valueText ?? "", view));
  return out;
}

function valueTokens(start, rawValue, view) {
  const typed = typeValue(rawValue);
  if (!rawValue) {
    return [
      tok(start, start, "content-value", view, { typed, empty: true }),
    ];
  }
  if (typed.forced) {
    let n = 0;
    while (n < rawValue.length && rawValue.charCodeAt(n) === 32) n++;
    const out = [tok(start, start + n, "forced-string-mark", view, { typed })];
    if (n < rawValue.length) {
      out.push(
        tok(start + n, start + rawValue.length, "content-value", view, { typed }),
      );
    } else {
      out.push(
        tok(start + n, start + n, "content-value", view, { typed, empty: true }),
      );
    }
    return out;
  }
  return [
    tok(start, start + rawValue.length, "content-value", view, { typed }),
  ];
}

function pathTokens(start, path, view) {
  const out = [];
  if (!path) return out;
  let offset = start;
  let i = 0;
  while (i < path.length) {
    const ch = path[i];
    if (ch === ">") {
      out.push(tok(offset, offset + 1, "path-separator", view));
      offset += 1;
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\t") {
      let j = i + 1;
      while (j < path.length && (path[j] === " " || path[j] === "\t")) j++;
      out.push(
        tok(offset, offset + (j - i), "label-gap", view, {
          text: path.slice(i, j),
        }),
      );
      offset += j - i;
      i = j;
      continue;
    }
    let j = i + 1;
    while (
      j < path.length &&
      path[j] !== ">" &&
      path[j] !== " " &&
      path[j] !== "\t"
    ) {
      j++;
    }
    const text = path.slice(i, j);
    out.push(
      tok(offset, offset + text.length, "path-segment", view, { text }),
    );
    offset += text.length;
    i = j;
  }
  return out;
}

function tok(start, end, role, view, data) {
  return { start, end, role, view, data: data ?? null };
}

/**
 * @param {string} line
 * @param {number} column
 */
function tokenAt(line, column) {
  const tokens = tokensForLine(line);
  for (const t of tokens) {
    if (t.end > t.start && column >= t.start && column < t.end) return t;
  }
  if (tokens.length && column === line.length) {
    const last = tokens[tokens.length - 1];
    if (last.end === column || last.end === last.start) return last;
  }
  for (const t of tokens) {
    if (t.start === t.end && column === t.start) return t;
  }
  return tokens[0] ?? null;
}

module.exports = {
  KIND,
  classifyLine,
  typeValue,
  tokensForLine,
  tokenAt,
};
