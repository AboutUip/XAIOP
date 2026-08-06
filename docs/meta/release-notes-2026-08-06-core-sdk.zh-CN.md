# 发行说明 — 2026-08-06 · 核心协议 SDK（Python · Go）

[English](release-notes-2026-08-06-core-sdk.md) · [简体中文](release-notes-2026-08-06-core-sdk.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| 日期 | **2026-08-06** |
| 协议 | **0.6.0** Frozen（未变） |
| Python `xaiop` | **0.6.0a1**（核心协议轨） |
| Go module | **0.6.0-alpha.1**（核心协议轨） |
| Node `xaiop` | **0.15.1**（已重建验证；本次不升版） |
| Java `io.xaiop:xaiop` | **0.15.1**（已重建验证；本次不升版） |
| 类型 | 核心线文 SDK + 跨语言 CI |

## 摘要

为 **Python** 与 **Go** 发布 **STRICT Frozen 0.6.0** 核心线文：parse / encode / Live / materialize。  
新增共享 `cases.json` 语料、Python ↔ Go NDJSON 对比与 CI 任务。  
**不声称**与 Node/`0.15.1` 或 Java 产品面对等。

策略：[../sdk/notes/core-sdk-track.zh-CN.md](../sdk/notes/core-sdk-track.zh-CN.md) · Fixture：[../../xaiop-sdk/conformance/core-wire/](../../xaiop-sdk/conformance/core-wire/)

## 本次内容

### Python（`xaiop-sdk/python`）

- `parse_sync`、`LiveParser`、`encode_sync`、`materialize`、`XaiopFragment`
- STRICT 算符：`>` `<` `-` `=` `@` `!` `&` `#` `.` · Content 分型 · forced-string
- 包版本 **0.6.0a1**（PEP 440）；协议 **0.6.0**
- 测试：单测 + 共享 corpus（本地 **86** passed）

### Go（`xaiop-sdk/go`）

- `Parse`、`LiveParser`、`Encode`、`Materialize`、`Fragment`
- 与 Python 相同的 STRICT 线文面
- Module 版本 **0.6.0-alpha.1**；CI 用 `cmd/dump-core-wire`
- 测试：单测 + 共享 corpus

### 对等与 CI

- `conformance/core-wire/cases.json` — **38** 条共享用例
- `npm run core-wire` — dump Python + Go，比较树 / 线文
- GitHub Actions：`python`、`go`、`core-wire`（与现有 `node` / `java` / `golden` / `fuzz` 并列）
- 仓库 `.gitignore` 扩展（Go / Python / conformance 输出）

## 澄清说明

| 主题 | 决定 |
| --- | --- |
| 规范依据 | `docs/protocol/`（Frozen **0.6.0**） |
| 与 Node/Java | 仅协议符合核心；**非**产品 golden |
| Encode 键顺序 | 交叉 dump 使用 `key_order: sorted`（避免 Go map 不确定） |
| 数值 | 数值等价比较（`1` == `1.0`） |
| 错误文案 | 不要求跨语言一致；用例成败必须一致 |

## 构建产物（本地验证）

| 栈 | 产物 |
| --- | --- |
| Node | `xaiop-sdk/nodejs/dist/xaiop-0.15.1.tgz` |
| Java | `xaiop-sdk/java/target/xaiop-0.15.1.jar` |
| Python | `xaiop-sdk/python/dist/xaiop-0.6.0a1-py3-none-any.whl`（+ sdist） |
| Go | 库包（无单一发布二进制）；`go test ./...` |

## 验证

Node：

```bash
cd xaiop-sdk/nodejs
npm ci
npm run build:ts
npm test
npm run pack
```

Java：

```bash
cd xaiop-sdk/java
mvn -B package
```

Python：

```bash
cd xaiop-sdk/python
python -m pip install -e ".[dev]"
python -m pytest -q
python -m build
```

Go：

```bash
cd xaiop-sdk/go
go test ./...
go build ./cmd/dump-core-wire
```

Python ↔ Go 核心线文：

```bash
cd xaiop-sdk/conformance
npm run core-wire
```

## 建议标签

- Python alpha：`sdk-python-v0.6.0a1`
- Go alpha：`sdk-go-v0.6.0-alpha.1`
