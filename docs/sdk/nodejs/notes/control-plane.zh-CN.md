# SDK 控制根（`#!`）— demux、会话、续传

[English](control-plane.md) · [简体中文](control-plane.zh-CN.md)

| 字段 | 值 |
| --- | --- |
| Document ID | `SDK-NODE-NOTE-CONTROL` |
| Status | Informative（SDK 产品约定） |
| Last updated | 2026-08-05 |
| 包版本 | `xaiop` **0.14.1+** |
| 是否改 Frozen 线文 | **否** — 封存协议 **0.6.0** 仍把 `#…` 当作自定义注解传递；本文是 **SDK Control Root** 约定 |
| Depends on | [ws-session.zh-CN.md](ws-session.zh-CN.md)、[annotation-span.zh-CN.md](annotation-span.zh-CN.md)、[typecheck.zh-CN.md](typecheck.zh-CN.md)、[streaming-parse.zh-CN.md](streaming-parse.zh-CN.md) |
| 测试 | `test/control.plane.test.js` · `test/control.resume.test.js` · `test/control.coverage.test.js` |

---

## 1. 为何要有控制根

| 世界 | 形态 | 是否进 parse / Span |
| --- | --- | --- |
| **文档** | `>` `-` Content `#app…` | 是 |
| **控制** | `#!…` | **否** |
| **应用注解** | `#…` 且第二字符 **≠** `!` | 是（parse 忽略；Span 可挂载） |

**硬规则：** 逻辑行前两字为 `#` `!` → **SDK 控制根**。应用注解 **必须** 避开该形状。

---

## 2. 帧语法（SDK）

```text
#!<ns>/<name>/v<major>\n
<body-line>\n
```

| 段 | 约定 |
| --- | --- |
| `ns` | 官方能力用 `xaiop`；其它 ns 仍进控制面 |
| `name` | 能力名 |
| `vN` | 能力主版本 |
| body | **恰好一行**（JSON 或空）；编码器始终以 `\n` 结束 |

**未知策略（0.14）：** 凡 `#!…` 均 demux。未知 ns/capability / 不支持版本 → **丢弃** + `XaiopControlError`（`onControlError`）；默认 **不断开** 连接。

导出：`encodeControlFrame`、各 capability 编码器、`ControlDemux` / `ControlIngest` / `ControlPlaneHost` / `ControlSessionState` / `ResumeWireLog` / `XaiopControlError` 等。

---

## 3. 官方能力（`ns=xaiop`）

| 帧 | Body | 作用 |
| --- | --- | --- |
| `#!xaiop/types/v1` | 类型 schema | 同既有 `pushTypeConsistency` |
| `#!xaiop/session/v1` | `{ sessionId, role, capabilities[], epoch }` | 会话握手 |
| `#!xaiop/ack/v1` | `{ sessionId, seq }` | 确认已应用的 **会话日志** seq |
| `#!xaiop/resume/v1` | `{ sessionId, fromSeq, epoch? }` | 重连：从 **`fromSeq + 1`** 续推（日志空间） |
| `#!xaiop/snapshot/v1` | `{ sessionId, seq, tree }` | 可选提交树种子（**不**重放历史 Diff）；`seq` 为日志空间 |
| `#!xaiop/seq/v1` | `{ seq }`（`seq >= 1`） | 为**随后**的文档相位打 **会话日志** 戳 → `meta.logSeq` |

---

## 4. Demux 与交错

```text
text → ControlDemux（按行 / 帧边界）
     → 控制帧 → 路由 / ControlPlaneHost
     → 剩余线文 → DotCheckpointEngine
```

控制帧可与线文 **按行交错**；历史整包 types（JSON 后无 LF）仍兼容；剥离时 **保留** 线文 CRLF。兼容路径若在无尾 LF 时提前收口 JSON，随后空 LF **不会**当成线文空行。

---

## 5. 相位 seq 与续传（0.14 锁定 / 0.14.1 澄清）

| 主题 | 决定 |
| --- | --- |
| **两套编号** | **勿混淆** 连接局部 `meta.seq` 与会话日志 `meta.logSeq` / `fromSeq` |
| **seq 粒度** | 每个完成的 **物理** `.` 一个单位（非空 finish 尾同理） |
| **窗口合并** | `meta.seqs` / `meta.logSeqs`；`meta.seq` / `meta.logSeq` 为批内最高 |
| **ack / resume / snapshot.seq** | **仅会话日志空间**（有戳时优先 `meta.logSeq`） |
| **重连 Diff** | **不**重放；可选 `snapshot` + 从 `fromSeq+1` 续线文 |
| **字节偏移** | **不用** |

### 两套序号（续传最高频误用）

| 空间 | 位置 | 生命周期 | 能否当 `fromSeq`？ |
| --- | --- | --- | --- |
| **连接局部** | `meta.seq` / `phaseSeq` / `inboundSeq` | **每个新 socket 从 1 重计** | 重连后 **否** |
| **会话日志** | `meta.logSeq` / `logSeq` / `getResumeState().seq` / `ResumeWireLog` | 有打戳/日志则跨重连 | **是** |

**错误：** 重连补发后写 `resumeCursor = meta.seq`（局部 1/2/3），下次 `fromSeq` 会丢掉更高的日志相位。  
**正确：** 有戳时坚持 `resumeCursor = meta.logSeq`（或 `getResumeState().seq` / `conn.logSeq`）。

打戳：`#!xaiop/seq/v1` 紧挨相位线文之前。`session`/`retainOutbound` 下 `pushJson`/`pushObject` 自动打戳。`ResumeWireLog.wiresAfter` 为每条加戳；裸拼接用 `wiresAfterRaw`。工具：`encodeSeqFrame` / `stampWireWithLogSeq`。

### 补发与 `mergeChunkWindow`（不是 bug）

默认 `mergeChunkWindow: true`：一次 `pushWire` 灌入多相续传，常变成 **一次** `onChunk`（批末 Diff），`meta.logSeqs` 仍列出各日志单位。对补状态无所谓。若要按相回调（动画等），connect 时设 `mergeChunkWindow: false`。

| 游标 | 含义 |
| --- | --- |
| `phaseSeq` / `inboundSeq` | 本连接已接收的局部相位 |
| `logSeq` / `getResumeState().seq` | 会话续传游标（有戳用 logSeq） |
| `outboundSeq` | 本连接已发送（跨重连请用应用侧 `ResumeWireLog`） |
| `pushWire` | **不**自动记出站 / 打戳 |

WS 选项与 API 表、完整示例见英文 [control-plane.md](control-plane.md) §5。

跨 socket 续传：**必须**应用侧按 `sessionId` 持有 `ResumeWireLog`（连接级 `outboundLog` 随关闭清空）。

Stream：收端 demux + 可选 inbound `session`；`onChunk` 可带 `logSeq`；双向续传优先 WS。

---

## 6. Annotation Span

见到 `#!` **硬跳过**（demux 正常会先剥掉）。普通 `#…` 不变 — [annotation-span.zh-CN.md](annotation-span.zh-CN.md)。

---

## 7. 后续方向

多行 body、ping/error、Hub 自动按 seq 留存、Java 对齐 — 见英文 §7。协议 Frozen 改写 `#` **不在**本版范围。

---

## 8. 相关

- API：[../API.zh-CN.md](../API.zh-CN.md) §7.7  
- [typecheck.zh-CN.md](typecheck.zh-CN.md) · [ws-session.zh-CN.md](ws-session.zh-CN.md)  
- 发行说明：[../../../meta/release-notes-2026-08-05.zh-CN.md](../../../meta/release-notes-2026-08-05.zh-CN.md)
