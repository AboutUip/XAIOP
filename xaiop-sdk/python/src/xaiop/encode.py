"""Simplified JSON → XAIOP encoder (STRICT wire only)."""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from .errors import XaiopEncodeError

_FLOAT_RE = re.compile(
    r"^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$|^[+-]?\d+[eE][+-]?\d+$"
)
_OPERATOR_HEADS = frozenset("><=!&#.-")


def encode_sync(
    value: Any,
    *,
    root: Literal["auto", "object", "array", "fragment"] = "auto",
    trailing_newline: bool = True,
    key_order: Literal["insertion", "sorted"] = "insertion",
) -> str:
    """Encode a JSON value as XAIOP wire (simplified single-phase relative style)."""
    if value is None:
        raise XaiopEncodeError("cannot encode null as a document root")

    root_kind = _resolve_root(value, root)
    lines: list[str] = []

    if root_kind == "array":
        if not isinstance(value, list):
            raise XaiopEncodeError("root:'array' requires an array value")
        lines.append("-")
        _emit_array_elements(lines, value, "$", key_order)
        return _join_wire(lines, trailing_newline)

    if root_kind == "fragment":
        if not isinstance(value, dict):
            raise XaiopEncodeError(
                "root:'fragment' requires a plain object", path="$"
            )
        keys = _ordered_keys(value, key_order)
        for key in keys:
            _emit_object_entry(lines, key, value[key], f"$.{key}", key_order)
        return _join_wire(lines, trailing_newline)

    if not isinstance(value, dict):
        raise XaiopEncodeError(
            "object document root requires a plain object (or use an array root)",
            path="$",
        )

    keys = _ordered_keys(value, key_order)
    if not keys:
        lines.append(">")
        return _join_wire(lines, trailing_newline)

    lines.append(">")
    for key in keys:
        _emit_object_entry(lines, key, value[key], f"$.{key}", key_order)
    return _join_wire(lines, trailing_newline)


def _resolve_root(
    value: Any, root: Literal["auto", "object", "array", "fragment"]
) -> Literal["object", "array", "fragment"]:
    if root == "object":
        return "object"
    if root == "array":
        return "array"
    if root == "fragment":
        return "fragment"
    if isinstance(value, list):
        return "array"
    return "object"


def _ordered_keys(obj: dict[str, Any], key_order: Literal["insertion", "sorted"]) -> list[str]:
    keys = list(obj.keys())
    if key_order == "sorted":
        keys.sort()
    return keys


def _emit_object_entry(
    lines: list[str],
    key: str,
    value: Any,
    path: str,
    key_order: Literal["insertion", "sorted"],
) -> None:
    _assert_key(key, path)

    if value is None:
        lines.append(f"{key}:null")
        return

    if isinstance(value, list):
        lines.append(f">{key}-")
        _emit_array_elements(lines, value, path, key_order)
        lines.append("<")
        return

    if isinstance(value, dict):
        lines.append(f">{key}")
        for k in _ordered_keys(value, key_order):
            _emit_object_entry(lines, k, value[k], f"{path}.{k}", key_order)
        lines.append("<")
        return

    lines.append(_format_content(key, value, path))


def _emit_array_elements(
    lines: list[str],
    arr: list[Any],
    path: str,
    key_order: Literal["insertion", "sorted"],
) -> None:
    for i, el in enumerate(arr):
        el_path = f"{path}[{i}]"
        if el is None:
            lines.append(":null")
            continue
        if isinstance(el, list):
            lines.append("-")
            _emit_array_elements(lines, el, el_path, key_order)
            lines.append("<")
            continue
        if isinstance(el, dict):
            lines.append(">")
            for k in _ordered_keys(el, key_order):
                _emit_object_entry(lines, k, el[k], f"{el_path}.{k}", key_order)
            lines.append("<")
            continue
        lines.append(_format_scalar_element(el, el_path))


def _format_scalar_element(value: Any, path: str) -> str:
    if value is None:
        return ":null"
    if isinstance(value, bool):
        return f":{'true' if value else 'false'}"
    if isinstance(value, int) and not isinstance(value, bool):
        return f":{_format_number_token(value, path)}"
    if isinstance(value, float):
        return f":{_format_number_token(value, path)}"
    if isinstance(value, str):
        _assert_encodable_string(value, path)
        if _needs_forced_string(value):
            return f": {value}"
        return f":{value}"
    raise XaiopEncodeError(
        f"unsupported array element type: {type(value).__name__}", path=path
    )


def _format_content(key: str, value: Any, path: str) -> str:
    if isinstance(value, bool):
        return f"{key}:{'true' if value else 'false'}"
    if isinstance(value, int) and not isinstance(value, bool):
        return f"{key}:{_format_number_token(value, path)}"
    if isinstance(value, float):
        return f"{key}:{_format_number_token(value, path)}"
    if isinstance(value, str):
        _assert_encodable_string(value, path)
        if _needs_forced_string(value):
            return f"{key}: {value}"
        return f"{key}:{value}"
    raise XaiopEncodeError(
        f"unsupported value type: {type(value).__name__}", path=path
    )


def _format_number_token(n: int | float, path: str) -> str:
    if not isinstance(n, (int, float)) or not (n == n and abs(n) != float("inf")):
        raise XaiopEncodeError(
            f"non-finite numbers are not encodable as float tokens ({n!r})",
            path=path,
        )
    if isinstance(n, int) and not isinstance(n, bool):
        return str(n)
    if isinstance(n, float) and n.is_integer() and abs(n) < 2**53:
        return str(int(n))
    s = str(n)
    if re.match(r"^[+-]?\d+$", s):
        return s
    if _FLOAT_RE.match(s):
        return s
    j = json.dumps(n)
    if isinstance(j, str):
        return j
    raise XaiopEncodeError(f"cannot format number: {n!r}", path=path)


def _needs_forced_string(s: str) -> bool:
    if s in ("true", "false", "null"):
        return True
    if re.match(r"^[+-]?\d+$", s):
        return True
    return bool(_FLOAT_RE.match(s))


def _assert_key(key: str, path: str) -> None:
    if not isinstance(key, str) or not key:
        raise XaiopEncodeError("object keys must be non-empty strings", path=path)
    if any(c.isspace() for c in key) or ":" in key:
        raise XaiopEncodeError(f"invalid label name: {key!r}", path=path)
    if key.endswith("-"):
        raise XaiopEncodeError(
            f'invalid label name (trailing "-" reserved for arrays): {key!r}',
            path=path,
        )
    if key and key[0] in _OPERATOR_HEADS:
        raise XaiopEncodeError(
            f"invalid label name (must not begin with line-operator): {key!r}",
            path=path,
        )
    if any(c in key for c in "><=!&"):
        raise XaiopEncodeError(
            f"invalid label name (contains Cursor/operator character): {key!r}",
            path=path,
        )


def _assert_encodable_string(s: str, path: str) -> None:
    if "\n" in s or "\r" in s:
        raise XaiopEncodeError("string values must not contain CR/LF", path=path)
    if s and ord(s[0]) == 0x20:
        raise XaiopEncodeError(
            "string values must not begin with U+0020 SPACE "
            "(wire forced-string marker would strip leading spaces)",
            path=path,
        )


def _join_wire(lines: list[str], trailing_newline: bool) -> str:
    cleaned = _collapse_redundant_leaves(lines)
    if not cleaned:
        return ""
    text = "\n".join(cleaned)
    if trailing_newline:
        text += "\n"
    return text


def _collapse_redundant_leaves(lines: list[str]) -> list[str]:
    drop = 0
    for i in range(len(lines)):
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if lines[i] == "<" and (nxt == "." or nxt is None):
            drop += 1
    if drop == 0:
        return lines
    out: list[str] = []
    for i, line in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else None
        if line == "<" and (nxt == "." or nxt is None):
            continue
        out.append(line)
    return out
