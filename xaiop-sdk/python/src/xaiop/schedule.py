"""Portable run-soon scheduler."""

from __future__ import annotations

import threading
from typing import Callable


def schedule_immediate(fn: Callable[[], None]) -> None:
    """Prefer a background thread with zero delay (portable setImmediate)."""
    threading.Timer(0, fn).start()
