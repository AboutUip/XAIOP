# XAIOP

<p align="center">
  <img src="resources/xaiop-mark.svg" width="96" height="96" alt="XAIOP 标识" />
</p>

<p align="center">
  <strong>eXtensible AI Output Protocol</strong><br/>
  <sub>按行<em>游标构造</em> · 程序确定性<em>物化</em>为 JSON。</sub>
</p>

<p align="center">
  <a href="https://github.com/AboutUip/XAIOP"><img alt="协议" src="https://img.shields.io/badge/protocol-v0.4.0_Frozen-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="LICENSE"><img alt="许可证" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="游标 IR" src="https://img.shields.io/badge/wire-cursor--IR-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="流式相位" src="https://img.shields.io/badge/stream-phase--native-0ea5e9?style=flat-square&labelColor=0b1220" />
  <img alt="Node SDK" src="https://img.shields.io/badge/SDK-Node.js-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="按行" src="https://img.shields.io/badge/wire-line--oriented-94a3b8?style=flat-square&labelColor=0b1220" />
</p>

<p align="center">
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/lang-English-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-0ea5e9?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/overview/positioning.zh-CN.md"><img alt="定位" src="https://img.shields.io/badge/docs-%E5%AE%9A%E4%BD%8D-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/protocol/syntax.zh-CN.md"><img alt="协议文档" src="https://img.shields.io/badge/docs-%E5%8D%8F%E8%AE%AE-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/practice/"><img alt="实践文档" src="https://img.shields.io/badge/docs-%E5%AE%9E%E8%B7%B5-f59e0b?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/sdk/nodejs/"><img alt="SDK 文档" src="https://img.shields.io/badge/docs-SDK-22c55e?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/performance.zh-CN.md"><img alt="评测" src="https://img.shields.io/badge/docs-%E8%AF%84%E6%B5%8B-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>

---

<p align="center">
  <img alt="写者" src="https://img.shields.io/badge/Writer-0b1220?style=for-the-badge&logoColor=white" />
  <img alt="到" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="XAIOP" src="https://img.shields.io/badge/XAIOP-14b8a6?style=for-the-badge&labelColor=0b1220" />
  <img alt="到" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="SDK" src="https://img.shields.io/badge/SDK%20·%20%E8%A7%A3%E6%9E%90-0ea5e9?style=for-the-badge&labelColor=0b1220" />
  <img alt="到" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="JSON" src="https://img.shields.io/badge/JSON%20·%20Snapshot-22c55e?style=for-the-badge&labelColor=0b1220" />
</p>

<p align="center">
  写者发出进入 / 回退 / 定位 / 重置指令。<br/>
  程序物化为 JSON —— 含中途 <code>.</code> 相位。<br/>
  <sub>不是服务间 JSON 总线。LLM · 工具 · WS 会话都是写者。</sub>
</p>

---

### 一次性完整结构的问题

传统 JSON/XML 要求写者一次性吐出全局正确的整树——括号配对与深度记账。对长输出或增量输出，这是**记忆**考验。

XAIOP 要求写一串**游标构造**步骤，由 SDK **物化**为 JSON。结构按行；位置是游标；`.` 界定流式相位。默认**不静默修复**。

写者包括 LLM（首发楔子）、`encode` 工具链、骨架 WebSocket 推送——任何符合规范的指令源。

→ [定位说明](docs/overview/positioning.zh-CN.md) · [设计原则](docs/overview/design-principles.zh-CN.md) · [概览](docs/overview/introduction.zh-CN.md)

### 生成端楔子（有条件）

对 LLM，收益随模型自身 JSON 能力变化——不是「永远碾压 JSON」。那是**楔子证据**，不是全部产品主张。

→ [评测](docs/performance.zh-CN.md)

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

- **定位** — [docs/overview/positioning.zh-CN.md](docs/overview/positioning.zh-CN.md)（线 IR · 生成端楔子）
- **协议（仅线格式）** — [docs/protocol/](docs/protocol/) · [隔离说明](docs/SEPARATION.zh-CN.md)
- **实践** — [docs/practice/](docs/practice/) · [模型输出](docs/practice/model-output.zh-CN.md) · [流式传输](docs/practice/streaming-transport.zh-CN.md) · [骨架 WS](docs/practice/skeleton-stream.zh-CN.md)
- **Node.js SDK** — [docs/sdk/nodejs/](docs/sdk/nodejs/) · [流式](docs/sdk/nodejs/stream.zh-CN.md) · [encode](docs/sdk/nodejs/encode.zh-CN.md) · [合并](docs/sdk/nodejs/merge.zh-CN.md) · [`XaiopWs`](docs/sdk/nodejs/notes/ws-session.zh-CN.md) · [对等](docs/sdk/behavioral-contract.zh-CN.md) · [代码](xaiop-sdk/nodejs/) · [SDK 对比耗时：JSON/NDJSON/Patch/Protobuf/XAIOP](dev/sdk-timing/)
- **Java SDK** — [docs/sdk/java/](docs/sdk/java/) · [代码](xaiop-sdk/java/)
- **预览 UI** — [views/](views/)（`cd views && npm run dev`）
- **教写者** — [经典 Skill](skills/xaiop/SKILL.md) · [白名单 Skill](skills/xaiop-allowlist/SKILL.md) · [实践指南](docs/practice/model-output.zh-CN.md)
- **指标包** — [JSON](docs/metrics/bench-metrics-gpt-gemini-compat-2026-08-02.json) · [导读](docs/metrics/bench-metrics-gpt-gemini-compat-2026-08-02.md)

Java SDK 核心已启用（`io.xaiop:xaiop` 0.4.0 — parse · encode · merge · checkpoint；Stream/WS 后续）。Python 仍待更新。英文文档为权威文本；仓库内配有 `*.zh-CN.md` 镜像。

---

### 证据（LLM 楔子）

原生双通道 · 禁止 JSON→XAIOP 转写 · 结构成功率按非空补全统计  
**楔子证据——非唯一价值主张。** 口径：[docs/performance.zh-CN.md](docs/performance.zh-CN.md)

<p align="center">
  <img alt="GPT 经典 JSON" src="https://img.shields.io/badge/GPT%20%E7%BB%8F%E5%85%B8%20·%20JSON-86.1%25-ef4444?style=flat-square&labelColor=0b1220" />
  <img alt="GPT 经典 XAIOP" src="https://img.shields.io/badge/GPT%20%E7%BB%8F%E5%85%B8%20·%20XAIOP-94.4%25-14b8a6?style=flat-square&labelColor=0b1220" />
  <br/>
  <img alt="GPT 白名单 JSON" src="https://img.shields.io/badge/GPT%20%E7%99%BD%E5%90%8D%E5%8D%95%20·%20JSON-80.6%25-ef4444?style=flat-square&labelColor=0b1220" />
  <img alt="GPT 白名单 XAIOP" src="https://img.shields.io/badge/GPT%20%E7%99%BD%E5%90%8D%E5%8D%95%20·%20XAIOP-88.9%25-14b8a6?style=flat-square&labelColor=0b1220" />
  <br/>
  <img alt="Gemini 经典 JSON" src="https://img.shields.io/badge/Gemini%20%E7%BB%8F%E5%85%B8%20·%20JSON-91.7%25-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="Gemini 经典 XAIOP" src="https://img.shields.io/badge/Gemini%20%E7%BB%8F%E5%85%B8%20·%20XAIOP-97.2%25-14b8a6?style=flat-square&labelColor=0b1220" />
  <br/>
  <img alt="Gemini 白名单 JSON" src="https://img.shields.io/badge/Gemini%20%E7%99%BD%E5%90%8D%E5%8D%95%20·%20JSON-91.7%25-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="Gemini 白名单 XAIOP" src="https://img.shields.io/badge/Gemini%20%E7%99%BD%E5%90%8D%E5%8D%95%20·%20XAIOP-100%25-22c55e?style=flat-square&labelColor=0b1220" />
</p>

<p align="center">
  <img alt="DEEPWIDE JSON" src="https://img.shields.io/badge/DEEPWIDE%20·%20JSON-0%25-ef4444?style=for-the-badge&labelColor=0b1220" />
  <img alt="DEEPWIDE XAIOP" src="https://img.shields.io/badge/DEEPWIDE%20·%20XAIOP-100%25-22c55e?style=for-the-badge&labelColor=0b1220" />
  <br/>
  <sub>深树场景下，JSON 未闭合括号——四场皆然。</sub>
</p>

<table>
  <tr>
    <td width="50%" valign="top">
      <p align="center"><sub>GPT · 白名单 · 兼容模式</sub></p>
      <img src="resources/ChatGPT模型对于XAIOP兼容模式的白名单SKILL测试.png" alt="GPT 白名单兼容模式评测" />
    </td>
    <td width="50%" valign="top">
      <p align="center"><sub>GPT · 经典 · 兼容模式</sub></p>
      <img src="resources/ChatGPT模型对于XAIOP兼容模式的非白名单SKILL测试.png" alt="GPT 经典兼容模式评测" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <p align="center"><sub>Gemini · 白名单 · 兼容模式</sub></p>
      <img src="resources/Gemini模型对于XAIOP兼容模式的白名单SKILL测试.png" alt="Gemini 白名单兼容模式评测" />
    </td>
    <td width="50%" valign="top">
      <p align="center"><sub>Gemini · 经典 · 兼容模式</sub></p>
      <img src="resources/Gemini模型对于XAIOP兼容模式的非白名单SKILL测试.png" alt="Gemini 经典兼容模式评测" />
    </td>
  </tr>
</table>

<p align="center">
  <sub>更多截图（原生模式、DeepSeek）→ <a href="resources/">resources/</a></sub>
</p>

---

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="Frozen" src="https://img.shields.io/badge/protocol-Frozen_v0.4.0-14b8a6?style=flat-square&labelColor=0b1220" />
  <a href="docs/"><img alt="文档" src="https://img.shields.io/badge/docs-%E7%B4%A2%E5%BC%95-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>
