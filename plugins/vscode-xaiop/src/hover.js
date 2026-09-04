"use strict";

const { inspectLine, issueMarkdown } = require("./explain");
const { tokenAt, typeValue } = require("./classify");

/**
 * @param {{ start: number, end: number, role: string, view: object, data?: object }} token
 * @param {string} [language] vscode.env.language
 * @returns {string|null}
 */
function hoverMarkdown(token, language) {
  if (!token) return null;
  const zh = String(language || "").toLowerCase().startsWith("zh");
  if (
    token.role === "path-segment" ||
    token.role === "label-gap" ||
    token.role === "array-postfix"
  ) {
    const issues = inspectLine(token.view.raw);
    if (issues.length) return issueMarkdown(issues[0], zh);
  }
  switch (token.role) {
    case "operator":
      return operatorMarkdown(token.view, zh);
    case "array-postfix":
      return md(
        zh,
        "`-` 具名数组后缀",
        "`-` named-array postfix",
        zh
          ? "写在 `>name-` 行尾：创建或再进入具名数组；已是数组则**追加**元素。`-` **不是**数组兄弟分隔符。"
          : "Trailing `-` on `>name-`: create or re-enter a named array; if it already is an array, **append**. `-` is **not** a sibling separator.",
        ">tags-\n:a\n:b",
      );
    case "path-separator":
      return md(
        zh,
        "`>` 路径分段",
        "`>` path separator",
        zh
          ? "路径段之间用 `>` 连接（如 `=data>cor`、`@a>b`）。这不是「再写一个进入算子」。"
          : "Path segments are joined with `>` (e.g. `=data>cor`, `@a>b`). This is not another enter operator.",
      );
    case "label-gap":
      return md(
        zh,
        "Label 里的空白",
        "Whitespace in a Label",
        zh
          ? "Label 禁止空格。具名数组是 `>name-`，`-` 必须紧贴名字。"
          : "Labels cannot contain spaces. A named array is `>name-`; the `-` must touch the name.",
      );
    case "path-segment":
      return pathSegmentMarkdown(token, zh);
    case "content-key":
      return md(
        zh,
        "Content 键",
        "Content key",
        zh
          ? "属性名。Content **只按第一个** `:` 分割；之后的 `:` 留在值里。"
          : "Property name. Content splits on the **first** `:` only; later `:` stay in the value.",
      );
    case "content-colon":
      return md(
        zh,
        "`:` Content 分隔",
        "`:` Content separator",
        zh
          ? "键/值分隔。空键（行首 `:`）是匿名标量。`:` 后紧跟空格则 **forced-string**（强制字符串）。"
          : "Key/value split. An empty key (leading `:`) is an anonymous scalar. Spaces immediately after `:` are the **forced-string** marker.",
      );
    case "forced-string-mark":
      return valueMarkdown(token.data?.typed, zh, { marker: true });
    case "content-value":
      return valueMarkdown(token.data?.typed, zh, { empty: token.data?.empty });
    case "select-wildcard":
      return md(
        zh,
        "`*` 全选 / 谓词广播",
        "`*` all / predicate broadcast",
        zh
          ? "`?*` 进入数组每个元素（广播）。`?*k:v` 进入每个匹配的对象元素。空数组或零命中 → 语法错误。广播中途不能再写 `=` / `@` / `!` / `?`，先 `.`。"
          : "`?*` enters every array element (broadcast). `?*k:v` enters every matching object element. Empty array or zero hits → syntax error. While broadcasting, `=` / `@` / `!` / `?` are illegal until `.`.",
        "@orders\n?*status:pending",
      );
    case "select-index":
      return selectIndexMarkdown(token, zh);
    case "annotation-body":
      return md(
        zh,
        "自定义注解传递",
        "Custom annotation transmission",
        zh
          ? "协议**不解释** `#` 之后的文本；无 Cursor / 树副作用。官方名称不是「注释原语」。`#!…` 在 SDK 里可作 Control Root 分流，线文法仍按整行 `#` 处理。"
          : "The protocol does **not** interpret text after `#`; no Cursor / tree effect. Official name is not a “comment primitive”. `#!…` may be SDK Control Root demux; the wire still treats the whole line as `#`.",
      );
    case "invalid": {
      const issues = inspectLine(token.view.raw);
      if (issues.length) return issueMarkdown(issues[0], zh);
      return invalidMarkdown(token.view, zh);
    }
    default:
      return operatorMarkdown(token.view, zh);
  }
}

function operatorMarkdown(view, zh) {
  const k = view.kind;
  if (k === "object_anon") {
    return md(
      zh,
      "`>` 匿名对象",
      "`>` anonymous object",
      zh
        ? "按 Cursor：**开匿名根** / 在数组里**新建元素并进入** / 已在对象上则**再进入**（修改）。这是创建匿名对象的**唯一**方式。`>name` 不会隐含外层匿名包裹。"
        : "By Cursor: **open anonymous root** / **new array element and enter** / **re-enter** the current object (modify). This is the **only** way to create an anonymous object. `>name` does not imply an outer wrap.",
      ">\nx:1",
      zh ? "禁止 `>>x` 叠写。" : "`>>x` stacking is forbidden.",
    );
  }
  if (k === "object_named") {
    return md(
      zh,
      "`>name` 具名对象",
      "`>name` named object",
      zh
        ? "在当前 Cursor 创建或进入具名子对象。单独 `>a` 得到该层 `{ \"a\": {} }`，**不会**先包一层匿名对象。"
        : "Create or enter a named child at the current Cursor. `>a` alone is `{ \"a\": {} }` at that level — **no** implied anonymous wrapper.",
      ">meta\nname:demo",
    );
  }
  if (k === "array_named") {
    return md(
      zh,
      "`>name-` 具名数组",
      "`>name-` named array",
      zh
        ? "创建或再进入具名数组。若该键已是数组，后续元素**追加**（跨 `.` 相位同样增长）。"
        : "Create or re-enter a named array. If the key already holds an array, later elements **append** (including across `.` phases).",
      ">tags-\n:a\n:b",
    );
  }
  if (k === "array_anon") {
    return md(
      zh,
      "`-` 匿名数组",
      "`-` anonymous array",
      zh
        ? "创建/进入匿名数组。文档根若是数组**必须**先写 `-`。在数组里再写 `-` 会作为下一个元素打开嵌套数组。不要用 `-` 分隔兄弟元素。"
        : "Create/enter an anonymous array. An array **document root** MUST open with `-`. Another `-` inside an array opens a nested array as the next element. Do not use `-` between siblings.",
      "-\n:a\n:b",
    );
  }
  if (k === "pop") {
    return md(
      zh,
      "`<` 上浮一层",
      "`<` pop one level",
      zh
        ? "只回到父级，不创建。**Root 上的 `<` 是语法错误**。从数组元素回到数组后再写下一个兄弟。"
        : "Move Cursor to the parent; do not create. **`<` at Root is a syntax error**. After leaving an array element, write the next sibling at array level.",
      ">\n>a\nx:1\n<",
    );
  }
  if (k === "pop_enter") {
    return md(
      zh,
      "`<name` 上浮再进入",
      "`<name` pop then enter",
      zh
        ? "先上浮一层，再在父级创建/进入 `name`。等价于 `<` 然后 `>name`，但只占一行。"
        : "Pop one level, then create/enter `name` at the parent. Same as `<` then `>name`, in one line.",
      ">\n>a\n<b",
    );
  }
  if (k === "phase") {
    return md(
      zh,
      "`.` 相位 / 重置 Cursor",
      "`.` phase / reset Cursor",
      zh
        ? "把 Cursor 重置到 Root，并退出广播。`.` 界定流式相位。深度不确定时先 `.` 再用 `=` / `@` / `>` 从 Root 定位，不要靠连写 `<` 猜层级。"
        : "Reset Cursor to Root and exit broadcast. `.` bounds stream phases. When depth is uncertain, emit `.` then relocate with `=` / `@` / `>` from Root — do not guess with extra `<`.",
      ">\nid:1\n.\n>\nid:2",
    );
  }
  if (k === "locate") {
    return md(
      zh,
      "`=path` 模糊定位",
      "`=path` fuzzy locate",
      zh
        ? "在**已建成的整棵树**里模糊匹配路径（段用 `>`），取**首次**命中并移动单一 Cursor。**不创建**。零命中 → 语法错误。不能在广播中使用。"
        : "Fuzzy-match `path` (segments via `>`) in the **tree built so far**; take the **first** hit; move the single Cursor. **Does not create**. Zero hits → syntax error. Illegal while broadcasting.",
      "=data>cor",
    );
  }
  if (k === "exact") {
    return md(
      zh,
      "`@path` 精确路径",
      "`@path` exact path",
      zh
        ? "从 Root **精确**走 `>` 分段；缺段则**创建**空对象并进入。不进入广播。与 `=` / `!` 不同：缺失路径会在当前写入中补上。"
        : "Walk `path` **exactly** from Root (`>` segments); **create** missing object segments and enter. Does not enter broadcast. Unlike `=` / `!`, a missing path is filled in the current write.",
      "@a>b",
    );
  }
  if (k === "broadcast") {
    return md(
      zh,
      "`!path` 广播",
      "`!path` broadcast",
      zh
        ? "把后续 Structure / Content 应用到所有完整路径片段命中。零命中 → 语法错误。广播中 `=` / `@` / `!` / `?` 非法；`.` 退出。`&path` 在广播中允许（相对各 Cursor）。"
        : "Apply later Structure / Content to every complete path-fragment match. Zero hits → syntax error. `=` / `@` / `!` / `?` are illegal while broadcasting; `.` exits. `&path` is allowed (relative to each Cursor).",
      "!t\nz:9",
    );
  }
  if (k === "delete") {
    if (view.raw === "&") {
      return md(
        zh,
        "`&` 删除当前数组元素",
        "`&` delete current array element",
        zh
          ? "仅当 Cursor 在**直接数组元素**上：删掉该元素并落到父数组。否则裸 `&` 是语法错误。广播 `?*` 时删除所选元素并退出广播。"
          : "Only when Cursor is a **direct array element**: splice it out and land on the parent array. Otherwise bare `&` is a syntax error. Under `?*` broadcast, deletes the selected elements and exits broadcast.",
        "@orders\n?id:A1\n&",
      );
    }
    return md(
      zh,
      "`&path` 删除键",
      "`&path` delete key",
      zh
        ? "删除路径最深键。单 Cursor 时路径**自 Root 绝对**，**不移动** Cursor。缺目标静默 no-op。不能删文档根；删到 Cursor 链上的节点 → 语法错误。需要对象文档根。"
        : "Delete the deepest key on `path`. Single Cursor: path is **absolute from Root**; **do not** move Cursor. Missing target = silent no-op. Cannot delete the document root; deleting a node on the Cursor chain → syntax error. Object document root only.",
      "&a>b",
    );
  }
  if (k === "select") {
    return md(
      zh,
      "`?selector` 数组选元素",
      "`?selector` array element select",
      zh
        ? "Cursor **必须已在数组层**。不创建。零命中 → 语法错误。`?2` 0 基下标（禁止前导零）；`?id:A2` 首个键匹配；`?*` / `?*k:v` 进入广播。谓词值按 Content 分型。"
        : "Cursor **MUST already be at array level**. Does not create. Zero hits → syntax error. `?2` 0-based index (no leading zeros); `?id:A2` first key match; `?*` / `?*k:v` start broadcast. Predicate payloads use Content typing.",
      "@orders\n?id:A2",
    );
  }
  if (k === "annotation") {
    return md(
      zh,
      "`#` 自定义注解传递",
      "`#` custom annotation transmission",
      zh
        ? "独立整行，且 `#` 必须是该逻辑行的**首字符**（前导空白就不是这条原语）。协议不解释其后文本；不移动 Cursor、不改树。不是行尾注释。"
        : "A standalone line whose **first** character is `#` (leading whitespace means it is not this primitive). The protocol ignores the rest; no Cursor / tree effect. Not an end-of-line comment.",
      "# note",
      view.raw.startsWith("#!")
        ? zh
          ? "`#!` 在 SDK Control Root 中会分流；线文法仍按整行 `#` 处理。"
          : "`#!` may be SDK Control Root demux; the wire still treats the whole line as `#`."
        : undefined,
    );
  }
  return invalidMarkdown(view, zh);
}

function pathSegmentMarkdown(token, zh) {
  const label = token.data?.text ?? "";
  const k = token.view.kind;
  const where =
    k === "object_named" || k === "array_named" || k === "pop_enter"
      ? zh
        ? "这是 Label 名。"
        : "This is a Label name."
      : zh
        ? "这是路径段。"
        : "This is a path segment.";
  return md(
    zh,
    label ? `\`${label}\`` : zh ? "路径段" : "Path segment",
    label ? `\`${label}\`` : "Path segment",
    where,
  );
}

function selectIndexMarkdown(token, zh) {
  const n = token.data?.text ?? "";
  if (token.data?.illegal) {
    return md(
      zh,
      zh ? `下标 \`?${n}\` 非法` : `Illegal index \`?${n}\``,
      zh ? `下标 \`?${n}\` 非法` : `Illegal index \`?${n}\``,
      zh
        ? "数组下标只能是无前导零的十进制（`?0` 合法，`?01` 非法）。"
        : "Array index is decimal digits with no leading zeros (`?0` is legal; `?01` is not).",
    );
  }
  return md(
    zh,
    zh ? `数组下标 \`${n}\`（0 基）` : `Array index \`${n}\` (0-based)`,
    zh ? `数组下标 \`${n}\`（0 基）` : `Array index \`${n}\` (0-based)`,
    zh
      ? "从当前数组 Cursor 进入该下标的已有元素。越界 → 语法错误。不创建。"
      : "From an array Cursor, enter the existing element at this index. Out of range → syntax error. Does not create.",
  );
}

function valueMarkdown(typed, zh, opts = {}) {
  if (!typed) return null;
  if (typed.type === "error") {
    return md(
      zh,
      zh ? "Content 转义错误" : "Content escape error",
      zh ? "Content 转义错误" : "Content escape error",
      `\`${typed.error}\`\n\n${
        zh
          ? "允许的转义只有 `\\\\` `\\n` `\\r`。未知 `\\x` 或末尾单独 `\\` 是语法错误。"
          : "The escape alphabet is only `\\\\` `\\n` `\\r`. Unknown `\\x` or a trailing `\\` is a syntax error."
      }`,
    );
  }
  const typeLabel = typeTitle(typed, zh);
  const bits = [];
  if (opts.marker) {
    bits.push(
      zh
        ? "`:` 后的空格是 **forced-string** 标记，不是 payload。整段值按 **string** 收。"
        : "Spaces immediately after `:` are the **forced-string** marker, not payload. The value types as **string**.",
    );
  } else if (typed.forced) {
    bits.push(
      zh
        ? "forced-string：`:` 后有空格，跳过 int / float / bool / null 规则。"
        : "forced-string: spaces after `:` skip int / float / bool / null rules.",
    );
  } else {
    bits.push(
      zh
        ? "分型顺序：int → float（binary64）→ `true`/`false` → `null` → string。`NaN` / `Infinity` 仍是 string。"
        : "Typing order: int → float (binary64) → `true`/`false` → `null` → string. `NaN` / `Infinity` stay string.",
    );
  }
  if (opts.empty) {
    bits.push(zh ? "此值为空字符串。" : "This value is the empty string.");
  }
  bits.push("");
  bits.push(`- ${zh ? "线值" : "Wire"}: \`${fenceTick(typed.wire)}\``);
  bits.push(`- ${zh ? "类型化" : "Typed"}: \`${fenceTick(formatTyped(typed))}\``);
  return heading(typeLabel) + "\n\n" + bits.join("\n");
}

function typeTitle(typed, zh) {
  const name = typed.type;
  if (typed.forced) {
    return zh ? `类型：**string**（forced-string）` : `Type: **string** (forced-string)`;
  }
  return zh ? `类型：**${name}**` : `Type: **${name}**`;
}

function formatTyped(typed) {
  if (typed.type === "error") return typed.error;
  if (typed.type === "string") return JSON.stringify(typed.value);
  if (typed.type === "null") return "null";
  return JSON.stringify(typed.value);
}

function invalidMarkdown(view, zh) {
  const inv = view.invalid;
  if (inv === "empty") {
    return md(
      zh,
      zh ? "空行非法" : "Empty line is illegal",
      zh ? "空行非法" : "Empty line is illegal",
      zh
        ? "空 Content 行是语法错误。结构用 `>` / `<` / `.` 等算子，不要留空行。"
        : "An empty Content line is a syntax error. Use structure operators; do not leave blank lines.",
    );
  }
  if (inv === "leading-whitespace") {
    return md(
      zh,
      zh ? "前导空白非法" : "Leading whitespace is illegal",
      zh ? "前导空白非法" : "Leading whitespace is illegal",
      zh
        ? "逻辑行从首字符分类。前导空格/Tab 使 `#` 也不再是注解原语。"
        : "Lines are classified from the first character. Leading space/tab means `#` is not the annotation primitive.",
    );
  }
  if (inv === "stacked-enter") {
    return md(
      zh,
      zh ? "`>>` 叠写非法" : "`>>` stacking is illegal",
      zh ? "`>>` 叠写非法" : "`>>` stacking is illegal",
      zh
        ? "同一行不能叠两个 `>`。多层请分行写 `>` / `>name`，或用 `=path` / `@path`。"
        : "Do not stack `>` on one line. Descend with one `>` per line, or use `=path` / `@path`.",
    );
  }
  return md(
    zh,
    zh ? "裸 Label 非法" : "Bare Label is illegal",
    zh ? "裸 Label 非法" : "Bare Label is illegal",
    zh
      ? "只有名字的行（如 `data`）是语法错误。具名对象写成 `>data`。"
      : "A name-only line (e.g. `data`) is a syntax error. Write a named object as `>data`.",
  );
}

function md(zh, titleZh, titleEn, body, example, note) {
  const title = zh ? titleZh : titleEn;
  let out = heading(title) + "\n\n" + body;
  if (example) {
    out += "\n\n```xaiop\n" + example + "\n```";
  }
  if (note) out += "\n\n" + note;
  return out;
}

function heading(title) {
  return "### " + title;
}

function fenceTick(s) {
  return String(s).replace(/`/g, "'");
}

module.exports = {
  hoverMarkdown,
  tokenAt,
  typeValue,
};
