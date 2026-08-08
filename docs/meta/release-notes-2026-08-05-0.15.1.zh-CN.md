# 发行说明 — Node.js SDK 0.15.1（2026-08-05）

[English](release-notes-2026-08-05-0.15.1.md) · [简体中文](release-notes-2026-08-05-0.15.1.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| SDK | **0.15.1** |
| 协议 | **0.6.0** Frozen（不变） |
| 类型 | 性能补丁 |

## 摘要

相对 **0.15.0** 同机全量测速基线：`streamOn` / `emitDiff` 路径约快 **38–43%**；`parseSync+materialize` 约快 **16%**。协议语义与 Diff/Commit 隔离不变。

## 变更

- 明文树 `cloneJson` 手写遍历（热路径不再 JSON 往返）
- Diff≡Commit：Diff 只 materialize 一次，Commit 保持 live 直到读取
- `feedLines` / `feedLineFast`；空相 / `readLine` 去正则
- encode 无冗余 `<` 时跳过 collapse 分配

## 验证

```bash
cd xaiop-sdk/nodejs && npm test
cd ../../xaiop-sdk/timing && npm run bench
```
