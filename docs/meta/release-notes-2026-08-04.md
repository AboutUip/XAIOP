# Release notes — 2026-08-04

[English](release-notes-2026-08-04.md) · [简体中文](release-notes-2026-08-04.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-REL-NOTES-2026-08-04` |
| Status | Informative |
| Date | 2026-08-04 |
| Normative | **No** — product announcement; seal rules remain in `META-VER` |

Immutable package index: [releases.md](releases.md).

---

## Highlights

| Package | Version | Protocol wire |
| --- | --- | --- |
| Node.js `xaiop` | **0.13.0** | **0.6.0** Frozen |
| Java `io.xaiop:xaiop` | **0.5.0** | **0.4.0** Frozen (subset) |

Artifacts are built from this repository (`npm pack` / Maven JAR). Published registry uploads are separate from this note.

---

## Announcement — Skills are no longer provided

**Official Skill delivery is discontinued.**

- The project **does not** ship, support, or recommend Skills as a product surface going forward.
- Source under [`skills/`](../../skills/) (`xaiop`, `xaiop-allowlist`) **remains in the repository** for anyone who wants to **download / copy from source**.
- That tree is **not** a sealed deliverable and **not** versioned with SDK releases. Retained digests were later refreshed to target protocol **0.6.0** (see [`skills/README.md`](../../skills/README.md)); authority remains [`docs/protocol/`](../protocol/).
- Prefer programmatic Generators (`encode`, skeleton WS push, your own writers) over Skill-driven emit. LLM emit recipes stay in the sealed archive only: [../archive/practice-llm-emit-2026-08-04/](../archive/practice-llm-emit-2026-08-04/).

Status page: [../../skills/README.md](../../skills/README.md).

---

## Node.js SDK `0.13.0`

- Implements sealed protocol **0.6.0** (`#` custom annotations).
- Annotation Span (`onAnnotationSpan`); typeCheck escape for span regions.
- Prior surface retained: stream / WS / history / cover / line intercept / `core` · `browser` · Node entries.
- Guide: [../sdk/nodejs/API.md](../sdk/nodejs/API.md) · code: [../../xaiop-sdk/nodejs/](../../xaiop-sdk/nodejs/)
- Suggested Git tag: `sdk-nodejs-v0.13.0`

**Build locally**

```bash
cd xaiop-sdk/nodejs
npm test
npm run pack    # → dist/xaiop-0.13.0.tgz
```

---

## Java SDK `0.5.0`

- Wire remains protocol **0.4.0** subset (not `&` / `#` / cover / WS).
- New: **`XaiopStream` consumer** — HTTP / SSE / RAW; status machine aligned with Node consumer defaults; UTF-8 streaming decoder; SSE multi-`data:` join.
- Retained: parse · encode · merge · checkpoint.
- Guide: [../sdk/java/README.md](../sdk/java/README.md) · code: [../../xaiop-sdk/java/](../../xaiop-sdk/java/)
- Suggested Git tag: `sdk-java-v0.5.0`

**Build locally**

```bash
cd xaiop-sdk/java
mvn test
mvn -DskipTests package   # → target/xaiop-0.5.0.jar
```

---

## What did not change

- Protocol package **0.6.0** remains Frozen and immutable.
- Older sealed protocol / SDK package numbers are not rewritten ([releases.md](releases.md)).
- Python SDK remains pending.

---

## Related

- Seal rules: [status-and-versioning.md](status-and-versioning.md)
- Behavioral catalog (Node reference): [../sdk/behavioral-contract.md](../sdk/behavioral-contract.md)
- Practice streaming: [../practice/streaming-transport.md](../practice/streaming-transport.md)
