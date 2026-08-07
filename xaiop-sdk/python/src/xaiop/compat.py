"""Compatibility-mode fix policy (SDK ingest only; wire protocol unchanged)."""

from __future__ import annotations

from typing import Any

COMPAT_FIX_DEFAULTS: dict[str, bool] = {
    "forcedRoot": True,
    "rewriteBareNameArray": True,
    "rewriteEnterLine": True,
    "ignoreBareLeaveAtRoot": True,
    "popAndRetry": True,
    "locatePathTrim": True,
    "locatePathStripSpaces": True,
    "locatePathArraySuffix": True,
}

COMPAT_FIX_IDS: tuple[str, ...] = tuple(COMPAT_FIX_DEFAULTS.keys())

CompatFixId = str


class CompatPolicy:
    """Mutable per-engine (or per-parse) compatibility fix flags."""

    def __init__(self, overrides: dict[str, bool] | None = None) -> None:
        overrides = overrides or {}
        for fix_id in COMPAT_FIX_IDS:
            if fix_id in overrides:
                setattr(self, fix_id, bool(overrides[fix_id]))
            else:
                setattr(self, fix_id, COMPAT_FIX_DEFAULTS[fix_id])

    def reset_to_defaults(self) -> CompatPolicy:
        for fix_id in COMPAT_FIX_IDS:
            setattr(self, fix_id, COMPAT_FIX_DEFAULTS[fix_id])
        return self

    def snapshot(self) -> dict[str, bool]:
        return {fix_id: bool(getattr(self, fix_id)) for fix_id in COMPAT_FIX_IDS}

    def set(self, fix_id: str, enabled: bool) -> bool:
        if fix_id not in COMPAT_FIX_DEFAULTS:
            return False
        if not isinstance(enabled, bool):
            return False
        setattr(self, fix_id, enabled)
        return True


def resolve_compat_options(
    arg: bool | CompatPolicy | dict[str, bool] | None | Any = False,
) -> dict[str, bool] | None:
    """Normalize parse/upload compat arg into a policy snapshot, or ``None`` (strict)."""
    if not arg:
        return None
    if arg is True:
        return CompatPolicy().snapshot()
    if isinstance(arg, CompatPolicy):
        return arg.snapshot()
    if isinstance(arg, dict):
        return CompatPolicy(arg).snapshot()
    return None
