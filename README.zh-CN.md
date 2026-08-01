# XAIOP

> **eXtensible AI Output Protocol** — LLM 与软件之间的结构化输出协议

[English](README.md) · [简体中文](README.zh-CN.md)

---

XAIOP 是一套 **AI 原生**线协议：模型负责写，程序确定性解析。它**不是**服务之间用来替代 JSON 的格式，而是从「生成」走到「你的应用」的那一层桥。

```text
LLM  →  XAIOP  →  SDK / 解析器  →  JSON 与业务
```

**协议 v0.1.0 已冻结（Frozen）。** Node.js SDK 可用；Java / Python 待更新。

---

## 从这里开始

| 我想… | 去这里 |
| --- | --- |
| 先搞清它是干什么的 | 下方 [为什么需要 XAIOP](#为什么需要-xaiop)，再看 [文档概览](docs/overview/introduction.zh-CN.md) |
| 读线格式 / 文法 | [docs/protocol/syntax.zh-CN.md](docs/protocol/syntax.zh-CN.md) |
| 接入 SDK | [docs/sdk/](docs/sdk/) · 代码 [xaiop-sdk/](xaiop-sdk/) |
| 让模型学会写出 XAIOP | [skills/xaiop/SKILL.md](skills/xaiop/SKILL.md) |
| 本地试一次解析 | [demos/nodejs/](demos/nodejs/) |
| 看完整样例 | [docs/examples/complex.xaiop](docs/examples/complex.xaiop) |

文档分为 **协议** 与 **SDK** 两套。英文为权威文本；仓库内配有 `*.zh-CN.md` 镜像。

---

## 为什么需要 XAIOP？

JSON 要求模型在长输出里持续维护括号、逗号与嵌套——在流式与长上下文下很脆。

XAIOP 换了一条路：**按行结构**、**游标导航**、**不用括号配对**、**不要求模型算哈希或长度**、**确定性解析且不静默修复**。

原则细节见 [设计原则](docs/overview/design-principles.zh-CN.md)——本页只做门面导览。

---

## 仓库导览

```text
docs/           协议 + SDK 文档
xaiop-sdk/      运行时（nodejs · java · python）
skills/         接入模型用的单 Skill
demos/          可运行示例
```

| 技术栈 | 状态 |
| --- | --- |
| **Node.js** | Parse + Engine API · [文档](docs/sdk/nodejs/) · [代码](xaiop-sdk/nodejs/) |
| Java | 待更新 |
| Python | 待更新 |

---

## 许可证

[MIT](LICENSE)
