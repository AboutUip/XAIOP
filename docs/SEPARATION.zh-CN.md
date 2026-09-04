# 文档隔离

[English](SEPARATION.md) · [简体中文](SEPARATION.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-SEP` |
| 状态 | 信息性 |
| 最近更新 | 2026-09-04 |
| 规范性 | **否** — 文档架构（本仓库的隔离规则） |

---

## 0. 硬权威（先读）

本仓库是**协议仓库**。线含义**永远不能**从编辑器、演示、Skill 或「高亮器怎么画」反推。

| 优先级 | 来源 | 角色 |
| --- | --- | --- |
| **1** | **所引用版本**的已封存协议包（[meta/releases.zh-CN.md](meta/releases.zh-CN.md)） | **冲突时一律胜出** |
| **2** | [protocol/](protocol/) 下 tip Draft（仅在 Draft / 未封存期间） | 封存前的工作线文 |
| **3** | 产品 SDK 可观察语义（[sdk/](sdk/) · `xaiop-sdk/`） | 合规模序如何物化 / encode / 流式 |
| **4** | [practice/](practice/) | 建议用法；**对线含义无约束力** |
| **5** | [`../plugins/`](../plugins/) · demos · 实验 UI · skills 源码 | **仅呈现 / 工具** — **绝非**线含义证据 |

**推论：** 若插件、Quick Fix、实时 JSON 路径、TextMate 作用域、大纲折叠或 inlay 与所引协议包不一致，**错在宿主**。修宿主；**禁止**为迁就宿主而改线。

---

## 1. 三棵规范树 + 可选宿主

| 层 | 路径 | 负责 | 不负责 |
| --- | --- | --- | --- |
| **协议** | [protocol/](protocol/) | 已封存的**流式、按行、游标构造线格式**：Label / Block / 算子 / Content 类型化 / 流式有效性 / later-wins | Skill、提示词、LLM 评测、HTTP/SSE/WS 配方、语言 API、静默修复、**任何编辑器 UX** |
| **实践** | [practice/](practice/) | 使用该线的**建议场景**（传输分帧、会话）。LLM 发射 → [archive/](archive/) | 新算子；把某语言方法名写成规范 |
| **SDK** | [sdk/](sdk/) + `xaiop-sdk/` | 各语言 parse / encode / stream **API**。**重心：Node.js**；其它语言为次要移植。可选：[sdk/behavioral-contract.zh-CN.md](sdk/behavioral-contract.zh-CN.md) | 重定义 Label / later-wins / Block；发明算子 |
| **插件** *（可选，在 `docs/` 之外）* | [`../plugins/`](../plugins/) | 对**已定义线文**的编辑器 / 宿主**呈现**（id、高亮、悬浮、lint UI、实时查阅、encode UX）。首个宿主：[vscode-xaiop](../plugins/vscode-xaiop/) | 线文法；算子；Cursor 语义；封存包内容；替代产品 SDK |

```text
┌─────────────────────────────────────────────┐
│ 协议 — 已封存的流式行线（游标 IR）           │  ← 唯一规范性线文
└──────────────────────┬──────────────────────┘
                       │ 使能
┌──────────────────────▼──────────────────────┐
│ 实践 — 建议使用场景                         │  ← 对含义无约束力
└──────────────────────┬──────────────────────┘
                       │ 由实现落地
┌──────────────────────▼──────────────────────┐
│ SDK — 物化 / encode / stream / WS           │  ← 产品 API
└─────────────────────────────────────────────┘

        （正交；不在 docs 权威链上）
┌─────────────────────────────────────────────┐
│ plugins/ — 可选编辑器宿主（仅 UX）          │
└─────────────────────────────────────────────┘
```

插件**不是**第四棵规范树。它旁挂在仓库里，仅为方便维护，**零**封存权。

**身份：** 协议是**数据组织线格式**，不是「AI 输出产品」。SDK 表面与传输会话是**应用层**。编辑器插件是**可选宿主**，可以呈现同一条线，但 **禁止** 重定义线。可选 LLM 发射指引已**目标封存**于 [archive/practice-llm-emit-2026-08-04/](archive/practice-llm-emit-2026-08-04/)，不构成线定义。

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
| [`../plugins/`](../plugins/) | 仅宿主 README / changelog — **不是**协议 notes；**禁止**当作线权威引用 |

### 跨树规则

1. 协议文档 **禁止** 把 SDK 方法名或编辑器命令写成线要求。  
2. 实践文档 **禁止** 改变已封存线含义。  
3. SDK 文档 **禁止** 发明线算子。  
4. 实践或 SDK 与**所引用的已封存协议包版本**冲突时，以该协议包为准。  
5. 兼容 / 静默修复 = **SDK 摄入**，不是线许可。

### 插件 / 宿主隔离（严格）

[`../plugins/`](../plugins/) 下的宿主 **必须**遵守：

1. **禁止** 发明线算子、Label 规则、Content 分型、流式有效性或 later-wins 例外。  
2. **禁止** 改写与所引 [protocol/syntax.md](protocol/syntax.md) §3 表及所引 SDK 版本 `classifyLine` 不一致的行分类。编辑器专属标记（如 `>>` 叠写、前导空白）是**非法线的诊断**，不是新原语。  
3. **禁止** 把 TextMate 作用域、大纲/折叠结构、选区、转到定义、重命名、状态栏路径或实时查阅的 JSON 路径当成 Cursor / 树语义。那些面是**尽力而为的 UX**；权威物化只能是完整 parse（产品 SDK，或该 SDK parse/encode 核心的**逐字**捆绑）。  
4. **禁止** 把 Quick Fix、片段、补全或「用 `>` 包根片段」写成协议许可。它们只是把文本改向**本已合法**的线文。  
5. **禁止** 把 SDK 兼容 / 静默修复当作默认 lint 路径。若宿主暴露 compat，**必须**标明为**非严格 / 非线许可**。  
6. **禁止** 引入可在未显式升宿主版本与 changelog 的情况下静默漂移的 live npm 依赖。允许捆绑 parse/encode 核心，但只能是所引 SDK 的**钉死快照**；重新生成属于宿主发行事务，不是协议变更。  
7. **禁止** 在 `plugins/` 下放置规范性线表、封存公告或 META 文档。规范性文本只在 [protocol/](protocol/) / [meta/](meta/)。  
8. **禁止** 在协议评审中用插件行为（截图、Problems 文案、悬浮文案）当线含义证据。  
9. `#` 行在线上仍是 **自定义注解传递**。映射到编辑器「注释」作用域 / 切换行注释只属于 **UX**，**不**使 `#` 成为注释原语。

---

## 3. 冲突

| 冲突 | 胜出 |
| --- | --- |
| 实践 vs 已封存协议包 | **已封存协议包**（所引版本） |
| SDK vs 已封存协议包 | **已封存协议包** |
| 插件 / 演示 / 实验 UI vs 已封存协议包 | **已封存协议包** |
| 插件 vs tip Draft 协议文档 | **协议 tip 文档**（封存后改为封存包） |
| 插件 UX 路径 / 折叠 / 高亮 vs 同一缓冲的 SDK parse | **SDK parse**（或宿主对该 parse 的逐字捆绑） |
| 更粗的 Diff 交付 | SDK（实践可摘要） |
| 兼容 / 静默修复 | 仅 SDK 摄入 — **不是**线许可 |

编辑器 Quick Fix 与实时 JSON 查阅是**宿主辅助**，不是线规则。

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
| 编辑器宿主（非权威） | [../plugins/README.zh-CN.md](../plugins/README.zh-CN.md) · [vscode-xaiop](../plugins/vscode-xaiop/) |
