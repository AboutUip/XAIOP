# Node 注意事项 — 类型检查（注册 / 冻结 / WS 推送）

[English](typecheck.md) · [简体中文](typecheck.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-NODE-NOTE-TYPE` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-04 |
| 规范性 | **否** — SDK 产品能力；非线文法 |
| 包版本 | `xaiop` **0.10.0+** |

主入口：[../API.zh-CN.md](../API.zh-CN.md) §5.5 · §7.2 · §11。

---

## 1. 分层

| 层 | 作用 |
| --- | --- |
| **Canonical** | 封闭种类：`int` `float` `bool` `string` `null` `object` `array` `any`（可选 object 字段表 / array 元素类型） |
| **表面** | `TYPE.*`、`objectType` / `arrayType`，或糖 `object<name:string,old:int>` — 比较前一律规范化 |
| **注册表** | 服务端 path → `{ type, polarity }`；单路径不可变 |
| **冻结** | 客户端 path → 首次非 `null` 观测类型 |
| **控制帧** | `#!xaiop/types/v1\n` + 快照 JSON — 相对 XAIOP 线文为带外 |

路径用 **JSON 路径**家风（`a.b[0]`，同 encode），不是线文 `a>b`。

---

## 2. 服务端

1. 在 `XaiopEngine` 上 `registerType` / `registerTypes` / `registerTypeDeny`。
2. `setTypeCheck(true)`（仅严格模式）。
3. `upload*` / `inject*` 对**已注册路径**跑 `TypeChecker`。
4. 可选 `onTypeViolation`，再抛 `XaiopTypeError`。

空注册表 + 开启检查 = 无操作。

---

## 3. 客户端

在 `XaiopWs.connect` / `XaiopStream` / `XaiopBrowserWs.connect` 设 `typeCheck: true`（若同时 `compatibilityMode` 则无效）。

| 行为 | |
| --- | --- |
| 冻结 | 路径上首次非 `null` 锁定类型 |
| `null` | 跳过（保留冻结；不报错） |
| 数组 | 元素类型同质 |
| 刷新 | commit 缺键 → 清子树冻结 |
| Schema | 来自 `typeSchema` 或 `pushTypeConsistency`；`any` 不做 freeze；schema 违规**不**写入 freeze |

未推 schema 时，仍靠首次冻结保证后续一致。

**Annotation Span 逃逸：** 启用 `onAnnotationSpan` 时，Span 在 typeCheck **之前**运行；被该处理器处理的同层级区域路径会传入 `observeTree(..., { escapePaths })` 并跳过冻结/一致性检查。详见 [annotation-span.zh-CN.md](annotation-span.zh-CN.md) · API §6.5。

---

## 4. `pushTypeConsistency`

```js
hub.onConnection((conn) => {
  conn.pushTypeConsistency(engine); // 已注册且 engine.typeCheck
  conn.pushJson("k", 1);
});
```

前提：连接严格 · 注册表非空 · 若传引擎则 `typeCheck === true`。  
可传 engine / `TypeRegistry` / 快照。非 OPEN → `false`。

---

## 5. 相关

- API §5.5 / §7 · 测试：`xaiop-sdk/nodejs/test/typecheck.test.js`
- WS notes：[ws-session.zh-CN.md](ws-session.zh-CN.md)
- 协议 Content 叶类型：[../../../protocol/content.zh-CN.md](../../../protocol/content.zh-CN.md)（仅叶种类）
