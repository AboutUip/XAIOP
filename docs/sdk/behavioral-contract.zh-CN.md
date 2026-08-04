# SDK 行为契约（第三方同等水平）

[English](behavioral-contract.md) · [简体中文](behavioral-contract.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 ID | `SDK-BEHAVE` |
| 状态 | 信息性 |
| 最近更新 | 2026-08-04 |
| 规范性 | **否** — SDK 产品目录（非协议符合性） |
| 参考实现（重心） | Node.js `xaiop` **0.13.0**（`xaiop-sdk/nodejs/`） |
| 协议线格式 | Frozen **v0.6.0** |

**隔离：** 协议 = **游标 IR** 线格式 · 实践 = 写者与传输 · 本文 = **第三方要对齐官方水平时必须匹配的行为** — [../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)。  
**立场：** 协议 IR ≠ 产品营销面 — [../overview/introduction.zh-CN.md](../overview/introduction.zh-CN.md)。  
**符合性：** 协议层级（`CONF`）**不**认证 SDK API（[../conformance/conformance.zh-CN.md](../conformance/conformance.zh-CN.md) §7）。**协议符合 ≠ 官方 SDK 同等。**

---

## 1. 目的

宣称「与官方 Node 包同等水平」的第三方 / 其它语言 SDK **应当**实现下列行为（默认值、Diff 边界、兼容套件、encode 策略、WS 相位推送）。方法名可不同；**可观察语义**不应不同。

线文法仍以 Frozen 协议文档为准。本文记录已被 Node 参考实现与测试锁定的 **SDK 产品选择**。

| 需求 | 文档 |
| --- | --- |
| 线文法 / Content 类型 | [../protocol/](../protocol/) |
| 现行实践（传输 / 会话） | [../practice/](../practice/) |
| LLM 发射（封存） | [../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/) |
| Node API 表面 | [nodejs/API.zh-CN.md](nodejs/API.zh-CN.md) · [nodejs/README.zh-CN.md](nodejs/README.zh-CN.md) · [nodejs/notes/](nodejs/notes/) |
| 相位 Diff 算法 | [nodejs/notes/streaming-parse.zh-CN.md](nodejs/notes/streaming-parse.zh-CN.md) |
| WS 会话细节 | [nodejs/notes/ws-session.zh-CN.md](nodejs/notes/ws-session.zh-CN.md) |

---

## 2. 严格 vs 兼容（摄入）

| 规则 | 官方行为 |
| --- | --- |
| 默认解析 | **严格** — 任一 `XaiopSyntaxError` 立即失败 |
| 兼容模式 | **可选** SDK 摄入；Well-Formed 线格式绝不隐含 |
| Encode | **始终严格** — 兼容标志不改变线输出 |
| 细粒度修复 | 八个独立开关（模式开启时默认**全开**）；见 §2.1 |

### 2.1 兼容修复 ID（模式开启时默认均为 `true`）

| ID | 效果（摘要） |
| --- | --- |
| `forcedRoot` | 首个有效行不是 `>` / `-` 时，注入匿名对象根（不返回 fragment） |
| `rewriteBareNameArray` | 匹配 `^[A-Za-z_][A-Za-z0-9_]*-$` 时 `name-` → `>name-` |
| `rewriteEnterLine` | 去尾空格；`>  ` → `>`；带空格的 enter；粘连 `>key:value` → Content |
| `ignoreBareLeaveAtRoot` | Root 上裸 `<`（`stack.length <= 1`）忽略 |
| `popAndRetry` | 语法错误时：弹出游标并重试同行；同消息再弹；消息变化则抛新错；不能再弹则抛原错 |
| `locatePathTrim` | `=` 未命中 → 修剪路径空白再试 |
| `locatePathStripSpaces` | 仍未命中 → 去掉路径中全部空白 |
| `locatePathArraySuffix` | 仍未命中 → 段尾 `-` 视为数组键（仅当值为数组） |

**策略对象语义（Node）：** `false` / 省略 → 严格；`true` → 全开；普通对象 / `CompatPolicy` → 在默认上覆盖（未写的键仍为 `true`）。关闭总开关 **不**重置各 fix；模式关闭时改 fix 为 no-op。

栈细节：[nodejs/README.zh-CN.md](nodejs/README.zh-CN.md)（兼容模式 · CompatPolicy）。

---

## 3. 文档形状（parse）

| 输入 | 严格结果 |
| --- | --- |
| 以 `>` / `-` 开头 | 完整对象 / 数组文档 |
| 以 `>name` / Root Content 开头（无匿名根） | **Fragment** 类型（不是包一层 `{ "a": … }`） |
| 空源 | `{}` |
| 文档中间空行 | 语法错误 |
| 行首 BOM（`U+FEFF`） | 剥离 |

**面向 JSON 的流式表面** 将 fragment 物化为普通对象（`entries` 的克隆）。一次性 engine/static parse **可以**保留 fragment 类型。只暴露 JSON 的移植 **必须**说明走哪条路径。

Content 类型遵循 `PROT-CONTENT`（`:` 后空格强制字符串；int → float → bool → null → string）。

其它对等锁定行为：

- 对象游标 + 裸 `>` → **重入**（修改）；数组游标 + 裸 `>` → **新元素**。
- `>name-` → **再进入**已有命名数组（元素 **追加**）；缺失或类型不对则创建。
- `=` 定位：在**已建整树**上模糊（向前跨相）；首命中；不创建。`@path` → 自 Root 精确，**创建**缺失对象（本相）。`!path` → 已建整树全部匹配广播（外层剪枝）至 `.`。

---

## 4. Encode 默认（JSON → 线）

对编码器接受的值：

| 选项 | 官方默认 |
| --- | --- |
| `root` | `auto` |
| `style` | `reset` |
| `dotPolicy` | `perTopLevelKey` |
| `phaseEvery` | `1`（`perTopLevelKey` 时强制） |
| `finalDot` | `false` |
| `keyOrder` | `insertion` |
| `nullPolicy` | **`encode`**（`key:null` / `:null`） |
| `undefinedPolicy` | `omit` |

附加锁定规则：

1. `parse(encode(value))` 深度等于 `value`（`-0` → `0`）。
2. 相同 `(value, options)` → 相同线文本；线以恰好一个尾 `\n` 结束。
3. 命名数组 **可以**跨 `.` 相位（`>name-` 再进入即追加）。Encode 默认仍把每个命名数组放在一相（Diff 清晰度）。
4. **数组文档根** 以 `-` 开头，**不**插入对象式顶层 `.` 相位（数组根上忽略用于分相的 `dotPolicy`）。
5. 紧挨 `.` 或 EOF 前的尾 `<` 可省略（与 reset / 结束冗余）。
6. 拒绝键：空 / 空白 / `:`、尾 `-`、字符 `>` `<` `=` `!`。
7. 稀疏数组 `undefined` 洞 → 错误；对象 `null` 在 `omit` 下丢键；**数组 null 仍编码**（除非 `nullPolicy: "error"`）。

完整指南：[nodejs/API.zh-CN.md](nodejs/API.zh-CN.md)。

---

## 4.1 合并 / 注入（预处理 / 后处理 — 非流式）

| 规则 | 官方 SDK |
| --- | --- |
| 角色 | 发送前 / 接收后的离线合并 — **不是** WS / `.` Diff 传输 |
| 操作数序 | 基底 **JSON** + overlay **XAIOP**（或经 `injectJson` / `mergeJson` 的 JSON） |
| `conflict` | `overwrite`（**默认**）或 `keep` — **仅冲突键**；普通对象深合并；数组/标量在该键上整体冲突 |
| 返回 | `mergeToJson` → JSON；`mergeToXaiop` → 线文（默认 encode `dotPolicy: "none"`） |
| Engine 注入 | `injectXaiop` / `injectJson` 按 `dataId` 写回 store；`as: "json"\|"xaiop"` 选返回形态 |
| 片段 | 已存 `XaiopFragment` 先物化再合并 |

指南：[nodejs/API.zh-CN.md](nodejs/API.zh-CN.md)。

---

## 5. 流式 Diff 边界（官方默认）

| 关注点 | 官方 SDK |
| --- | --- |
| Diff / `onChunk` 单元 | 默认：缓冲窗口内已完整 `.` **合并一次**交付；`mergeChunkWindow: false` → 每个 `.` 一相 |
| 异步摄入 | `pushAsync` / `finishAsync` / `asyncParse: true` — `setImmediate` 合并扫描（非空 Promise 壳） |
| 解析历史 | 可选 `historySnapshot` / `historyRealtime`（默认**关**）。按物理 `.` 记账；快照=只读导出/对比/区间；实时=仅向前 `jumpTo`（保留定位点、丢弃其后）。见 [nodejs/notes/history.zh-CN.md](nodejs/notes/history.zh-CN.md) |
| 空相位 | Chunk 值为 **`null`** |
| 渐进 Snapshot | 已提交前缀的累积 parse（`getCommittedSnapshot`） |
| 最终 Snapshot | finish / 对端关闭后的全缓冲 parse（`getSnapshot` / `done`） |
| 流中途 `getSnapshot` | 在 finish 前通常为 **undefined** |

### 5.1 Checkpoint 算法（要对齐必须匹配）

```text
buffer += chunk
每遇到完整 "." 行:
  raw = 自相位起点到 "." 行结束的切片
  text = 第一相 ? raw : injectLeadingDot(raw)
  chunkDiff = emptyPhaseBody(raw) ? null : materialize(parse(text))
  committed = materialize(parse(buffer[0 .. endOfDot]))
  发出 chunkDiff
finish 时:
  按同样规则冲刷剩余尾为最后一 chunk
  finalSnapshot = materialize(parse(full buffer))   # 空 → {}
```

`injectLeadingDot`：若切片尚未以 `.` 行开头，则前置 `.\n`（或在已有前导换行前加 `.`）。后续相位按「已 Root reset」的文档解析，以便游标规则生效。

细节与坑点：[nodejs/notes/streaming-parse.zh-CN.md](nodejs/notes/streaming-parse.zh-CN.md)。

---

## 6. 流式客户端表面（Node 参考）

追求对等的移植 **应当**提供等价能力：

| 行为 | 官方默认 / 规则 |
| --- | --- |
| 投递模式 | 可多选；默认仅 **`callback`**；不可降到低于 callback 的空集 |
| 状态机 | `idle → connecting → streaming → completing → completed`（另有 `aborted` / `error`） |
| `streamProcessing` | 默认 **开**；关闭时 finish 仅一个 chunk = 全量 parse |
| Busy `send` | promise 模式 → reject；否则 throw |
| 事件监听器 | 监听器内异常隔离（不拖垮流） |
| 传输 | 默认 `http`；SSE 多行 `data:` 用 `\n` 拼接；二进制用流式 UTF-8 解码；空文本不转发；超时 abort |

API：[nodejs/API.zh-CN.md](nodejs/API.zh-CN.md) §6 · [nodejs/notes/streaming-parse.zh-CN.md](nodejs/notes/streaming-parse.zh-CN.md)。

**Java（`io.xaiop:xaiop` 0.5.0）：** 实现本消费端表面的 **HTTP / SSE / RAW**（状态机、模式、`mergeChunkWindow`、监听器隔离、UTF-8 解码、SSE 拼接）。相对 Node 的缺口：**无 WebSocket**、无 `cover` Diff、无线拦截 / Annotation Span，线格式仍为协议 **0.4.0**。指南：[java/README.zh-CN.md](java/README.zh-CN.md)。

---

## 7. WebSocket 相位会话（`XaiopWs`）

| 规则 | 官方行为 |
| --- | --- |
| 相位编码 | 强制 `dotPolicy: "none"`；非 `final` 在尾换行后再追加 `.\n`；`final: true` 不加相位分隔 |
| Later-wins | 拼接相位按整文档 parse；重开 `>name-` **追加**；`!path` 广播（外层剪枝）至 `.` |
| 处理器 | 在 `open` 完成前挂好（避免同步推送丢失） |
| 连接握手 | 默认超时 **15000** ms |
| `end` | 等待 `bufferedAmount` 最长 **2s**，再以 `1000` 关闭 |
| `abort` | `terminate` + 关闭码 `1001`，原因 `"aborted"` |
| Parse / finish 失败 | 关闭码 `1011`，原因 = 消息截断 ≤ **120** 字符 |
| 已关闭 / 非 OPEN | `push*` 返回 `false`（encode 错误在发送前抛出） |

细节：[nodejs/notes/ws-session.zh-CN.md](nodejs/notes/ws-session.zh-CN.md) · 实践：[../practice/skeleton-stream.zh-CN.md](../practice/skeleton-stream.zh-CN.md)。

---

## 8. 第三方检查清单

- [ ] 默认严格；兼容可选；encode 始终严格  
- [ ] 八项兼容修复（或文档化子集）与同类 rewrite / pop-and-retry / locate 重试  
- [ ] Fragment vs 完整根 vs 空 `{}`；流式物化策略已说明  
- [ ] Encode 默认 + 数组根无顶层 `.` + 尾 `\n` + 键危害  
- [ ] 合并/注入：冲突键 `overwrite`/`keep`；inject 写回 store；非流式  
- [ ] Diff = `.` 相位；默认 **窗口合并**（`mergeChunkWindow`）；逐步模式下空 → `null`；commit vs chunk；后续相注入 leading `.`  
- [ ] 异步摄入可选（`pushAsync` / `asyncParse`）— 合并扫描，非空 Promise 壳  
- [ ] 解析历史可选（`historySnapshot` / `historyRealtime`）— 按 `.`；快照只读；实时向前 `jumpTo`
- [ ] 最终 Snapshot ≡ 同兼容策略下全缓冲一次性 parse  
- [ ] 若提供骨架会话：WS 相位 `.\n` / `final` / 关闭码  

**黄金套件（Node）：** `engine.test.js` · `encode.stability.test.js` · `merge.test.js` · `checkpoint.window.test.js` · `stream.consistency.test.js` · `ws.session.test.js` · `ws.phase-encode.test.js`。

---

## 相关

- 跨栈原则：[notes/principles.zh-CN.md](notes/principles.zh-CN.md)  
- 隔离：[../SEPARATION.zh-CN.md](../SEPARATION.zh-CN.md)  
- Node 指南：[nodejs/README.zh-CN.md](nodejs/README.zh-CN.md)
