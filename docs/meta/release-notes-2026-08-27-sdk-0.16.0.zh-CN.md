# 发行说明 — SDK 0.16.0（2026-08-27）

[English](release-notes-2026-08-27-sdk-0.16.0.md) · [简体中文](release-notes-2026-08-27-sdk-0.16.0.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| SDK | **0.16.0**（Node · Java · Python · Go） |
| 协议 | **0.7.0** Draft（未封存；不是协议升版） |
| 类型 | 产品切 — 树上游已落地的加法表面 |
| 登记处 | **尚未上架。** 上一份不可变产物仍是 **0.15.1**（npm / Maven Central / PyPI / Go 模块标签） |

## 摘要

协议 **0.7.0** Draft 工作此前挂在 **0.15.1** 号下；本切是第一份诚实的产品号。已发布的 **0.15.1** 包仍实现协议 **0.6.0**，不原地改写（`META-VER`）。本树为 **0.16.0**。协议包保持 **0.7.0** Draft — 不 Frozen，也不升 0.8。

## 变更

- **数组元素选择：** 从数组 Cursor 发出 `?2` / `?id:A2` / `?*` / `?*k:v`。零命中 → 语法错误。`?*` 进入广播。拦截种类 `LINE_KIND.SELECT`。
- **裸 `&`：** 删除当前直接数组元素（`viaIndex`）；落到父数组。`&path` 不变（无下标段）。
- **Content 转义（一律生效）：** `\\` `\n` `\r`。物理 `LF`/`CRLF` 仍结束一行。相对 **0.6.0** 中字面 `\n` 的载荷为 breaking。
- **Label 转义（可选）：** `symbolKeys` / U+001F 方言；不改变独立 `#…`。
- **History / `jumpTo`：** cover、拦截、window、stream 联测对齐。Go 引擎 `jumpTo` 重建在存在拦截器时重跑行拦截（此前只 feed）。
- **Cover 约束：** cover 在 `&` 前注入 `.`，Cursor 回到 Root。cover 再 `?` 再裸 `&` **无法**恢复数组元素 Cursor。select 之后 cover + `&orders` 仍与 `parseSync` 一致。

`@` 仍不寻址数组下标（`@arr` / `@array-` 仍是对象脊 / 创建 `{}`）。开/再进入数组用 `>name-`，选元素用 `?`。

## 验证

```bash
cd xaiop-sdk/nodejs && npm test
cd ../python && python -m pytest tests/test_version.py tests/test_array_select.py tests/test_content_escape.py tests/test_array_select_history.py
cd ../java && mvn -q test
cd ../go && go test ./...
```

在本切打标签并部署之前，不要把 npm / Maven / PyPI / `pkg.go.dev@v0.16.0` 当成已上架。
