# 插件

[English](README.md) · [简体中文](README.zh-CN.md)

面向 XAIOP 线格式的**可选编辑器 / 宿主工具**。

**本目录不定义协议。** 它不是封存包，不是第四棵规范文档树，也不是线含义的证据。隔离：[../docs/SEPARATION.zh-CN.md](../docs/SEPARATION.zh-CN.md) §0–§2。

| 路径 | 宿主 | 状态 | 表面（仅 UX） |
| --- | --- | --- | --- |
| [vscode-xaiop/](vscode-xaiop/) | VS Code · Cursor · VSCodium（VS Code 兼容） | **现行** | 语言 id · 高亮 · 悬浮 · lint UI · 实时 JSON 查阅 · encode UX |

## 状态

| 项 | 值 |
| --- | --- |
| 产品 | 可选编辑器宿主 |
| 协议目标（所引） | **0.7.0** Draft |
| 线权威 | 仅 [../docs/protocol/](../docs/protocol/) — 所引版本的已封存包胜出 |
| 与 SDK | 识别 / TextMate / 大纲：**无** live SDK。Lint + encode：与 SDK **0.16.0** 对齐的**钉死**捆绑 Node parse/encode 核心（不是运行时 npm 依赖） |
| `plugins/` 下的规范性文档 | **无** — 仅 README / changelog |

## 权威顺序（做宿主时）

1. 所引**已封存**协议包（论证封存版本时）。  
2. Draft 期间 tip [../docs/protocol/syntax.md](../docs/protocol/syntax.md) §3。  
3. 所引 SDK 版本的产品 `classifyLine` / `parseSync` / `encodeSync`（或本树对该核心的逐字 vendor 捆绑）。  
4. 宿主 UX（高亮、悬浮文案、Quick Fix、实时路径）— **最末**；与 1–3 冲突则 UX 错。

## 规则（必须）

1. **禁止** 发明线算子、Label / Content / 流式规则或 later-wins 例外。  
2. **禁止** 改写与 syntax §3 / SDK `classifyLine` 不一致的行分类。编辑器专属非法标记（`>>`、前导空白、空行）是坏线诊断，不是新原语。  
3. **禁止** 把 TextMate 作用域、大纲/折叠、转到定义、重命名、状态栏路径或实时查阅 JSON 路径当成 Cursor / 树语义。权威物化 = 仅完整 parse。  
4. **禁止** 默认用 SDK 兼容 / 静默修复做 lint。若暴露 compat，**必须**标明非严格。  
5. **禁止** 在协议评审中用插件 UI 当线证据。  
6. 线上 `#` 是 **自定义注解传递**。注释作用域映射只属于 UX。

文法（权威表）：[../docs/protocol/syntax.md](../docs/protocol/syntax.md) §3。  
冲突策略：[../docs/SEPARATION.zh-CN.md](../docs/SEPARATION.zh-CN.md) §3。
