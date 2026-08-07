"""Materialize parser output into independent JSON values."""

from __future__ import annotations

import copy
from typing import Any

from .fragment import XaiopFragment


def materialize(parsed: Any) -> Any:
    """Deep-copy a parsed document or fragment entries."""
    return materialize_snapshot(parsed)


def materialize_snapshot(parsed: Any) -> Any:
    """Deep-cloned JSON snapshot (safe to retain / mutate independently)."""
    if isinstance(parsed, XaiopFragment):
        return copy.deepcopy(parsed.entries)
    return copy.deepcopy(parsed)


def materialize_owned(parsed: Any) -> Any:
    """Transfer parser output without cloning a plain document root."""
    if isinstance(parsed, XaiopFragment):
        return copy.deepcopy(parsed.entries)
    return parsed
