# Skills (retained source · protocol digest)

[English](README.md) · [简体中文](README.zh-CN.md)

> **Notice (2026-08-04):** Skills are **no longer provided** as an official product.  
> Source in this directory remains available for **download / copy from the repository**.  
> Details: [../docs/meta/release-notes-2026-08-04.md](../docs/meta/release-notes-2026-08-04.md).

| Path | Role |
| --- | --- |
| [xaiop/](xaiop/) | Retained classic protocol digest (Generator pedagogy) |
| [xaiop-allowlist/](xaiop-allowlist/) | Retained allowlist emit digest (closed-world A1–A12) |

## Status

| Item | Value |
| --- | --- |
| Product | **Discontinued** (not shipped / supported / recommended as a product surface) |
| Tree | **Retained implementation** — downloadable source digests |
| Protocol target | Sealed package **0.6.0** Frozen (synced digests) |
| Authority | Normative wire = [../docs/protocol/](../docs/protocol/) only |
| SDK coupling | **None** — Skills are not SDK package versions |

Prefer programmatic Generators (`encode`, skeleton WS push, your own writers) over Skill-driven emit.  
LLM emit practice recipes (if needed) live only in the sealed archive: [../docs/archive/practice-llm-emit-2026-08-04/](../docs/archive/practice-llm-emit-2026-08-04/).

## Protocol 0.6.0 digest highlights

Both digests teach the Frozen **0.6.0** line grammar, including:

- Structure: `>` · `>name` · `>name-` · `-` · `<` · `<name` · `.` · `=path` · `@path` · `!path` · **`&path`** (delete)
- **`#…`** custom annotation transmission (whole line; **not** a comment-on-Content habit)
- Content typing + forced string · complete root vs fragment · array one-line objects

Authoritative tables: [../docs/protocol/syntax.md](../docs/protocol/syntax.md) §3.
