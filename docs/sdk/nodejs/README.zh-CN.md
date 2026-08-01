# XAIOP Node.js SDK

[English](README.md) · [简体中文](README.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 包名 | `xaiop` |
| 协议 | v0.1.0 Frozen |
| 运行时 | Node.js ≥ 18（ESM） |
| 代码 | [../../../xaiop-sdk/nodejs/](../../../xaiop-sdk/nodejs/) |

---

## 安装

```bash
cd xaiop-sdk/nodejs
npm install
npm test
```

```js
import { XaiopEngine, PROTOCOL_VERSION } from "xaiop";
```

---

## 三个 API

主方法均为 **async**，并提供对应 **sync**。

### 1. `new XaiopEngine()` — 创建引擎

```js
const engine = new XaiopEngine();
```

内存中按运行时 **data id** 保存已上传文档。

### 2. `upload` / `get` — 实例 API

上传**完整**（非流式）XAIOP 文本，得到 data id；再用 id 取解析后的 JSON。

```js
const dataId = await engine.upload(xaiopText);
const json = await engine.get(dataId);

const dataId2 = engine.uploadSync(xaiopText);
const json2 = engine.getSync(dataId2);
```

### 3. `XaiopEngine.parse` — 静态 API

无需引擎实例、不存 id，直接解析。

```js
const json = await XaiopEngine.parse(xaiopText);
const jsonSync = XaiopEngine.parseSync(xaiopText);
```

---

## API 参考

| API | 说明 |
| --- | --- |
| `new XaiopEngine()` | 标准引擎实例 |
| `upload(source)` / `uploadSync` | 完整文本 → data id |
| `get(dataId)` / `getSync` | data id → JSON（克隆） |
| `XaiopEngine.parse` / `parseSync` | 静态：文本 → JSON |

辅助：`PROTOCOL_VERSION`、`has` / `delete` / `clear`、`XaiopSyntaxError`。

---

## 错误

- 非法线格式 → `XaiopSyntaxError`（确定性，**不**静默修复）  
- 未知 data id → `Error`  
- 参数类型错误 → `TypeError`  

---

## 样例

见 [../../examples/complex.xaiop](../../examples/complex.xaiop)。

---

## 本版本范围外

- 流式 Snapshot / Diff（`PROT-STREAM`，后续）  
- Emitter（JSON → XAIOP）  
