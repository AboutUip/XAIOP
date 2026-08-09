# Node 注意事项 — Annotation Span（相位 `#` 跨度）

[English](annotation-span.md) · [简体中文](annotation-span.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-ANNSPAN` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-05 |
| 规范性 | **否** — SDK 产品能力；协议 `#` 仍无树副作用 |
| 包版本 | `xaiop` **0.13.0+**（Span）；控制根 demux **0.14.0+** |

主入口：[../API.zh-CN.md](../API.zh-CN.md) §6.5 · §5.5 · §7.2。  
测试：`xaiop-sdk/nodejs/test/annotation.span.test.js`。

---

## 1. 分层（勿与行拦截混淆）

| 层 | 时机 | 能力 |
| --- | --- | --- |
| **行拦截** §6.4 | 缓冲拆行后 → 相位行表 / `feedLine` 前 | 逐行观察 · 改写 · `null` 跳过 |
| **Annotation Span** §6.5 | 相位行表已齐 → **Diff / Commit / typeCheck 前** | 遇 `#`：向前收集**同层级**兄弟（含子树）为 JSON；改写 / 丢弃 / 保持 |
| **控制根** §7.7 | 在 Span / parse 之前 | `#!…` 先 demux；若漏剥，Span **硬跳过** `#!` — [control-plane.zh-CN.md](control-plane.zh-CN.md) |
| **`onPhase` / `onChunk`** | Diff 已解析并 Commit | 只读 Diff |
| **类型冻结 / `typeCheck`** | 解析后的树 | **在 Span 之后**；Span 标记的路径**逃逸**检查 |

挂载点：`DotCheckpointEngine`（`XaiopStream` / `XaiopWsConnection` / `XaiopBrowserWsConnection` 转发）。

协议 `#…`：解析器忽略、不改树。Annotation Span 是 SDK 在相位上**主动消费** `#` 的产品能力。以 `#!` 开头的行**不是** Span 目标（控制根；demux 漏剥时硬跳过）。

---

## 2. 契约

1. **调用时机严格早于 typeCheck**：本相位内先跑 Span → 再 feed / Diff → 再 `TypeFreezeSession.observeTree`（若开启）。
2. **逃逸类型检查（产品硬规则）**：一旦本相位对该 `#` **调用了** Span 处理器链（无论返回 `undefined` / JSON / `null`），则：
   - **处理器处理的区域**（向前收集到的同层级兄弟及其子树，或 remount 后的键），以及
   - **该向前区域所覆盖的同层级键**（收集定义上已含「`#` 之后直至离开本层」的同级），
   - 对应路径会进入 `typeCheckEscapePaths`，在后续 `observeTree(..., { escapePaths })` 中**跳过**冻结 / 一致性检查。
   - `#` **之前**同层键、其它相位未逃逸路径：**仍受** typeCheck。
3. 处理器签名：`(annotation, view) => unknown`。`annotation` = `#` 后原文（含前导空白）；`view` 含模板化 JSON，**不含**线文 `=` / `@` / `!` 操作符形态。
4. 返回值：

| 返回 | 含义 |
| --- | --- |
| `undefined` | 保持 `#` + 捕获区原线文；**仍报告 escape 路径** |
| `null` | 丢弃 `#` + 捕获区（不 feed）；无 escape（键已消失） |
| 对象 / 数组 / JSON 文本 | remount 为同级线文替换捕获区；escape remount 键 |

5. 多处理器：**注册顺序**；**第一个非 `undefined` 决定结果**（`null` 亦算决定）；其后不跑。
6. 捕获止于：本层 `<` / `<name` 离开、`=` / `@` / `!` 重定位、相位 `.`。
7. 仅 `streamProcessing: true`（裸 `DotCheckpointEngine` 默认开，与 `XaiopStream` / WS 相同）的行扫描 / 相位收口路径生效；`streamProcessing: false` 整缓冲一次 parse **不**跑 Span（与行拦截一致）。

---

## 3. `view` 字段

| 字段 | 说明 |
| --- | --- |
| `annotation` | `#` 后文本 |
| `annotationRaw` | 完整 `#…` 行 |
| `path` | `#` 所在父路径（JSON path 风格） |
| `depth` | 栈深度 |
| `json` | 捕获区物化后的 JSON（对象表面） |
| `jsonText` | `JSON.stringify(json)` 稳定文本 |

导出辅助：`applyAnnotationSpans` · `encodeAsSiblingLines` · `pathEscapesTypeCheck`。

---

## 4. API 表面

| 表面 | 注册方式 |
| --- | --- |
| `DotCheckpointEngine` | 构造 `annotationSpan` · `onAnnotationSpan` · `clearAnnotationSpans` |
| `XaiopStream` | 同上 |
| `XaiopWs` / `XaiopBrowserWs` connect | 选项 `annotationSpan`；连接上 `onAnnotationSpan` |

`onChunk(diff, meta?)` 的 `meta.typeCheckEscapePaths` 携带本相位逃逸路径；Stream / WS 在启用 `typeCheck` 时累加并传入 `observeTree`。

---

## 5. 示例

```js
import { TYPE, TypeRegistry, XaiopWs } from "@bylan280/xaiop";

const schema = new TypeRegistry();
schema.register("ok", TYPE.INT);
schema.register("flex", TYPE.INT);

const client = await XaiopWs.connect(url, {
  typeCheck: true,
  typeSchema: schema,
  // 在 typeCheck 之前跑；返回的 flex 路径逃逸类型检查
  annotationSpan: (ann, view) => {
    if (!ann.includes("loose")) return undefined;
    return { flex: String(view.json.flex) }; // 非 INT，但逃逸
  },
});
```

---

## 7. 坑：用 `#` 做应用层「自定义小协议」

协议 `#` = **自定义注解传递**（无树副作用）。挂上 Annotation Span 后，**同一行**可被 SDK 改树 / 逃逸 typeCheck —— 这是产品能力，不是协议语义。

| 坑 | 说明 |
| --- | --- |
| 同线两义 | 无 Span → 树不变；有 Span remount → 树变 |
| `#` 在载荷 / `>` 前 | 向前吞掉同级（可含整相）；其后的 `#` 命令**不会**再触发 Span |
| `.` 后的 `#` | 算作**下一相**首行，不是「相间旁路」 |
| `ignore`/`undefined` | 线文保留，**仍**给捕获键做 typeCheck 逃逸 |
| Content 内 `#` | `note:#x` **不是**注解行，Span 不触发 |
| 行首空白 | ` #cmd` 不是本原语；若行内还有 `:`，可能被当成 **Content** 脏键，且 Span 不触发 |
| 收窄捕获 | 用 `@path` / `=` / `!` 截断；需检查的键放在 `#` **之前** |

测试：`test/annotation.span.test.js`（`pitfalls — custom annotation protocol`）· `test/hash.annotation.test.js`。

---

## 8. 相关

- API §6.5 · [line-intercept.zh-CN.md](line-intercept.zh-CN.md) · [typecheck.zh-CN.md](typecheck.zh-CN.md) · [control-plane.zh-CN.md](control-plane.zh-CN.md) · [ws-session.zh-CN.md](ws-session.zh-CN.md) · 协议 [wire-attention §6.1](../../../protocol/notes/wire-attention.zh-CN.md)
