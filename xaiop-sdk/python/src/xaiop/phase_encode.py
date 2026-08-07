"""Encode one skeleton/module phase for WebSocket push."""

from __future__ import annotations

from typing import Any

from .encode import encode_sync


def encode_phase_json(
    key: str,
    value: Any,
    *,
    final: bool = False,
    encode_options: dict[str, Any] | None = None,
) -> str:
    if not isinstance(key, str) or not key:
        raise TypeError("phase key must be a non-empty string")
    opts = {**(encode_options or {}), "dot_policy": "none"}
    wire = encode_sync({key: value}, **opts)
    if not final:
        wire = _ensure_trailing_newline(wire) + ".\n"
    return wire


def encode_phase_object(
    obj: dict[str, Any],
    *,
    final: bool = False,
    encode_options: dict[str, Any] | None = None,
) -> str:
    if obj is None or not isinstance(obj, dict):
        raise TypeError("phase object must be a plain object")
    opts = {**(encode_options or {}), "dot_policy": "none"}
    wire = encode_sync(obj, **opts)
    if not final:
        wire = _ensure_trailing_newline(wire) + ".\n"
    return wire


def _ensure_trailing_newline(wire: str) -> str:
    return wire if wire.endswith("\n") else f"{wire}\n"
