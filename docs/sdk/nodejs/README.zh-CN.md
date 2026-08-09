# XAIOP Node.js SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包名 | `@bylan280/xaiop`（npm） |
| SDK | **0.15.1**（TypeScript） |
| 协议包 | **0.6.0** Frozen（已封存） |
| 运行时 | Node.js ≥ 18（默认入口）；浏览器 → `@bylan280/xaiop/browser` |
| 代码 | [../../../xaiop-sdk/nodejs/](../../../xaiop-sdk/nodejs/)（`src/` → `dist/`） |

**完整 API：** [API.zh-CN.md](API.zh-CN.md)

**入口：**

```js
import { parseSync, XaiopWs } from "@bylan280/xaiop";                 // Node 全表面
import { parseSync, XaiopBrowserWs } from "@bylan280/xaiop/browser"; // 浏览器客户端
import { parseSync, encodeSync } from "@bylan280/xaiop/core";        // 同构核心
```

**协议包：** [../../protocol/](../../protocol/) · [../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md)  
**产品目录：** [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)  
**运行时细节：** [API §0](API.zh-CN.md#0-运行时范围与入口)  
**性能 / 计时：** [notes/performance.zh-CN.md](notes/performance.zh-CN.md) · [../../performance.zh-CN.md](../../performance.zh-CN.md)

---

## 安装

```bash
npm install @bylan280/xaiop
```

从源码：

```bash
cd xaiop-sdk/nodejs
npm install
npm test   # 先 tsc 再跑测试
```

---

## 可选深度说明（`notes/`）

| 笔记 | 主题 |
| --- | --- |
| [notes/streaming-parse.zh-CN.md](notes/streaming-parse.zh-CN.md) | `.` 相位 Diff / Commit、`mergeChunkWindow`、`cover` |
| [notes/history.zh-CN.md](notes/history.zh-CN.md) | 可选解析历史与 `jumpTo` |
| [notes/encode-attention.zh-CN.md](notes/encode-attention.zh-CN.md) | 编码坑点与路径切相 |
| [notes/ws-session.zh-CN.md](notes/ws-session.zh-CN.md) | `XaiopWs` + **浏览器相位**（`xaiop/browser` · §9）+ **类型推送**（§10） |
| [notes/typecheck.zh-CN.md](notes/typecheck.zh-CN.md) | 类型注册 / 冻结检查 / `pushTypeConsistency` |
| [notes/line-intercept.zh-CN.md](notes/line-intercept.zh-CN.md) | 缓冲行拦截（`onLineIntercept`） |
| [notes/annotation-span.zh-CN.md](notes/annotation-span.zh-CN.md) | 相位 Annotation Span（typeCheck 逃逸；**0.13.0+**） |
| [notes/control-plane.zh-CN.md](notes/control-plane.zh-CN.md) | SDK 控制根 `#!` · 会话 / 续传（**0.14.0+**） |
| [notes/adjustment-policy.zh-CN.md](notes/adjustment-policy.zh-CN.md) | 兼容修复：按设计 vs 可慎重调整 |
