# -*- coding: utf-8 -*-
"""Rewrite Maven coordinates io.xaiop:xaiop -> io.github.aboutuip:xaiop (not Java packages)."""
from pathlib import Path

ROOT = Path(".")
# Living docs + sdk readmes + pom-related; skip sealed historical narrative lightly by still replacing coordinate string
targets = []
for pat in [
    "xaiop-sdk/java/pom.xml",
    "xaiop-sdk/java/README.md",
    "xaiop-sdk/java/MAVEN-CENTRAL.md",
    "xaiop-sdk/java/MAVEN-CENTRAL.zh-CN.md",
    "xaiop-sdk/README.md",
    "xaiop-sdk/README.zh-CN.md",
    "README.md",
    "docs/**/*.md",
]:
    targets.extend(ROOT.glob(pat))

# Unique
files = sorted({p.resolve() for p in targets if p.is_file()})

repls = [
    ("io.xaiop:xaiop", "io.github.aboutuip:xaiop"),
    ("<groupId>io.xaiop</groupId>", "<groupId>io.github.aboutuip</groupId>"),
    ("`io.xaiop:xaiop`", "`io.github.aboutuip:xaiop`"),
]

# MAVEN-CENTRAL special rewrite for namespace section
maven_en = Path("xaiop-sdk/java/MAVEN-CENTRAL.md")
maven_zh = Path("xaiop-sdk/java/MAVEN-CENTRAL.zh-CN.md")

count = 0
for p in files:
    text = p.read_text(encoding="utf-8")
    orig = text
    for a, b in repls:
        text = text.replace(a, b)
    if text != orig:
        p.write_text(text, encoding="utf-8", newline="\n")
        count += 1
        print("updated", p.relative_to(ROOT))

print("files", count)
