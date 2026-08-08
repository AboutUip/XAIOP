# Skills（保留源码 · 协议摘要）

[English](README.md) · [简体中文](README.zh-CN.md)

> **公告（2026-08-04）：** Skill **不再**以官方产品形态继续提供。  
> 本目录源码仍保留，可从仓库**自行下载 / 复制**。  
> 详见：[../docs/meta/release-notes-2026-08-04.zh-CN.md](../docs/meta/release-notes-2026-08-04.zh-CN.md)。

| 路径 | 角色 |
| --- | --- |
| [xaiop/](xaiop/) | 保留的经典协议摘要（Generator 教学法） |
| [xaiop-allowlist/](xaiop-allowlist/) | 保留的白名单发射摘要（封闭世界 A1–A12） |

## 状态

| 项 | 值 |
| --- | --- |
| 产品 | **已停供**（不以产品面继续交付 / 支持 / 推荐） |
| 目录 | **保留实现** — 可下载的源码摘要 |
| 协议目标 | 封存包 **0.6.0** Frozen（摘要已对齐） |
| 权威文本 | 规范性线文仅以 [../docs/protocol/](../docs/protocol/) 为准 |
| 与 SDK | **无绑定** — Skill 不是 SDK 包版本 |

请优先使用程序化 Generator（`encode`、骨架 WS 推送、自写写者），而非 Skill 驱动发射。  
若需 LLM 发射实践配方，仅见封存档案：[../docs/archive/practice-llm-emit-2026-08-04/](../docs/archive/practice-llm-emit-2026-08-04/)。

## 协议 0.6.0 摘要要点

两份摘要均教授 Frozen **0.6.0** 行文法，含：

- Structure：`>` · `>name` · `>name-` · `-` · `<` · `<name` · `.` · `=path` · `@path` · `!path` · **`&path`**（删除）
- **`#…`** 自定义注解传递（整行；**不是**写在 Content 行尾的“注释”习惯）
- Content 分型 + forced-string · 完整根 vs fragment · 数组一行对象

权威表：[../docs/protocol/syntax.md](../docs/protocol/syntax.md) §3。
