"""Root fragment representation."""

from __future__ import annotations

import json
from typing import Any


class XaiopFragment:
    """Named bindings at Root without an anonymous outer object."""

    __slots__ = ("entries",)

    def __init__(self, entries: dict[str, Any]) -> None:
        self.entries = entries

    @property
    def is_fragment(self) -> bool:
        return True

    def notation(self) -> str:
        return ",".join(
            f"{json.dumps(k)}:{json.dumps(v)}" for k, v in self.entries.items()
        )
