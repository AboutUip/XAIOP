# Node.js 合并 / 注入（JSON ↔ XAIOP）

[English](merge.md) · [简体中文](merge.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包 | `xaiop` **0.6.0+** |
| 代码 | [`merge.js`](../../../xaiop-sdk/nodejs/src/merge.js) |
| 测试 | `merge.test.js` |

上级指南：[README.zh-CN.md](README.zh-CN.md)

---

## 1. 目的

**预处理 / 后处理**：把 **基底 JSON** 与 overlay（JSON 或解析后的 XAIOP）合并。

| 不是 | 是 |
| --- | --- |
| 流式 / WS / `.` 相位 | 发送前或接收后的离线合并 |
| 传输层 later-wins | 显式 `conflict`，**仅冲突键** |

---

## 2. 冲突策略

| `conflict` | 遇到冲突键 |
| --- | --- |
| `overwrite`（**默认**） | 采用 overlay |
| `keep` | 保留基底；非冲突键仍并入 |

深层 **普通对象** 递归；**数组**与标量在该键上整体冲突。

常量：`MERGE_CONFLICT.OVERWRITE` / `MERGE_CONFLICT.KEEP`。

---

## 3. 全参 API

参数序：**① 基底 JSON**，**② XAIOP 文本**。

| API | 返回 |
| --- | --- |
| `mergeToJson(base, xaiop, options?)` | JSON |
| `mergeToXaiop(base, xaiop, options?)` | XAIOP 线文（合并后再 encode；默认 `dotPolicy: "none"`） |

另有：自由函数、`XaiopEngine.mergeToJson` / `mergeToXaiop`（静态 + 实例；实例 parse 跟兼容开关），以及 JSON+JSON 的 `mergeJson(base, overlayJson, conflict?)`。

```js
import { mergeToJson, mergeToXaiop, MERGE_CONFLICT } from "xaiop";

const json = mergeToJson({ a: 1 }, ">\nb:2\n", { conflict: MERGE_CONFLICT.KEEP });
const wire = mergeToXaiop({ a: 1 }, ">\na:9\n", { conflict: "overwrite" });
```

---

## 4. Engine 注入（少参）

实例上已有 `dataId` 文档时（`upload` / `uploadJson`），只注入 overlay：

| API | Overlay |
| --- | --- |
| `injectXaiop(dataId, xaiopSource, options?)` | XAIOP 文本 |
| `injectJson(dataId, jsonValue, options?)` | JSON |

均 **就地更新** store。选项：

- `conflict` — 同上  
- `as: "json"`（**默认**）| `"xaiop"` — 合并后的返回形态  
- `encodeOptions` — 当 `as: "xaiop"` 时使用  

存有根片段（`XaiopFragment`）时，注入前会物化为普通对象再合并并写回。

```js
const id = engine.uploadJsonSync({ a: 1 });
engine.injectXaiopSync(id, ">\nb:2\n");
engine.injectJsonSync(id, { a: 9 }, { conflict: "keep" }); // a 仍为 1
```

---

## 5. 相关

- 编码：[encode.zh-CN.md](encode.zh-CN.md)  
- 流式（非合并）：[stream.zh-CN.md](stream.zh-CN.md)
