# XAIOP Go SDK

面向 **核心协议轨**（线文 **v0.6.0 Frozen**，STRICT）的模块。

指南：[../../docs/sdk/go/README.zh-CN.md](../../docs/sdk/go/README.zh-CN.md) · English: [../../docs/sdk/go/README.md](../../docs/sdk/go/README.md)  
范围说明：[../../docs/sdk/notes/core-sdk-track.zh-CN.md](../../docs/sdk/notes/core-sdk-track.zh-CN.md)

## 状态

| 项 | 状态 |
| --- | --- |
| 布局 / module | **进行中** |
| `ProtocolVersion` | **0.6.0** |
| `SDKVersion` | **0.6.0-alpha.1** |
| Parse / Encode / Live / Materialize | **已实现**（STRICT） |
| 产品面（stream · WS · control · ...） | **不在范围** |

对齐同伴：[../python/](../python/)。

## 测试

```bash
cd xaiop-sdk/go
go test ./...
```

## 布局

```text
go.mod
xaiop/          # parse · encode · live · materialize
```
