"""Materialize parser output into independent JSON values."""

from __future__ import annotations

import copy
from typing import Any

from .fragment import XaiopFragment


def materialize(parsed: Any) -> Any:
    """Deep-copy a parsed document or fragment entries."""
    if isinstance(parsed, XaiopFragment):
        return copy.deepcopy(parsed.entries)
    return copy.deepcopy(parsed)
