"""Package-private checkpoint helpers (Diff wire shaping · cover · line scan).

Kept out of :mod:`xaiop.checkpoint` so the engine class stays focused on buffer /
Commit / history wiring. Not part of the published API surface.
"""

from __future__ import annotations

from typing import Any


def read_line(text: str, from_: int, at_eof: bool) -> dict[str, Any] | None:
    if from_ >= len(text):
        return None
    i = from_
    n = len(text)
    while i < n:
        if text[i] == "\n":
            end = i
            if end > from_ and text[end - 1] == "\r":
                end -= 1
            return {
                "line": text[from_:end],
                "end": i + 1,
                "consumed_newline": True,
            }
        i += 1
    if not at_eof:
        return None
    return {"line": text[from_:], "end": n, "consumed_newline": False}


def lines_to_wire(lines: list[str]) -> str:
    if not lines:
        return ""
    return "\n".join(lines) + "\n"


def is_amp_line(line: str) -> bool:
    return bool(line) and line[0] == "&"


def _split_path_segments(path: str) -> list[str]:
    """Split ``a>b>c`` without ``str.split`` allocation of empty tails."""
    segs: list[str] = []
    start = 0
    n = len(path)
    for i in range(n):
        if path[i] == ">":
            if i > start:
                segs.append(path[start:i])
            start = i + 1
    if start < n:
        segs.append(path[start:])
    return segs


def build_delete_tombstone(amps: list[str]) -> dict[str, Any]:
    root: dict[str, Any] = {}
    for line in amps:
        path = line[1:]
        segments = _split_path_segments(path)
        if not segments:
            continue
        cur = root
        for seg in segments[:-1]:
            existing = cur.get(seg)
            if existing is None or not isinstance(existing, dict):
                cur[seg] = {}
            cur = cur[seg]
        cur[segments[-1]] = None
    return root


def with_leading_dot(raw: str) -> str:
    if raw == "." or raw.startswith(".\n") or raw.startswith(".\r\n"):
        return raw
    return raw if raw.startswith("\n") else f".\n{raw}"


def first_phase_line(raw: str) -> str | None:
    i = 0
    n = len(raw)
    while i < n:
        if raw[i] == "\r":
            i += 1
            continue
        if raw[i] == "\n":
            i += 1
            continue
        j = i
        while j < n and raw[j] not in "\n\r":
            j += 1
        line = raw[i:j]
        if line.endswith("\r"):
            line = line[:-1]
        if line in (".", ""):
            i = j + 1
            continue
        return line
    return None


def phase_has_bare_document_root(raw: str) -> bool:
    return first_phase_line(raw) in (">", "-")


def ensure_diff_document_root(raw: str, root_kind: str | None) -> str:
    if phase_has_bare_document_root(raw):
        return raw
    if root_kind == "array":
        return raw
    return f">\n{raw}"


def phase_needs_prior_tree(raw: str) -> bool:
    i = 0
    n = len(raw)
    while i < n:
        if raw[i] == "\r":
            i += 1
            continue
        if raw[i] == "\n":
            i += 1
            continue
        c = ord(raw[i])
        if c in (61, 33, 38, 64, 63):  # = ! & @ ?
            return True
        while i < n:
            ch = raw[i]
            if ch == "\n":
                i += 1
                break
            if ch == "\r":
                i += 1
                if i < n and raw[i] == "\n":
                    i += 1
                break
            i += 1
    return False


def is_empty_phase_wire(raw: str) -> bool:
    start = 0
    end = len(raw)
    if start < end and raw[start] == ".":
        start += 1
        if start < end and raw[start] == "\r":
            start += 1
        if start < end and raw[start] == "\n":
            start += 1
    if end > start:
        e = end
        if e > start and raw[e - 1] == "\n":
            e -= 1
        if e > start and raw[e - 1] == "\r":
            e -= 1
        if e > start and raw[e - 1] == ".":
            e -= 1
            if e > start and raw[e - 1] == "\n":
                e -= 1
            if e > start and raw[e - 1] == "\r":
                e -= 1
            end = e
    while start < end and raw[start] in " \t\n\r":
        start += 1
    while end > start and raw[end - 1] in " \t\n\r":
        end -= 1
    return start >= end


def normalize_empty_phase(raw: str, value: Any) -> Any:
    return None if is_empty_phase_wire(raw) else value
