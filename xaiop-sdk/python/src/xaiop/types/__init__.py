"""XAIOP type registry / freeze checking (not protocol wire)."""

from __future__ import annotations

from ._impl import (
    TYPE,
    TYPE_SCHEMA_FRAME_PREFIX,
    TypeChecker,
    TypeFreezeSession,
    TypeRegistry,
    XaiopTypeError,
    array_type,
    canonicalize_type,
    classify_value,
    clone_type,
    encode_type_schema_frame,
    object_type,
    parse_type_surface,
    try_parse_type_schema_frame,
    type_compatible,
    type_to_string,
    value_matches_type,
)

__all__ = [
    "TYPE",
    "TYPE_SCHEMA_FRAME_PREFIX",
    "TypeChecker",
    "TypeFreezeSession",
    "TypeRegistry",
    "XaiopTypeError",
    "array_type",
    "canonicalize_type",
    "classify_value",
    "clone_type",
    "encode_type_schema_frame",
    "object_type",
    "parse_type_surface",
    "try_parse_type_schema_frame",
    "type_compatible",
    "type_to_string",
    "value_matches_type",
]
