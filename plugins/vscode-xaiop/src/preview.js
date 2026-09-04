"use strict";

/**
 * Live JSON inspector shell. Payload is applied via postMessage so edits
 * do not reset scroll or recreate the webview.
 *
 * @param {{ nonce: string, cspSource: string, zh?: boolean }} opts
 */
function renderInspectorHtml(opts) {
  const zh = opts.zh === true;
  const pathPh = zh ? "路径" : "Path";
  const atCursor = zh ? "光标处" : "At cursor";
  const documentLabel = zh ? "整份 JSON" : "Document";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${opts.cspSource} 'nonce-${opts.nonce}'; script-src 'nonce-${opts.nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>XAIOP live</title>
  <style nonce="${opts.nonce}">
    :root { color-scheme: light dark; }
    html, body { height: 100%; }
    body {
      --ui: var(--vscode-font-family, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", sans-serif);
      --code: var(--vscode-editor-font-family), "Cascadia Code", "Cascadia Mono", "JetBrains Mono",
        "Sarasa Term SC", "Sarasa Mono SC", "IBM Plex Mono", Menlo, Consolas,
        "Microsoft YaHei UI", monospace;
      --code-size: var(--vscode-editor-font-size, 13px);
      margin: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: var(--ui);
      font-size: var(--vscode-font-size, 13px);
      line-height: 1.5;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-synthesis: none;
    }
    header {
      flex: 0 0 auto;
      padding: 12px 16px 10px;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(127,127,127,.35));
    }
    .status {
      font-size: 12px;
      font-weight: 500;
      opacity: 0.72;
    }
    .status.error { color: var(--vscode-errorForeground, #f14c4c); opacity: 1; }
    .status.fragment { color: var(--vscode-editorWarning-foreground, #cca700); opacity: 1; }
    .path {
      margin-top: 6px;
      font-family: var(--code);
      font-size: var(--code-size);
      line-height: 1.45;
      font-variant-ligatures: none;
      font-feature-settings: "liga" 0, "calt" 0;
      word-break: break-all;
      opacity: 0.92;
    }
    .error-text {
      display: none;
      margin: 12px 16px 0;
      padding: 8px 12px;
      border-left: 3px solid var(--vscode-errorForeground, #f14c4c);
      white-space: pre-wrap;
      font-size: 13px;
      line-height: 1.5;
    }
    .error-text.show { display: block; }
    .pane {
      padding: 12px 16px 16px;
    }
    .pane h2 {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 500;
      opacity: 0.55;
    }
    #focus-wrap {
      flex: 0 1 auto;
      max-height: 40%;
      overflow: auto;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(127,127,127,.35));
    }
    #doc-wrap {
      flex: 1 1 auto;
      overflow: auto;
      min-height: 0;
    }
    pre {
      margin: 0;
      font-family: var(--code);
      font-size: var(--code-size);
      line-height: 1.6;
      font-variant-ligatures: none;
      font-feature-settings: "liga" 0, "calt" 0;
      tab-size: 2;
      white-space: pre;
      word-break: normal;
      overflow-wrap: normal;
    }
    #focus {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    mark {
      color: inherit;
      background: var(--vscode-editor-findMatchHighlightBackground, rgba(255, 210, 0, .35));
      outline: 1px solid var(--vscode-editor-findMatchHighlightBorder, transparent);
      border-radius: 2px;
    }
  </style>
</head>
<body>
  <header>
    <div id="status" class="status"></div>
    <div id="path" class="path">${escapeHtml(pathPh)}</div>
  </header>
  <div id="error" class="error-text"></div>
  <section id="focus-wrap" class="pane">
    <h2>${escapeHtml(atCursor)}</h2>
    <pre id="focus"></pre>
  </section>
  <section id="doc-wrap" class="pane">
    <h2>${escapeHtml(documentLabel)}</h2>
    <pre id="doc"></pre>
  </section>
  <script nonce="${opts.nonce}">
    const vscode = acquireVsCodeApi();
    const statusEl = document.getElementById("status");
    const pathEl = document.getElementById("path");
    const errorEl = document.getElementById("error");
    const focusEl = document.getElementById("focus");
    const docEl = document.getElementById("doc");
    const focusWrap = document.getElementById("focus-wrap");

    function esc(text) {
      return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function paint(pre, text, highlight) {
      const raw = String(text ?? "");
      if (
        highlight &&
        Number.isInteger(highlight.start) &&
        Number.isInteger(highlight.end) &&
        highlight.end > highlight.start &&
        highlight.start >= 0 &&
        highlight.end <= raw.length
      ) {
        pre.innerHTML =
          esc(raw.slice(0, highlight.start)) +
          "<mark id=\\"hl\\">" +
          esc(raw.slice(highlight.start, highlight.end)) +
          "</mark>" +
          esc(raw.slice(highlight.end));
        const mark = document.getElementById("hl");
        if (mark) mark.scrollIntoView({ block: "center", inline: "nearest" });
      } else {
        pre.textContent = raw;
      }
    }

    window.addEventListener("message", (event) => {
      const m = event.data;
      if (!m || m.type !== "inspect") return;
      statusEl.className = "status " + (m.status || "");
      statusEl.textContent = m.statusText || "";
      pathEl.textContent = m.pathLabel || "$";
      if (m.errorText) {
        errorEl.textContent = m.errorText;
        errorEl.classList.add("show");
      } else {
        errorEl.textContent = "";
        errorEl.classList.remove("show");
      }
      const same =
        !m.pathLabel || m.pathLabel === "$" || m.focusPretty === m.pretty;
      focusWrap.style.display = same ? "none" : "block";
      if (!same) focusEl.textContent = m.focusPretty || "";
      paint(docEl, m.pretty, m.highlight);
    });
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

function renderPreviewHtml(opts) {
  return renderInspectorHtml(opts);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

module.exports = { renderInspectorHtml, renderPreviewHtml, escapeHtml, nonce };
