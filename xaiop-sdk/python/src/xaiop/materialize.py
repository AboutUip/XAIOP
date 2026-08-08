"""Materialize parser output into independent JSON values."""

from __future__ import annotations

from typing import Any

from .clone import clone_json
from .fragment import XaiopFragment


def materialize(parsed: Any) -> Any:
    """Deep-copy a parsed document or fragment entries."""
    return materialize_snapshot(parsed)


def materialize_snapshot(parsed: Any) -> Any:
    """Deep-cloned JSON snapshot (safe to retain / mutate independently).

    Uses hand-walk :func:`clone_json` (Node ``cloneJson``), not ``copy.deepcopy``.
    """
    if isinstance(parsed, XaiopFragment):
        return clone_json(parsed.entries)
    return clone_json(parsed)


def materialize_owned(parsed: Any) -> Any:
    """Transfer parser output without cloning a plain document root."""
    if isinstance(parsed, XaiopFragment):
        return clone_json(parsed.entries)
    return parsed
