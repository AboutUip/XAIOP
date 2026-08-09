# 发布说明 — 2026-08-09 · Node.js npm 上架

[English](release-notes-2026-08-09-nodejs-npm.md) · [简体中文](release-notes-2026-08-09-nodejs-npm.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包 | **`@bylan280/xaiop@0.15.1`** |
| 仓库 | [npmjs.com/package/@bylan280/xaiop](https://www.npmjs.com/package/@bylan280/xaiop) |
| 协议 | **0.6.0** Frozen |
| 组织 | `bylan280` |

## 摘要

Node.js 产品 SDK **首次**以作用域名 **`@bylan280/xaiop`** 公开发布到 npm。版本 **0.15.1**（与仓库 tip 一致，含 2026-08-09 极限热路径）。线文语义不变。

## 安装

```bash
npm install @bylan280/xaiop
```

```js
import { parseSync, XaiopWs } from "@bylan280/xaiop";
import { XaiopBrowserWs } from "@bylan280/xaiop/browser";
import { encodeSync } from "@bylan280/xaiop/core";
```

## 说明

- 历史文档 / 旧标签可能仍写无作用域 `xaiop`；**使用者请安装 `@bylan280/xaiop`**。
- 子路径：`@bylan280/xaiop/browser` · `@bylan280/xaiop/core`。
- 相关 tip：[release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md](release-notes-2026-08-09-sdk-extreme-perf-internal.zh-CN.md)。
- 指南：[../sdk/nodejs/README.zh-CN.md](../sdk/nodejs/README.zh-CN.md) · API：[../sdk/nodejs/API.zh-CN.md](../sdk/nodejs/API.zh-CN.md)。
