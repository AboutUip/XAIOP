# XAIOP（VS Code / Cursor）

[English](README.md) · [简体中文](README.zh-CN.md)

XAIOP 线格式的语言识别、语法高亮、悬浮说明、linter、大纲/折叠、实时 JSON 查阅与 JSON→XAIOP 编码（协议 **0.7.0** Draft）。

悬浮是按行说明。Linter 跑捆绑的 Node parse 核心（SDK **0.16.0**）：语法错误 + JSON 物化。大纲/折叠跟进入/上浮行，不是第二套解析器。线定义仍以 [docs/protocol](../../docs/protocol/) 为准。

## 做什么

| 面 | 行为 |
| --- | --- |
| 文件识别 | `*.xaiop` → 语言 `xaiop` · MIME `text/x-xaiop` |
| 高亮 | 按行的 TextMate 文法，对齐 `classifyLine` |
| 悬浮 | 原生算子 → 用法；Content 值 → 分型结果；光标处的物化 JSON |
| Linter | 编辑时严格 parse；语法错误进 Problems；**根片段**（不能单独作为 JSON 文档）给警告；对物化值做 `JSON.stringify` |
| Quick Fix | 常见非法形式（`>name -`、`>>x`、裸 Label、空行、前导空白） |
| 大纲 / 折叠 | 具名 `>` / `>name-` 块；跳到匹配的 `<` |
| 补全 | 行首算子、代码片段（`root`、`obj`、`arr`、`elem`、`phase`） |
| 预览 | **实时查阅 JSON**（打开 .xaiop 时侧边打开；随光标高亮；解析失败保留上一份合法 JSON）· 无标题 JSON · 复制 |
| 编码 | **粘贴 JSON 为 XAIOP** · **把 JSON 编码为 XAIOP**（从 `.json` 编辑器）· 用 `>` 包根片段 |
| 跳转 | Label 上转到定义 / 重命名；状态栏显示 `{} > meta > author` |
| Inlay | Content 类型（int / float / bool / null / forced-string） |
| 状态栏 | 合法 JSON / 根片段 / 首个出错行（点击预览） |
| Markdown | 围栏代码块（语言标记 `xaiop`） |
| 编辑器默认 | 不修剪行尾空格（forced-string 标记）· LF · 关闭自动缩进 |

线上 `#` 的官方名称是 **自定义注解传递**。编辑器把它映射到注释作用域，便于主题变暗；**切换行注释**会插入 `#` 行。

## 安装（本仓库）

1. 打开文件夹 `plugins/vscode-xaiop`。
2. 按 **F5**（扩展宿主）— 会打开 `examples/highlight.xaiop`。
3. 或从 XAIOP 仓库根目录：

```text
cursor --extensionDevelopmentPath=plugins/vscode-xaiop docs/examples/complex.xaiop
```

（VS Code 把 `cursor` 换成 `code` 即可。）

若要打 VSIX 再安装：

```text
cd plugins/vscode-xaiop
npx --yes @vscode/vsce package
```

然后 **Extensions: Install from VSIX…**

## 文法

[syntaxes/xaiop.tmLanguage.json](syntaxes/xaiop.tmLanguage.json) 是本宿主的 TextMate 源。行顺序对齐 [syntax.md](../../docs/protocol/syntax.md) §3 / SDK `classifyLine`。

```text
cd plugins/vscode-xaiop
npm test
```

## 尚未包含

语言服务器、以及 SDK 兼容修复（除非打开 `xaiop.lint.compat`）。编码用捆绑的 Node 核心，不是运行时 npm 依赖。
