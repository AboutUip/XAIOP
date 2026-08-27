"""Phase annotation-span (#) intercept — SDK product, not wire grammar."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable

from .encode import encode_sync, format_json_path
from .materialize import materialize_snapshot
from .parse import LiveParser

_UNSET = object()


class AnnotationSpan:
    """Annotation span handler return values."""

    class _KeepSentinel:
        def __repr__(self) -> str:
            return "AnnotationSpan.KEEP"

    KEEP = _KeepSentinel()


@dataclass
class AnnotationSpanView:
    annotation: str
    annotation_raw: str
    path: str
    depth: int
    json: Any
    json_text: str


AnnotationSpanHandler = Callable[[str, AnnotationSpanView], Any]


def apply_annotation_spans(
    phase_lines: list[str],
    handlers: list[AnnotationSpanHandler],
) -> dict[str, Any]:
    if not handlers:
        return {"lines": phase_lines, "escape_paths": []}

    stack: list[dict[str, Any]] = []
    out: list[str] = []
    escape_paths: list[str] = []

    i = 0
    while i < len(phase_lines):
        line = phase_lines[i]

        if line == ".":
            out.append(line)
            stack.clear()
            i += 1
            continue

        if line.startswith("#!"):
            out.append(line)
            i += 1
            continue

        if line.startswith("#"):
            depth = len(stack)
            parent_path = _path_from_stack(stack)
            annotation = line[1:]
            collected = _collect_forward_siblings(phase_lines, i + 1, depth)
            capture_lines = collected["lines"]
            parent_kind = (
                "array"
                if stack and stack[-1].get("kind") == "array"
                else "object"
            )
            json_val = _materialize_capture(capture_lines, parent_kind)
            view = AnnotationSpanView(
                annotation=annotation,
                annotation_raw=line,
                path=parent_path,
                depth=depth,
                json=json_val,
                json_text=_stable_json_text(json_val),
            )

            result: Any = _UNSET
            for fn in handlers:
                if not callable(fn):
                    continue
                ret = fn(annotation, view)
                if ret is None:
                    result = None
                    break
                if ret is not AnnotationSpan.KEEP:
                    result = ret
                    break

            if result is _UNSET or result is AnnotationSpan.KEEP:
                out.append(line)
                for cap_line in capture_lines:
                    _apply_sim_line(stack, cap_line)
                    out.append(cap_line)
                _add_escape_keys(escape_paths, parent_path, json_val)
            elif result is None:
                pass
            else:
                remount = _normalize_handler_json(result)
                sibling_lines = encode_as_sibling_lines(remount, parent_kind)
                for sib_line in sibling_lines:
                    _apply_sim_line(stack, sib_line)
                    out.append(sib_line)
                _add_escape_keys(escape_paths, parent_path, remount)

            i = collected["end"]
            continue

        _apply_sim_line(stack, line)
        out.append(line)
        i += 1

    return {"lines": out, "escape_paths": _unique_paths(escape_paths)}


def encode_as_sibling_lines(
    value: Any,
    parent_kind: str = "object",
) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, (dict, list)):
        raise TypeError("remount value must be a plain object or array")
    if isinstance(value, list):
        live = encode_sync(value, dot_policy="none")
        lines = _split_wire_lines(live)
        if parent_kind == "array" and lines and lines[0] == "-":
            return lines[1:]
        return lines
    live = encode_sync(value, dot_policy="none")
    lines = _split_wire_lines(live)
    if parent_kind == "array":
        return lines
    if lines and lines[0] == ">":
        return lines[1:]
    return lines


def path_escapes_type_check(path: str, escape_paths: list[str] | None) -> bool:
    if not escape_paths:
        return False
    for e in escape_paths:
        if e == "":
            return True
        if path == e:
            return True
        if path.startswith(e + ".") or path.startswith(e + "["):
            return True
    return False


def _collect_forward_siblings(
    lines: list[str],
    from_: int,
    base_depth: int,
) -> dict[str, Any]:
    capture: list[str] = []
    stack: list[dict[str, Any]] = [
        {"kind": "object", "key": None} for _ in range(base_depth)
    ]
    i = from_
    while i < len(lines):
        line = lines[i]
        if line == ".":
            break
        depth_before = len(stack)
        if line == "<":
            if depth_before <= base_depth:
                break
        elif line.startswith("<") and len(line) > 1:
            if depth_before <= base_depth:
                break
        if line.startswith(("=", "@", "!", "?")):
            break
        capture.append(line)
        _apply_sim_line(stack, line)
        i += 1
    return {"lines": capture, "end": i}


def _materialize_capture(
    capture_lines: list[str],
    parent_kind: str = "object",
) -> Any:
    if not capture_lines:
        return [] if parent_kind == "array" else {}
    live = LiveParser(False)
    live.feed_line("-" if parent_kind == "array" else ">")
    for cap_line in capture_lines:
        live.feed_line(cap_line)
    snap = materialize_snapshot(live.value())
    if snap is None:
        return [] if parent_kind == "array" else {}
    if not isinstance(snap, (dict, list)):
        return {"value": snap}
    return snap


def _stable_json_text(json_val: Any) -> str:
    try:
        return json.dumps(json_val)
    except (TypeError, ValueError):
        return "null"


def _normalize_handler_json(result: Any) -> Any:
    if isinstance(result, str):
        t = result.strip()
        if not t:
            return {}
        return json.loads(t)
    if result is None:
        return {}
    if not isinstance(result, (dict, list)):
        raise TypeError(
            "annotation span handler must return JSON object/array, JSON text, "
            "null, AnnotationSpan.KEEP, or omit"
        )
    return result


def _split_wire_lines(text: str) -> list[str]:
    t = text.replace("\r\n", "\n").replace("\r", "\n")
    parts = t.split("\n")
    if parts and parts[-1] == "":
        parts.pop()
    return parts


def _apply_sim_line(stack: list[dict[str, Any]], line: str) -> None:
    if line.startswith("#"):
        return
    if line == ".":
        stack.clear()
        return
    if line == "<":
        if stack:
            stack.pop()
        return
    if line.startswith("<") and len(line) > 1:
        if stack:
            stack.pop()
        stack.append({"kind": "object", "key": line[1:]})
        return
    if line.startswith(("=", "@", "!")):
        path = line[1:]
        segs = [s for s in path.split(">") if s]
        stack.clear()
        for s in segs:
            stack.append({"kind": "object", "key": s})
        return
    if line.startswith("?"):
        stack.append({"kind": "object", "key": None})
        return
    if line.startswith("&"):
        return
    if line == ">":
        stack.append({"kind": "object", "key": None})
        return
    if line == "-":
        stack.append({"kind": "array", "key": None})
        return
    if line.startswith(">") and line.endswith("-") and len(line) > 2:
        stack.append({"kind": "array", "key": line[1:-1]})
        return
    if line.startswith(">") and len(line) > 1:
        name = line[1:]
        if ">" in name:
            for p in name.split(">"):
                if p:
                    stack.append({"kind": "object", "key": p})
            return
        stack.append({"kind": "object", "key": name})
        return


def _path_from_stack(stack: list[dict[str, Any]]) -> str:
    segs: list[str | int] = []
    for fr in stack:
        key = fr.get("key")
        if key is not None and key != "":
            segs.append(key)
    return format_json_path(segs) if segs else ""


def _add_escape_keys(
    escape_paths: list[str],
    parent_path: str,
    json_val: Any,
) -> None:
    if json_val is None:
        return
    if not isinstance(json_val, (dict, list)):
        if parent_path:
            escape_paths.append(parent_path)
        return
    if isinstance(json_val, list):
        base = parent_path or ""
        for i in range(len(json_val)):
            p = f"{base}[{i}]" if base else f"[{i}]"
            escape_paths.append(p)
        if not parent_path:
            escape_paths.append("")
        return
    for key in json_val:
        p = f"{parent_path}.{key}" if parent_path else key
        escape_paths.append(p)


def _unique_paths(paths: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for p in paths:
        if isinstance(p, str) and p not in seen:
            seen.add(p)
            out.append(p)
    return out
