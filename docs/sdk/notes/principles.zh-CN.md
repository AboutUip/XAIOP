# SDK 注意事项 — 跨栈原则

[English](principles.md) · [简体中文](principles.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NOTE-PRIN` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-03 |
| 规范性 | **否** |

---

## 1. 隔离规则

1. **线含义**只来自 Frozen 协议（+ 协议 notes 清单）。  
2. **产品怎么做**（模型输出、网络流式）见 [../../practice/](../../practice/)。  
3. **API 形态**（方法名、Diff 边界、存储 id、传输辅助）写在 SDK 文档/notes。  
4. 兼容 / 恢复模式是 **SDK 摄入**特性，不由良构线暗示。  
5. Encode（JSON→XAIOP）是 SDK 工具；LLM 评测双通道方法论另见 [../../performance.zh-CN.md](../../performance.zh-CN.md)。

---

## 2. 记载 Snapshot / Diff 时

| SDK 若… | 则在 SDK notes 写明… |
| --- | --- |
| 每完成一个 **Block** 推 Diff | 与 `PROT-STREAM` §5 对齐 |
| 使用其他边界（如 `.` 相位） | 显式声明边界及其与 Block 的关系 |
| 仅在 EOF 暴露 Snapshot | 声明中途无渐进 Snapshot |

协议基线：[../../protocol/notes/streaming-attention.zh-CN.md](../../protocol/notes/streaming-attention.zh-CN.md)。  
产品分帧：[../../practice/streaming-transport.zh-CN.md](../../practice/streaming-transport.zh-CN.md)。

---

## 3. 通用消费建议

1. EOF 全文（或等价终态 Snapshot）是 later-wins 权威视图。  
2. 中途 Diff 须按命名数组**追加**（再进入）与同键覆盖理解。  
3. 传输分帧 ≠ Label 分帧 — 先解码再按行缓冲。  
4. 不要把兼容模式当作协议符合性。

实践：[../../practice/](../../practice/)。  
分栈：[../nodejs/notes/](../nodejs/notes/)。  
第三方对等清单：[../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)。
