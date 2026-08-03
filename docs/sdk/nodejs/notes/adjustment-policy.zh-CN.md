# Node.js 注意事项 — 慎重调整策略

[English](adjustment-policy.md) · [简体中文](adjustment-policy.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-ADJUST` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** |

---

## 1. 原则

**慎重**调整 Node SDK：优先加法 API 与传输 bugfix；不改 Frozen 线含义，不默默改默认行为。

| 宜 | 不宜 |
| --- | --- |
| 增加方法 / status 字段 | 默默翻转 Diff 边界默认 |
| 修传输解码 | 改 later-wins / 数组替换（协议） |
| 文档写明 Diff=`.` 相位 | 为迁就 SDK 改写 `PROT-STREAM` |
| 未来能力用 opt-in | 破坏 `getSnapshot()`「仅终态」语义 |

---

## 2. 状态板

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 终态流 ≡ 一次性 parse | **已关闭** | 一致性测试 |
| Diff=`.` 相位（默认） | **按设计** | 仅未来 opt-in Block Diff |
| `getCommittedSnapshot()` | **已做**（加法） | 中途累积 JSON |
| `getSnapshot()` 流中 | **不变** | 仍仅 finish 后 |
| RAW/WS 二进制 UTF-8 流式解码 | **已做** | 对齐 HTTP |
| 空相位 → `null` | **按设计** | 消费端须容忍 |
| 兼容 × 多相位 | **开放（低优）** | 默认保持关 |
| SSE 事件间自动补 `\n` | **暂缓** | 优先生成端约定 |
| Block 级 Diff 模式 | **暂缓** | 若做必 opt-in |
| 协议 later-wins / 数组替换 | **此处不可调** | [协议 notes](../../../protocol/notes/) |

---

## 3. 相关

- [streaming-parse.zh-CN.md](streaming-parse.zh-CN.md)  
- [../../notes/principles.zh-CN.md](../../notes/principles.zh-CN.md)  
- [../../../SEPARATION.zh-CN.md](../../../SEPARATION.zh-CN.md)
