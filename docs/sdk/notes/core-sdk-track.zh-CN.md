# 核心协议 SDK 轨（Python · Go）

[English](core-sdk-track.md) · [简体中文](core-sdk-track.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 文档 | 薄 SDK 的说明性策略 |
| 线文目标 | Frozen 协议 **0.6.0** |
| 产品参考 | Node.js `xaiop` **0.15.1** / Java `io.xaiop:xaiop` **0.15.1**（仅参考） |
| 状态 | **线文完成** + CI 门禁（STRICT parse / encode / Live / materialize） |

## 目的

官方**完整** SDK（Node · Java）实现全部产品面。  
**Python** 与 **Go** 实现 **核心协议轨**：

1. 声明 `PROTOCOL_VERSION = 0.6.0`。
2. 实现 STRICT Frozen 线文（以协议为唯一规范）。
3. **不声称**与 Node/`0.15.1` 产品对等。

规范依据：[../../protocol/](../../protocol/)。Node `parse.ts` / `encode.ts` 仅在歧义时可参考。

## 范围内（已实现）

- 严格 parse / fragment / Content 分型  
- Encode 默认（有限数；forced-string 拒绝以 SPACE 开头的字符串）  
- `&` 删除 · `#` 注解忽略 · `.` 复位 · `=` / `@` / `!`  
- Live 按行解析 · `materialize`（Fragment → 对象）  
- 共享 corpus + CI 中的 **Python ↔ Go** NDJSON 对比

共享 fixture：[../../../xaiop-sdk/conformance/core-wire/](../../../xaiop-sdk/conformance/core-wire/)

## 范围外

- 完整 `XaiopStream` · WebSocket · Control Root · typeCheck · line intercept · Annotation Span · history / buffer compact · Diff checkpoint  
- 以 Node/Java 产品 golden 作为本轨门禁  
- Draft 0.7.0 label-escape（U+001F）

## 澄清说明

见 [core-wire README](../../../xaiop-sdk/conformance/core-wire/README.md)：encode 键顺序、数值比较、fragment/materialize、Live 喂入规则。

## 布局同伴

| 语言 | 代码 | 文档 | SDK 版本 |
| --- | --- | --- | --- |
| Python | [../../../xaiop-sdk/python/](../../../xaiop-sdk/python/) | [../python/](../python/) | `0.6.0a1` |
| Go | [../../../xaiop-sdk/go/](../../../xaiop-sdk/go/) | [../go/](../go/) | `0.6.0-alpha.1` |

## CI

GitHub Actions（`.github/workflows/ci.yml`）：

- `python` / `go` — 单测（含 `cases.json` corpus）  
- `core-wire` — dump + 对比 Python ↔ Go  
- 与 Node ↔ Java 的 `golden` / `fuzz` 分开  

本轨是 **协议符合的核心线文**，不是 Node/Java 官方产品等价。
