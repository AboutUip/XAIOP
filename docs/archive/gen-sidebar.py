# -*- coding: utf-8 -*-
"""Regenerate docs/_sidebar.md from the docs/ tree (English tip pages).

Links are root-absolute (`/path/to.md`) so Docsify can use relativePath:true
for in-article links without breaking the sidebar.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
OUT = DOCS / "_sidebar.md"

SKIP_DIRS = {".vitepress", "node_modules", "metrics", "themes", "vendor"}
SKIP_FILES = {"index.html", "_sidebar.md", "_navbar.md", "_404.md", "theme-boot.js"}

SECTION_LABEL = {
    "overview": "Overview",
    "protocol": "Protocol",
    "practice": "Practice",
    "sdk": "SDK",
    "meta": "Meta",
    "archive": "Archive",
    "terminology": "Terminology",
    "requirements": "Requirements",
    "conformance": "Conformance",
}


def title_for(name: str) -> str:
    if name == "README.md":
        return "Index"
    base = name.replace(".md", "")
    return base.replace("-", " ")


def href(rel: str) -> str:
    """Docsify root-absolute path (leading slash, keep .md)."""
    rel = rel.replace("\\", "/").lstrip("/")
    return f"/{rel}"


def walk_files(dir_path: Path, prefix: str, depth: int) -> list[str]:
    lines: list[str] = []
    entries = sorted(
        dir_path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())
    )
    for p in entries:
        if p.name.startswith(".") or p.name.startswith("_"):
            continue
        if p.is_dir():
            if p.name in SKIP_DIRS:
                continue
            indent = "  " * depth
            rel = f"{prefix}/{p.name}".strip("/")
            readme = p / "README.md"
            lines.append(f"{indent}* **{p.name}**")
            if readme.exists():
                lines.append(f"{indent}  * [Index]({href(rel + '/README.md')})")
            lines.extend(walk_files(p, rel, depth + 1))
            continue
        if p.name in SKIP_FILES:
            continue
        if not p.name.endswith(".md") or p.name.endswith(".zh-CN.md"):
            continue
        if p.name == "README.md":
            continue
        indent = "  " * depth
        rel = f"{prefix}/{p.name}".strip("/")
        lines.append(f"{indent}* [{title_for(p.name)}]({href(rel)})")
    return lines


def main() -> None:
    body = [
        "* [Hub](#/README)",
        f"* [Introduction]({href('overview/introduction.md')})",
        f"* [Separation]({href('SEPARATION.md')})",
        "",
    ]
    for top in [
        "overview",
        "protocol",
        "practice",
        "sdk",
        "meta",
        "archive",
        "terminology",
        "requirements",
        "conformance",
    ]:
        d = DOCS / top
        if not d.is_dir():
            continue
        label = SECTION_LABEL.get(top, top)
        body.append(f"* **{label}**")
        if (d / "README.md").exists():
            body.append(f"  * [Index]({href(top + '/README.md')})")
        body.extend(walk_files(d, top, 1))
        body.append("")

    if (DOCS / "performance.md").exists():
        body.append(f"* [Performance (SDK timing)]({href('performance.md')})")
        body.append("")

    OUT.write_text("\n".join(body) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(body)} lines)")


if __name__ == "__main__":
    main()
