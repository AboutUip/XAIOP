# XAIOP

<p align="center">
  <img src="resources/xaiop-mark.svg" width="96" height="96" alt="XAIOP 标识" />
</p>

<p align="center">
  <strong>eXtensible AI Output Protocol</strong><br/>
  <sub>模型按行书写，程序确定性解析。</sub>
</p>

<p align="center">
  <a href="https://github.com/AboutUip/XAIOP"><img alt="协议" src="https://img.shields.io/badge/protocol-v0.1.0_Frozen-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="LICENSE"><img alt="许可证" src="https://img.shields.io/badge/license-MIT-38bdf8?style=flat-square&labelColor=0b1220" /></a>
  <img alt="AI 原生" src="https://img.shields.io/badge/output-AI--native-f59e0b?style=flat-square&labelColor=0b1220" />
  <img alt="Node SDK" src="https://img.shields.io/badge/SDK-Node.js-22c55e?style=flat-square&labelColor=0b1220" />
  <img alt="按行" src="https://img.shields.io/badge/wire-line--oriented-94a3b8?style=flat-square&labelColor=0b1220" />
</p>

<p align="center">
  <a href="README.md"><img alt="English" src="https://img.shields.io/badge/lang-English-64748b?style=flat-square&labelColor=0b1220" /></a>
  <a href="README.zh-CN.md"><img alt="简体中文" src="https://img.shields.io/badge/lang-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-0ea5e9?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/protocol/syntax.zh-CN.md"><img alt="协议文档" src="https://img.shields.io/badge/docs-%E5%8D%8F%E8%AE%AE-14b8a6?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/sdk/nodejs/"><img alt="SDK 文档" src="https://img.shields.io/badge/docs-SDK-22c55e?style=flat-square&labelColor=0b1220" /></a>
  <a href="docs/performance.zh-CN.md"><img alt="评测" src="https://img.shields.io/badge/docs-%E8%AF%84%E6%B5%8B-f59e0b?style=flat-square&labelColor=0b1220" /></a>
</p>

---

<p align="center">
  <img alt="LLM" src="https://img.shields.io/badge/LLM-0b1220?style=for-the-badge&logoColor=white" />
  <img alt="到" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="XAIOP" src="https://img.shields.io/badge/XAIOP-14b8a6?style=for-the-badge&labelColor=0b1220" />
  <img alt="到" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="解析器" src="https://img.shields.io/badge/%E8%A7%A3%E6%9E%90%E5%99%A8-0ea5e9?style=for-the-badge&labelColor=0b1220" />
  <img alt="到" src="https://img.shields.io/badge/→-64748b?style=for-the-badge&labelColor=64748b&color=64748b" />
  <img alt="JSON · 业务" src="https://img.shields.io/badge/JSON%20·%20%E4%B8%9A%E5%8A%A1-22c55e?style=for-the-badge&labelColor=0b1220" />
</p>

<p align="center">
  不是服务间用来替代 JSON 的格式——而是从<em>生成</em>走到<em>软件</em>的桥。
</p>

---

### JSON 生成的问题

长流式输出要求括号、逗号与嵌套全程正确。一旦截断或嵌套加深，这份契约就会在最糟的时机失效。

### XAIOP 改了什么

结构是 **按行** 的。位置是 **游标**。没有括号配对，没有模型侧哈希；默认也 **不静默修复**。线上保持诚实。

→ [设计原则](docs/overview/design-principles.zh-CN.md) · [概览](docs/overview/introduction.zh-CN.md)

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

- **文法** — [docs/protocol/](docs/protocol/)
- **Node.js SDK** — [docs/sdk/nodejs/](docs/sdk/nodejs/) · [xaiop-sdk/nodejs/](xaiop-sdk/nodejs/)
- **教模型写** — [经典 Skill](skills/xaiop/SKILL.md) · [白名单 Skill](skills/xaiop-allowlist/SKILL.md)
- **评测脚本** — [dev/perf/](dev/perf/)
- **指标包** — [JSON](dev/bench-metrics-gpt-gemini-compat-2026-08-02.json) · [导读](dev/bench-metrics-gpt-gemini-compat-2026-08-02.md)

Java / Python SDK 待更新。英文文档为权威文本；仓库内配有 `*.zh-CN.md` 镜像。

---

### 证据

原生双通道 · 禁止 JSON→XAIOP 转写 · 结构成功率按非空补全统计  
口径：[docs/performance.zh-CN.md](docs/performance.zh-CN.md)

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
  <img alt="Frozen" src="https://img.shields.io/badge/protocol-Frozen_v0.1.0-14b8a6?style=flat-square&labelColor=0b1220" />
  <a href="docs/"><img alt="文档" src="https://img.shields.io/badge/docs-%E7%B4%A2%E5%BC%95-64748b?style=flat-square&labelColor=0b1220" /></a>
</p>
