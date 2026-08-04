# 发行版

[English](releases.md) · [简体中文](releases.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `META-REL` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-05 |
| 规范性 | **否** — 发行索引；封存规则见 `META-VER` |
| 依赖 | `META-VER`, `META-REV` |

---

## 1. 用途

**不可变**协议包与 SDK 包发行索引（对齐 GitHub Releases 模型）。

- 已封存协议包版本在更新包封存后**不**被改写。  
- 已发布 SDK 包版本号**不**被原地篡改。  
- 规范性封存规则：[status-and-versioning.zh-CN.md](status-and-versioning.zh-CN.md)。

---

## 2. 协议包（已封存）

| 协议 | 状态 | 线要点 | Git 标签（建议） |
| --- | --- | --- | --- |
| `0.6.0` | Frozen | `#` 自定义注解传递；既有 `&` / `@` / `!` / `=` | `protocol-v0.6.0` |
| `0.5.0` | Frozen | `&path` 删除；既有 `@` / `!` / `=` | `protocol-v0.5.0` |
| `0.4.0` | Frozen | `@` 创建或进入；`!` 广播 | `protocol-v0.4.0` |
| `0.3.0` | Frozen | 具名数组再进入追加 | `protocol-v0.3.0` |

完整叙述史：[revisions.zh-CN.md](revisions.zh-CN.md)。

---

## 3. SDK 包（Node.js `xaiop`）

| SDK | 实现的协议 | Git 标签（建议） | 说明 |
| --- | --- | --- | --- |
| `0.14.1` | `0.6.0` | `sdk-nodejs-v0.14.1` | `#!xaiop/seq/v1` → `meta.logSeq`；pushJson / `ResumeWireLog.wiresAfter` 打戳；两套序号文档；仍协议 **0.6.0** |
| `0.14.0` | `0.6.0` | `sdk-nodejs-v0.14.0` | SDK 控制根 `#!` demux；session / seq / resume / ack / snapshot；Span 硬跳过 `#!`；仍实现协议 **0.6.0** |
| `0.13.0` | `0.6.0` | `sdk-nodejs-v0.13.0` | Annotation Span（`onAnnotationSpan`）；处理区逃逸 typeCheck；仍实现协议 **0.6.0** |
| `0.12.0` | `0.6.0` | `sdk-nodejs-v0.12.0` | 缓冲行拦截（`onLineIntercept`）；仍实现协议 **0.6.0** |
| `0.11.0` | `0.6.0` | `sdk-nodejs-v0.11.0` | 解析 `#` 自定义注解行；实现协议 **0.6.0** |
| `0.10.0` | `0.5.0` | `sdk-nodejs-v0.10.0` | 类型注册 / 冻结检查；WS `pushTypeConsistency` |
| `0.9.0` | `0.5.0` | `sdk-nodejs-v0.9.0` | TypeScript；`core` / `browser` / Node 入口；`&` + `cover` |
| `0.8.0` | `0.5.0` | `sdk-nodejs-v0.8.0` | `&` 解析；可选 `cover` Diff（JS 源） |
| `0.7.0` | 发布时声明的 `0.4.0` | `sdk-nodejs-v0.7.0` | 解析历史 |
| `0.6.0` | `0.4.0` | `sdk-nodejs-v0.6.0` | `@` / `!` 对齐 |

### SDK 包（Java `io.xaiop:xaiop`）

| SDK | 实现的协议 | 说明 |
| --- | --- | --- |
| `0.5.0` | `0.4.0` | `XaiopStream` 消费端（HTTP / SSE / RAW）；线格式仍为 **0.4.0** |
| `0.4.0` | `0.4.0` | parse · encode · merge · checkpoint |

其他语言：在各自 README 中声明封存映射。尚未实现协议 `0.5.0` 的语言 **必须** 继续引用其实际实现的协议版本（例如 Java 可仍引用 `0.4.0`）。

---

## 4. 发行说明与公告

| 日期 | 说明 |
| --- | --- |
| 2026-08-05 | [release-notes-2026-08-05-0.14.1.zh-CN.md](release-notes-2026-08-05-0.14.1.zh-CN.md) — Node `0.14.1` `meta.logSeq` / seq 打戳 |
| 2026-08-05 | [release-notes-2026-08-05.zh-CN.md](release-notes-2026-08-05.zh-CN.md) — Node `0.14.0` 控制根 `#!` / session / resume / ack / snapshot |
| 2026-08-04 | [release-notes-2026-08-04.zh-CN.md](release-notes-2026-08-04.zh-CN.md) — Node `0.13.0` · Java `0.5.0` · **Skill 不再继续提供**（源码仍在 [`skills/`](../../skills/)） |

---

## 5. 符合性引用

有效：「符合 XAIOP 协议包 **0.5.0**（Frozen / 已封存）。」  
无效：「符合最新 Frozen 的 XAIOP」（无版本号）。
