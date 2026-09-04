# XAIOP 文档

[English](README.md) · [简体中文](README.zh-CN.md)

**耦合但隔离**的三棵规范树枢纽 — 见 **[SEPARATION.zh-CN.md](SEPARATION.zh-CN.md)**（协议 · 实践 · SDK）。可选编辑器宿主在 [`../plugins/`](../plugins/)，**无规范效力**。  
**XAIOP 是什么：** [overview/introduction.zh-CN.md](overview/introduction.zh-CN.md)。  
**Frozen / 已封存** = 不可变协议包版本 — [meta/releases.zh-CN.md](meta/releases.zh-CN.md) · [meta/status-and-versioning.zh-CN.md](meta/status-and-versioning.zh-CN.md)（`META-VER`）。  
**现行 tip：** 官方产品 SDK **Node · Java · Python · Go** `0.16.0` ↔ 协议 **0.7.0** Draft（**本树**；登记处在上架前仍是 **0.15.1**）。Go 对等：[sdk/go/ALIGNMENT.zh-CN.md](sdk/go/ALIGNMENT.zh-CN.md)（产品黄金 **60** · core-wire **152**）。  
**Node npm：** 上次发布 [`@bylan280/xaiop@0.15.1`](https://www.npmjs.com/package/@bylan280/xaiop) — 本树 **0.16.0**。[release-notes-2026-08-27-sdk-0.16.0.zh-CN.md](meta/release-notes-2026-08-27-sdk-0.16.0.zh-CN.md) · [nodejs-npm 0.15.1](meta/release-notes-2026-08-09-nodejs-npm.zh-CN.md)。  
**Java Maven：** Central 上仍是 [`io.github.aboutuip:xaiop:0.15.1`](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop) — 本树 **0.16.0**。[安装](sdk/java/README.zh-CN.md#安装)。  
**Go 模块：** 上次标签 [`…/xaiop-sdk/go@v0.15.1`](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.15.1) — 本树 **0.16.0**。[安装](sdk/go/README.zh-CN.md#安装)。  
**SDK 阶段计时 / 极限性能（2026-08-09）：** [performance.zh-CN.md](performance.zh-CN.md) · [meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](meta/release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)。  
**先前发行说明：** [meta/release-notes-2026-08-27-sdk-0.16.0.zh-CN.md](meta/release-notes-2026-08-27-sdk-0.16.0.zh-CN.md)（SDK **0.16.0** 本树）· [meta/release-notes-2026-08-08-go-0.15.1.zh-CN.md](meta/release-notes-2026-08-08-go-0.15.1.zh-CN.md)（Go **0.15.1**）· [meta/release-notes-2026-08-08-python-0.15.1.zh-CN.md](meta/release-notes-2026-08-08-python-0.15.1.zh-CN.md)（Python **0.15.1**）· [meta/release-notes-2026-08-05-0.15.1.zh-CN.md](meta/release-notes-2026-08-05-0.15.1.zh-CN.md)（Node **0.15.1**）· [meta/release-notes-2026-08-05-0.15.0.zh-CN.md](meta/release-notes-2026-08-05-0.15.0.zh-CN.md)（Node **0.15.0**）· [meta/release-notes-2026-08-05-0.14.3.zh-CN.md](meta/release-notes-2026-08-05-0.14.3.zh-CN.md)（Node **0.14.3**）· [meta/release-notes-2026-08-05-0.14.2.zh-CN.md](meta/release-notes-2026-08-05-0.14.2.zh-CN.md)（Node **0.14.2**）· [meta/release-notes-2026-08-05-0.14.1.zh-CN.md](meta/release-notes-2026-08-05-0.14.1.zh-CN.md)（Node **0.14.1**）· [meta/release-notes-2026-08-05.zh-CN.md](meta/release-notes-2026-08-05.zh-CN.md)（Node **0.14.0** 控制根）· [meta/release-notes-2026-08-04.zh-CN.md](meta/release-notes-2026-08-04.zh-CN.md)（Node **0.13.0** · Java **0.5.0** · Skill 不再作为产品提供；源码仍在 [`../skills/`](../skills/)）。

**在线浏览：** `cd views && npm run dev` → [http://127.0.0.1:5173/docs/](http://127.0.0.1:5173/docs/)（[Docsify](https://docsify.js.org) 直接读本树，与 Lab 同端口）。侧栏：`python docs/archive/gen-sidebar.py`。

```text
协议 (protocol)  →  practice  →  sdk  →  meta
                     ↘ archive（目标封存，非现行主路径）

plugins/  （可选宿主；不在本权威链上 — 见 SEPARATION §0）
```

| 层 | 路径 | 职责 |
| --- | --- | --- |
| **协议** | [protocol/](protocol/) | 已封存流式行线文（Cursor IR） |
| **实践** | [practice/](practice/) | 现行使用场景（传输、会话） |
| **SDK** | [sdk/](sdk/) | 各语言 API |
| **元** | [meta/](meta/) | 发行、封存规则、修订 |
| **封存** | [archive/](archive/) | 目标封存快照（非现行枢纽） |
| **插件** *（非规范）* | [../plugins/](../plugins/) | 可选编辑器宿主 — **不是**线定义 |

---

## 协议

入口：**[protocol/syntax.zh-CN.md](protocol/syntax.zh-CN.md)**  
索引：[protocol/README.zh-CN.md](protocol/README.zh-CN.md) · 线文注意事项：[protocol/notes/](protocol/notes/)  
样例：[examples/](examples/)

---

## 实践

索引：[practice/README.zh-CN.md](practice/README.zh-CN.md)

| 指南 | 主题 |
| --- | --- |
| [practice/streaming-transport.zh-CN.md](practice/streaming-transport.zh-CN.md) | 网络流式、分帧、产品 Snapshot/Diff |
| [practice/skeleton-stream.zh-CN.md](practice/skeleton-stream.zh-CN.md) | 固定键 WebSocket 推送（SDK `XaiopWs`） |
| [practice/keyed-state-modeling.zh-CN.md](practice/keyed-state-modeling.zh-CN.md) | 键控映射 / 重复具名用于定位·广播·删除 |

LLM 发射 / 评测口径已迁入目标封存：[archive/practice-llm-emit-2026-08-04/](archive/practice-llm-emit-2026-08-04/)（占位仍保留在 [practice/model-output.zh-CN.md](practice/model-output.zh-CN.md) · [performance.zh-CN.md](performance.zh-CN.md)）。

---

## SDK

索引：[sdk/README.zh-CN.md](sdk/README.zh-CN.md) · 目录：[sdk/behavioral-contract.zh-CN.md](sdk/behavioral-contract.zh-CN.md) · 注意事项：[sdk/notes/](sdk/notes/)

| 技术栈 | 文档 | 代码 |
| --- | --- | --- |
| **Node.js** | **[sdk/nodejs/API.zh-CN.md](sdk/nodejs/API.zh-CN.md)**（主入口 · §6.4 行拦截 · §6.5 Annotation Span · §7.7 控制根；Node ≥ 18；浏览器相位消费用 `@bylan280/xaiop/browser`） · [sdk/nodejs/](sdk/nodejs/) | [../xaiop-sdk/nodejs/](../xaiop-sdk/nodejs/) — npm **`@bylan280/xaiop`** **0.16.0** ↔ 协议 **0.7.0** Draft |
| Java | [sdk/java/](sdk/java/) · **[ALIGNMENT](sdk/java/ALIGNMENT.zh-CN.md)** · [安装](sdk/java/README.zh-CN.md#安装) | [../xaiop-sdk/java/](../xaiop-sdk/java/) — Maven Central **`io.github.aboutuip:xaiop`** **0.16.0** — 协议 **0.7.0** Draft |
| Python | [sdk/python/](sdk/python/) · **[ALIGNMENT](sdk/python/ALIGNMENT.zh-CN.md)** | [../xaiop-sdk/python/](../xaiop-sdk/python/) — `xaiop` **0.16.0** — 协议 **0.7.0** Draft |
| Go | [sdk/go/](sdk/go/) · **[ALIGNMENT](sdk/go/ALIGNMENT.zh-CN.md)** · [安装](sdk/go/README.zh-CN.md#安装) | [../xaiop-sdk/go/](../xaiop-sdk/go/) — `github.com/AboutUip/XAIOP/xaiop-sdk/go` **0.16.0** — 协议 **0.7.0** Draft |

---

## 其它

[meta/](meta/) · [overview/](overview/) · [terminology/](terminology/) · [requirements/](requirements/) · [conformance/](conformance/) · [archive/](archive/) · [metrics/](metrics/)（数据快照；评测口径见封存包）

**本地预览整棵 `docs/`：** `cd views && npm run dev` → http://127.0.0.1:5173/docs/（Docsify；改 md 刷新即可）。

---

## 语言配对

| 英文（默认） | 中文 |
| --- | --- |
| `path/name.md` | `path/name.zh-CN.md` |
