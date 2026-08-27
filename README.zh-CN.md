# XAIOP

<p align="center">
  <img src="resources/xaiop-mark.svg" width="96" height="96" alt="XAIOP 标识" />
</p>

<p align="center">
  <strong>XAIOP</strong><br/>
  <sub>流式、按行<em>游标构造</em>线协议 · 程序确定性<em>物化</em>为 JSON。</sub><br/>
  <sub><em>遗留命名：</em>「eXtensible AI Output Protocol」——不构成范围或主用例定义。</sub>
</p>

<p align="center">
  <a href="https://github.com/AboutUip/XAIOP"><img alt="协议" src="https://img.shields.io/badge/protocol-v0.7.0_Draft-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="LICENSE"><img alt="许可证" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="游标 IR" src="https://img.shields.io/badge/wire-cursor--IR-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="流式相位" src="https://img.shields.io/badge/stream-phase--native-0ea5e9?style=flat-square&labelColor=0b1220" />
  <img alt="Node SDK" src="https://img.shields.io/badge/SDK-Node.js_0.16.0-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="Java SDK" src="https://img.shields.io/badge/SDK-Java_0.16.0-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="Python SDK" src="https://img.shields.io/badge/SDK-Python_0.16.0-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="Go SDK" src="https://img.shields.io/badge/SDK-Go_0.16.0-22c55e?style=flat-square&labelColor=0b1220" />
</p>

<p align="center">
  <sub>已封存协议版本<strong>不可变</strong> — <a href="docs/meta/releases.zh-CN.md">发布索引</a> · <a href="docs/meta/status-and-versioning.zh-CN.md">META-VER</a></sub>
</p>

<p align="center">
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/lang-English-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-0ea5e9?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/overview/introduction.zh-CN.md"><img alt="引言" src="https://img.shields.io/badge/docs-%E5%BC%95%E8%A8%80-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/protocol/syntax.zh-CN.md"><img alt="协议文档" src="https://img.shields.io/badge/docs-%E5%8D%8F%E8%AE%AE-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/practice/"><img alt="实践文档" src="https://img.shields.io/badge/docs-%E5%AE%9E%E8%B7%B5-f59e0b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/sdk/"><img alt="SDK 文档" src="https://img.shields.io/badge/docs-SDK-22c55e?style=flat-square&labelColor=0b1220" /></a>
</p>

---

<p align="center">
  任意符合规范的 <strong>Generator</strong> 发出进入 / 回退 / 定位 / 重置 / 删除指令。<br/>
  程序物化为 JSON —— 含中途 <code>.</code> 相位。<br/>
  <sub>不是服务间 JSON 总线 · 也不是通用 JSON 演化层（优先键控 / 具名路径 — <a href="docs/practice/keyed-state-modeling.zh-CN.md">键控建模</a>）。</sub><br/>
  <sub>工具 · WS 会话 · encode 管线为<em>使用场景</em>，不是线定义。</sub>
</p>

---

### 一次性完整结构的问题

传统 JSON/XML 要求写者一次性吐出全局正确的整树——括号配对与深度记账。对长输出或增量输出，这是**记忆**考验。

XAIOP 要求写一串**游标构造**步骤，由 SDK **物化**为 JSON。结构按行；位置是游标；`.` 界定流式相位。默认**不静默修复**。

写者是任意符合规范的 Generator——程序、`encode` 工具链、骨架 WebSocket 推送。

→ [引言](docs/overview/introduction.zh-CN.md) · [设计原则](docs/overview/design-principles.zh-CN.md) · [隔离说明](docs/SEPARATION.zh-CN.md)

---

### 线上长这样

```text
>
>meta
name:demo
version:1
.
>tags-
:alpha
:beta
.
>users-
>
id:1
name:alice
<
```

物化为：

```json
{
  "meta": { "name": "demo", "version": 1 },
  "tags": ["alpha", "beta"],
  "users": [{ "id": 1, "name": "alice" }]
}
```

[文法](docs/protocol/syntax.zh-CN.md) · [完整样例](docs/examples/complex.xaiop) · [Node 演示](demos/nodejs/) · [Python 演示](demos/python/)

---

### 路径

- **引言** — [docs/overview/introduction.zh-CN.md](docs/overview/introduction.zh-CN.md)
- **协议（仅线格式）** — [docs/protocol/](docs/protocol/) · [隔离说明](docs/SEPARATION.zh-CN.md) · [发布索引](docs/meta/releases.zh-CN.md) · [META-VER](docs/meta/status-and-versioning.zh-CN.md)
- **实践** — [docs/practice/](docs/practice/) · [流式传输](docs/practice/streaming-transport.zh-CN.md) · [骨架 WS](docs/practice/skeleton-stream.zh-CN.md)
- **SDK** — [docs/sdk/](docs/sdk/) · [对等契约](docs/sdk/behavioral-contract.zh-CN.md) · [代码](xaiop-sdk/) · [阶段计时](xaiop-sdk/timing/)
  - **Node.js** `xaiop` **0.16.0** — **[API](docs/sdk/nodejs/API.zh-CN.md)** · [notes](docs/sdk/nodejs/notes/) · [`XaiopWs`](docs/sdk/nodejs/notes/ws-session.zh-CN.md) · [代码](xaiop-sdk/nodejs/) · [演示](demos/nodejs/)
  - **Java** `io.github.aboutuip:xaiop` **0.16.0**（[Maven Central](https://central.sonatype.com/artifact/io.github.aboutuip/xaiop)）— [API](docs/sdk/java/) · [安装](docs/sdk/java/README.zh-CN.md#安装) · [ALIGNMENT](docs/sdk/java/ALIGNMENT.zh-CN.md) · [代码](xaiop-sdk/java/)
  - **Python** `xaiop` **0.16.0** — [API](docs/sdk/python/API.zh-CN.md) · [ALIGNMENT](docs/sdk/python/ALIGNMENT.zh-CN.md) · [代码](xaiop-sdk/python/) · [演示](demos/python/)
  - **Go** `github.com/AboutUip/XAIOP/xaiop-sdk/go` **0.16.0**（[pkg.go.dev](https://pkg.go.dev/github.com/AboutUip/XAIOP/xaiop-sdk/go@v0.16.0)）— [API](docs/sdk/go/API.zh-CN.md) · [安装](docs/sdk/go/README.zh-CN.md#安装) · [ALIGNMENT](docs/sdk/go/ALIGNMENT.zh-CN.md) · [代码](xaiop-sdk/go/) · [演示](demos/go/)
- **文档预览** — 与实验 UI 同站：`cd views && npm run dev` → [http://127.0.0.1:5173/docs/](http://127.0.0.1:5173/docs/)（Docsify 读 `docs/`；深色主题与 Lab 共用）
- **实验 UI** — [views/](views/) → [http://127.0.0.1:5173/](http://127.0.0.1:5173/) — playground / 直播流 / API 正文渲染
- **目标封存** — [docs/archive/](docs/archive/)（LLM 发射 / 评测口径刻意不放进现行枢纽）

官方产品 SDK（**Node · Java · Python · Go** `0.16.0`，协议 **0.7.0** Draft）：parse · stream · encode · merge · history · WS · 控制根 · typeCheck · 行拦截 / Annotation Span（Java/Python/Go 无 browser 包）。Node 为参考实现；Java/Python/Go 在可观察语义层面对齐。英文文档为权威文本；仓库内配有 `*.zh-CN.md` 镜像。对等：[java/ALIGNMENT](docs/sdk/java/ALIGNMENT.zh-CN.md) · [python/ALIGNMENT](docs/sdk/python/ALIGNMENT.zh-CN.md) · [go/ALIGNMENT](docs/sdk/go/ALIGNMENT.zh-CN.md)。

**公告（2026-08-04）：** Skill **不再**以官方产品形态继续提供；源码仍可从 [`skills/`](skills/) 下载，作为**保留的协议摘要**（已对齐 **0.6.0**；非封存发行物）。完整说明：[docs/meta/release-notes-2026-08-04.zh-CN.md](docs/meta/release-notes-2026-08-04.zh-CN.md)。

---

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="Frozen" src="https://img.shields.io/badge/protocol-Draft_v0.7.0-14b8a6?style=flat-square&labelColor=0b1220" />
  <a href="docs/meta/releases.zh-CN.md"><img alt="发布" src="https://img.shields.io/badge/docs-releases-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/"><img alt="文档" src="https://img.shields.io/badge/docs-%E7%B4%A2%E5%BC%95-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>
