"""Deep-clone JSON-compatible values (objects / arrays / scalars)."""

from __future__ import annotations

import copy
import json
from typing import Any


def clone_json(value: Any) -> Any:
    if value is None:
        return value
    t = type(value)
    if t in (str, int, float, bool):
        return value
    if t is not dict and t is not list:
        try:
            return copy.deepcopy(value)
        except Exception:
            return value
    if isinstance(value, list):
        return [clone_json(v) for v in value]
    if isinstance(value, dict) and type(value) is dict:
        return {k: clone_json(v) for k, v in value.items()}
    try:
        return copy.deepcopy(value)
    except Exception:
        try:
            return json.loads(json.dumps(value))
        except Exception:
            return value
