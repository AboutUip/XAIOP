"""Response consumption modes (multi-select). Default: callback only."""

from __future__ import annotations

from typing import Iterable

StreamMode = str

STREAM_MODES = {
    "CALLBACK": "callback",
    "PROMISE": "promise",
    "ASYNC_ITERATOR": "asyncIterator",
    "EVENTS": "events",
}

ALL_STREAM_MODES: frozenset[str] = frozenset(STREAM_MODES.values())


def normalize_modes(
    modes: Iterable[str] | str | None = None,
) -> set[str]:
    if modes is None:
        return {STREAM_MODES["CALLBACK"]}
    items = [modes] if isinstance(modes, str) else list(modes)
    out: set[str] = set()
    for m in items:
        if m not in ALL_STREAM_MODES:
            raise TypeError(f"unknown stream mode: {m!r}")
        out.add(m)
    if not out:
        out.add(STREAM_MODES["CALLBACK"])
    return out
