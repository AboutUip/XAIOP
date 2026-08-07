"""JSON ↔ XAIOP merge / inject (pre/post-processing — not streaming)."""

from __future__ import annotations

from typing import Any, Literal

from .clone import clone_json
from .encode import encode_sync
from .fragment import XaiopFragment
from .materialize import materialize
from .parse import parse_sync

MergeConflict = Literal["overwrite", "keep"]

MERGE_CONFLICT = {
    "OVERWRITE": "overwrite",
    "KEEP": "keep",
}


def _is_plain_object(v: Any) -> bool:
    return isinstance(v, dict) and type(v) is dict


def _normalize_conflict(conflict: MergeConflict | None) -> MergeConflict:
    c: MergeConflict = conflict or "overwrite"  # type: ignore[assignment]
    if c not in ("overwrite", "keep"):
        raise TypeError(
            f'merge conflict must be "overwrite" or "keep", got {json_repr(conflict)}'
        )
    return c


def json_repr(v: Any) -> str:
    import json

    return json.dumps(v)


def merge_json(
    base: Any,
    overlay: Any,
    conflict: MergeConflict = "overwrite",
) -> Any:
    policy = _normalize_conflict(conflict)
    return _merge_into(clone_json(base), clone_json(overlay), policy)


def _merge_into(target: Any, overlay: Any, conflict: MergeConflict) -> Any:
    if not _is_plain_object(target) or not _is_plain_object(overlay):
        return overlay if conflict == "overwrite" else target

    for key in overlay:
        ov = overlay[key]
        if key not in target:
            target[key] = ov
            continue
        tv = target[key]
        if _is_plain_object(tv) and _is_plain_object(ov):
            _merge_into(tv, ov, conflict)
            continue
        if conflict == "overwrite":
            target[key] = ov
    return target


def to_mergeable_json(value: Any) -> Any:
    if isinstance(value, XaiopFragment):
        return materialize(value)
    return clone_json(value)


def merge_to_json(
    base_json: Any,
    xaiop_source: str,
    options: dict[str, Any] | None = None,
) -> Any:
    options = options or {}
    if not isinstance(xaiop_source, str):
        raise TypeError("xaiop_source must be a string")
    overlay = materialize(parse_sync(xaiop_source, options.get("compat", False)))
    return merge_json(base_json, overlay, options.get("conflict"))


def merge_to_xaiop(
    base_json: Any,
    xaiop_source: str,
    options: dict[str, Any] | None = None,
) -> str:
    options = options or {}
    json_value = merge_to_json(base_json, xaiop_source, options)
    encode_options = options.get("encode_options") or {"dot_policy": "none"}
    return encode_sync(json_value, **encode_options)


def format_inject_result(value: Any, options: dict[str, Any] | None = None) -> Any:
    options = options or {}
    as_fmt = options.get("as", "json")
    if as_fmt == "xaiop":
        encode_options = options.get("encode_options") or {"dot_policy": "none"}
        return encode_sync(value, **encode_options)
    if as_fmt != "json":
        raise TypeError(
            f'inject as must be "json" or "xaiop", got {json_repr(as_fmt)}'
        )
    return clone_json(value)
