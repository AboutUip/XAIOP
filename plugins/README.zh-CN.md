# 插件

[English](README.md) · [简体中文](README.zh-CN.md)

面向 XAIOP 线格式的编辑器 / 宿主工具。本目录**不**定义协议。

| 路径 | 宿主 | 状态 | 首要能力 |
| --- | --- | --- | --- |
| [vscode-xaiop/](vscode-xaiop/) | VS Code · Cursor · VSCodium（及其它 VS Code 兼容编辑器） | **现行** | 语言 id `xaiop` · 高亮 · 悬浮 · linter · 实时 JSON 查阅 · 编码 |

## 状态

| 项 | 值 |
| --- | --- |
| 产品 | 编辑器插件（可选宿主） |
| 协议目标 | **0.7.0** Draft |
| 权威文本 | 规范性线文仅以 [../docs/protocol/](../docs/protocol/) 为准 |
| 与 SDK | 识别 / 高亮：无绑定。Linter + 编码：捆绑 Node parse/encode 核心 **0.16.0**（不是运行时 npm 依赖） |

## 规则

1. 插件 **禁止** 发明线算子或改写行分类。
2. 高亮是**展示层尽力而为**。Linter 诊断与 JSON→XAIOP 编码来自捆绑的 Node parse/encode 核心；产品 SDK 仍是 API 面。
3. 线上 `#` 行的官方名称是 **自定义注解传递**。编辑器宿主可以把它映射到注释作用域 / 注释快捷键，以便主题把它变暗，并用「切换行注释」插入 `#` 行。

文法（权威表）：[../docs/protocol/syntax.md](../docs/protocol/syntax.md) §3。
