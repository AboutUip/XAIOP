# XAIOP Python SDK API 文档

[English](API.md) · [简体中文](API.zh-CN.md)

**协议版本**: v0.7.0 Draft  
**SDK 版本**: **0.15.1**  
**运行时**: **Python ≥ 3.10**  
**包名**: `xaiop`  
**代码**: [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/)（`src/xaiop/`）  
**对等矩阵**: [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) · **Node 产品选择目录**: [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md)（可选对照；非跨语言强制） · **封存索引**: [../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md)

> 稳定版，在可观察语义层面与 Node **0.15.1** 对齐（无 browser）。见 [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)。

---

## 0. 运行时范围与入口

| 入口 | 环境 | 内容 |
| --- | --- | --- |
| `import xaiop` | **Python ≥ 3.10**（主路径） | 全门面：parse / encode / engine / checkpoint / history / merge / types / control 辅助；再导出 stream + WS |
| `xaiop.stream` | 网络消费端 | `XaiopStream`、`TRANSPORT_KIND`、`chunks_of`、`open_transport` |
| `xaiop.ws` | WebSocket 会话 | `XaiopWs`、`XaiopWsConnection`、`XaiopWsHub`（可选 `[ws]` extra） |
| `xaiop.types` | 类型注册 / 冻结 | `TYPE`、`TypeRegistry`、`TypeFreezeSession`、… |
| `xaiop.control` | 控制根（`#!`） | 帧、demux、`ResumeWireLog`、会话辅助 |

| 命题 | |
| --- | --- |
| 浏览器包（`xaiop/browser`） | **无** — 不在范围内（与 Java 相同） |
| 同步优先的公共 API | **是** — 默认阻塞；异步显式（`push_async`，`send` / `done` 返回的 `Future`） |
| 可选 extras | `[http]` → `httpx`；`[ws]` → `websockets` |
| 线语义 | 与 Node / Java 同一协议包 **0.6.0** |

### 惯用法（Node → Python）

| 主题 | Python |
| --- | --- |
| 命名 | `snake_case`：`parse_sync`、`encode_sync`、`jump_to`、`get_after`、`view_range`、`export_time_root` |
| Annotation Span 保留 | `AnnotationSpan.KEEP`（Node 的 `undefined`） |
| 选项 dict / 钩子 | 同时接受 **camelCase** 键（`mergeChunkWindow`、`streamProcessing`、…）与 snake_case |
| History 范围错误 | `xaiop.RangeError`（`ValueError` 子类） |
| 相位迭代 | 同步迭代器 `chunks()` / 辅助 `chunks_of`（非原生 `async for`） |
| 实时解析类 | `LiveParser`（Node `LiveXaiopParser`） |

Node 仍为产品选择锁定的参考实现；Python 为同可观测语义水平的官方移植。对等清单：[ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md)。

---

## 目录

0. [运行时范围与入口](#0-运行时范围与入口)
1. [快速开始](#1-快速开始)
2. [核心概念](#2-核心概念)
3. [解析 API](#3-解析-api)
4. [编码 API](#4-编码-api)
5. [引擎 API](#5-引擎-api)（含 [§5.5 类型检查](#55-类型检查实例)）
6. [流式 API](#6-流式-api)（含 [§6.4 行拦截](#64-行拦截-on_line_intercept) · [§6.5 Annotation Span](#65-annotation-span-on_annotation_span) · 相位 `meta.seq`）
7. [WebSocket API](#7-websocket-api)（含 [§7.5 connect 时序](#75-connect-future-与回调时序注意) · [§7.6 控制根](#76-sdk-控制根----会话--续传)）
8. [合并与注入](#8-合并与注入)
9. [兼容模式](#9-兼容模式)
10. [类型与常量](#10-类型与常量)
11. [错误处理](#11-错误处理)

---

## 1. 快速开始

### 安装

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev,http,ws]"
pytest
```

已发布 / 可编辑包名：**`xaiop`**。可选 extras：`httpx`（`[http]`）、`websockets`（`[ws]`）。

### 基础用法

```python
from xaiop import (
    parse_sync,
    encode_sync,
    XaiopEngine,
    XaiopStream,
    PROTOCOL_VERSION,
    SDK_VERSION,
)

# XAIOP → JSON
parse_sync(">\na:1\n")  # → {"a": 1}

# JSON → XAIOP（默认：每个顶层键一相，含 `.`）
encode_sync({"a": 1, "b": 2})

# 引擎存储（同步优先）
engine = XaiopEngine()
data_id = engine.upload_json_sync({"meta": {"name": "demo"}})
json_doc = engine.get_sync(data_id)

# 流式消费（`cover` 默认为 False）
stream = XaiopStream(url, cover=False)
stream.on_chunk(lambda diff, meta=None: None)
fut = stream.send(transport="http")  # 启用 promise 模式时返回 Future
```

WebSocket（可选 `[ws]`）：

```python
from xaiop import XaiopWs

hub = XaiopWs.listen(host="127.0.0.1", port=0)

def on_conn(conn, _req):
    conn.push_json("a", 1)
    conn.push_json("b", {"x": 2}, final=True)
    conn.end()

hub.on_connection(on_conn)

client = XaiopWs.connect(
    hub.url(),
    on_phase=lambda diff, meta=None: None,  # 可能在 connect 返回前触发 — 见 §7.5
)
final = client.done.result()
hub.close()
```

主方法为**同步**。网络 `send` / WS `done` / `closed` 在需要完成句柄时暴露 `concurrent.futures.Future`。

---

## 2. 核心概念

**XAIOP 线文**是流式、面向行的**游标构造协议**。旧称 “eXtensible AI Output Protocol” **不是**定义本身。本 SDK 文档描述的是**已封存协议包 0.6.0**（SDK **0.15.1**）的 Python 实现。

- 完整语法：[../../protocol/syntax.zh-CN.md](../../protocol/syntax.zh-CN.md)（若无则见 [syntax.md](../../protocol/syntax.md)）
- 封存与发布索引：[../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md)
- Node 参考 API：[../nodejs/API.zh-CN.md](../nodejs/API.zh-CN.md)

### 2.1 线文行（Labels）

| 形式 | 作用 |
| --- | --- |
| `>` / `>name` / `>name-` / `<` | 进入 / 离开结构（对象、具名对象、具名数组） |
| `-` | 进入匿名数组元素 |
| `key:value` / `:value` | 内容（键值 / 数组元素） |
| `.` | 将 Cursor 重置到 Root；退出广播；界定一个**相位** |
| `=path` | 模糊定位（不创建；零命中 → 语法错误） |
| `@path` | 自 Root 的精确路径；**创建**缺失的对象段并进入 |
| `!path` | 广播：匹配所有完整路径片段；后续行在每个 Cursor 上执行 |
| `?selector` | 数组局部选择（`?2` · `?id:A2` · `?*` · `?*k:v`）；不创建 |
| `&path` | 删除最深键；**不**移动 Cursor |
| `&` | 删除当前直接数组元素；落到父数组 |

路径段使用 `>`（例如 `@a>b`、`&a>b`）。禁止裸 Labels、裸 `&`（直接数组元素上除外）、在 Root 的裸 `<`，以及值内换行。

**示例：**

```text
>
>user
name:Alice
<
.
&user
>user
name:Bob
<
```

完整语法：[../../protocol/syntax.zh-CN.md](../../protocol/syntax.zh-CN.md)（若无则见 [syntax.md](../../protocol/syntax.md)）

### 2.2 相位（Phase）

`.` 将 Cursor 重置到 Root，并作为流式 **Diff 边界**（SDK 策略：相位落在 `.` 上，而非 Block）。  
含 `=` / `!` / `&` 的相位必须看到**迄今累计树**；官方流式器对这些相位解析累计前缀。

### 2.3 Root 形态

| 开端 | 结果 |
| --- | --- |
| `>` | 完整匿名**对象**根 |
| `-` | 完整匿名**数组**根 |
| `>name` / Root Content 等 | 严格模式 → **`XaiopFragment`**（无外层 `{}`） |

空源 → `{}`。Compat `forcedRoot` 为片段开端注入对象根，且永不返回 fragment。

### 2.4 `&` 删除（协议语义）

| 规则 | 行为 |
| --- | --- |
| 最深键 | `&a>b` 只删除 `b`；父节点可保留为 `{}` |
| 单 Cursor | 路径自 Root **绝对** |
| 缺失 | 静默 **no-op**（永不创建） |
| 文档根 | **仅对象**；数组根 / fragment 根 → 语法错误 |
| Cursor 链 | 删除当前 Cursor 或其祖先 → **语法错误** |
| 广播 | `&path` 相对每个 Cursor；该 Cursor 上缺失 → 对该 Cursor no-op；任一链冲突 → 整行失败 |
| 数组 | 可删除整个具名数组值。元素删除用 `?` / `>` 之后的裸 `&`；`&path` 无下标段 |
| Cursor | `&path` **不改变** Cursor；后续 Content 仍写在先前 Cursor。裸 `&`（删元素）**会**落到父数组 |

### 2.5 `#` 自定义注解传输（协议）

以 `#` 开头的独立行是**自定义注解传输**（官方名称；不是“注释”）。位置无限制；协议不解释 `#` 之后的文本；解析器忽略它（无 Cursor / 树副作用）。`note:#x` 仍是 Content。`#` 前有前导空白的行**不是**该原语。

### 2.6 Cover 与非 Cover（仅流式 Diff）

`cover` 是 **SDK 流式选项**（默认 `False`）。它不改变最终键集：`finish` 之后 Snapshot ≡ `parse_sync(wire)`。

| `cover` | Diff 行为 |
| --- | --- |
| `False`（默认） | `&` 更新 live / Commit 树；**已发出的 Diff 不回写** |
| `True` | 连续 `&` → 强制 `.` → 最深键 **`None` 墓碑 Diff** → 用 `>` 链恢复 Cursor → 继续 |

勿混淆三种 null：

| 种类 | 含义 |
| --- | --- |
| Diff 墓碑 `None` | Cover 模式下删除相位的 Diff 值（键存在，值为 `None`） |
| Content 类型化 `null` | 线文 `key:null` / `:null`（协议 Content） |
| 空相位 chunk `None` | 空流式相位 / 无 Diff 的投递值 |

---

## 3. 解析 API

### 3.1 `parse_sync`

```python
parse_sync(source, compat_or_options=False) -> Any | XaiopFragment
```

将完整 XAIOP 文本解析为 JSON 或 Fragment（同步）。Python 门面上**没有**公开的 `parse_async`（同步优先）。

**参数：**

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `source` | `str` | — | 完整 XAIOP 文本；非 str → `TypeError` |
| `compat_or_options` | `bool \| CompatPolicy \| dict` | `False` | `False` 严格；`True` 全部八项修复；`CompatPolicy` / 部分 dict 覆盖；options dict 可含 `compat` / `symbolKeys`（`symbol_keys`） |

**返回：**

- 完整文档 → 普通 `dict` / `list`
- 根片段（严格模式）→ `XaiopFragment`（使用 `.entries`）
- 空源 → `{}`

```python
from xaiop import parse_sync, CompatPolicy

parse_sync(">\na:1\n")
parse_sync(text, True)
parse_sync(text, {"forcedRoot": False})  # 其余修复保持默认 True
parse_sync(text, CompatPolicy({"popAndRetry": False}))
parse_sync(text, {"compat": True, "symbolKeys": True})
```

**不对称：** 自由函数 `parse_sync` 接受细粒度 compat / options；`XaiopEngine.parse_sync`（静态）**仅接受布尔**。

### 3.2 `LiveParser`

增量解析器：喂入行 / 文本；语义 ≡ 对拼接结果做 `parse_sync`。供流式 checkpoint 使用，避免每次 `.` 重扫整个前缀。

```python
LiveParser(compat_or_options=False)
feed_line(line) -> LiveParser
feed_text(text) -> LiveParser
feed_lines(lines) -> LiveParser
value() -> Any | XaiopFragment   # live 引用 — 对外暴露前请 clone
cursor_restore_lines() -> list[str]  # cover 恢复用的 `>` / `>name-` 链；在 Root → []
```

| 方法 | 说明 |
| --- | --- |
| `feed_line` | 完整逻辑行（无尾随 LF/CRLF）。`""` → `empty line is a Content syntax error` |
| `feed_text` | 按 `parse_sync` 方式切分 — **跨调用无半行缓冲**；无 LF 的尾段仍算一整行。任意网络分片请用 `DotCheckpointEngine.push` / `XaiopStream` |
| `value` | 当前文档（后续 feed 原地变更） |
| `cursor_restore_lines` | 广播激活时不可用；栈上有匿名 / 数组元素帧 → 语法错误 |

**尾 `\n`：** encode 默认以一个 `\n` 结尾（`trailing_newline=True`）。`parse_sync` / `feed_text` 会丢掉末尾空段。不要把 `encode_sync(x).split("\n")` 喂进 `feed_line` — 最后的 `""` 是终止符，不是一行 Content。`feed_line` 仍是逐行原语；跳过那个空串，或整段交给 `feed_text`。

```python
from xaiop import LiveParser

live = LiveParser()
# OK：完整行（无 LF 的尾随未完成段仍算一行）
live.feed_text(">\n>a\nx:1\n.\n>b\ny:2\n")
live.cursor_restore_lines()  # → [">b"]
live.value()                 # → {"a": {"x": 1}, "b": {"y": 2}}
# 不适合 TCP/WS 字节切片：feed_text(">me") 再 feed_text("ta\n") ≠ feed_text(">meta\n")
```

### 3.3 `XaiopFragment`

严格模式下，当无匿名根且文档以 `>name` / Root Content 开端时返回。

| 成员 | 含义 |
| --- | --- |
| `entries` | Root 上的具名绑定 |
| `is_fragment` | 恒为 `True` |
| `notation()` | 调试字符串，例如 `'"a":{}'` |

流式 / WS JSON 面运行 `materialize_snapshot`：fragment → `entries` 的 clone。Engine `get_sync` 保留 fragment。

辅助：`materialize` / `materialize_owned` / `materialize_snapshot`。

---

## 4. 编码 API

### 4.1 `encode_sync`

```python
encode_sync(
    value,
    *,
    root="auto",
    style="reset",
    dot_policy=DOT_POLICY["PER_TOP_LEVEL_KEY"],  # "perTopLevelKey"
    phase_every=None,
    max_phases=None,
    final_dot=False,
    key_order="insertion",
    null_policy="encode",
    undefined_policy="omit",
    should_phase=None,
    symbol_keys=False,
    trailing_newline=True,
) -> str
```

将**普通 JSON** 编码为**严格** XAIOP（兼容模式**永不**改变 encode 输出）。门面上**没有**公开的 `encode_async`（同步优先；与没有 `parse_async` 相同）。Node 的 `encode` / `encodeAsync` 对应本函数。  
自由函数 / `XaiopEngine.encode_sync` 对同一 `(value, options)` 产出相同线文。

**保证：** 对可接受的值，`parse_sync(encode_sync(value, …))` 与 `value` 深度相等；当 `trailing_newline=True`（默认）时线文以恰好一个 `\n` 结尾（终止符，不是一行 Content — 见 §3.2）。  
**不保证：** `encode(parse(手写线文))` 字节级相同。  
**浮点记号：** 线文格式与 ECMAScript `Number#toString` 对齐，供共享 fixture / golden CI。

**拒绝的字符串值（抛 `XaiopEncodeError`）：** **以 U+0020 SPACE 开头**（`:` 后的强制字符串标记不是载荷 — 发出此类值会在解析时静默剥掉前导空格）。Tab（`U+0009`）与尾随空格仍可编码。值里的语义 CR/LF 编码为 `\n` / `\r`（协议 **0.7.0**）；Content 载荷内从不放置物理换行。

```python
from xaiop import encode_sync, DOT_POLICY

encode_sync({"a": 1, "b": 2})  # 默认 perTopLevelKey
encode_sync({"a": 1, "b": 2}, dot_policy=DOT_POLICY["NONE"])
encode_sync({"a": 1, "b": 2, "c": 3}, dot_policy="perNKeys", phase_every=2)
encode_sync(obj, dot_policy=["meta", "items[0]"])  # 路径切割
```

引擎便捷方式（options dict；解包时键可为 snake_case kwargs）：

```python
engine.encode_sync(value, {"dot_policy": "none"})
```

### 4.2 编码选项

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `root` | `"auto"` | `"object"` \| `"array"` \| `"auto"` \| `"fragment"` |
| `style` | `"reset"` | `"reset"` 在相位间插入 `.`；`"relative"` 仅与 `dot_policy: "none"` 合用 |
| `dot_policy` | `"perTopLevelKey"` | `"none"` \| `"perTopLevelKey"` \| `"perNKeys"` \| `"custom"` \| `list[str]`（JSON 路径；每个列出的节点后加 `.`） |
| `phase_every` | `None`（`perNKeys` 时为 `1`） | `perNKeys` 时每相键数 |
| `max_phases` | — | 相位数量上限（尾部合并） |
| `final_dot` | `False` | 追加尾随 `.` |
| `key_order` | `"insertion"` | 或 `"sorted"` |
| `null_policy` | `"encode"` | `"encode"` 类型化 null；`"omit"` 丢弃对象 null 键（数组仍编码）；`"error"` 遇 null 抛错 |
| `undefined_policy` | `"omit"` | `"omit"` \| `"error"`（Python 无 `undefined`；为对等 / 稀疏钩子保留） |
| `should_phase` | — | `dot_policy: "custom"` 时必需 |
| `symbol_keys` | `False` | 可选 U+001F label-escape 方言，使键可始于 `#` `@` `>` `<` `=` `!` `&` 或 U+001F；**encode 与 parse 均须启用**；见 [label-escape](../../protocol/notes/label-escape.md) |
| `trailing_newline` | `True` | 以 `\n` 收尾 |

路径列表重载与 `phase_every` / `max_phases` / `should_phase` **互斥**；要求 `style: "reset"`；数组下标必须是路径的**最后一段**。辅助：`parse_json_path` / `format_json_path`（在 `xaiop.encode`；JSON 路径 `items[0]`；线上定位用 `>` — `@items>it_1`；亦供类型路径 / Annotation Span 使用）。

### 4.3 拒绝的键

这些键抛 `XaiopEncodeError`（无静默改形）：

| 形式 | 原因 |
| --- | --- |
| 空 / 空白 / 含 `:` | 非法 Label 名 |
| 以 `-` 结尾 | 与 `>name-` 数组进入冲突 |
| 键体内含 `>` `<` `=` `!` **`&`** | Cursor / 定位 / 删除算子歧义 |
| **以** `#` `@` `>` `<` `=` `!` `&` 或 **U+001F** **开头** | 行类 / 保留转义引入符 — 除非 `symbol_keys=True` |

**不是通用 JSON 序列化。** RFC 8259 合法键如 `a:b`、`""`、`"a b"`、`"tags-"`、`"a>b"` 在这里仍会抛。`symbol_keys` 只逃逸**行类首字符**，**不解**体里的 `:` / 空白 / 算符。含 CR/LF 的字符串值是合法 JSON，encode 经 `\n` / `\r` 发出。Unicode 名在合法 Label 时可用。宿主独有值（与 JSON `null` 相对的省略等）是另一套 encode 策略，不是这条缺口。约束放在 **JSON → encode** 边界（`upload_json_sync`）；反方向 parse / 物化就是普通 JSON。见 [label-escape](../../protocol/notes/label-escape.zh-CN.md)。

常量：`DOT_POLICY` · `LABEL_ESCAPE_INTRODUCER`（`"\u001f"`）。

---

## 5. 引擎 API

`XaiopEngine`：内存存储（运行时 data id）外加 parse / encode / merge-inject。兼容模式默认**关闭**。**同步优先**方法名（`*_sync`）。

```python
from xaiop import XaiopEngine

engine = XaiopEngine()
engine_compat = XaiopEngine(compatibility_mode=True)
```

### 5.1 存储

| API | 返回 | 说明 |
| --- | --- | --- |
| `upload_sync(source)` | `data_id` | 解析完整 XAIOP → 入库；遵循实例 compat |
| `upload_json_sync(value, encode_options?)` | `data_id` | 严格 encode → upload |
| `get_sync(data_id)` | JSON 或 `XaiopFragment`（clone） | 未知 id → `ValueError` |
| `has` / `delete` / `clear` | — | 存储管理 |

### 5.2 实例 encode / merge

| API | 说明 |
| --- | --- |
| `encode_sync` | 与自由函数相同；**忽略** compat 开关 |
| `merge_to_json_sync` | 基 JSON + XAIOP → JSON（parse 用实例 compat；可通过 `options["compat"]` 覆盖） |
| `merge_to_xaiop_sync` | → XAIOP 线文 |
| `inject_xaiop_sync` | 向已有 `data_id` 注入 XAIOP（变更存储） |
| `inject_json_sync` | 向已有 `data_id` 注入 JSON |

### 5.3 静态方法

| API | 说明 |
| --- | --- |
| `XaiopEngine.parse_sync` | 第二参**仅布尔** |
| `XaiopEngine.encode_sync_static` | 与自由 `encode_sync` 相同 |
| `XaiopEngine.merge_to_json_static` / `merge_to_xaiop_static` | 与自由函数相同 |

### 5.4 兼容开关（实例）

| API | 说明 |
| --- | --- |
| `compatibility_mode` / `set_compatibility_mode` | 总开关；**不**重置各项 fix 标志；打开 compat **会清除** `type_check` |
| `compat_forced_root` … `set_compat_locate_path_array_suffix` | 八项细粒度修复；若模式关闭或参数非 bool，setter 返回 `False` 且状态不变 |

Fix ID（`CompatPolicy` 上的 camelCase 属性）：`forcedRoot`、`rewriteBareNameArray`、`rewriteEnterLine`、`ignoreBareLeaveAtRoot`、`popAndRetry`、`locatePathTrim`、`locatePathStripSpaces`、`locatePathArraySuffix`。

### 5.5 类型检查（实例）

**非协议：** 注册 / 冻结 / 推送是 **SDK** 产品特性；不改写线文语法。模块：`xaiop.types`。

| API | 说明 |
| --- | --- |
| `type_check` / `set_type_check(enabled)` | 总开关（默认 `False`）；**仅严格模式**；打开 compat **会清除**它；开启时 `upload_*` / `inject_*` 走注册表检查 |
| `TYPE` | 叶子/结构常量：`INT` `FLOAT` `BOOL` `STRING` `NULL` `OBJECT` `ARRAY` `ANY` |
| `object_type(fields)` / `array_type(element)` | 构建器；亦接受表层糖字符串 |
| `register_type(path, type_, options?)` | 绑定 JSON 路径；`polarity`：`"allow"`（默认）\| `"deny"`；**一经设定不可变**（再注册 → `False`） |
| `register_types(map\|entries, options?)` | 批量 |
| `register_type_deny(path, type_)` | 拒绝辅助 |
| `get_registered_type` / `type_registry` / `export_type_schema` | 查询与快照 |
| `encode_type_schema_frame()` | 编码控制帧（连接上优先用 `push_type_consistency`） |
| `on_type_violation(fn\|None)` | 违规钩子（在抛 `XaiopTypeError` **之前**调用） |

**路径惯例：** `data.fork`、`items[0]`（encode `parse_json_path`）。线上 `@` / `=` / `!` / `&` 用 `>`（`@items>it_1`）——不要混用。

**可选表层糖：** `string`、`array<int>`、`object<name:string,old:int>` → 按**规范**类型比较。

**服务端检查（`type_check` + 注册表）：**

| 规则 | |
| --- | --- |
| 范围 | **仅已注册路径**；未注册路径被注册表忽略 |
| `allow` | 值必须匹配；`int` ≠ `float`（与 encode 同一拆分） |
| `deny` | 值必须**不**匹配该类型 |
| `any` | 显式忽略（不可组合 `deny` + `any`） |
| 空注册表 | 启用检查无操作 |
| 时机 | `upload_sync` / `upload_json_sync` / `inject_xaiop_sync` / `inject_json_sync` |

```python
from xaiop import XaiopEngine, TYPE, object_type, array_type

eng = XaiopEngine()
eng.register_type("data.fork", TYPE["STRING"])
eng.register_type("user", object_type({"name": TYPE["STRING"], "old": TYPE["INT"]}))
eng.register_type("items", array_type(TYPE["INT"]))
eng.register_type_deny("data.bad", TYPE["STRING"])
eng.register_type("meta.note", TYPE["ANY"])
eng.set_type_check(True)
eng.upload_sync(">\n>data\nfork:ok\n")  # OK
```

**客户端（`XaiopWs` / `XaiopStream`，`type_check=True` / `typeCheck=True`）：**

| 规则 | |
| --- | --- |
| 冻结 | 路径上首次**非 `None`** 观测锁定类型；后续值必须兼容 |
| `None` / 线文 null | 客户端**跳过**（不刷新、不报错），以免破坏删除/清空原语 |
| 数组 | 检查开启时元素类型须**同质** |
| 刷新 | 键从 commit 中消失（删除）清除子树冻结；删除后重建可改类型 |
| 无 schema 推送 | 首次所见冻结仍强制一致性 |
| Schema 推送 / 预载 | `allow` / `deny` / `any` 优先；**违反 schema 的观测不写入冻结**；`any` **不**锁定冻结 |
| 选项 | `type_check` / `typeCheck`、`type_schema` / `typeSchema`；兼容模式开启时 **typeCheck 被忽略** |

**类型一致性推送（WS）：** `conn.push_type_consistency(engine|registry|snapshot)`

| 前提 | |
| --- | --- |
| 连接 | **严格**（`compatibility_mode is False`） |
| 载荷 | 非空注册表；若传 `XaiopEngine`，其 **`type_check` 必须为 True** |
| 形态 | 控制帧（**非** XAIOP 线文）：前缀 `#!xaiop/types/v1\n` + JSON 快照；由控制根在 parse / Span 之前 demux |
| 失败 | 前提不满足 → `TypeError`；套接字未打开 → `False` |

深入（Node 笔记语义适用）：[../nodejs/notes/typecheck.md](../nodejs/notes/typecheck.md)。

---

## 6. 流式 API

### 6.1 `XaiopStream`

HTTP / SSE / RAW **消费端**（`xaiop.stream`）。文本喂入 `DotCheckpointEngine`，在 `.` 上发出 Diff，并在 EOF 解析最终 Snapshot。  
**WebSocket 会话**使用 `XaiopWs`（§7），而非流客户端上的 `TRANSPORT_KIND`。

```python
from xaiop import XaiopStream, STREAM_MODES, TRANSPORT_KIND

stream = XaiopStream(
    url,
    stream_processing=True,      # 默认
    compatibility_mode=False,    # 默认
    merge_chunk_window=True,     # 或 mergeChunkWindow=True
    async_parse=False,
    history_snapshot=False,
    history_realtime=False,
    retain_wire_history=True,
    cover=False,
    modes=[STREAM_MODES["CALLBACK"]],
)

stream.on_chunk(lambda diff, meta=None: None)
stream.on_done(lambda json_doc: None)
fut = stream.send(transport=TRANSPORT_KIND["HTTP"])
```

#### 构造选项

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `stream_processing` / `streamProcessing` | `True` | 流中相位 Diff；`False` → 结束时一块 |
| `merge_chunk_window` / `mergeChunkWindow` | `True` | 窗口内全部完整 `.` → **一个** Diff |
| `async_parse` / `asyncParse` | `False` | 传输使用 `push_async` |
| `history_snapshot` / `historySnapshot` | `False` | 只读 `.` 历史 |
| `history_realtime` / `historyRealtime` | `False` | 前向 `jump_to` |
| `retain_wire_history` / `retainWireHistory` | `True` | 开启 history 时保留线文切片 |
| `cover` | `False` | `&` 的 Cover Diff（§2.6） |
| `compatibility_mode` / `compatibilityMode` | `False` | 与 Engine 相同 |
| `type_check` / `typeCheck` | `False` | 客户端冻结 / schema 检查（§5.5）；兼容模式同时开启时忽略 |
| `type_schema` / `typeSchema` | — | 预载类型快照或 `TypeRegistry` |
| `symbol_keys` / `symbolKeys` | `False` | Label-escape 方言 |
| `line_intercept` / `lineIntercept` | — | 初始行拦截处理器或列表（§6.4） |
| `annotation_span` / `annotationSpan` | — | 初始 Annotation Span 处理器或列表（§6.5） |
| `session` / 控制回调 | — | 可选控制根入站游标（§7.6） |
| `modes` | `["callback"]` | 允许多选 |

#### Snapshot / chunk

| API | 时机 | 值 |
| --- | --- | --- |
| `on_chunk` / `chunks()` | 相位 / 窗口边界 | Diff JSON；空相位可为 `None`；第二参 `meta` 可含 `seq` / `seqs` 与 `typeCheckEscapePaths` |
| `get_committed_snapshot()` | 每次 commit 后 | 截至上次 `.` / EOF 的累计 later-wins |
| `buffer_stats()` / `compact_committed(drop_history=…)` | 流中 | 接收缓冲大小 / 丢弃已提交线文（保留 live 树） |
| `get_snapshot()` / `on_done` | finish 后 | 全缓冲解析；空 → `{}` |
| 流中 `get_snapshot()` | `streaming` | 通常为 `None` |

这些面上的 Fragment 会物化为普通对象（`materialize_snapshot`）。

#### 投递模式

| 模式 | 表面 |
| --- | --- |
| `callback`（底线） | `on_chunk` / `on_done` / `on_error`；亦含行拦截 / Annotation Span |
| `promise` | `send()` → 最终 Snapshot 的 `Future` |
| `asyncIterator` | 同步迭代器 `chunks()`（模式名保留以对齐 Node） |
| `events` | `on("chunk"\|"done"\|"error"\|"status")` |

`set_modes` 永不留下空集（保留 `callback`）。忙碌时再次 `send`：promise 模式 → 失败的 `Future`；否则抛错。

#### `send` 要点

| 项 | 规则 |
| --- | --- |
| 默认传输 | `http`（`TRANSPORT_KIND["HTTP"]`） |
| SSE | 设置 `Accept: text/event-stream`；多行 `data:` 以 `\n` 拼接 |
| RAW | 需要 `source`（文本块可迭代）— 或 `send_raw(chunks)` |
| 二进制 | 跨分片流式 UTF-8 解码 |
| `abort()` | 状态 `aborted` |
| HTTP 客户端 | 默认标准库；可用时经 `[http]` extra 使用可选 `httpx` |

状态机：`idle → connecting → streaming → completing → completed`（或 `aborted` / `error`）。常量：`STREAM_STATUS`、`TRANSPORT_KIND`（`http` / `sse` / `raw`）、`STREAM_MODES`；`is_stream_busy(status)`。

```python
# 同步相位迭代器
stream = XaiopStream(url, modes=["callback", "asyncIterator"])
# 按需在线程中启动 send / 启用 promise
for diff in stream.chunks():
    ...
```

### 6.2 `DotCheckpointEngine`

底层 `.`-相位解析器（用于 `XaiopStream` / WS 内部；亦可直接使用）。以 **hooks dict** 构造（camelCase 或 snake_case 键）。

```python
from xaiop import DotCheckpointEngine

eng = DotCheckpointEngine({
    "streamProcessing": True,   # 默认
    "mergeChunkWindow": True,   # 默认
    "emitDiff": True,           # 默认；False → 仅 Commit/最终
    "cover": False,
    "historySnapshot": False,
    "historyRealtime": False,
    "retainWireHistory": True,
    "compat": False,
    "lineIntercept": None,      # 或 handler / 列表
    "annotationSpan": None,     # 或 handler / 列表
    "onChunk": lambda diff, meta=None: None,
})
eng.push(chunk)
eng.buffer_stats()       # {length, committedAt, pendingBytes, openPhase}
eng.compact_committed()  # 丢弃已提交线文；保留 live 树
eng.finish()
eng.snapshot             # 最终
eng.committed_snapshot   # 上次 commit
eng.history              # ParseHistory | None
eng.on_line_intercept(fn)
eng.on_annotation_span(fn)
```

| 选项 | 默认 | 说明 |
| --- | --- | --- |
| `streamProcessing` | `True` | 流中 `.` 相位 + 行扫描路径（拦截 / Span）。无该标志的裸构造**开启**。 |
| `mergeChunkWindow` | `True` | 缓冲窗口内批量完整 `.` → 一个 Diff |
| `emitDiff` | `True` | 仅需 Commit / 最终快照时设 `False` |
| `cover` | `False` | `&` 的 Cover 模式 Diff |

| 方法 | 说明 |
| --- | --- |
| `push` / `push_async` | 同步摄入 / 线程调度合并扫描 |
| `finish` / `finish_async` | 冲刷尾部 |
| `buffer_stats()` | `{length, committedAt, pendingBytes, openPhase}`。`pendingBytes` **必须**等于 `length - committedAt` |
| `compact_committed(drop_history=False)` | 丢弃 `buffer[0..committedAt)`；保留 live 树。引擎已关闭、`historyRealtime`+`retainWireHistory`、或非空 history 时**必须**抛错 — 除非 `drop_history=True` |
| `jump_to(index)` | 需要 `historyRealtime`；丢弃索引之后的节点 |
| `on_line_intercept` / `clear_line_intercepts` | 完整行切分后、parse 前；见 §6.4 |
| `on_annotation_span` / `clear_annotation_spans` | 相位 `#` span；见 §6.5 |
| `stream_processing` / `merge_chunk_window` | 解析后默认值的只读属性 |
| `note_log_seq(seq)` | 为 Diff `meta` 排队会话日志 seq（§7.6） |

### 6.3 `ParseHistory` / Snapshot 辅助

当 `history_snapshot` 和/或 `history_realtime` 开启时，由 checkpoint 构建历史。

| API | 说明 |
| --- | --- |
| `info()` / `export_time_root()` | 元数据 / 节点列表（快照模式） |
| `get_node` / `get_diff` / `get_before` / `get_after` | 按索引读取 |
| `compare` / `view_range` | 比较 / 范围视图（快照） |
| `jump_to` / `can_jump_to` | 实时**仅前向**跳转 |
| `set_source` / `release` | 关联源键 / 释放 |
| 越界 / 后向跳转 | 抛 `xaiop.RangeError` |

`materialize_snapshot(parsed)`：Fragment → 普通对象（JSON 面）。

深入笔记（Node，语义适用）：[../nodejs/notes/streaming-parse.md](../nodejs/notes/streaming-parse.md) · [../nodejs/notes/history.md](../nodejs/notes/history.md)。

### 6.4 行拦截（`on_line_intercept`）

**SDK 产品特性**（非线文语法）：checkpoint **接收缓冲**切出完整逻辑行之后、**喂入** `LiveParser` **之前**，按**注册顺序**运行处理器。

| 对照 | 行拦截 | `on_phase` / `on_chunk` |
| --- | --- | --- |
| 层 | 缓冲行边界（切分后） | 相位 Diff（parse + Commit 后） |
| 粒度 | 每条完整行 | `.` 相位（可窗口合并） |
| 改写 / 跳过 | **是**（返回 `str` 或 `None`） | **否** |

```python
from xaiop import LINE_KIND, DotCheckpointEngine

def intercept(ctx):
    view = ctx["view"]
    if view.kind == LINE_KIND["ANNOTATION"]:
        return None  # 跳过该行
    if view.kind == LINE_KIND["CONTENT"] and view.key == "x":
        return "x:42"  # 改写
    return ctx["raw"]  # 保留（Python 无 `undefined`；返回当前文本）

eng = DotCheckpointEngine({"onChunk": lambda d, m=None: None})
eng.on_line_intercept(intercept)
```

处理器约定（与 Node 对齐）：

| 返回 | 含义 |
| --- | --- |
| `str` | 下游喂入文本；下一处理器可见（用 `ctx["raw"]` **保留**） |
| `None` | **跳过该行**（短路；后续处理器不调用） |

**三种 null（勿混淆）：** 拦截跳过 ≠ Content `key:null` ≠ 空相位 Diff `None`。

**固定模板 `LineView`：** `kind` · `raw` · `name` · `path` · `key` · `value_text` · `annotation_text`。亦导出：`LINE_KIND` / `classify_line` / `run_line_intercept_chain`。

| 边界 | 行为 |
| --- | --- |
| `stream_processing=False` | 全缓冲解析；拦截器**不**运行 |
| 跳过 `.` / 改写为 `.` | 相位关闭遵循**拦截后**文本 |
| `merge_chunk_window` / `cover` / `push_async` | 有效行之后沿用既有相位规则 |
| `jump_to`（`history_realtime`） | 重建**重跑**拦截链 |
| 存在拦截器 → Diff 自有解析 | 使用**有效**行线文（可能与传输缓冲不同） |

表面：`DotCheckpointEngine` · `XaiopStream` · `XaiopWsConnection`（构造 `line_intercept` / `lineIntercept` 和/或 `on_line_intercept` / `clear_line_intercepts`）。

深入：[../nodejs/notes/line-intercept.md](../nodejs/notes/line-intercept.md)。

### 6.5 Annotation Span（`on_annotation_span`）

**SDK 产品特性**（非线文语法）：线文 `#…` 仍无树副作用。在**本相位**行就绪之后、**Diff / Commit / `typeCheck` 之前**，对 `#` 收集**向前同级**兄弟（+ 子树），以**注解文本 + 模板 JSON** 调用处理器，并 remount / 丢弃 / 保留。以 `#!` 开头的行是控制根：在 Span 之前 demux；Span **硬跳过**任何剩余的 `#!`。

| 对照 | 行拦截 §6.4 | Annotation Span §6.5 |
| --- | --- | --- |
| 层 | 缓冲行切分 | 相位行（面向 JSON 的捕获） |
| 触发 | 每条完整行 | `#` + 向前同级区域 |
| 处理器输入 | 线文 `view` | `annotation` + 物化后的 `json`（无 `=`/`@`/`!` 形态） |
| 保留哨兵 | — | **`AnnotationSpan.KEEP`**（Node `undefined`） |
| vs typeCheck | 正交 | **在 typeCheck 之前**；处理区域**逃逸**类型检查 |

```python
from xaiop import AnnotationSpan

def on_span(annotation, view):
    if "tag" not in annotation:
        return AnnotationSpan.KEEP  # 保留线文；仍逃逸捕获键
    if "drop" in annotation:
        return None  # 丢弃 # + 捕获
    return {**view.json, "rewritten": True}  # remount

eng.on_annotation_span(on_span)
```

| 返回 | 含义 |
| --- | --- |
| `AnnotationSpan.KEEP` | 保留 `#` + 捕获线文；**仍**为捕获键记录逃逸路径 |
| `None` | 丢弃 `#` + 捕获 |
| object / list / JSON 文本 | 编码为替换捕获的兄弟线文 |

**TypeCheck 逃逸（必须理解）：** 一旦本相位对某个 `#` **调用** Span 处理器链，处理器处理的区域与该向前区域覆盖的同级键进入 `meta.typeCheckEscapePaths`；之后 `observeTree` **跳过**这些路径（及后代）。`#` **之前**的同级键**不**逃逸。

表面：构造 `annotation_span` / `annotationSpan` · `on_annotation_span` · `clear_annotation_spans`。辅助：`apply_annotation_spans` / `encode_as_sibling_lines` / `path_escapes_type_check`。

深入：[../nodejs/notes/annotation-span.md](../nodejs/notes/annotation-span.md)。

---

## 7. WebSocket API

长生命周期骨架会话（同一连接上推送 + 消费）优先使用 `XaiopWs`。HTTP/SSE/RAW 继续用 `XaiopStream`。  
需要可选 extra：`pip install "xaiop[ws]"`（`websockets`）。  
**线文**不定义 `connect` / Future / 回调顺序；以下为与 Node 对齐的**锁定 Python SDK** 行为。深入：[../nodejs/notes/ws-session.md](../nodejs/notes/ws-session.md)。

### 7.1 `XaiopWs`

```python
from xaiop import XaiopWs

hub = XaiopWs.listen(host="127.0.0.1", port=0)
hub.on_connection(lambda conn, _req: (
    conn.push_json("a", 1),
    conn.push_json("b", {"x": 2}, final=True),
    conn.end(),
) and None)

client = XaiopWs.connect(
    hub.url(),
    on_phase=lambda diff, meta=None: None,  # 可能在 connect 返回前运行 — §7.5
)
json_doc = client.done.result()  # connect 返回时可能已 settled
hub.close()
```

| API | 说明 |
| --- | --- |
| `XaiopWs.listen(**options)` | → `XaiopWsHub` |
| `XaiopWs.connect(url, **options)` | → `XaiopWsConnection`（处理器锁定）；缺 `websockets` 时抛 `ImportError` |
| `XaiopWs.encode_phase_json` / `encode_phase_object` | 仅编码（不发送）；亦为自由函数 |

**Connect 选项：** `stream_processing`、`merge_chunk_window`、`async_parse`、`cover`、`compatibility_mode`、`type_check`、`type_schema`、`symbol_keys`、`line_intercept`、`annotation_span`、**`session`**、**`auto_session`**、**`auto_ack`**、**`retain_outbound`**、`protocols`、`handshake_timeout_ms` / `handshakeTimeoutMs`（默认 **15000**）、`headers`，以及构造时的 `on_phase` / `on_chunk` / `on_done` / `on_error` / **`on_control_error`** / **`on_session`** / **`on_resume`** / **`on_ack`** / **`on_snapshot`**。接受 camelCase 别名。

**Listen 选项：** 上述 parse/control 相关选项 + `host` / `port` / …

### 7.2 `XaiopWsConnection`

| 成员 | 说明 |
| --- | --- |
| `push_json(key, value, final=False, …)` | 每相一键；非 final 保证尾随 `.\n`；未打开 → `False` |
| `push_object(obj, final=False, …)` | 一相内多键 |
| `push_wire(text)` | 原始线文**原样**（无自动 `\n`）；连续帧须已行安全 |
| `push_wire_ln(text)` | 类似 `push_wire`，但当 `text` 尚未以 LF 结尾时追加 `\n` |
| `push_type_consistency(engine\|registry\|snapshot)` | 推送已注册类型 schema（控制帧）；前提见 §5.5 |
| `session_id` / `auto_session` / `auto_ack` / 出站日志 | 控制会话 / hello / 自动 ack / 出站日志（§7.6） |
| `send_session` / `send_ack` / `send_resume` / `send_snapshot` | 出站控制帧 |
| `get_resume_state()` / `phase_seq` / `outbound_seq` / `acked_seq` / `log_seq` | 续传游标 |
| `outbound_log` / `replay_outbound_after` / `note_outbound_phase` | 生产者出站相位日志 |
| `ResumeWireLog` | 应用拥有的跨重连持久日志 |
| `type_check` | 只读；客户端类型检查是否开启 |
| `on_phase` / `on_chunk` | Diff 回调；**`(diff, meta?)`**，含 `seq` / `seqs`；**`connect` 后锁定** |
| `on_line_intercept` / `clear_line_intercepts` | 缓冲行拦截（§6.4）；**`connect` 后锁定** |
| `on_annotation_span` / `clear_annotation_spans` | 相位 Annotation Span（§6.5）；**`connect` 后锁定** |
| `on_done` / `on_error` / 控制回调 | 最终 / 错误 / 控制；**`connect` 后锁定** |
| `handlers_locked` | 成功 `XaiopWs.connect` 后为 `True` |
| `get_committed_snapshot` / `get_snapshot` | 与 Stream 相同：流中已提交；`get_snapshot()` 在最终前为 `None` |
| `done` | 对端关闭 + `finish` 后最终 Snapshot 的 `Future` |
| `closed` | `Future` — 套接字拆除完成 |
| `end` / `abort` | 排空关闭 / 中止 |

### 7.3 `XaiopWsHub`

| 成员 | 说明 |
| --- | --- |
| `url(host?)` | 连接 URL |
| `on_connection` / `on_error` | 接受回调（此处可**同步** `push_*`） |
| `connections` | 当前连接 |
| `close()` | 关闭 hub |
| `port` | 绑定端口 |

Listen 接受的连接保持**未锁定**，以便生产者/消费者仍可在 `hub.on_connection` 中挂接处理器。

### 7.4 `encode_phase_json` / `encode_phase_object`

```python
encode_phase_json(key, value, *, final=False, encode_options=None) -> str
encode_phase_object(obj, *, final=False, encode_options=None) -> str
```

内部使用 `encode_sync`（默认 `dot_policy: "none"`）；`final=True` 省略相位 `.`。非法键仍抛 `XaiopEncodeError`。

### 7.5 `connect` Future 与回调时序（注意）

内部 `connect` 顺序：**打开套接字 → 构造 `XaiopWsConnection`（绑定 reader + 选项回调）→ 返回**。

| 显式语义 | |
| --- | --- |
| `connect` 返回意味着 | 握手成功；返回可用连接对象 |
| `connect` 返回**不**意味着 | “尚无 `on_phase` / `on_done`”或“`done` 未 settled” |
| SDK **不**缓冲相位直至返回后 | 有意为之 — 避免 accept 侧同步首帧被丢 |

因此 **`on_phase` / `on_done` / `on_error` 以及 `done` 的结算都可能在 `XaiopWs.connect(...)` 返回之前发生**（尤其当 accept 侧在 `on_connection` 中同步推送时）。

**要求：** 将 **`on_phase` / `on_chunk` / `on_done` / `on_error` / `line_intercept` / `annotation_span` / 控制回调** 放在 **`connect` kwargs** 中。  
`connect` 返回后，变更器（`on_phase`、`on_line_intercept`、…）在 `handlers_locked` 时**抛错** — **无**早期帧回放。  
若应用需要“仅在 connect 返回后处理”：在应用层排队；勿要求 SDK 推迟投递。

### 7.6 SDK 控制根（`#!`）— 会话 / 续传

产品约定（非 Frozen 0.6.0 语法变更）：以 `#!` 开头的行是 **SDK 控制面**。在 parse / Annotation Span **之前** demux。模块：`xaiop.control`。完整笔记：**[../nodejs/notes/control-plane.md](../nodejs/notes/control-plane.md)**。

| 项 | 摘要 |
| --- | --- |
| 官方帧 | `#!xaiop/types/v1`、`session/v1`、`ack/v1`、`resume/v1`、`snapshot/v1`、**`seq/v1`** |
| 未知 `#!` | 丢弃 + `XaiopControlError`（`on_control_error`）；永不进入线文管线 |
| **两个 seq 空间** | `meta.seq` = **连接本地**（每套接字重置）；`meta.logSeq` = **会话日志**，供 `fromSeq` / ack。重连后**切勿**赋 `resumeCursor = meta.seq` — 使用 `meta.logSeq` / `get_resume_state()` |
| 盖章 | 每相前 `#!xaiop/seq/v1`；`session`/`retain_outbound` 时 `push_json`/`push_object` 自动盖章；`ResumeWireLog.wires_after` 盖章 |
| 窗口合并 | 默认 `merge_chunk_window=True` 可能将续传追赶合并为一块（`meta.logSeqs` 仍列出单元）— 非缺陷；要每相回调则用 `False` |
| 续传 | `send_resume({"sessionId", "fromSeq"})` → 从**日志**空间的 `fromSeq+1` 继续；**无**历史 Diff 回放；可选 `send_snapshot` |
| Connect 选项 | `session`、`auto_session`、`auto_ack`、`retain_outbound`、`on_session`、`on_resume`、`on_ack`、`on_snapshot`、`on_control_error` |
| 生产者日志 | `session`/`retain_outbound` 时自动记录 + 盖章；持久：应用按 `session_id` 拥有的 `ResumeWireLog` |
| 流 | `on_chunk(diff, meta)` 可含 `seq`/`seqs` 与 `logSeq`/`logSeqs` |

导出包括：`CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY`、`ControlDemux` / `ControlIngest` / `ControlPlaneHost` / `ControlSessionState`、`encode_*_frame`、`stamp_wire_with_log_seq`、`ResumeWireLog`、`XaiopControlError`、`XaiopResumeLogError`。

---

## 8. 合并与注入

**前/后处理**，非流式。冲突策略仅作用于**冲突键**（深层对象递归；数组 / 标量整体冲突）。

| `conflict` | 行为 |
| --- | --- |
| `overwrite`（默认） | 在冲突键上取 overlay |
| `keep` | 保留 base；非冲突键仍并入 |

**不是 Diff 应用器：** `merge_json` / `merge_to_json` **不删除** overlay 中缺失的键。例：`merge_json({"cart": {"a": 1, "b": 2}}, {"cart": {"a": 1}})` 保留 `b`。`on_chunk` / `on_phase` 的相位 Diff 是**子树替换**（或累计 commit）面 — 要本地应用 Diff，按路径替换（或取 `get_committed_snapshot()`）；**勿**把 Diff 管道进 `merge_json`。

**Live 与 inject：** overlay 当作**新文档** parse（空树），再 JSON 合并——`@` / `:value` **不会**作用在存量树上。`@items>it_1>history` + `:7` 在同一条 `LiveParser`（或 `parse(encode(存量) + 补丁)`）上是**追加**；交给 `inject_xaiop_sync` / `merge_to_json` 会报 `:value scalar Content is only valid at array level`（overlay 里没有该数组时 `@` 造的是 `{}`）。overlay 写成 `>history-` + `:7` 会把数组**整段换成** `[7]`（数组整体冲突）。存文档 + 光标补丁 → live / 拼接重 parse，**不要**走 inject。

常量：`MERGE_CONFLICT["OVERWRITE"]` / `MERGE_CONFLICT["KEEP"]`。

| API | 返回 |
| --- | --- |
| `merge_json(base, overlay, conflict?)` | JSON ← JSON+JSON |
| `merge_to_json(base_json, xaiop_source, options?)` | JSON |
| `merge_to_xaiop(base_json, xaiop_source, options?)` | XAIOP（默认 encode `dot_policy: "none"`） |

`options`：`conflict`、`compat`（解析 overlay）；`merge_to_xaiop` 可加 `encode_options` / encode kwargs。

引擎注入（变更存储）：

| API | Overlay |
| --- | --- |
| `inject_xaiop_sync(data_id, xaiop, options?)` | XAIOP |
| `inject_json_sync(data_id, json, options?)` | JSON |

```python
from xaiop import merge_to_json, MERGE_CONFLICT, XaiopEngine

merge_to_json({"a": 1}, ">\nb:2\n", {"conflict": MERGE_CONFLICT["KEEP"]})

engine = XaiopEngine()
data_id = engine.upload_json_sync({"a": 1})
engine.inject_xaiop_sync(data_id, ">\nb:2\n")
```

---

## 9. 兼容模式

可选解析路径，面向不完美模型输出。**不**改变已封存线文协议；只改变摄入恢复。默认**关闭**。

| 入口 | 形式 |
| --- | --- |
| 自由 `parse_sync` | `bool \| CompatPolicy \| partial dict` |
| `XaiopEngine.parse_sync` | **仅布尔** |
| Engine / Stream 实例 | `compatibility_mode` + `set_compat_*` |

无覆盖启用时：**全部八项**修复开启。普通 dict 覆盖默认（省略的键保持 `True`）。

| Fix ID | 摘要 |
| --- | --- |
| `forcedRoot` | 开端非 `>`/`-` 时注入匿名对象根 |
| `rewriteBareNameArray` | `name-` → `>name-` |
| `rewriteEnterLine` | 改写 `>` 空白 / 粘连 `>key:value` |
| `ignoreBareLeaveAtRoot` | 忽略 Root 上的裸 `<` |
| `popAndRetry` | 弹出 Cursor 并重试失败行 |
| `locatePathTrim` | 修剪路径空白后重试 `=` |
| `locatePathStripSpaces` | 剥离全部空白后重试 `=` |
| `locatePathArraySuffix` | 当值为数组时，将 `=` 段尾随 `-` 视为数组键 |

导出：`CompatPolicy`、`COMPAT_FIX_IDS`、`COMPAT_FIX_DEFAULTS`、`resolve_compat_options`。

```python
from xaiop import parse_sync, CompatPolicy

parse_sync(text, CompatPolicy({"forcedRoot": False}))
engine.set_compatibility_mode(True)
engine.set_compat_forced_root(False)  # 模式关闭时返回 False
```

恢复**不**发明字段名；恢复失败或错误变化时仍抛 `XaiopSyntaxError`。深入笔记：[../nodejs/notes/adjustment-policy.md](../nodejs/notes/adjustment-policy.md)。

---

## 10. 类型与常量

| 导出 | 值 / 说明 |
| --- | --- |
| `PROTOCOL_VERSION` | `"0.7.0"` |
| `SDK_VERSION` | `"0.15.1"` |
| `__version__` | `"0.15.1"` |
| `DOT_POLICY` | `NONE` · `PER_TOP_LEVEL_KEY` · `PER_N_KEYS` · `CUSTOM` |
| `MERGE_CONFLICT` | `OVERWRITE` · `KEEP` |
| `STREAM_MODES` | `CALLBACK` · `PROMISE` · `ASYNC_ITERATOR` · `EVENTS` |
| `STREAM_STATUS` | `IDLE` … `ERROR` |
| `STREAM_IDLE_LIKE` | 类空闲状态元组 |
| `TRANSPORT_KIND` | `HTTP` · `SSE` · `RAW`（WS 经 `XaiopWs`，非 Stream 传输） |
| `HISTORY_NODE_KIND` | `DOT` · `TAIL` |
| `LINE_KIND` / `classify_line` / `run_line_intercept_chain` | 行拦截分类 + 链辅助（§6.4） |
| `AnnotationSpan` / `AnnotationSpanView` | Span 保留哨兵 + 视图（§6.5） |
| `apply_annotation_spans` / `encode_as_sibling_lines` / `path_escapes_type_check` | Annotation Span 辅助 |
| `CONTROL_NS` / `CONTROL_NAME` / `CONTROL_CAPABILITY` | SDK 控制根常量（§7.6） |
| `encode_seq_frame` / `stamp_wire_with_log_seq` | 会话日志 seq 盖章（`#!xaiop/seq/v1`） |
| `ControlDemux` / `ControlIngest` / `ControlPlaneHost` / `ControlSessionState` | 控制 demux / 会话辅助 |
| `ResumeWireLog` / `XaiopResumeLogError` | 续传用持久出站相位日志 |
| `encode_control_frame` / `encode_session_frame` / `encode_ack_frame` / `encode_resume_frame` / `encode_snapshot_frame` | 控制帧编解码 |
| `is_sdk_control_line` / `parse_control_header` / `dispatch_control_frame` | 控制分类 / 路由 |
| `XaiopControlError` | 软控制面错误 |
| `COMPAT_FIX_IDS` / `COMPAT_FIX_DEFAULTS` | 八项修复列表与默认 |
| `TYPE` / `object_type` / `array_type` | 类型检查常量与构建器（§5.5） |
| `TypeRegistry` / `TypeChecker` / `TypeFreezeSession` | 注册表 / 服务端检查 / 客户端冻结 |
| `TYPE_SCHEMA_FRAME_PREFIX` / `encode_type_schema_frame` / `try_parse_type_schema_frame` | 类型一致性控制帧 |
| `canonicalize_type` / `parse_type_surface` / `classify_value` / `value_matches_type` | 规范化与匹配辅助 |
| `RangeError` | 历史索引 / 跳转错误（`ValueError` 子类） |
| `LABEL_ESCAPE_INTRODUCER` / `encode_wire_label` / `decode_wire_label` | Symbol-keys 方言 |
| `chunks_of` / `open_transport` | RAW 辅助 / 传输打开器 |
| `schedule_immediate` | `push_async` 使用的线程调度 |
| `XaiopWs` / `XaiopWsConnection` / `XaiopWsHub` | WebSocket API（`xaiop.ws`；需要 `[ws]`） |

包映射（模块）：见 [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) §4。

---

## 11. 错误处理

| 错误 | 时机 |
| --- | --- |
| `XaiopSyntaxError` | 非法线文；可选 `.line`。严格：立即失败。Compat：恢复失败或错误变化时仍抛 |
| `XaiopEncodeError` | 非法 encode 输入 / 选项 / 拒绝的键；可选 `.path`（例如 `$.meta.name`） |
| `XaiopTypeError` | 类型注册表 / 冻结 / schema 检查失败；可选 `.path` / `.expected` / `.actual` / `.polarity` |
| `XaiopControlError` | 未知 / 畸形控制帧（默认软处理；见 §7.6） |
| `XaiopResumeLogError` | 续传出站日志错误 |
| `RangeError` | 历史索引越界；后向 / 非法 `jump_to` |
| `ValueError` | 未知 `data_id`；相关存储错误 |
| `RuntimeError` | 流忙碌；compact/history 门控等 |
| `TypeError` | 参数类型错误（非字符串源、非法 `conflict`、`push_type_consistency` 前提等） |
| `ImportError` | `XaiopWs.connect` / `listen` 缺少可选 `websockets` |

```python
from xaiop import parse_sync, encode_sync, XaiopSyntaxError, XaiopEncodeError

try:
    parse_sync(">\n&\n")  # bare & → XaiopSyntaxError
except XaiopSyntaxError as e:
    print(e.line, e)

try:
    encode_sync({"a&b": 1})
except XaiopEncodeError as e:
    print(e.path, e)
```

---

## 相关

| 文档 | 用途 |
| --- | --- |
| [README.zh-CN.md](README.zh-CN.md) | 包落地页 |
| [ALIGNMENT.zh-CN.md](ALIGNMENT.zh-CN.md) | Python ↔ Node 对等矩阵（**版本声明的权威来源**） |
| [../behavioral-contract.zh-CN.md](../behavioral-contract.zh-CN.md) | Node 产品选择目录（可选） |
| [../nodejs/API.zh-CN.md](../nodejs/API.zh-CN.md) | Node.js API 文档 |
| [../java/API.md](../java/API.md) | Java API 文档 |
| [../../protocol/syntax.zh-CN.md](../../protocol/syntax.zh-CN.md) | 协议语法（若无则见 [syntax.md](../../protocol/syntax.md)） |
| [../../meta/releases.zh-CN.md](../../meta/releases.zh-CN.md) | 封存 / 发布 |
| [../nodejs/notes/](../nodejs/notes/) | 流式解析、history、encode 陷阱、WS、类型检查、行拦截、Annotation Span、**控制根**、调整策略 |
