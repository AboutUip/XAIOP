# Node 注意事项 — 行拦截（缓冲层）

[English](line-intercept.md) · [简体中文](line-intercept.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-LINE` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-04 |
| 规范性 | **否** — SDK 产品能力；非线文法 |
| 包版本 | `xaiop` **0.12.0+** |

主入口：[../API.zh-CN.md](../API.zh-CN.md) §6.4 · §6.2 · §7.2。  
测试：`xaiop-sdk/nodejs/test/line.intercept.test.js`。

---

## 1. 分层

| 层 | 时机 | 能力 |
| --- | --- | --- |
| **行拦截** | `readLine` 完成后 → 相位行表 / `feedLine` 前 | 观察 · 改写 · `null` 跳过 |
| **`onPhase` / `onChunk`** | `.` 相位 Diff 已解析并 Commit | 只读 Diff；**不能**改线文 |
| **类型冻结 / `typeCheck`** | 解析后的树 | 与行拦截无关 |

挂载点：`DotCheckpointEngine`（`XaiopStream` / `XaiopWsConnection` / `XaiopBrowserWsConnection` 转发同一引擎）。

---

## 2. 契约

1. **注册顺序 = 调用顺序**；任一返回 `null` → **短路**后续处理器。
2. 三种 `null` 边界：

| 含义 | 来源 |
| --- | --- |
| 拦截跳过本行 | handler 返回 `null` |
| Content 空值 | 线文 `key:null`（真实数据） |
| 空相位 Diff | `onPhase`/`onChunk` 收到 `null`（空 `.` 相或 `emitDiff: false`） |

3. `view` 为**固定模板**最小分类（`LINE_KIND`），**不是**类型系统 / `typeCheck`。
4. 链上有拦截器时，Diff 的 owned-parse 使用**生效行**拼线（与缓冲原文可能不一致）。
5. 仅 `streamProcessing: true`（裸 `DotCheckpointEngine` 默认开，与 `XaiopStream` / WS 相同）的行扫描路径生效；`streamProcessing: false` 整缓冲一次 parse **不**跑拦截。
6. `jumpTo` 重建时若仍有拦截器，对保留前缀**重新跑链**。
7. 是否关闭相位看**拦截后的文本**：跳过 `.` → 相不关；把普通行改成 `.` → 提前关相。

---

## 3. `LINE_KIND` / 模板字段

| `kind` | 典型线文 | 填充槽 |
| --- | --- | --- |
| `phase` | `.` | — |
| `annotation` | `#…` | `annotationText` |
| `pop` / `pop_enter` | `<` / `<name` | `name` |
| `locate` / `exact` / `broadcast` / `delete` | `=` / `@` / `!` / `&` + path | `path` |
| `object_anon` / `array_anon` | `>` / `-` | — |
| `array_named` / `object_named` | `>name-` / `>name` | `name` |
| `content` | `k:v` / `:v` | `key` · `valueText` |
| `unknown` | 其它 | — |

固定字段始终存在：`kind` · `raw` · `name` · `path` · `key` · `valueText` · `annotationText`（未用为 `null`）。  
导出：`LINE_KIND` · `classifyLine` · `emptyLineView` · `runLineInterceptChain`。

---

## 4. API 表面

| 表面 | 注册方式 |
| --- | --- |
| `DotCheckpointEngine` | 构造 `lineIntercept` · `onLineIntercept` · `clearLineIntercepts` |
| `XaiopStream` | 同上（引擎创建前先缓存，创建时注入） |
| `XaiopWs` / `XaiopBrowserWs` connect | 选项 `lineIntercept`；连接上 `onLineIntercept` |

---

## 5. 示例

```js
import { LINE_KIND, XaiopWs } from "xaiop";

const client = await XaiopWs.connect(url, {
  lineIntercept: ({ view }) => {
    if (view.kind === LINE_KIND.CONTENT && view.key === "secret") return null;
    return undefined;
  },
  onPhase: (diff) => { /* 解析后 Diff — 不能改线 */ },
});
```

---

## 6. 相关

- API §6.4 · [streaming-parse.zh-CN.md](streaming-parse.zh-CN.md) · [ws-session.zh-CN.md](ws-session.zh-CN.md) · [typecheck.zh-CN.md](typecheck.zh-CN.md) · [annotation-span.zh-CN.md](annotation-span.zh-CN.md)
