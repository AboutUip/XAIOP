"""Minimal line classification + intercept chain for checkpoint."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

LINE_KIND = {
    "PHASE": "phase",
    "ANNOTATION": "annotation",
    "POP": "pop",
    "POP_ENTER": "pop_enter",
    "LOCATE": "locate",
    "EXACT": "exact",
    "BROADCAST": "broadcast",
    "DELETE": "delete",
    "OBJECT_ANON": "object_anon",
    "ARRAY_ANON": "array_anon",
    "ARRAY_NAMED": "array_named",
    "OBJECT_NAMED": "object_named",
    "CONTENT": "content",
    "UNKNOWN": "unknown",
}


@dataclass
class LineView:
    kind: str
    raw: str
    name: str | None = None
    path: str | None = None
    key: str | None = None
    value_text: str | None = None
    annotation_text: str | None = None


LineInterceptHandler = Callable[[dict[str, LineView | str]], str | None]


def empty_line_view(raw: str, kind: str = LINE_KIND["UNKNOWN"]) -> LineView:
    return LineView(kind=kind, raw=raw)


def classify_line(line: str) -> LineView:
    raw = line if isinstance(line, str) else str(line or "")
    if raw == ".":
        return empty_line_view(raw, LINE_KIND["PHASE"])
    if raw.startswith("#"):
        view = empty_line_view(raw, LINE_KIND["ANNOTATION"])
        view.annotation_text = raw[1:]
        return view
    if raw == "<":
        return empty_line_view(raw, LINE_KIND["POP"])
    if raw.startswith("<") and len(raw) > 1:
        view = empty_line_view(raw, LINE_KIND["POP_ENTER"])
        view.name = raw[1:]
        return view
    if raw.startswith("="):
        view = empty_line_view(raw, LINE_KIND["LOCATE"])
        view.path = raw[1:]
        return view
    if raw.startswith("@"):
        view = empty_line_view(raw, LINE_KIND["EXACT"])
        view.path = raw[1:]
        return view
    if raw.startswith("!"):
        view = empty_line_view(raw, LINE_KIND["BROADCAST"])
        view.path = raw[1:]
        return view
    if raw.startswith("&"):
        view = empty_line_view(raw, LINE_KIND["DELETE"])
        view.path = raw[1:]
        return view
    if raw == ">":
        return empty_line_view(raw, LINE_KIND["OBJECT_ANON"])
    if raw == "-":
        return empty_line_view(raw, LINE_KIND["ARRAY_ANON"])
    if raw.startswith(">") and raw.endswith("-") and len(raw) > 2:
        view = empty_line_view(raw, LINE_KIND["ARRAY_NAMED"])
        view.name = raw[1:-1]
        return view
    if raw.startswith(">") and len(raw) > 1:
        view = empty_line_view(raw, LINE_KIND["OBJECT_NAMED"])
        view.name = raw[1:]
        return view
    colon = raw.find(":")
    if colon != -1:
        view = empty_line_view(raw, LINE_KIND["CONTENT"])
        view.key = raw[:colon]
        view.value_text = raw[colon + 1 :]
        return view
    return empty_line_view(raw, LINE_KIND["UNKNOWN"])


def run_line_intercept_chain(
    line: str,
    handlers: list[LineInterceptHandler],
) -> str | None:
    if not handlers:
        return line
    current = line
    for fn in handlers:
        if not callable(fn):
            continue
        view = classify_line(current)
        out = fn({"raw": current, "view": view})
        if out is None:
            return None
        if isinstance(out, str):
            current = out
    return current
