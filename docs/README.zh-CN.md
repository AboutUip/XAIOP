# XAIOP 文档

[English](README.md) · [简体中文](README.zh-CN.md)

三套**耦合但隔离**的文档树（见 **[SEPARATION.zh-CN.md](SEPARATION.zh-CN.md)**）。  
**立场：** 按行**游标 IR** → SDK 物化 / 相位；生成端写者（LLM 楔子）为有条件证据 — [overview/positioning.zh-CN.md](overview/positioning.zh-CN.md)。

| 树 | 路径 | 用途 |
| --- | --- | --- |
| **协议** | [protocol/](protocol/) | Frozen v0.4.0 线格式 — 仅游标 IR 文法与语义 |
| **实践** | [practice/](practice/) | 写者配方：**模型发射**、**流式传输**、会话 |
| **SDK** | [sdk/](sdk/) | 各语言运行时 API（物化 · encode · 流式 · WS） |

基础文档（约定、术语、需求、符合性）支撑协议包，仍在本 `docs/` 根下。

---

## 协议

入口：**[protocol/syntax.zh-CN.md](protocol/syntax.zh-CN.md)**  
索引：[protocol/README.zh-CN.md](protocol/README.zh-CN.md) · 线注意事项：[protocol/notes/](protocol/notes/)  
样例：[examples/](examples/)

---

## 实践

索引：[practice/README.zh-CN.md](practice/README.zh-CN.md)

| 指南 | 主题 |
| --- | --- |
| [practice/model-output.zh-CN.md](practice/model-output.zh-CN.md) | LLM / 生成端输出、Skill |
| [practice/streaming-transport.zh-CN.md](practice/streaming-transport.zh-CN.md) | 网络流式、分帧、产品侧 Snapshot/Diff |
| [practice/skeleton-stream.zh-CN.md](practice/skeleton-stream.zh-CN.md) | 固定键 WebSocket 推送（SDK `XaiopWs`） |

---

## SDK

索引：[sdk/README.zh-CN.md](sdk/README.zh-CN.md) · 对等：[sdk/behavioral-contract.zh-CN.md](sdk/behavioral-contract.zh-CN.md) · 注意事项：[sdk/notes/](sdk/notes/)

| 技术栈 | 文档 | 代码 |
| --- | --- | --- |
| **Node.js** | [sdk/nodejs/](sdk/nodejs/) | [../xaiop-sdk/nodejs/](../xaiop-sdk/nodejs/)（`xaiop` 0.6.0+） |
| Java | [sdk/java/](sdk/java/) | [../xaiop-sdk/java/](../xaiop-sdk/java/) — **待更新** |
| Python | [sdk/python/](sdk/python/) | [../xaiop-sdk/python/](../xaiop-sdk/python/) — **待更新** |

---

## 另见

[meta/](meta/) · [overview/](overview/)（[定位](overview/positioning.zh-CN.md) · [引言](overview/introduction.zh-CN.md) · [原则](overview/design-principles.zh-CN.md)）· [terminology/](terminology/) · [requirements/](requirements/) · [conformance/](conformance/) · [performance.zh-CN.md](performance.zh-CN.md) · [metrics/](metrics/)

---

## 语言配对

| 英文（默认） | 中文 |
| --- | --- |
| `path/name.md` | `path/name.zh-CN.md` |
