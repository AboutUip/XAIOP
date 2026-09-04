# 文档隔离

[English](SEPARATION.md) · [简体中文](SEPARATION.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-SEP` |
| 状态 | 信息性 |
| 最近更新 | 2026-09-04 |
| 规范性 | **否** — 文档架构 |

---

## 1. 四层，一条线

| 层 | 路径 | 负责 | 不负责 |
| --- | --- | --- | --- |
| **协议** | [protocol/](protocol/) | 已封存的**流式、按行、游标构造线格式**：Label / Block / 算子 / Content 类型化 / 流式有效性 / later-wins | Skill、提示词、LLM 评测叙事、HTTP/SSE/WS 配方、语言 API、静默修复策略、编辑器 UX |
| **实践** | [practice/](practice/) | 使用该线的**建议场景**（传输分帧、会话）。LLM 发射配方已迁入 [archive/](archive/) | 新线算子；把某语言方法名写成规范 |
| **SDK** | [sdk/](sdk/) + `xaiop-sdk/` | 各语言 parse / encode / stream **API**。**重心：Node.js**；其它语言为次要移植。可选：[sdk/behavioral-contract.zh-CN.md](sdk/behavioral-contract.zh-CN.md)（Node 产品选择目录，非跨语言强制） | 重定义 Label / later-wins / Block；发明线算子 |
| **插件** | [`../plugins/`](../plugins/) | 可选的**编辑器 / 宿主工具**（语言 id、高亮、悬浮、lint、实时 JSON 查阅、JSON→XAIOP 编码）。首个宿主：[vscode-xaiop](../plugins/vscode-xaiop/) | 线文法；发明算子；替代产品 SDK API |

```text
┌─────────────────────────────────────────────┐
│ 协议 — 已封存的流式行线（游标 IR）           │
└──────────────────────┬──────────────────────┘
                       │ 使能
┌──────────────────────▼──────────────────────┐
│ 实践 — 建议使用场景                         │
└──────────────────────┬──────────────────────┘
                       │ 由实现落地
┌──────────────────────▼──────────────────────┐
│ SDK — 物化 / encode / stream / WS           │
└──────────────────────┬──────────────────────┘
                       │ 可选地由宿主呈现
┌──────────────────────▼──────────────────────┐
│ 插件 — 编辑器识别 / UX                      │
└─────────────────────────────────────────────┘
```

**身份：** 协议是**数据组织线格式**，不是「AI 输出产品」。SDK 表面与传输会话是**应用层**；编辑器插件是**可选宿主**，只呈现同一条线，不重定义线。可选 LLM 发射指引已**目标封存**于 [archive/practice-llm-emit-2026-08-04/](archive/practice-llm-emit-2026-08-04/)，不构成线定义。

XAIOP 是什么：[overview/introduction.zh-CN.md](overview/introduction.zh-CN.md)。  
封存 / 发行规则：[meta/status-and-versioning.zh-CN.md](meta/status-and-versioning.zh-CN.md) · [meta/releases.zh-CN.md](meta/releases.zh-CN.md)。  
插件枢纽：[../plugins/README.zh-CN.md](../plugins/README.zh-CN.md)。

**Node SDK 人类文档：** 优先单一 **API 参考** — [sdk/nodejs/API.zh-CN.md](sdk/nodejs/API.zh-CN.md)。[sdk/nodejs/notes/](sdk/nodejs/notes/) 下为**实现深潜**，不是主 API 面。

---

## 2. Notes 放哪里

| 树 | 范围 |
| --- | --- |
| [protocol/notes/](protocol/notes/) | 仅与语言无关的线清单 |
| [practice/](practice/) | *如何使用*该线（传输、会话） |
| [archive/](archive/) | 目标封存（含历史 LLM 发射 / 评测口径） |
| [sdk/notes/](sdk/notes/) · [sdk/nodejs/notes/](sdk/nodejs/notes/) | 实现 Diff 边界、encode、慎重调整 — 深潜，不是 Node 主 API |
| [`../plugins/`](../plugins/) | 仅编辑器宿主 README / changelog — 线的呈现，不是协议 notes |

**规则：**

1. 协议文档 **禁止** 把 SDK 方法名（或编辑器命令）写成线要求。  
2. 实践文档 **禁止** 改变已封存线含义。  
3. SDK 文档 **禁止** 发明线算子。  
4. 插件 **禁止** 发明线算子，也 **禁止** 改写与所引协议 / SDK `classifyLine` 不一致的行分类。高亮是展示层尽力而为；宿主里的 lint / encode 可以捆绑 Node parse/encode 核心，但产品 SDK 仍是 API 面。  
5. 实践、SDK 或插件与**所引用的已封存协议包版本**冲突时，以该协议包为准。  
6. 线上 `#` 行的官方名称是 **自定义注解传递**。编辑器宿主可以把它映射到注释作用域 / 注释快捷键以便主题变暗；该映射只属于 UX。

---

## 3. 冲突

实践 / SDK / 插件 vs 已封存协议包 → **以所引用版本的协议包为准**。  
更粗的 Diff 交付策略属 SDK（实践可摘要）。兼容 / 静默修复 = **SDK 摄入**，不是线许可。编辑器 Quick Fix 与实时 JSON 查阅是**宿主辅助**，不是线规则。

---

## 4. 快捷入口

| 需求 | 去向 |
| --- | --- |
| 线是什么 | [overview/introduction.zh-CN.md](overview/introduction.zh-CN.md) |
| 封存 / 版本 | [meta/status-and-versioning.zh-CN.md](meta/status-and-versioning.zh-CN.md) · [meta/releases.zh-CN.md](meta/releases.zh-CN.md) |
| 文法 | [protocol/syntax.zh-CN.md](protocol/syntax.zh-CN.md) |
| 线坑点 | [protocol/notes/](protocol/notes/) |
| 传输配方 | [practice/streaming-transport.zh-CN.md](practice/streaming-transport.zh-CN.md) |
| 骨架 WS | [practice/skeleton-stream.zh-CN.md](practice/skeleton-stream.zh-CN.md) |
| LLM 发射 / 评测（封存） | [archive/practice-llm-emit-2026-08-04/](archive/practice-llm-emit-2026-08-04/) |
| Node SDK（主入口） | [sdk/nodejs/API.zh-CN.md](sdk/nodejs/API.zh-CN.md) |
| Node 产品选择目录（可选对照） | [sdk/behavioral-contract.zh-CN.md](sdk/behavioral-contract.zh-CN.md) |
| 编辑器插件 | [../plugins/README.zh-CN.md](../plugins/README.zh-CN.md) · [vscode-xaiop](../plugins/vscode-xaiop/) |
