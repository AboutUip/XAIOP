# 发行说明 — 2026-08-04

[English](release-notes-2026-08-04.md) · [简体中文](release-notes-2026-08-04.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-REL-NOTES-2026-08-04` |
| 状态 | 信息性 |
| 日期 | 2026-08-04 |
| 规范性 | **否** — 产品公告；封存规则仍见 `META-VER` |

不可变包索引：[releases.zh-CN.md](releases.zh-CN.md)。

---

## 要点

| 包 | 版本 | 协议线 |
| --- | --- | --- |
| Node.js `xaiop` | **0.13.0** | **0.6.0** Frozen（已封存） |
| Java `io.xaiop:xaiop` | **0.5.0** | **0.4.0** Frozen（子集） |

产物由本仓库本地构建（`npm pack` / Maven JAR）。向公共注册表推送不在本说明范围内。

---

## 公告 — Skill 不再继续提供

**官方不再以产品形态提供 Skill。**

- 此后项目**不**再交付、支持或推荐 Skill 作为产品表面。
- 仓库内 [`skills/`](../../skills/)（`xaiop`、`xaiop-allowlist`）**源码仍保留**，任何人可从仓库**自行下载 / 拷贝**。
- 该目录**不是**封存发行物，**不**随 SDK 版本号发版。保留摘要随后已刷新为对齐协议 **0.6.0**（见 [`skills/README.zh-CN.md`](../../skills/README.zh-CN.md)）；权威仍以 [`docs/protocol/`](../protocol/) 为准。
- 优先使用程序化 Generator（`encode`、骨架 WS 推送、自有写者），而非依赖 Skill 驱动发射。LLM 发射配方仅留在封存归档：[../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/)。

状态页：[../../skills/README.zh-CN.md](../../skills/README.zh-CN.md)。

---

## Node.js SDK `0.13.0`

- 实现已封存协议 **0.6.0**（`#` 自定义注解）。
- Annotation Span（`onAnnotationSpan`）；处理区逃逸 typeCheck。
- 既有表面保留：stream / WS / history / cover / 行拦截 / `core` · `browser` · Node 入口。
- 指南：[../sdk/nodejs/API.zh-CN.md](../sdk/nodejs/API.zh-CN.md) · 代码：[../../xaiop-sdk/nodejs/](../../xaiop-sdk/nodejs/)
- 建议 Git 标签：`sdk-nodejs-v0.13.0`

**本地构建**

```bash
cd xaiop-sdk/nodejs
npm test
npm run pack    # → dist/xaiop-0.13.0.tgz
```

---

## Java SDK `0.5.0`

- 线格式仍为协议 **0.4.0** 子集（无 `&` / `#` / cover / WS）。
- 新增：**`XaiopStream` 消费端** — HTTP / SSE / RAW；状态机对齐 Node 消费端默认；流式 UTF-8 解码；SSE 多行 `data:` 拼接。
- 保留：parse · encode · merge · checkpoint。
- 指南：[../sdk/java/README.zh-CN.md](../sdk/java/README.zh-CN.md) · 代码：[../../xaiop-sdk/java/](../../xaiop-sdk/java/)
- 建议 Git 标签：`sdk-java-v0.5.0`

**本地构建**

```bash
cd xaiop-sdk/java
mvn test
mvn -DskipTests package   # → target/xaiop-0.5.0.jar
```

---

## 未变更项

- 协议包 **0.6.0** 仍为 Frozen，不可变。
- 既有封存协议 / SDK 包版本号不被改写（[releases.zh-CN.md](releases.zh-CN.md)）。
- Python SDK 仍待更新。

---

## 相关

- 封存规则：[status-and-versioning.zh-CN.md](status-and-versioning.zh-CN.md)
- 行为目录（Node 参考）：[../sdk/behavioral-contract.zh-CN.md](../sdk/behavioral-contract.zh-CN.md)
- 实践流式：[../practice/streaming-transport.zh-CN.md](../practice/streaming-transport.zh-CN.md)
