"""In-memory XAIOP engine (isomorphic core)."""

from __future__ import annotations

import copy
import random
import time
from typing import Any

from .clone import clone_json
from .compat import CompatPolicy
from .encode import encode_sync
from .fragment import XaiopFragment
from .merge import (
    format_inject_result,
    merge_json,
    merge_to_json,
    merge_to_xaiop,
    to_mergeable_json,
)
from .parse import parse_sync
from .types import TypeChecker, TypeRegistry, encode_type_schema_frame

PROTOCOL_VERSION = "0.6.0"
SDK_VERSION = "0.15.1"


class XaiopEngine:
    def __init__(self, *, compatibility_mode: bool = False) -> None:
        self._store: dict[str, Any] = {}
        self._seq = 0
        self._compatibility_mode = bool(compatibility_mode)
        self._type_check = False
        self._type_registry = TypeRegistry()
        self._type_violation_hook = None
        self._compat = CompatPolicy()

    @property
    def compatibility_mode(self) -> bool:
        return self._compatibility_mode

    @property
    def type_check(self) -> bool:
        return self._type_check

    def set_compatibility_mode(self, enabled: bool) -> XaiopEngine:
        self._compatibility_mode = bool(enabled)
        if self._compatibility_mode:
            self._type_check = False
        return self

    def set_type_check(self, enabled: bool) -> bool:
        if enabled:
            if self._compatibility_mode:
                return False
            self._type_check = True
            return True
        self._type_check = False
        return True

    @property
    def type_registry(self) -> TypeRegistry:
        return self._type_registry

    def register_type(
        self,
        path: str,
        type_: Any,
        options: dict[str, Any] | None = None,
    ) -> bool:
        return self._type_registry.register(path, type_, options)

    def register_types(
        self,
        mapping: dict[str, Any] | list[tuple[str, Any]],
        options: dict[str, Any] | None = None,
    ) -> None:
        self._type_registry.register_many(mapping, options)

    def register_type_deny(self, path: str, type_: Any) -> bool:
        return self._type_registry.register(path, type_, {"polarity": "deny"})

    def get_registered_type(self, path: str) -> Any:
        return self._type_registry.get(path)

    def export_type_schema(self) -> dict[str, Any]:
        return self._type_registry.snapshot()

    def on_type_violation(self, fn: Any) -> XaiopEngine:
        self._type_violation_hook = fn if callable(fn) else None
        return self

    def encode_type_schema_frame(self) -> str:
        return encode_type_schema_frame(self._type_registry.snapshot())

    def _run_type_check(self, value: Any) -> None:
        if not self._type_check:
            return
        if self._type_registry.size == 0:
            return
        checker = TypeChecker(
            self._type_registry,
            on_violation=self._type_violation_hook,
        )
        checker.check_tree(value)

    def _set_compat_fix(self, fix_id: str, enabled: bool) -> bool:
        if not self._compatibility_mode:
            return False
        return self._compat.set(fix_id, enabled)

    def _parse_compat_arg(self) -> bool | dict[str, bool]:
        return self._compat.snapshot() if self._compatibility_mode else False

    @property
    def compat_forced_root(self) -> bool:
        return self._compat.forcedRoot

    def set_compat_forced_root(self, enabled: bool) -> bool:
        return self._set_compat_fix("forcedRoot", enabled)

    @property
    def compat_rewrite_bare_name_array(self) -> bool:
        return self._compat.rewriteBareNameArray

    def set_compat_rewrite_bare_name_array(self, enabled: bool) -> bool:
        return self._set_compat_fix("rewriteBareNameArray", enabled)

    @property
    def compat_rewrite_enter_line(self) -> bool:
        return self._compat.rewriteEnterLine

    def set_compat_rewrite_enter_line(self, enabled: bool) -> bool:
        return self._set_compat_fix("rewriteEnterLine", enabled)

    @property
    def compat_ignore_bare_leave_at_root(self) -> bool:
        return self._compat.ignoreBareLeaveAtRoot

    def set_compat_ignore_bare_leave_at_root(self, enabled: bool) -> bool:
        return self._set_compat_fix("ignoreBareLeaveAtRoot", enabled)

    @property
    def compat_pop_and_retry(self) -> bool:
        return self._compat.popAndRetry

    def set_compat_pop_and_retry(self, enabled: bool) -> bool:
        return self._set_compat_fix("popAndRetry", enabled)

    @property
    def compat_locate_path_trim(self) -> bool:
        return self._compat.locatePathTrim

    def set_compat_locate_path_trim(self, enabled: bool) -> bool:
        return self._set_compat_fix("locatePathTrim", enabled)

    @property
    def compat_locate_path_strip_spaces(self) -> bool:
        return self._compat.locatePathStripSpaces

    def set_compat_locate_path_strip_spaces(self, enabled: bool) -> bool:
        return self._set_compat_fix("locatePathStripSpaces", enabled)

    @property
    def compat_locate_path_array_suffix(self) -> bool:
        return self._compat.locatePathArraySuffix

    def set_compat_locate_path_array_suffix(self, enabled: bool) -> bool:
        return self._set_compat_fix("locatePathArraySuffix", enabled)

    def upload_sync(self, source: str) -> str:
        value = parse_sync(source, self._parse_compat_arg())
        self._run_type_check(value)
        data_id = _next_id(self._seq + 1)
        self._seq += 1
        self._store[data_id] = value
        return data_id

    def upload_json_sync(self, value: Any, encode_options: dict[str, Any] | None = None) -> str:
        source = encode_sync(value, **(encode_options or {}))
        return self.upload_sync(source)

    def encode_sync(self, value: Any, options: dict[str, Any] | None = None) -> str:
        return encode_sync(value, **(options or {}))

    def merge_to_json_sync(
        self,
        base_json: Any,
        xaiop_source: str,
        options: dict[str, Any] | None = None,
    ) -> Any:
        options = dict(options or {})
        if "compat" not in options:
            options["compat"] = self._parse_compat_arg()
        return merge_to_json(base_json, xaiop_source, options)

    def merge_to_xaiop_sync(
        self,
        base_json: Any,
        xaiop_source: str,
        options: dict[str, Any] | None = None,
    ) -> str:
        options = dict(options or {})
        if "compat" not in options:
            options["compat"] = self._parse_compat_arg()
        return merge_to_xaiop(base_json, xaiop_source, options)

    def inject_xaiop_sync(
        self,
        data_id: str,
        xaiop_source: str,
        options: dict[str, Any] | None = None,
    ) -> Any:
        options = dict(options or {})
        base = self._require_stored(data_id)
        merge_opts = {
            "conflict": options.get("conflict"),
            "compat": options.get("compat", self._parse_compat_arg()),
        }
        merged = merge_to_json(base, xaiop_source, merge_opts)
        self._run_type_check(merged)
        self._store[data_id] = merged
        return format_inject_result(merged, options)

    def inject_json_sync(
        self,
        data_id: str,
        json_value: Any,
        options: dict[str, Any] | None = None,
    ) -> Any:
        options = options or {}
        base = self._require_stored(data_id)
        merged = merge_json(base, json_value, options.get("conflict"))
        self._run_type_check(merged)
        self._store[data_id] = merged
        return format_inject_result(merged, options)

    def _require_stored(self, data_id: str) -> Any:
        if not isinstance(data_id, str) or not data_id:
            raise TypeError("dataId must be a non-empty string")
        if data_id not in self._store:
            raise ValueError(f"unknown data id: {data_id}")
        return to_mergeable_json(self._store[data_id])

    def get_sync(self, data_id: str) -> Any:
        if not isinstance(data_id, str) or not data_id:
            raise TypeError("dataId must be a non-empty string")
        if data_id not in self._store:
            raise ValueError(f"unknown data id: {data_id}")
        value = self._store[data_id]
        if isinstance(value, XaiopFragment):
            return XaiopFragment(copy.deepcopy(value.entries))
        return copy.deepcopy(value)

    @staticmethod
    def parse_sync(source: str, compatibility_mode: bool = False) -> Any:
        return parse_sync(source, compatibility_mode)

    @staticmethod
    def encode_sync_static(value: Any, options: dict[str, Any] | None = None) -> str:
        return encode_sync(value, **(options or {}))

    @staticmethod
    def merge_to_json_static(
        base_json: Any,
        xaiop_source: str,
        options: dict[str, Any] | None = None,
    ) -> Any:
        return merge_to_json(base_json, xaiop_source, options)

    @staticmethod
    def merge_to_xaiop_static(
        base_json: Any,
        xaiop_source: str,
        options: dict[str, Any] | None = None,
    ) -> str:
        return merge_to_xaiop(base_json, xaiop_source, options)

    def has(self, data_id: str) -> bool:
        return data_id in self._store

    def delete(self, data_id: str) -> bool:
        return self._store.pop(data_id, None) is not None

    def clear(self) -> None:
        self._store.clear()


def _next_id(seq: int) -> str:
    return (
        f"xaiop_{seq}_{int(time.time() * 1000):x}_"
        f"{random.randint(0, 0xFFFFFF):06x}"
    )
