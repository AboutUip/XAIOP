"""Type registry, checker, freeze session, and schema frames."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable, Literal

from ..encode import format_json_path, parse_json_path
from ..fragment import XaiopFragment

TypeKind = Literal[
    "int", "float", "bool", "string", "null", "object", "array", "any"
]
TypePolarity = Literal["allow", "deny"]

TYPE_SCHEMA_FRAME_PREFIX = "#!xaiop/types/v1\n"


class XaiopTypeError(Exception):
    """Type mismatch or registry violation."""

    def __init__(
        self,
        message: str,
        *,
        path: str | None = None,
        expected: dict[str, Any] | None = None,
        actual: dict[str, Any] | None = None,
        polarity: TypePolarity | None = None,
    ) -> None:
        super().__init__(message)
        self.path = path
        self.expected = expected
        self.actual = actual
        self.polarity = polarity


TYPE: Any = type(
    "TYPE",
    (),
    {
        "INT": {"kind": "int"},
        "FLOAT": {"kind": "float"},
        "BOOL": {"kind": "bool"},
        "STRING": {"kind": "string"},
        "NULL": {"kind": "null"},
        "OBJECT": {"kind": "object"},
        "ARRAY": {"kind": "array"},
        "ANY": {"kind": "any"},
    },
)()


def object_type(fields: dict[str, Any]) -> dict[str, Any]:
    if fields is None or not isinstance(fields, dict):
        raise TypeError("object_type(fields) requires a plain object")
    out: dict[str, Any] = {}
    for k, v in fields.items():
        if not isinstance(k, str) or not k:
            raise TypeError("object_type field names must be non-empty strings")
        out[k] = canonicalize_type(v)
    return {"kind": "object", "fields": out}


def array_type(element: Any) -> dict[str, Any]:
    return {"kind": "array", "element": canonicalize_type(element)}


def canonicalize_type(input_: Any) -> dict[str, Any]:
    if input_ is None:
        raise TypeError("type is required")
    if isinstance(input_, str):
        return parse_type_surface(input_.strip())
    if not isinstance(input_, dict):
        raise TypeError(f"invalid type: {type(input_).__name__}")
    kind = input_.get("kind")
    if not isinstance(kind, str):
        raise TypeError("type object must have a kind")
    if kind in ("int", "float", "bool", "string", "null", "any"):
        return {"kind": kind}
    if kind == "object":
        fields = input_.get("fields")
        if fields is None:
            return {"kind": "object"}
        return object_type(fields)
    if kind == "array":
        element = input_.get("element")
        if element is None:
            return {"kind": "array"}
        return {"kind": "array", "element": canonicalize_type(element)}
    raise TypeError(f"unknown type kind: {kind}")


def parse_type_surface(text: str) -> dict[str, Any]:
    if not isinstance(text, str) or not text:
        raise TypeError("type surface must be a non-empty string")
    type_, nxt = _parse_type_expr(text, 0)
    if nxt != len(text):
        raise TypeError(
            f"unexpected trailing type syntax: {text[nxt:]!r}"
        )
    return type_


def _skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i] in " \t":
        i += 1
    return i


def _parse_type_expr(s: str, i: int) -> tuple[dict[str, Any], int]:
    i = _skip_ws(s, i)
    start = i
    while i < len(s) and re.match(r"[A-Za-z_]", s[i]):
        i += 1
    if i == start:
        raise TypeError(f"expected type name at {s[i:]!r}")
    name = s[start:i].lower()
    i = _skip_ws(s, i)
    if i < len(s) and s[i] == "<":
        i += 1
        if name == "array":
            inner, i = _parse_type_expr(s, i)
            i = _skip_ws(s, i)
            if i >= len(s) or s[i] != ">":
                raise TypeError("array<...> missing '>'")
            return {"kind": "array", "element": inner}, i + 1
        if name == "object":
            fields: dict[str, Any] = {}
            i = _skip_ws(s, i)
            if i < len(s) and s[i] == ">":
                return {"kind": "object"}, i + 1
            while True:
                i = _skip_ws(s, i)
                key_start = i
                while i < len(s) and re.match(r"[A-Za-z0-9_]", s[i]):
                    i += 1
                if i == key_start:
                    raise TypeError("object field name expected")
                key = s[key_start:i]
                i = _skip_ws(s, i)
                if i >= len(s) or s[i] != ":":
                    raise TypeError(f"object field {key} missing ':'")
                i += 1
                val, i = _parse_type_expr(s, i)
                fields[key] = val
                i = _skip_ws(s, i)
                if i < len(s) and s[i] == ",":
                    i += 1
                    continue
                if i < len(s) and s[i] == ">":
                    return {"kind": "object", "fields": fields}, i + 1
                raise TypeError("object<...> expected ',' or '>'")
        raise TypeError(f"type {name} does not take parameters")
    if name in (
        "int", "float", "bool", "string", "null", "object", "array", "any",
    ):
        return {"kind": name}, i
    raise TypeError(f"unknown type name: {name}")


def classify_value(value: Any) -> dict[str, Any]:
    if value is None:
        return {"kind": "null"}
    if isinstance(value, bool):
        return {"kind": "bool"}
    if isinstance(value, int) and not isinstance(value, bool):
        return {"kind": "int"}
    if isinstance(value, float):
        if not (value == value and abs(value) != float("inf")):
            raise XaiopTypeError(f"non-finite number cannot be typed ({value!r})")
        if value.is_integer() and abs(value) <= (2**53 - 1):
            return {"kind": "int"}
        return {"kind": "float"}
    if isinstance(value, str):
        return {"kind": "string"}
    if isinstance(value, list):
        element: dict[str, Any] | None = None
        for el in value:
            if el is None:
                continue
            t = classify_value(el)
            leaf = _strip_shape(t)
            if element is None:
                element = leaf
            elif not type_compatible(element, leaf):
                raise XaiopTypeError(
                    "array elements must share one type",
                    expected=element,
                    actual=leaf,
                )
        return {"kind": "array", **({"element": element} if element else {})}
    if isinstance(value, dict):
        return {"kind": "object"}
    raise XaiopTypeError(f"unsupported runtime type: {type(value).__name__}")


def _strip_shape(t: dict[str, Any]) -> dict[str, Any]:
    kind = t.get("kind")
    if kind == "object":
        return {"kind": "object"}
    if kind == "array":
        el = t.get("element")
        if el:
            return {"kind": "array", "element": _strip_shape(el)}
        return {"kind": "array"}
    return {"kind": kind}


def value_matches_type(value: Any, expected: dict[str, Any]) -> bool:
    kind = expected.get("kind")
    if kind == "any":
        return True
    if value is None:
        return kind == "null"
    if kind == "null":
        return False
    if kind == "bool":
        return isinstance(value, bool)
    if kind == "string":
        return isinstance(value, str)
    if kind == "int":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "float":
        return isinstance(value, float)
    if kind == "object":
        if not isinstance(value, dict) or isinstance(value, list):
            return False
        fields = expected.get("fields")
        if fields:
            for k, ft in fields.items():
                if k not in value:
                    if ft.get("kind") == "any":
                        continue
                    return False
                if value[k] is None and ft.get("kind") not in ("null", "any"):
                    if not value_matches_type(None, ft):
                        return False
                    continue
                if not value_matches_type(value[k], ft):
                    return False
        return True
    if kind == "array":
        if not isinstance(value, list):
            return False
        element = expected.get("element")
        if not element:
            return True
        for el in value:
            if el is None and element.get("kind") not in ("null", "any"):
                if not value_matches_type(None, element):
                    return False
                continue
            if not value_matches_type(el, element):
                return False
        return True
    return False


def type_compatible(a: dict[str, Any] | None, b: dict[str, Any] | None) -> bool:
    if not a or not b:
        return False
    if a.get("kind") == "any" or b.get("kind") == "any":
        return True
    if a.get("kind") != b.get("kind"):
        return False
    if a.get("kind") == "array":
        ae, be = a.get("element"), b.get("element")
        if not ae or not be:
            return True
        return type_compatible(ae, be)
    return True


def type_to_string(t: dict[str, Any] | None) -> str:
    if not t:
        return "?"
    kind = t.get("kind")
    if kind == "array":
        el = t.get("element")
        return f"array<{type_to_string(el)}>" if el else "array"
    if kind == "object" and t.get("fields"):
        parts = [f"{k}:{type_to_string(v)}" for k, v in t["fields"].items()]
        return f"object<{','.join(parts)}>"
    return str(kind)


def clone_type(t: dict[str, Any]) -> dict[str, Any]:
    if t.get("kind") == "object" and t.get("fields"):
        return {
            "kind": "object",
            "fields": {k: clone_type(v) for k, v in t["fields"].items()},
        }
    if t.get("kind") == "array" and t.get("element"):
        return {"kind": "array", "element": clone_type(t["element"])}
    return {"kind": t["kind"]}


@dataclass
class TypeEntry:
    path: str
    type: dict[str, Any]
    polarity: TypePolarity


class TypeRegistry:
    def __init__(self) -> None:
        self._entries: dict[str, TypeEntry] = {}

    @property
    def size(self) -> int:
        return len(self._entries)

    def register(
        self,
        path: str,
        type_input: Any,
        options: dict[str, Any] | None = None,
    ) -> bool:
        canon_path = _normalize_registry_path(path)
        if canon_path in self._entries:
            return False
        opts = options or {}
        polarity: TypePolarity = "deny" if opts.get("polarity") == "deny" else "allow"
        type_ = canonicalize_type(type_input)
        if polarity == "deny" and type_.get("kind") == "any":
            raise TypeError("cannot register deny polarity for type any")
        self._entries[canon_path] = TypeEntry(
            path=canon_path,
            type=clone_type(type_),
            polarity=polarity,
        )
        return True

    def register_many(
        self,
        mapping: dict[str, Any] | list[tuple[str, Any]] | list[dict[str, Any]],
        options: dict[str, Any] | None = None,
    ) -> dict[str, list[str]]:
        ok: list[str] = []
        rejected: list[str] = []
        if isinstance(mapping, dict):
            for path, type_input in mapping.items():
                if self.register(path, type_input, options):
                    ok.append(_normalize_registry_path(path))
                else:
                    rejected.append(_normalize_registry_path(path))
            return {"ok": ok, "rejected": rejected}
        for item in mapping:
            if isinstance(item, (list, tuple)) and len(item) == 2:
                path, type_input = item
                if self.register(path, type_input, options):
                    ok.append(_normalize_registry_path(path))
                else:
                    rejected.append(_normalize_registry_path(path))
            elif isinstance(item, dict) and item.get("path") is not None:
                polarity = item.get("polarity") or (options or {}).get("polarity")
                if self.register(
                    item["path"],
                    item["type"],
                    {"polarity": polarity} if polarity else {},
                ):
                    ok.append(_normalize_registry_path(item["path"]))
                else:
                    rejected.append(_normalize_registry_path(item["path"]))
            else:
                raise TypeError("register_many item must be [path, type] or TypeEntry")
        return {"ok": ok, "rejected": rejected}

    def has(self, path: str) -> bool:
        return _normalize_registry_path(path) in self._entries

    def get(self, path: str) -> TypeEntry | None:
        return self._entries.get(_normalize_registry_path(path))

    def list(self) -> list[TypeEntry]:
        return [
            TypeEntry(
                path=e.path,
                type=clone_type(e.type),
                polarity=e.polarity,
            )
            for e in self._entries.values()
        ]

    def snapshot(self) -> dict[str, Any]:
        return {
            "version": 1,
            "entries": [
                {"path": e.path, "type": e.type, "polarity": e.polarity}
                for e in self.list()
            ],
        }

    @classmethod
    def from_snapshot(cls, snap: Any) -> TypeRegistry:
        reg = cls()
        if isinstance(snap, TypeRegistry):
            for e in snap.list():
                if not reg.register(e.path, e.type, {"polarity": e.polarity}):
                    raise XaiopTypeError(
                        f"duplicate path in schema: {e.path}",
                        path=e.path,
                    )
            return reg
        if not snap or snap.get("version") != 1 or not isinstance(snap.get("entries"), list):
            raise TypeError("invalid type schema snapshot")
        for e in snap["entries"]:
            if not e or not isinstance(e.get("path"), str):
                raise TypeError("invalid type schema entry")
            if not reg.register(e["path"], e["type"], {"polarity": e.get("polarity")}):
                raise XaiopTypeError(
                    f"duplicate path in schema: {e['path']}",
                    path=e["path"],
                )
        return reg


def _normalize_registry_path(path: str) -> str:
    return format_json_path(parse_json_path(path))


ViolationHook = Callable[
    [XaiopTypeError, dict[str, Any]],
    None,
]


class TypeChecker:
    def __init__(
        self,
        registry: TypeRegistry,
        *,
        on_violation: ViolationHook | None = None,
    ) -> None:
        self._registry = registry
        self._on_violation = on_violation

    @property
    def registry(self) -> TypeRegistry:
        return self._registry

    def check_tree(
        self,
        value: Any,
        *,
        throw: bool = True,
    ) -> list[XaiopTypeError]:
        errors: list[XaiopTypeError] = []
        root = _unwrap_fragment(value)
        self._walk(root, [], errors)
        if throw and errors:
            raise errors[0]
        return errors

    def _walk(
        self,
        value: Any,
        segs: list[str | int],
        errors: list[XaiopTypeError],
    ) -> None:
        if segs:
            path = format_json_path(segs)
            entry = self._registry.get(path)
            if entry:
                self._check_entry(path, value, entry, errors)

        if value is not None and isinstance(value, (dict, list)):
            if isinstance(value, list):
                path = format_json_path(segs) if segs else None
                entry = self._registry.get(path) if path else None
                elem_type = None
                if (
                    entry
                    and entry.polarity == "allow"
                    and entry.type.get("kind") == "array"
                ):
                    elem_type = entry.type.get("element")
                for i, el in enumerate(value):
                    child_segs = segs + [i]
                    if elem_type and el is not None:
                        child_path = format_json_path(child_segs)
                        if not value_matches_type(el, elem_type):
                            self._fail(
                                XaiopTypeError(
                                    f"type mismatch at {child_path}: expected "
                                    f"{type_to_string(elem_type)}, got "
                                    f"{type_to_string(_classify_value_safe(el))}",
                                    path=child_path,
                                    expected=elem_type,
                                    actual=_classify_value_safe(el),
                                    polarity="allow",
                                ),
                                {"path": child_path, "value": el, "entry": entry},
                                errors,
                            )
                    self._walk(el, child_segs, errors)
            else:
                for key in value:
                    self._walk(value[key], segs + [key], errors)

    def _check_entry(
        self,
        path: str,
        value: Any,
        entry: TypeEntry,
        errors: list[XaiopTypeError],
    ) -> None:
        matches = value_matches_type(value, entry.type)
        if entry.polarity == "allow":
            if not matches:
                self._fail(
                    XaiopTypeError(
                        f"type mismatch at {path}: expected "
                        f"{type_to_string(entry.type)}, got "
                        f"{type_to_string(_classify_value_safe(value))}",
                        path=path,
                        expected=entry.type,
                        actual=_classify_value_safe(value),
                        polarity="allow",
                    ),
                    {"path": path, "value": value, "entry": entry},
                    errors,
                )
        elif matches:
            self._fail(
                XaiopTypeError(
                    f"type denied at {path}: must not be "
                    f"{type_to_string(entry.type)}",
                    path=path,
                    expected=entry.type,
                    actual=_classify_value_safe(value),
                    polarity="deny",
                ),
                {"path": path, "value": value, "entry": entry},
                errors,
            )

    def _fail(
        self,
        err: XaiopTypeError,
        ctx: dict[str, Any],
        errors: list[XaiopTypeError],
    ) -> None:
        if self._on_violation:
            self._on_violation(err, ctx)
        errors.append(err)


def _classify_value_safe(v: Any) -> dict[str, Any]:
    try:
        return classify_value(v)
    except XaiopTypeError:
        return {"kind": "any"}


def _unwrap_fragment(value: Any) -> Any:
    if isinstance(value, XaiopFragment):
        return value.entries
    if (
        isinstance(value, dict)
        and value.get("isFragment") is True
        and isinstance(value.get("entries"), dict)
    ):
        return value["entries"]
    return value


class TypeFreezeSession:
    def __init__(
        self,
        *,
        schema: TypeRegistry | dict[str, Any] | None = None,
        on_violation: Callable[[XaiopTypeError], None] | None = None,
    ) -> None:
        self._schema: TypeRegistry | None = None
        self._freeze: dict[str, dict[str, Any]] = {}
        self._escape_paths: list[str] = []
        self._on_violation = on_violation
        if schema is not None:
            self.apply_schema(schema)

    def apply_schema(self, schema: TypeRegistry | dict[str, Any] | None) -> None:
        if schema is None:
            self._schema = None
            return
        self._schema = (
            schema
            if isinstance(schema, TypeRegistry)
            else TypeRegistry.from_snapshot(schema)
        )
        for e in self._schema.list():
            if e.polarity == "allow" and e.type.get("kind") != "any":
                if e.path not in self._freeze:
                    self._freeze[e.path] = _strip_shape(e.type)

    @property
    def schema(self) -> TypeRegistry | None:
        return self._schema

    @property
    def freezes(self) -> dict[str, dict[str, Any]]:
        return self._freeze

    def clear_path(self, path: str) -> None:
        prefix = _normalize_registry_path(path)
        for key in list(self._freeze):
            if key == prefix or key.startswith(prefix + ".") or key.startswith(prefix + "["):
                del self._freeze[key]

    def observe_tree(
        self,
        tree: Any,
        *,
        throw: bool = True,
        escape_paths: list[str] | None = None,
    ) -> list[XaiopTypeError]:
        errors: list[XaiopTypeError] = []
        self._escape_paths = list(escape_paths) if escape_paths else []
        if tree is None:
            self._escape_paths = []
            return errors
        root = _unwrap_fragment(tree)
        self._walk_observe(root, [], errors)
        self._escape_paths = []
        if throw and errors:
            raise errors[0]
        return errors

    def reconcile_commit(self, commit: Any) -> None:
        if commit is None:
            self._freeze.clear()
            return
        present: set[str] = set()
        _collect_paths(_unwrap_fragment(commit), [], present)
        for key in list(self._freeze):
            if key not in present:
                del self._freeze[key]

    def _walk_observe(
        self,
        value: Any,
        segs: list[str | int],
        errors: list[XaiopTypeError],
    ) -> None:
        if not segs:
            if value is not None and isinstance(value, (dict, list)):
                if isinstance(value, list):
                    self._observe_array(value, [], errors)
                else:
                    for key in value:
                        if self._path_escaped(key):
                            continue
                        self._walk_observe(value[key], [key], errors)
            return

        path = format_json_path(segs)
        if self._path_escaped(path):
            return
        if value is None:
            return

        try:
            observed = _strip_shape(classify_value(value))
        except XaiopTypeError as e:
            err = e if e.path else XaiopTypeError(str(e), path=path)
            if not err.path:
                err.path = path
            self._fail(err, errors)
            return

        schema_entry = self._schema.get(path) if self._schema else None
        schema_violated = False
        schema_ignore = False
        if schema_entry:
            if (
                schema_entry.type.get("kind") == "any"
                and schema_entry.polarity == "allow"
            ):
                schema_ignore = True
            else:
                matches = value_matches_type(value, schema_entry.type)
                if schema_entry.polarity == "allow" and not matches:
                    schema_violated = True
                    self._fail(
                        XaiopTypeError(
                            f"type mismatch at {path}: expected "
                            f"{type_to_string(schema_entry.type)}, got "
                            f"{type_to_string(observed)}",
                            path=path,
                            expected=schema_entry.type,
                            actual=observed,
                            polarity="allow",
                        ),
                        errors,
                    )
                elif schema_entry.polarity == "deny" and matches:
                    schema_violated = True
                    self._fail(
                        XaiopTypeError(
                            f"type denied at {path}: must not be "
                            f"{type_to_string(schema_entry.type)}",
                            path=path,
                            expected=schema_entry.type,
                            actual=observed,
                            polarity="deny",
                        ),
                        errors,
                    )

        if not schema_violated and not schema_ignore:
            frozen = self._freeze.get(path)
            if frozen:
                if not type_compatible(frozen, observed):
                    self._fail(
                        XaiopTypeError(
                            f"type freeze mismatch at {path}: expected "
                            f"{type_to_string(frozen)}, got "
                            f"{type_to_string(observed)} (replace whole node via delete to refresh)",
                            path=path,
                            expected=frozen,
                            actual=observed,
                        ),
                        errors,
                    )
                elif (
                    frozen.get("kind") == "array"
                    and observed.get("kind") == "array"
                    and frozen.get("element")
                    and observed.get("element")
                    and not type_compatible(frozen["element"], observed["element"])
                ):
                    self._fail(
                        XaiopTypeError(
                            f"array element type mismatch at {path}: expected "
                            f"{type_to_string(frozen['element'])}, got "
                            f"{type_to_string(observed['element'])}",
                            path=path,
                            expected=frozen,
                            actual=observed,
                        ),
                        errors,
                    )
            else:
                self._freeze[path] = observed

        if isinstance(value, list):
            self._observe_array(value, segs, errors)
        elif isinstance(value, dict):
            for key in value:
                self._walk_observe(value[key], segs + [key], errors)

    def _observe_array(
        self,
        value: list[Any],
        segs: list[str | int],
        errors: list[XaiopTypeError],
    ) -> None:
        path = format_json_path(segs) if segs else None
        elem_freeze = None
        if path and path in self._freeze:
            arr = self._freeze[path]
            if arr.get("kind") == "array":
                elem_freeze = arr.get("element")

        for i, el in enumerate(value):
            if el is None:
                continue
            try:
                el_type = _strip_shape(classify_value(el))
            except XaiopTypeError as e:
                err = e if e.path else XaiopTypeError(
                    str(e), path=format_json_path(segs + [i])
                )
                self._fail(err, errors)
                continue
            if elem_freeze is None:
                elem_freeze = el_type
                if path:
                    self._freeze[path] = {"kind": "array", "element": elem_freeze}
            elif not type_compatible(elem_freeze, el_type):
                self._fail(
                    XaiopTypeError(
                        f"array element types must be consistent at "
                        f"{path or '<root>'}: expected "
                        f"{type_to_string(elem_freeze)}, got "
                        f"{type_to_string(el_type)}",
                        path=path or None,
                        expected=elem_freeze,
                        actual=el_type,
                    ),
                    errors,
                )
            self._walk_observe(el, segs + [i], errors)

    def _path_escaped(self, path: str) -> bool:
        escapes = self._escape_paths
        if not escapes:
            return False
        for e in escapes:
            if e == "":
                return True
            if e is None:
                continue
            if path == e:
                return True
            if path.startswith(e + ".") or path.startswith(e + "["):
                return True
        return False

    def _fail(self, err: XaiopTypeError, errors: list[XaiopTypeError]) -> None:
        if self._on_violation:
            self._on_violation(err)
        errors.append(err)


def _collect_paths(
    value: Any,
    segs: list[str | int],
    out: set[str],
) -> None:
    if segs:
        out.add(format_json_path(segs))
    if value is None or not isinstance(value, (dict, list)):
        return
    if isinstance(value, list):
        for i, el in enumerate(value):
            _collect_paths(el, segs + [i], out)
    else:
        for key in value:
            _collect_paths(value[key], segs + [key], out)


def encode_type_schema_frame(snapshot: dict[str, Any]) -> str:
    from ..control.control import CONTROL_NAME, CONTROL_NS, encode_control_frame

    if not snapshot or snapshot.get("version") != 1:
        raise TypeError("encode_type_schema_frame requires snapshot version 1")
    return encode_control_frame(CONTROL_NS, CONTROL_NAME["TYPES"], 1, snapshot)


def try_parse_type_schema_frame(text: str) -> dict[str, Any] | None:
    if not isinstance(text, str) or not text.startswith(TYPE_SCHEMA_FRAME_PREFIX):
        return None
    body = text[len(TYPE_SCHEMA_FRAME_PREFIX) :]
    import json

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        raise XaiopTypeError("invalid type schema frame JSON") from None
    if not parsed or parsed.get("version") != 1 or not isinstance(
        parsed.get("entries"), list
    ):
        raise XaiopTypeError("invalid type schema frame payload")
    return parsed
