"use strict";

const vscode = require("vscode");
const { tokenAt, hoverMarkdown } = require("./src/hover");
const { lintText, prettyJson } = require("./src/lint");
const { inspectLine } = require("./src/explain");
const { analyzeStructure, symbolName } = require("./src/structure");
const { completionsFor } = require("./src/complete");
const { renderInspectorHtml, nonce } = require("./src/preview");
const { encodeJsonText } = require("./src/encode");
const { typeInlays } = require("./src/inlay");
const {
  pathLabel,
  collectPaths,
  collectNames,
  occurrencesOf,
  nameAt,
  isLegalLabel,
  selectionSpans,
} = require("./src/nav");
const {
  jsonPathAtLine,
  buildInspectView,
  prettyValue,
  truncateText,
  getAtPath,
  formatJsonPath,
} = require("./src/inspect");

const SEVERITY = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

/**
 * @param {import("vscode").ExtensionContext} context
 */
function activate(context) {
  const collection = vscode.languages.createDiagnosticCollection("xaiop");
  /** @type {Map<string, ReturnType<typeof setTimeout>>} */
  const timers = new Map();
  /** @type {Map<string, ReturnType<typeof lintText>>} */
  const lastLint = new Map();
  /** @type {Map<string, { version: number, data: ReturnType<typeof analyzeStructure> }>} */
  const structureCache = new Map();
  /** @type {Map<string, { json: string, value: unknown }>} */
  const lastGood = new Map();
  let userClosedInspect = false;
  let inspectShellReady = false;
  let inspectHtmlSet = false;

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    10,
  );
  status.command = "xaiop.previewJson";
  status.name = "XAIOP";

  const onDidChangeCodeLenses = new vscode.EventEmitter();
  const onDidChangeInlayHints = new vscode.EventEmitter();

  function wrapRootAction(document, context) {
    const fromDiag = (context?.diagnostics || []).some(
      (d) => d.code === "xaiop.fragment",
    );
    const lint = lastLint.get(document.uri.toString());
    if (!fromDiag && !lint?.fragment) return null;
    const zh = isZh();
    const action = new vscode.CodeAction(
      zh ? "在开头加上 `>` 开匿名根" : "Prepend `>` to open an anonymous root",
      vscode.CodeActionKind.QuickFix,
    );
    action.isPreferred = fromDiag;
    const fragmentDiags = (context?.diagnostics || []).filter(
      (d) => d.code === "xaiop.fragment",
    );
    if (fragmentDiags.length) action.diagnostics = fragmentDiags;
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, new vscode.Position(0, 0), ">\n");
    return action;
  }

  /** @type {import("vscode").WebviewPanel | undefined} */
  let previewPanel;
  /** @type {string | undefined} */
  let previewUri;

  const quickFix = vscode.languages.registerCodeActionsProvider(
    "xaiop",
    {
      provideCodeActions(document, range, context) {
        const line = document.lineAt(range.start.line);
        const issues = inspectLine(line.text);
        /** @type {import("vscode").CodeAction[]} */
        const actions = [];
        for (const issue of issues) {
          if (!issue.edit) continue;
          const title = isZh() ? issue.edit.title.zh : issue.edit.title.en;
          const action = new vscode.CodeAction(
            title,
            vscode.CodeActionKind.QuickFix,
          );
          action.isPreferred = true;
          action.edit = new vscode.WorkspaceEdit();
          applyIssueEdit(action.edit, document, line, issue.edit);
          actions.push(action);
        }
        const wrap = wrapRootAction(document, context);
        if (wrap) actions.push(wrap);
        return actions;
      },
    },
    { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
  );

  const hover = vscode.languages.registerHoverProvider("xaiop", {
    provideHover(document, position) {
      const line = document.lineAt(position.line).text;
      const token = tokenAt(line, position.character);
      if (!token) return undefined;
      const text = hoverMarkdown(token, vscode.env.language);
      if (!text) return undefined;
      const md = new vscode.MarkdownString(text);
      md.supportHtml = false;
      md.isTrusted = false;
      const inspectMd = inspectHoverMarkdown(document, position.line);
      if (inspectMd) md.appendMarkdown("\n\n" + inspectMd);
      const end =
        token.end > token.start
          ? token.end
          : Math.min(token.start + 1, line.length);
      const range = new vscode.Range(
        position.line,
        token.start,
        position.line,
        Math.max(end, token.start),
      );
      return new vscode.Hover(md, range);
    },
  });

  const complete = vscode.languages.registerCompletionItemProvider(
    "xaiop",
    {
      provideCompletionItems(document, position) {
        const line = document.lineAt(position.line);
        const { symbols: frames } = structureOf(document);
        const items = completionsFor(line.text, position.character, isZh(), {
          paths: collectPaths(frames),
          names: collectNames(frames),
        });
        return items.map((c) => {
          const kind = c.snippet
            ? vscode.CompletionItemKind.Snippet
            : vscode.CompletionItemKind.Keyword;
          const item = new vscode.CompletionItem(c.label, kind);
          item.detail = c.detail;
          item.sortText = c.sort;
          item.filterText = c.label;
          item.range = new vscode.Range(
            position.line,
            0,
            position.line,
            position.character,
          );
          item.insertText = c.snippet
            ? new vscode.SnippetString(c.insert)
            : c.insert;
          return item;
        });
      },
    },
    ">",
    "<",
    "=",
    "@",
    "!",
    "?",
    "&",
    "#",
    "-",
    ".",
    ":",
  );

  const folding = vscode.languages.registerFoldingRangeProvider("xaiop", {
    provideFoldingRanges(document) {
      const { folds } = structureOf(document);
      return folds.map(
        (f) =>
          new vscode.FoldingRange(
            f.start,
            f.end,
            vscode.FoldingRangeKind.Region,
          ),
      );
    },
  });

  const symbols = vscode.languages.registerDocumentSymbolProvider("xaiop", {
    provideDocumentSymbols(document) {
      const { symbols: roots } = structureOf(document);
      return roots.map((frame) => toDocumentSymbol(document, frame));
    },
  });

  const highlights = vscode.languages.registerDocumentHighlightProvider(
    "xaiop",
    {
      provideDocumentHighlights(document, position) {
        const hit = nameAt(document.lineAt(position.line).text, position.character);
        if (hit) {
          return occurrencesOf(linesOf(document), hit.name).map(
            (o) =>
              new vscode.DocumentHighlight(
                new vscode.Range(o.line, o.start, o.line, o.end),
                o.definition
                  ? vscode.DocumentHighlightKind.Write
                  : vscode.DocumentHighlightKind.Read,
              ),
          );
        }
        const { pairOf } = structureOf(document);
        const line = position.line;
        const other = pairOf[line];
        if (other < 0) return [];
        return [
          new vscode.DocumentHighlight(
            operatorRange(document, line),
            vscode.DocumentHighlightKind.Read,
          ),
          new vscode.DocumentHighlight(
            operatorRange(document, other),
            vscode.DocumentHighlightKind.Read,
          ),
        ];
      },
    },
  );

  const lenses = vscode.languages.registerCodeLensProvider("xaiop", {
    onDidChangeCodeLenses: onDidChangeCodeLenses.event,
    provideCodeLenses(document) {
      const result = lastLint.get(document.uri.toString());
      if (!result) return [];
      const zh = isZh();
      const range = new vscode.Range(0, 0, 0, 0);
      if (!result.ok) {
        const first = result.diagnostics[0];
        const line = first?.line || 1;
        const title = zh
          ? `XAIOP: 第 ${line} 行解析失败`
          : `XAIOP: parse failed on line ${line}`;
        return [
          new vscode.CodeLens(range, {
            title,
            command: "xaiop.goToLine",
            arguments: [document.uri, line],
          }),
        ];
      }
      const title = result.fragment
        ? zh
          ? "XAIOP: 根片段 · 实时查阅"
          : "XAIOP: root fragment · live inspect"
        : zh
          ? "XAIOP: 实时查阅 JSON"
          : "XAIOP: live JSON inspect";
      const lenses = [
        new vscode.CodeLens(range, {
          title,
          command: "xaiop.previewJson",
        }),
      ];
      if (result.fragment) {
        lenses.push(
          new vscode.CodeLens(range, {
            title: zh
              ? "XAIOP: 用 `>` 包成 JSON 文档"
              : "XAIOP: wrap with `>` as JSON document",
            command: "xaiop.wrapRoot",
          }),
        );
      }
      return lenses;
    },
  });

  const definition = vscode.languages.registerDefinitionProvider("xaiop", {
    provideDefinition(document, position) {
      const hit = nameAt(
        document.lineAt(position.line).text,
        position.character,
      );
      if (!hit) return undefined;
      const defs = occurrencesOf(linesOf(document), hit.name).filter(
        (o) => o.definition,
      );
      if (!defs.length) return undefined;
      return defs.map(
        (o) =>
          new vscode.Location(
            document.uri,
            new vscode.Range(o.line, o.start, o.line, o.end),
          ),
      );
    },
  });

  const references = vscode.languages.registerReferenceProvider("xaiop", {
    provideReferences(document, position) {
      const hit = nameAt(
        document.lineAt(position.line).text,
        position.character,
      );
      if (!hit) return [];
      return occurrencesOf(linesOf(document), hit.name).map(
        (o) =>
          new vscode.Location(
            document.uri,
            new vscode.Range(o.line, o.start, o.line, o.end),
          ),
      );
    },
  });

  const rename = vscode.languages.registerRenameProvider("xaiop", {
    prepareRename(document, position) {
      const hit = nameAt(
        document.lineAt(position.line).text,
        position.character,
      );
      if (!hit) {
        throw new Error(isZh() ? "不是 Label / 路径段" : "Not a Label / path segment");
      }
      return new vscode.Range(
        position.line,
        hit.start,
        position.line,
        hit.end,
      );
    },
    provideRenameEdits(document, position, newName) {
      if (!isLegalLabel(newName)) {
        throw new Error(
          isZh()
            ? "非法 Label：不能为空，也不能含空白 / `:` / `@` / `&`"
            : "Illegal Label: empty, whitespace, `:`, `@`, and `&` are forbidden",
        );
      }
      const hit = nameAt(
        document.lineAt(position.line).text,
        position.character,
      );
      if (!hit) return new vscode.WorkspaceEdit();
      const edit = new vscode.WorkspaceEdit();
      for (const o of occurrencesOf(linesOf(document), hit.name)) {
        edit.replace(
          document.uri,
          new vscode.Range(o.line, o.start, o.line, o.end),
          newName,
        );
      }
      return edit;
    },
  });

  const selectionRange = vscode.languages.registerSelectionRangeProvider(
    "xaiop",
    {
      provideSelectionRanges(document, positions) {
        const lines = linesOf(document);
        const { symbols: frames } = structureOf(document);
        return positions.map((pos) => {
          const spans = selectionSpans(
            lines,
            pos.line,
            pos.character,
            frames,
          );
          /** @type {import("vscode").SelectionRange | undefined} */
          let current;
          for (let i = spans.length - 1; i >= 0; i--) {
            const s = spans[i];
            const range = new vscode.Range(
              s.startLine,
              s.start,
              s.endLine,
              s.end,
            );
            current = new vscode.SelectionRange(range, current);
          }
          return current ?? new vscode.SelectionRange(document.lineAt(pos.line).range);
        });
      },
    },
  );

  const inlays = vscode.languages.registerInlayHintsProvider("xaiop", {
    onDidChangeInlayHints: onDidChangeInlayHints.event,
    provideInlayHints(document, range) {
      const cfg = vscode.workspace.getConfiguration("xaiop", document.uri);
      if (cfg.get("inlay.types") === false) return [];
      const lines = linesOf(document);
      return typeInlays(lines, range.start.line, range.end.line, isZh()).map(
        (h) => {
          const hint = new vscode.InlayHint(
            new vscode.Position(h.line, h.column),
            h.label,
            h.kind === "error"
              ? vscode.InlayHintKind.Type
              : vscode.InlayHintKind.Type,
          );
          hint.paddingLeft = true;
          return hint;
        },
      );
    },
  });

  const showJson = vscode.commands.registerCommand("xaiop.showJson", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!requireXaiop(editor)) return;
    const result = runLint(editor.document);
    const body = jsonBody(result);
    if (body == null) {
      showLintError(result);
      return;
    }
    const jsonDoc = await vscode.workspace.openTextDocument({
      language: result.fragment ? "jsonc" : "json",
      content: body,
    });
    await vscode.window.showTextDocument(jsonDoc, {
      preview: true,
      viewColumn: vscode.ViewColumn.Beside,
    });
  });

  const previewJson = vscode.commands.registerCommand(
    "xaiop.previewJson",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!requireXaiop(editor)) return;
      const result = runLint(editor.document);
      showPreview(editor.document, result);
    },
  );

  const copyJson = vscode.commands.registerCommand("xaiop.copyJson", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!requireXaiop(editor)) return;
    const result = runLint(editor.document);
    if (!result.json) {
      showLintError(result);
      return;
    }
    const body = prettyJson(result.json);
    await vscode.env.clipboard.writeText(body);
    vscode.window.setStatusBarMessage(
      isZh() ? "已复制物化 JSON" : "Copied materialized JSON",
      2000,
    );
  });

  const goToPair = vscode.commands.registerCommand("xaiop.goToPair", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!requireXaiop(editor)) return;
    const { pairOf } = structureOf(editor.document);
    const other = pairOf[editor.selection.active.line];
    if (other < 0) {
      vscode.window.setStatusBarMessage(
        isZh() ? "当前行没有匹配的 `>` / `<`" : "No matching `>` / `<` on this line",
        2500,
      );
      return;
    }
    const pos = new vscode.Position(other, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  });

  const goToLine = vscode.commands.registerCommand(
    "xaiop.goToLine",
    async (uri, lineNo) => {
      const line = Math.max((Number(lineNo) || 1) - 1, 0);
      const doc =
        uri && vscode.Uri.isUri(uri)
          ? await vscode.workspace.openTextDocument(uri)
          : vscode.window.activeTextEditor?.document;
      if (!doc) return;
      const editor = await vscode.window.showTextDocument(doc);
      const pos = new vscode.Position(Math.min(line, doc.lineCount - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos));
    },
  );

  const wrapRoot = vscode.commands.registerCommand("xaiop.wrapRoot", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!requireXaiop(editor)) return;
    const result = runLint(editor.document);
    if (!result.fragment) {
      vscode.window.showInformationMessage(
        isZh()
          ? "当前已经是 JSON 文档根（不是根片段）。"
          : "This stream is already a JSON document root (not a fragment).",
      );
      return;
    }
    await editor.edit((edit) => {
      edit.insert(new vscode.Position(0, 0), ">\n");
    });
  });

  const newFile = vscode.commands.registerCommand("xaiop.newFile", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "xaiop",
      content: ">\n",
    });
    await vscode.window.showTextDocument(doc);
  });

  const pasteJson = vscode.commands.registerCommand(
    "xaiop.pasteJson",
    async () => {
      const clip = await vscode.env.clipboard.readText();
      const encoded = encodeJsonText(clip, encodeOpts());
      if (!encoded.ok) {
        vscode.window.showErrorMessage(
          (isZh() ? "剪贴板不是可编码的 JSON：" : "Clipboard is not encodable JSON: ") +
            encoded.message,
        );
        return;
      }
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "xaiop") {
        await insertWire(editor, encoded.wire);
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        language: "xaiop",
        content: encoded.wire,
      });
      await vscode.window.showTextDocument(doc);
    },
  );

  const encodeJson = vscode.commands.registerCommand(
    "xaiop.encodeJson",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage(
          isZh() ? "请先打开 JSON 或选中 JSON 文本。" : "Open a JSON editor or select JSON text first.",
        );
        return;
      }
      const text = editor.selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(editor.selection);
      const encoded = encodeJsonText(text, encodeOpts(editor.document.uri));
      if (!encoded.ok) {
        vscode.window.showErrorMessage(
          (isZh() ? "无法编码为 XAIOP：" : "Cannot encode as XAIOP: ") +
            encoded.message,
        );
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        language: "xaiop",
        content: encoded.wire,
      });
      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.Beside,
      });
    },
  );

  const copyAsXaiop = vscode.commands.registerCommand(
    "xaiop.copyAsXaiop",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const text = editor.selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(editor.selection);
      const encoded = encodeJsonText(text, encodeOpts(editor.document.uri));
      if (!encoded.ok) {
        vscode.window.showErrorMessage(
          (isZh() ? "无法编码为 XAIOP：" : "Cannot encode as XAIOP: ") +
            encoded.message,
        );
        return;
      }
      await vscode.env.clipboard.writeText(encoded.wire);
      vscode.window.setStatusBarMessage(
        isZh() ? "已复制 XAIOP 线文" : "Copied XAIOP wire",
        2000,
      );
    },
  );

  function schedule(doc) {
    if (doc.languageId !== "xaiop") return;
    const key = doc.uri.toString();
    const prev = timers.get(key);
    if (prev) clearTimeout(prev);
    const ms = Math.max(
      0,
      Number(
        vscode.workspace
          .getConfiguration("xaiop", doc.uri)
          .get("lint.debounceMs") ?? 250,
      ),
    );
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        applyLint(doc);
      }, ms),
    );
  }

  function applyLint(doc) {
    if (doc.languageId !== "xaiop") return;
    const cfg = vscode.workspace.getConfiguration("xaiop", doc.uri);
    if (cfg.get("lint.enabled") === false) {
      collection.delete(doc.uri);
      lastLint.delete(doc.uri.toString());
      onDidChangeCodeLenses.fire();
      onDidChangeInlayHints.fire();
      refreshStatus(vscode.window.activeTextEditor);
      return;
    }
    const result = runLint(doc);
    collection.set(doc.uri, toDiagnostics(doc, result.diagnostics));
    refreshStatus(vscode.window.activeTextEditor);
    maybeAutoOpen(doc, result);
    pushInspect(doc, result);
  }

  function runLint(doc) {
    const cfg = vscode.workspace.getConfiguration("xaiop", doc.uri);
    const result = lintText(doc.getText(), {
      zh: isZh(),
      compat: cfg.get("lint.compat") === true,
      fragmentSeverity: cfg.get("lint.fragmentSeverity") ?? "warning",
    });
    lastLint.set(doc.uri.toString(), result);
    if (result.json != null) {
      lastGood.set(doc.uri.toString(), {
        json: result.json,
        value: result.value,
      });
    }
    onDidChangeCodeLenses.fire();
    onDidChangeInlayHints.fire();
    return result;
  }

  function structureOf(doc) {
    const key = doc.uri.toString();
    const hit = structureCache.get(key);
    if (hit && hit.version === doc.version) return hit.data;
    const data = analyzeStructure(linesOf(doc));
    structureCache.set(key, { version: doc.version, data });
    return data;
  }

  function showPreview(doc, result, options = {}) {
    userClosedInspect = false;
    previewUri = doc.uri.toString();
    const reveal = options.reveal !== false;
    if (!previewPanel) {
      previewPanel = vscode.window.createWebviewPanel(
        "xaiop.jsonPreview",
        previewTitle(doc),
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
          enableScripts: true,
          enableFindWidget: true,
          retainContextWhenHidden: true,
        },
      );
      inspectShellReady = false;
      inspectHtmlSet = false;
      previewPanel.webview.onDidReceiveMessage((msg) => {
        if (msg?.type !== "ready") return;
        inspectShellReady = true;
        const editor = vscode.window.activeTextEditor;
        const target =
          editor && editor.document.languageId === "xaiop"
            ? editor.document
            : doc;
        const res =
          lastLint.get(target.uri.toString()) ||
          (target === doc ? result : runLint(target));
        pushInspect(target, res);
      });
      previewPanel.onDidDispose(() => {
        previewPanel = undefined;
        previewUri = undefined;
        inspectShellReady = false;
        inspectHtmlSet = false;
        userClosedInspect = true;
      });
    } else {
      previewPanel.title = previewTitle(doc);
      if (reveal) previewPanel.reveal(vscode.ViewColumn.Beside, true);
    }
    ensureInspectShell();
    pushInspect(doc, result);
  }

  function ensureInspectShell() {
    if (!previewPanel || inspectHtmlSet) return;
    const n = nonce();
    previewPanel.webview.html = renderInspectorHtml({
      nonce: n,
      cspSource: previewPanel.webview.cspSource,
      zh: isZh(),
    });
    inspectHtmlSet = true;
  }

  function maybeAutoOpen(doc, result) {
    if (previewPanel || userClosedInspect) return;
    if (
      vscode.workspace.getConfiguration("xaiop", doc.uri).get("inspect.autoOpen") ===
      false
    ) {
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== doc.uri.toString()) {
      return;
    }
    showPreview(doc, result, { reveal: true });
  }

  function pushInspect(doc, result) {
    if (!previewPanel || previewUri !== doc.uri.toString()) return;
    ensureInspectShell();
    if (!inspectShellReady) return;
    const view = inspectViewFor(doc, result);
    previewPanel.title = previewTitle(doc);
    previewPanel.webview.postMessage(view);
  }

  function inspectViewFor(doc, result) {
    const zh = isZh();
    const editor = vscode.window.activeTextEditor;
    const line =
      editor && editor.document.uri.toString() === doc.uri.toString()
        ? editor.selection.active.line
        : 0;
    const lines = linesOf(doc);
    const { symbols: frames } = structureOf(doc);
    const path = jsonPathAtLine(lines, frames, line);
    const good = lastGood.get(doc.uri.toString());
    const error = !result?.json;
    const value = error ? good?.value : result.value;
    const json = error ? good?.json : result.json;
    const pretty = json ? prettyJson(json) : "";
    return buildInspectView({
      value,
      pretty,
      path,
      fragment: result?.fragment === true,
      error,
      errorText: error
        ? result?.diagnostics?.[0]?.message ||
          (zh ? "解析失败" : "Parse failed")
        : undefined,
      stale: error && !!good,
      zh,
    });
  }

  function inspectHoverMarkdown(document, line) {
    if (
      vscode.workspace.getConfiguration("xaiop", document.uri).get("inspect.hover") ===
      false
    ) {
      return "";
    }
    const result = lastLint.get(document.uri.toString());
    const good = lastGood.get(document.uri.toString());
    const value = result?.json != null ? result.value : good?.value;
    if (value === undefined) return "";
    const { symbols: frames } = structureOf(document);
    const path = jsonPathAtLine(linesOf(document), frames, line);
    const focus = path.length ? getAtPath(value, path) : value;
    const pretty = prettyValue(focus);
    if (pretty == null) return "";
    const zh = isZh();
    return (
      "### " +
      (zh ? "物化" : "Materialized") +
      " `" +
      formatJsonPath(path) +
      "`\n\n```json\n" +
      truncateText(pretty, 800) +
      "\n```"
    );
  }

  function refreshStatus(editor) {
    const enabled =
      vscode.workspace.getConfiguration("xaiop").get("statusBar.enabled") !==
      false;
    if (!enabled || !editor || editor.document.languageId !== "xaiop") {
      status.hide();
      return;
    }
    const result = lastLint.get(editor.document.uri.toString());
    const zh = isZh();
    if (!result) {
      status.text = "$(sync) XAIOP";
      status.tooltip = zh ? "正在检查…" : "Linting…";
      status.backgroundColor = undefined;
      status.show();
      return;
    }
    const { symbols: frames } = structureOf(editor.document);
    const trail = pathLabel(frames, editor.selection.active.line);
    const trailBit = trail ? `  ${truncatePath(trail)}` : "";
    if (!result.ok) {
      const line = result.diagnostics[0]?.line || 1;
      status.text = `$(error) XAIOP L${line}${trailBit}`;
      status.tooltip = [result.diagnostics[0]?.message || "", trail].filter(Boolean).join("\n");
      status.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground",
      );
    } else if (result.fragment) {
      status.text = `$(warning) XAIOP fragment${trailBit}`;
      status.tooltip = [
        zh
          ? "根片段（不能单独作为 JSON 文档）。点击预览。"
          : "Root fragment (not a standalone JSON document). Click to preview.",
        trail,
      ]
        .filter(Boolean)
        .join("\n");
      status.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    } else {
      status.text = `$(check) XAIOP JSON${trailBit}`;
      status.tooltip = [
        zh ? "物化 JSON 合法。点击预览。" : "Materialized JSON is valid. Click to preview.",
        trail,
      ]
        .filter(Boolean)
        .join("\n");
      status.backgroundColor = undefined;
    }
    status.show();
  }

  function dropDoc(doc) {
    const key = doc.uri.toString();
    collection.delete(doc.uri);
    lastLint.delete(key);
    lastGood.delete(key);
    structureCache.delete(key);
    const t = timers.get(key);
    if (t) clearTimeout(t);
    timers.delete(key);
  }

  context.subscriptions.push(
    hover,
    quickFix,
    complete,
    folding,
    symbols,
    highlights,
    lenses,
    definition,
    references,
    rename,
    selectionRange,
    inlays,
    showJson,
    previewJson,
    copyJson,
    goToPair,
    goToLine,
    wrapRoot,
    newFile,
    pasteJson,
    encodeJson,
    copyAsXaiop,
    collection,
    status,
    onDidChangeCodeLenses,
    onDidChangeInlayHints,
    vscode.workspace.onDidOpenTextDocument(schedule),
    vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document)),
    vscode.workspace.onDidSaveTextDocument(applyLint),
    vscode.workspace.onDidCloseTextDocument(dropDoc),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      refreshStatus(editor);
      if (!editor || editor.document.languageId !== "xaiop") return;
      if (
        previewPanel &&
        vscode.workspace.getConfiguration("xaiop").get("preview.follow") !== false
      ) {
        previewUri = editor.document.uri.toString();
        previewPanel.title = previewTitle(editor.document);
        const result =
          lastLint.get(previewUri) || runLint(editor.document);
        pushInspect(editor.document, result);
      } else {
        maybeAutoOpen(
          editor.document,
          lastLint.get(editor.document.uri.toString()) || runLint(editor.document),
        );
      }
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.textEditor.document.languageId !== "xaiop") return;
      refreshStatus(e.textEditor);
      if (
        previewPanel &&
        previewUri === e.textEditor.document.uri.toString() &&
        vscode.workspace
          .getConfiguration("xaiop")
          .get("inspect.followCursor") !== false
      ) {
        const result = lastLint.get(previewUri);
        if (result) pushInspect(e.textEditor.document, result);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("xaiop")) return;
      for (const doc of vscode.workspace.textDocuments) {
        if (doc.languageId === "xaiop") applyLint(doc);
      }
      onDidChangeInlayHints.fire();
      refreshStatus(vscode.window.activeTextEditor);
    }),
    {
      dispose() {
        for (const t of timers.values()) clearTimeout(t);
        timers.clear();
        lastLint.clear();
        lastGood.clear();
        structureCache.clear();
        previewPanel?.dispose();
      },
    },
  );

  for (const doc of vscode.workspace.textDocuments) schedule(doc);
  refreshStatus(vscode.window.activeTextEditor);
}

function applyIssueEdit(workspaceEdit, document, line, edit) {
  if (edit.deleteLine) {
    workspaceEdit.delete(document.uri, line.rangeIncludingLineBreak);
    return;
  }
  if (edit.insertAtStart != null) {
    workspaceEdit.insert(document.uri, new vscode.Position(0, 0), edit.insertAtStart);
    return;
  }
  if (edit.newText != null) {
    workspaceEdit.replace(document.uri, line.range, edit.newText);
  }
}

async function insertWire(editor, wire) {
  const body = String(wire ?? "").replace(/\n$/, "");
  const sel = editor.selection;
  await editor.edit((edit) => {
    if (!sel.isEmpty) {
      edit.replace(sel, body);
      return;
    }
    const line = editor.document.lineAt(sel.active.line);
    if (line.text === "") {
      edit.replace(line.range, body);
    } else {
      edit.insert(line.range.end, "\n" + body);
    }
  });
}

function encodeOpts(uri) {
  const cfg = vscode.workspace.getConfiguration("xaiop", uri);
  return {
    dotPolicy: cfg.get("encode.dotPolicy") || "none",
    style: cfg.get("encode.style") || "relative",
  };
}

function truncatePath(label) {
  if (!label || label.length <= 28) return label;
  return "…" + label.slice(-27);
}

function toDocumentSymbol(doc, frame) {
  const start = new vscode.Position(frame.start, 0);
  const endLine = Math.min(frame.end, doc.lineCount - 1);
  const end = doc.lineAt(endLine).range.end;
  const selText = doc.lineAt(frame.start).text;
  const selEnd = new vscode.Position(frame.start, selText.length);
  const kind =
    frame.kind === "array"
      ? vscode.SymbolKind.Array
      : vscode.SymbolKind.Object;
  const symbol = new vscode.DocumentSymbol(
    symbolName(frame),
    frame.kind,
    kind,
    new vscode.Range(start, end),
    new vscode.Range(start, selEnd),
  );
  symbol.children = frame.children.map((child) =>
    toDocumentSymbol(doc, child),
  );
  return symbol;
}

function operatorRange(doc, lineNo) {
  const line = doc.lineAt(lineNo);
  const end = Math.min(1, line.text.length);
  if (end === 0) return line.range;
  return new vscode.Range(lineNo, 0, lineNo, end);
}

function linesOf(doc) {
  const out = [];
  for (let i = 0; i < doc.lineCount; i++) out.push(doc.lineAt(i).text);
  return out;
}

function jsonBody(result) {
  if (!result.json) return null;
  let body = prettyJson(result.json);
  if (result.fragment) {
    const note =
      "// root fragment — not a standalone JSON document; showing entries\n";
    body = note + body;
  }
  return body;
}

function showLintError(result) {
  const first = result.diagnostics[0];
  vscode.window.showErrorMessage(first ? first.message : "XAIOP parse failed");
}

function requireXaiop(editor) {
  if (!editor || editor.document.languageId !== "xaiop") {
    vscode.window.showWarningMessage(
      isZh() ? "请先打开一个 .xaiop 文件。" : "Open a .xaiop file first.",
    );
    return false;
  }
  return true;
}

function previewTitle(doc) {
  const name = doc.uri.path.split("/").pop() || "xaiop";
  return `${name} · live`;
}

function toDiagnostics(doc, items) {
  /** @type {import("vscode").Diagnostic[]} */
  const out = [];
  for (const item of items) {
    const severity = SEVERITY[item.severity];
    if (severity == null) continue;
    const lineIdx = Math.min(
      Math.max((item.line || 1) - 1, 0),
      Math.max(doc.lineCount - 1, 0),
    );
    const diag = new vscode.Diagnostic(
      rangeFor(doc, item, lineIdx),
      item.message,
      severity,
    );
    diag.source = "XAIOP";
    diag.code = item.code;
    out.push(diag);
  }
  return out;
}

function rangeFor(doc, item, lineIdx) {
  const line = doc.lineAt(lineIdx);
  const len = line.text.length;
  if (
    Number.isInteger(item.startColumn) &&
    Number.isInteger(item.endColumn) &&
    item.endColumn > item.startColumn
  ) {
    const start = Math.max(0, Math.min(item.startColumn, len));
    const end = Math.max(start, Math.min(item.endColumn, len));
    return new vscode.Range(lineIdx, start, lineIdx, end);
  }
  return line.range;
}

function isZh() {
  return String(vscode.env.language || "").toLowerCase().startsWith("zh");
}

function deactivate() {}

module.exports = { activate, deactivate };
