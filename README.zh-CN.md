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
  <a href="https://github.com/AboutUip/XAIOP"><img alt="协议" src="https://img.shields.io/badge/protocol-v0.6.0_Frozen-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="LICENSE"><img alt="许可证" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="游标 IR" src="https://img.shields.io/badge/wire-cursor--IR-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="流式相位" src="https://img.shields.io/badge/stream-phase--native-0ea5e9?style=flat-square&labelColor=0b1220" />
  <img alt="Node SDK" src="https://img.shields.io/badge/SDK-Node.js_0.14.0-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="按行" src="https://img.shields.io/badge/wire-line--oriented-94a3b8?style=flat-square&labelColor=0b1220" />
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
  <a href="docs/sdk/nodejs/API.zh-CN.md"><img alt="SDK 文档" src="https://img.shields.io/badge/docs-SDK-22c55e?style=flat-square&labelColor=0b1220" /></a>
</p>

---

<p align="center">
  任意符合规范的 <strong>Generator</strong> 发出进入 / 回退 / 定位 / 重置 / 删除指令。<br/>
  程序物化为 JSON —— 含中途 <code>.</code> 相位。<br/>
  <sub>不是服务间 JSON 总线。工具 · WS 会话 · encode 管线为<em>使用场景</em>，不是线定义。</sub>
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

[文法](docs/protocol/syntax.zh-CN.md) · [完整样例](docs/examples/complex.xaiop) · [Node 演示](demos/nodejs/)

---

### 路径

- **引言** — [docs/overview/introduction.zh-CN.md](docs/overview/introduction.zh-CN.md)
- **协议（仅线格式）** — [docs/protocol/](docs/protocol/) · [隔离说明](docs/SEPARATION.zh-CN.md) · [发布索引](docs/meta/releases.zh-CN.md) · [META-VER](docs/meta/status-and-versioning.zh-CN.md)
- **实践** — [docs/practice/](docs/practice/) · [流式传输](docs/practice/streaming-transport.zh-CN.md) · [骨架 WS](docs/practice/skeleton-stream.zh-CN.md)
- **Node.js SDK** — **[docs/sdk/nodejs/API.zh-CN.md](docs/sdk/nodejs/API.zh-CN.md)**（§6.4 行拦截 · §6.5 Annotation Span · §7.7 控制根） · [notes](docs/sdk/nodejs/notes/) · [`XaiopWs`](docs/sdk/nodejs/notes/ws-session.zh-CN.md) · [对等](docs/sdk/behavioral-contract.zh-CN.md) · [代码](xaiop-sdk/nodejs/) · [SDK 对比耗时](dev/sdk-timing/)
- **Java SDK** — [docs/sdk/java/](docs/sdk/java/) · [代码](xaiop-sdk/java/)
- **文档预览** — 与实验 UI 同站：`cd views && npm run dev` → [http://127.0.0.1:5173/docs/](http://127.0.0.1:5173/docs/)（Docsify 读 `docs/`；深色主题与 Lab 共用）
- **实验 UI** — [views/](views/) → [http://127.0.0.1:5173/](http://127.0.0.1:5173/) — playground / 直播流 / API 正文渲染
- **目标封存** — [docs/archive/](docs/archive/)（LLM 发射 / 评测口径刻意不放进现行枢纽）

Java SDK 已启用（`io.xaiop:xaiop` **0.5.0** — parse · encode · merge · checkpoint · **XaiopStream** HTTP/SSE/RAW；协议线仍 **0.4.0**；WS / cover / typeCheck 等后续）。Node.js `xaiop` **0.14.0** 实现协议 **0.6.0**。Python 仍待更新。英文文档为权威文本；仓库内配有 `*.zh-CN.md` 镜像。

**公告（2026-08-04）：** Skill **不再**以官方产品形态继续提供；源码仍可从 [`skills/`](skills/) 下载。完整说明：[docs/meta/release-notes-2026-08-04.zh-CN.md](docs/meta/release-notes-2026-08-04.zh-CN.md)。

---

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="Frozen" src="https://img.shields.io/badge/protocol-Frozen_v0.6.0-14b8a6?style=flat-square&labelColor=0b1220" />
  <a href="docs/meta/releases.zh-CN.md"><img alt="发布" src="https://img.shields.io/badge/docs-releases-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/"><img alt="文档" src="https://img.shields.io/badge/docs-%E7%B4%A2%E5%BC%95-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>
