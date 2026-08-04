import { marked } from "marked";

/**
 * @param {string} text
 */
export function slugify(text) {
  return String(text)
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-_.]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * @param {string} md
 * @returns {{ href: string, label: string, level: number }[]}
 */
export function extractToc(md) {
  /** @type {{ href: string, label: string, level: number }[]} */
  const out = [];
  const re = /^(#{2,3})\s+(.+)$/gm;
  let m;
  while ((m = re.exec(md))) {
    const level = m[1].length;
    const label = m[2].replace(/#+\s*$/, "").trim();
    if (!label) continue;
    if (/^\[English\]/i.test(label) || /^\[简体中文\]/.test(label)) continue;
    out.push({ href: `#${slugify(label)}`, label, level });
  }
  return out;
}

/**
 * Resolve a relative markdown href for Docsify (same origin /docs/).
 * @param {string} href
 * @param {string} docsRelDir e.g. "sdk/nodejs"
 */
export function toDocsifyUrl(href, docsRelDir = "") {
  if (!href) return href;
  if (
    href.startsWith("#") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:")
  ) {
    return href;
  }
  const base = "/docs/#/";
  let path = href.replace(/\\/g, "/");
  while (path.startsWith("./")) path = path.slice(2);

  const stack = docsRelDir ? docsRelDir.split("/").filter(Boolean) : [];
  const parts = path.split("/");
  for (const p of parts) {
    if (p === "..") stack.pop();
    else if (p && p !== ".") stack.push(p);
  }
  let joined = stack.join("/");
  joined = joined.replace(/\.zh-CN\.md$/i, ".zh-CN").replace(/\.md$/i, "");
  if (joined.endsWith("/README")) joined = joined.slice(0, -"/README".length) + "/";
  return base + joined;
}

/**
 * @param {string} md
 * @param {{ docsRelDir?: string }} [opts]
 */
export function renderMarkdown(md, opts = {}) {
  const docsRelDir = opts.docsRelDir || "";
  const renderer = new marked.Renderer();

  renderer.heading = function heading({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const plain = text.replace(/<[^>]+>/g, "");
    const id = slugify(plain);
    return `<h${depth} id="${id}">${text}</h${depth}>\n`;
  };

  renderer.link = function link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : "";
    const h = toDocsifyUrl(href || "", docsRelDir);
    const ext = /^https?:\/\//.test(h)
      ? ' target="_blank" rel="noopener"'
      : "";
    return `<a href="${escapeAttr(h)}"${titleAttr}${ext}>${text}</a>`;
  };

  renderer.code = function code({ text, lang }) {
    const cls = lang ? ` class="language-${escapeAttr(lang)}"` : "";
    return `<pre><code${cls}>${escapeHtml(text)}</code></pre>\n`;
  };

  return marked.parse(md, {
    async: false,
    gfm: true,
    breaks: false,
    renderer,
  });
}

/** @param {string} s */
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** @param {string} s */
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
