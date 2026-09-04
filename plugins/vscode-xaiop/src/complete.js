"use strict";

/**
 * Line-start completions for native operators.
 * Insert text is the full replacement for columns [0, column).
 *
 * @param {string} line
 * @param {number} column
 * @param {boolean} zh
 * @param {{ paths?: string[], names?: string[] }} [context]
 */
function completionsFor(line, column, zh, context = {}) {
  const prefix = line.slice(0, column);
  const suffix = line.slice(column);
  if (suffix.trim() !== "") return [];
  if (/[ \t]/.test(prefix)) return [];

  const catalog = zh ? CATALOG_ZH : CATALOG_EN;
  const paths = Array.isArray(context.paths) ? context.paths : [];
  const names = Array.isArray(context.names)
    ? context.names
    : uniqueNames(paths);
  /** @type {typeof CATALOG_EN} */
  const out = [];

  if (prefix === "") {
    out.push(...catalog);
  } else {
    for (const item of catalog) {
      if (item.label.startsWith(prefix)) out.push({ ...item });
    }
  }

  if (isBareLabelPrefix(prefix)) {
    out.unshift(
      {
        label: `>${prefix}`,
        insert: `>${prefix}`,
        sort: "00",
        detail: zh ? "具名对象" : "Named object",
      },
      {
        label: `>${prefix}-`,
        insert: `>${prefix}-`,
        sort: "01",
        detail: zh ? "具名数组" : "Named array",
      },
    );
  }

  if (/^>[^<>#@=!?&\-\.\s:]+$/.test(prefix)) {
    out.unshift({
      label: `${prefix}-`,
      insert: `${prefix}-`,
      sort: "00",
      detail: zh ? "改为具名数组" : "Make it a named array",
    });
  }

  const locate = /^(=|@|!|&)(.*)$/.exec(prefix);
  if (locate) {
    const op = locate[1];
    const typed = locate[2];
    const pool = paths.length ? paths : names;
    let n = 0;
    for (const p of pool) {
      if (typed && !p.startsWith(typed)) continue;
      out.push({
        label: `${op}${p}`,
        insert: `${op}${p}`,
        sort: `03${String(n).padStart(3, "0")}`,
        detail: zh ? "本文档中的路径" : "Path in this document",
      });
      n += 1;
      if (n >= 40) break;
    }
  }

  if (/^>[^<>#@=!?&\-\.\s:]*$/.test(prefix)) {
    const typed = prefix.slice(1);
    let n = 0;
    for (const name of names) {
      if (typed && !name.startsWith(typed)) continue;
      if (prefix === `>${name}`) continue;
      out.push({
        label: `>${name}`,
        insert: `>${name}`,
        sort: `02${String(n).padStart(3, "0")}`,
        detail: zh ? "本文档中的 Label" : "Label in this document",
      });
      n += 1;
      if (n >= 30) break;
    }
  }

  return out;
}

function uniqueNames(paths) {
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    for (const part of String(p).split(">")) {
      if (!part || seen.has(part)) continue;
      seen.add(part);
      out.push(part);
    }
  }
  return out;
}

function isBareLabelPrefix(prefix) {
  return prefix.length > 0 && /^[^<>#@=!?&\-\.\s:][^<>#@=!?&\s:]*$/.test(prefix);
}

const CATALOG_EN = [
  { label: ">", insert: ">", sort: "10", detail: "Anonymous object (root / array element / re-enter)" },
  { label: ">name", insert: ">${1:name}", snippet: true, sort: "11", detail: "Named object" },
  { label: ">name-", insert: ">${1:name}-", snippet: true, sort: "12", detail: "Named array (append)" },
  { label: "-", insert: "-", sort: "13", detail: "Anonymous array" },
  { label: "<", insert: "<", sort: "14", detail: "Pop one level" },
  { label: "<name", insert: "<${1:name}", snippet: true, sort: "15", detail: "Pop, then enter name" },
  { label: ".", insert: ".", sort: "16", detail: "Reset Cursor / end phase" },
  { label: "=path", insert: "=${1:path}", snippet: true, sort: "17", detail: "Fuzzy locate" },
  { label: "@path", insert: "@${1:path}", snippet: true, sort: "18", detail: "Exact path (create)" },
  { label: "!path", insert: "!${1:path}", snippet: true, sort: "19", detail: "Broadcast" },
  { label: "?selector", insert: "?${1:selector}", snippet: true, sort: "1a", detail: "Array select" },
  { label: "&path", insert: "&${1:path}", snippet: true, sort: "1b", detail: "Delete key" },
  { label: "#", insert: "# ${1:note}", snippet: true, sort: "1c", detail: "Custom annotation transmission" },
  { label: "key:value", insert: "${1:key}:${2:value}", snippet: true, sort: "1d", detail: "Content property" },
  { label: ":value", insert: ":${1:value}", snippet: true, sort: "1e", detail: "Anonymous / scalar value" },
];

const CATALOG_ZH = [
  { label: ">", insert: ">", sort: "10", detail: "匿名对象（开根 / 数组元素 / 再进入）" },
  { label: ">name", insert: ">${1:name}", snippet: true, sort: "11", detail: "具名对象" },
  { label: ">name-", insert: ">${1:name}-", snippet: true, sort: "12", detail: "具名数组（追加）" },
  { label: "-", insert: "-", sort: "13", detail: "匿名数组" },
  { label: "<", insert: "<", sort: "14", detail: "上浮一层" },
  { label: "<name", insert: "<${1:name}", snippet: true, sort: "15", detail: "上浮再进入" },
  { label: ".", insert: ".", sort: "16", detail: "重置 Cursor / 结束相位" },
  { label: "=path", insert: "=${1:path}", snippet: true, sort: "17", detail: "模糊定位" },
  { label: "@path", insert: "@${1:path}", snippet: true, sort: "18", detail: "精确路径（可创建）" },
  { label: "!path", insert: "!${1:path}", snippet: true, sort: "19", detail: "广播" },
  { label: "?selector", insert: "?${1:selector}", snippet: true, sort: "1a", detail: "数组选元素" },
  { label: "&path", insert: "&${1:path}", snippet: true, sort: "1b", detail: "删除键" },
  { label: "#", insert: "# ${1:note}", snippet: true, sort: "1c", detail: "自定义注解传递" },
  { label: "key:value", insert: "${1:key}:${2:value}", snippet: true, sort: "1d", detail: "Content 属性" },
  { label: ":value", insert: ":${1:value}", snippet: true, sort: "1e", detail: "匿名 / 标量值" },
];

module.exports = { completionsFor };
