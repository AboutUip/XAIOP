"use strict";

const { KIND, classifyLine } = require("./classify");

/**
 * Editor-facing explanation of a wire line: precise spans, copy, optional edit.
 * Used by the linter (Problems + Quick Fix) and by hover so they stay in sync.
 *
 * @param {string} line
 * @returns {Array<{
 *   kind: string,
 *   start: number,
 *   end: number,
 *   title: { zh: string, en: string },
 *   message: { zh: string, en: string },
 *   example?: string,
 *   edit?: { newText: string, title: { zh: string, en: string } },
 * }>}
 */
function inspectLine(line) {
  const raw = typeof line === "string" ? line : String(line ?? "");
  const view = classifyLine(raw);

  if (view.invalid === "empty") {
    return [
      issue("empty-line", 0, 0, {
        title: { zh: "空行非法", en: "Empty line is illegal" },
        message: {
          zh: "空 Content 行是语法错误。结构用 `>` / `<` / `.` 等算子，不要留空行。",
          en: "An empty Content line is a syntax error. Use structure operators; do not leave blank lines.",
        },
        edit: {
          deleteLine: true,
          title: { zh: "删除此空行", en: "Delete this empty line" },
        },
      }),
    ];
  }

  if (view.invalid === "leading-whitespace") {
    const trimmed = raw.replace(/^[ \t]+/, "");
    const ws = raw.length - trimmed.length;
    return [
      issue("leading-whitespace", 0, ws, {
        title: { zh: "前导空白非法", en: "Leading whitespace is illegal" },
        message: {
          zh: "逻辑行从首字符分类。前导空格/Tab 使 `#` 也不再是注解原语。",
          en: "Lines are classified from the first character. Leading space/tab means `#` is not the annotation primitive.",
        },
        example: trimmed || undefined,
        edit: trimmed
          ? {
              newText: trimmed,
              title: { zh: "去掉前导空白", en: "Trim leading whitespace" },
            }
          : {
              deleteLine: true,
              title: { zh: "删除此空行", en: "Delete this empty line" },
            },
      }),
    ];
  }

  if (view.invalid === "stacked-enter") {
    const lead = (/^>+/.exec(raw) || [">>"])[0].length;
    const rest = raw.slice(lead);
    const fixed = `>${rest}`;
    return [
      issue("stacked-enter", 1, lead, {
        title: { zh: "`>>` 叠写非法", en: "`>>` stacking is illegal" },
        message: {
          zh: "同一行不能叠两个 `>`。多层请分行写 `>` / `>name`，或用 `=path` / `@path`。",
          en: "Do not stack `>` on one line. Descend with one `>` per line, or use `=path` / `@path`.",
        },
        example: fixed,
        edit: {
          newText: fixed,
          title: { zh: `改为 ${fixed}`, en: `Change to ${fixed}` },
        },
      }),
    ];
  }

  if (view.invalid === "bare-label") {
    const fixed = `>${raw}`;
    return [
      issue("bare-label", 0, raw.length, {
        title: { zh: "裸 Label 非法", en: "Bare Label is illegal" },
        message: {
          zh: "只有名字的行是语法错误。具名对象写成 `>name`。",
          en: "A name-only line is a syntax error. Write a named object as `>name`.",
        },
        example: fixed,
        edit: {
          newText: fixed,
          title: { zh: `改为 ${fixed}`, en: `Change to ${fixed}` },
        },
      }),
    ];
  }

  if (view.kind === KIND.ARRAY_NAMED && view.name != null) {
    const name = view.name;
    if (/^\S+\s+$/.test(name)) {
      const trimmed = name.trimEnd();
      const start = 1 + trimmed.length;
      const end = raw.length - 1;
      return [
        issue("array-postfix-gap", start, end, {
          title: {
            zh: "`>name-` 中间不能有空格",
            en: "No space inside `>name-`",
          },
          message: {
            zh: `具名数组写作 \`>name-\`，\`-\` 必须紧贴 Label。空格会算进名字，而 Label **禁止空白**。`,
            en: `A named array is \`>name-\`: the \`-\` must touch the Label. A space becomes part of the name, and Labels **cannot contain whitespace**.`,
          },
          example: `>${trimmed}-`,
          edit: {
            newText: `>${trimmed}-`,
            title: {
              zh: `改为 >${trimmed}-`,
              en: `Change to >${trimmed}-`,
            },
          },
        }),
      ];
    }
    const hit = nameIssue(name, 1);
    if (hit) {
      if (hit.kind === "label-whitespace") {
        const compact = name.replace(/\s+/g, "");
        if (compact) {
          hit.example = `>${compact}-`;
          hit.edit = {
            newText: `>${compact}-`,
            title: {
              zh: `改为 >${compact}-`,
              en: `Change to >${compact}-`,
            },
          };
        }
      }
      return [hit];
    }
  }

  if (
    (view.kind === KIND.OBJECT_NAMED || view.kind === KIND.POP_ENTER) &&
    view.name != null
  ) {
    const hit = nameIssue(view.name, 1);
    if (hit) {
      if (hit.kind === "label-whitespace") {
        const compact = view.name.replace(/\s+/g, "");
        const op = view.kind === KIND.POP_ENTER ? "<" : ">";
        if (compact) {
          hit.example = `${op}${compact}`;
          hit.edit = {
            newText: `${op}${compact}`,
            title: {
              zh: `改为 ${op}${compact}`,
              en: `Change to ${op}${compact}`,
            },
          };
        }
      }
      if (hit.kind === "label-colon" && view.kind === KIND.OBJECT_NAMED) {
        hit.example = view.name;
        hit.edit = {
          newText: view.name,
          title: {
            zh: "改为 Content key:value",
            en: "Change to Content key:value",
          },
        };
      }
      return [hit];
    }
  }

  if (
    (view.kind === KIND.LOCATE ||
      view.kind === KIND.EXACT ||
      view.kind === KIND.BROADCAST ||
      view.kind === KIND.DELETE) &&
    view.path
  ) {
    const hit = nameIssue(view.path.split(">")[0] ?? view.path, 1);
    if (hit && /\s|:|@|&/.test(view.path)) {
      const inner = firstBadNameSpan(view.path, 1);
      if (inner) return [inner];
    }
  }

  return [];
}

/**
 * Turn an SDK parse error + the failing line into a diagnostic payload.
 * @param {string} sdkMessage already stripped of `line N:`
 * @param {string} lineText
 * @param {{ zh?: boolean, line: number }} ctx
 */
function explainError(sdkMessage, lineText, ctx) {
  const zh = ctx.zh === true;
  const line = ctx.line;
  const issues = inspectLine(lineText);
  if (issues.length) {
    const i = issues[0];
    return {
      severity: "error",
      line,
      startColumn: i.start,
      endColumn: i.end,
      code: "xaiop.syntax",
      message: pick(zh, i.message) + (i.edit ? " " + pick(zh, i.edit.title) + "。" : ""),
      edit: i.edit
        ? { newText: i.edit.newText, title: pick(zh, i.edit.title) }
        : undefined,
    };
  }

  const labelMatch = /^invalid label name:\s*(.*)$/i.exec(sdkMessage);
  if (labelMatch) {
    let shown = labelMatch[1];
    try {
      shown = JSON.parse(labelMatch[1]);
    } catch {
      /* keep raw */
    }
    const why = describeBadName(String(shown), zh);
    return {
      severity: "error",
      line,
      code: "xaiop.syntax",
      message: why,
    };
  }

  const mapped = mapSdkMessage(sdkMessage, zh);
  return {
    severity: "error",
    line,
    code: "xaiop.syntax",
    message: mapped,
  };
}

function nameIssue(name, offset) {
  if (!name) {
    return issue("empty-label", offset, offset, {
      title: { zh: "Label 为空", en: "Empty Label" },
      message: {
        zh: "Label 不能为空。具名对象写作 `>name`，具名数组写作 `>name-`。",
        en: "A Label cannot be empty. Named object: `>name`. Named array: `>name-`.",
      },
    });
  }
  const space = /\s/.exec(name);
  if (space) {
    const start = offset + space.index;
    let end = start + 1;
    while (end < offset + name.length && /\s/.test(name[end - offset])) end++;
    return issue("label-whitespace", start, end, {
      title: { zh: "Label 不能含空白", en: "Labels cannot contain whitespace" },
      message: {
        zh: "Label / 路径段禁止空格或 Tab。名字必须紧贴算子书写。",
        en: "Labels / path segments cannot contain space or tab. Write the name flush against the operator.",
      },
    });
  }
  if (name.includes(":")) {
    const at = offset + name.indexOf(":");
    return issue("label-colon", at, at + 1, {
      title: { zh: "Label 不能含 `:`", en: "Labels cannot contain `:`" },
      message: {
        zh: "`:` 是 Content 分隔符。属性写成 `key:value`，不要写在 `>` 后面。",
        en: "`:` is the Content separator. Write a property as `key:value`, not after `>`.",
      },
    });
  }
  if (name.includes("@") || name.includes("&")) {
    const ch = name.includes("@") ? "@" : "&";
    const at = offset + name.indexOf(ch);
    return issue("label-operator-char", at, at + 1, {
      title: { zh: `Label 不能含 \`${ch}\``, en: `Labels cannot contain \`${ch}\`` },
      message: {
        zh: `\`${ch}\` 是行首算子。默认模式禁止它出现在 Label 里（需要时用 symbol-key 模式）。`,
        en: `\`${ch}\` is a line-start operator. Default mode forbids it inside a Label (use symbol-key mode if needed).`,
      },
    });
  }
  return null;
}

function firstBadNameSpan(path, offset) {
  let i = 0;
  const parts = path.split(">");
  for (const part of parts) {
    const hit = nameIssue(part, offset + i);
    if (hit) return hit;
    i += part.length + 1;
  }
  return null;
}

function describeBadName(name, zh) {
  if (!name) {
    return zh ? "Label 为空。" : "Empty Label.";
  }
  if (/\s/.test(name)) {
    return zh
      ? `非法 Label \`${visible(name)}\`：不能含空白。具名数组请写 \`>name-\`（\`-\` 紧贴名字）。`
      : `Invalid Label \`${visible(name)}\`: whitespace is forbidden. For a named array write \`>name-\` (no space before \`-\`).`;
  }
  if (name.includes(":")) {
    return zh
      ? `非法 Label \`${visible(name)}\`：不能含 \`:\`。属性用 Content \`key:value\`。`
      : `Invalid Label \`${visible(name)}\`: \`:\` is not allowed. Use Content \`key:value\`.`;
  }
  return zh
    ? `非法 Label \`${visible(name)}\`。`
    : `Invalid Label \`${visible(name)}\`.`;
}

function mapSdkMessage(msg, zh) {
  if (/empty line is a Content syntax error/i.test(msg)) {
    return zh
      ? "空行非法。结构用 `>` / `<` / `.` 等算子，不要留空行。"
      : "Empty line is illegal. Use structure operators; do not leave blank lines.";
  }
  if (/Bare Label or unknown line form/i.test(msg)) {
    return zh
      ? "裸 Label 非法。具名对象写成 `>name`，不要只写名字。"
      : "Bare Label is illegal. Write a named object as `>name`.";
  }
  if (/< at Root is illegal/i.test(msg)) {
    return zh
      ? "Root 上不能写 `<`。先进入一层，或用 `.` 重置后再从 Root 定位。"
      : "`<` at Root is illegal. Enter a level first, or `.` and relocate from Root.";
  }
  if (/same-symbol stacking/i.test(msg)) {
    return zh
      ? "禁止 `>>` 叠写。一行一个 `>`，或多层用 `=path` / `@path`。"
      : "`>>` stacking is forbidden. One `>` per line, or use `=path` / `@path`.";
  }
  return msg;
}

function issue(kind, start, end, rest) {
  return { kind, start, end, ...rest };
}

function pick(zh, pair) {
  return zh ? pair.zh : pair.en;
}

function visible(name) {
  return String(name).replace(/ /g, "·").replace(/\t/g, "→");
}

function lineAt(source, lineNo) {
  const lines = String(source).split(/\r?\n/);
  return lines[Math.max(lineNo, 1) - 1] ?? "";
}

function issueMarkdown(i, zh) {
  const title = pick(zh, i.title);
  const body = pick(zh, i.message);
  let out = `### ${title}\n\n${body}`;
  if (i.edit?.newText) {
    out +=
      "\n\n" +
      (zh ? "写成：" : "Write:") +
      "\n\n```xaiop\n" +
      i.edit.newText +
      "\n```";
  } else if (i.example) {
    out += "\n\n```xaiop\n" + i.example + "\n```";
  }
  return out;
}

module.exports = {
  inspectLine,
  explainError,
  issueMarkdown,
  lineAt,
  pick,
};
