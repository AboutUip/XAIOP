# -*- coding: utf-8 -*-
"""Strict docs cross-reference + tip-version check for XAIOP."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TIP_SDK = "0.14.0"
TIP_PROTOCOL = "0.6.0"

MD_GLOBS = [
    "README.md",
    "README.zh-CN.md",
    "docs/**/*.md",
    "xaiop-sdk/nodejs/README.md",
]

# Tip hubs must not advertise stale SDK tip as current (historical tables OK).
TIP_FORBIDDEN_IN_HUBS = [
    (re.compile(r"`xaiop` \*\*0\.12\.0\*\*"), "stale tip 0.12.0 as current xaiop"),
    (re.compile(r"Package \*\*0\.12\.0\*\*"), "stale Package 0.12.0"),
    (re.compile(r"SDK \*\*0\.12\.0\*\*(?!\+)"), "stale SDK 0.12.0 without +"),
    (re.compile(r"protocol-v0\.5\.0_Frozen"), "root badge still 0.5.0"),
    (re.compile(r"Frozen_v0\.5\.0"), "footer badge still 0.5.0"),
]

HUBS = {
    ROOT / "README.md",
    ROOT / "README.zh-CN.md",
    ROOT / "docs/README.md",
    ROOT / "docs/README.zh-CN.md",
    ROOT / "docs/sdk/README.md",
    ROOT / "docs/sdk/README.zh-CN.md",
    ROOT / "docs/sdk/nodejs/API.md",
    ROOT / "docs/sdk/nodejs/API.zh-CN.md",
    ROOT / "docs/sdk/nodejs/README.md",
    ROOT / "docs/sdk/nodejs/README.zh-CN.md",
    ROOT / "xaiop-sdk/nodejs/README.md",
}

LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")
DELETED_TARGETS = [
    "overview/positioning.md",
    "overview/positioning.zh-CN.md",
    "sdk/nodejs/encode.md",
    "sdk/nodejs/encode.zh-CN.md",
    "sdk/nodejs/merge.md",
    "sdk/nodejs/merge.zh-CN.md",
    "sdk/nodejs/stream.md",
    "sdk/nodejs/stream.zh-CN.md",
]


def iter_md() -> list[Path]:
    out: list[Path] = []
    for pattern in MD_GLOBS:
        out.extend(ROOT.glob(pattern))
    # unique
    return sorted({p.resolve() for p in out if p.is_file()})


def resolve_link(src: Path, target: str) -> Path | None:
    t = target.strip()
    if not t or t.startswith(("http://", "https://", "mailto:", "#")):
        return None
    # strip anchor
    path_part = t.split("#", 1)[0]
    if not path_part:
        return None
    # ignore absolute site roots
    if path_part.startswith("/"):
        return None
    return (src.parent / path_part).resolve()


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    # package tip
    pkg = (ROOT / "xaiop-sdk/nodejs/package.json").read_text(encoding="utf-8")
    if f'"version": "{TIP_SDK}"' not in pkg:
        errors.append(f"package.json tip != {TIP_SDK}")

    files = iter_md()
    for src in files:
        text = src.read_text(encoding="utf-8", errors="replace")
        rel = src.relative_to(ROOT).as_posix()

        if src in HUBS:
            for rx, msg in TIP_FORBIDDEN_IN_HUBS:
                if rx.search(text):
                    # allow releases/history tables outside hubs only — hubs flagged
                    errors.append(f"{rel}: {msg}")

        for m in LINK_RE.finditer(text):
            target = m.group(2).strip()
            # skip images with spaces weirdness already handled
            if " " in target and not target.startswith(("http", "mailto")):
                # markdown may have title — rare in this repo
                target = target.split()[0]

            for dead in DELETED_TARGETS:
                if dead in target.replace("\\", "/"):
                    errors.append(f"{rel}: link to deleted path `{target}`")

            dest = resolve_link(src, target)
            if dest is None:
                continue
            if not dest.exists():
                errors.append(f"{rel}: broken link → `{target}` (resolved {dest})")

        # live hubs must not embed LLM evidence badge walls
        if src in {
            ROOT / "README.md",
            ROOT / "README.zh-CN.md",
        }:
            if "GPT classic" in text or "GPT 经典" in text or "DEEPWIDE" in text:
                errors.append(f"{rel}: LLM evidence badges still in root README")
            if "Optional LLM scenario" in text or "可选 LLM 场景（有条件）" in text:
                errors.append(f"{rel}: optional LLM scenario section still in root README")

    # required discovery
    api = (ROOT / "docs/sdk/nodejs/API.md").read_text(encoding="utf-8")
    if "### 6.5 Annotation Span" not in api:
        errors.append("API.md missing §6.5 Annotation Span")
    if TIP_SDK not in api:
        errors.append(f"API.md missing tip {TIP_SDK}")

    arch = ROOT / "docs/archive/practice-llm-emit-2026-08-04/SEAL.md"
    if not arch.exists():
        errors.append("missing LLM seal SEAL.md")

    print(f"checked {len(files)} markdown files")
    for w in warnings:
        print("WARN:", w)
    if errors:
        print(f"FAIL ({len(errors)}):")
        for e in errors[:80]:
            print(" -", e)
        if len(errors) > 80:
            print(f" ... +{len(errors)-80} more")
        return 1
    print("OK — tip versions + cross-refs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
