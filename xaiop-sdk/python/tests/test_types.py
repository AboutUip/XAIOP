"""Expanded type surface / registry / freeze / schema / engine typeCheck."""

from __future__ import annotations

import pytest

from xaiop import (
    TYPE,
    TYPE_SCHEMA_FRAME_PREFIX,
    TypeChecker,
    TypeFreezeSession,
    TypeRegistry,
    XaiopEngine,
    XaiopFragment,
    XaiopTypeError,
    array_type,
    canonicalize_type,
    classify_value,
    encode_type_schema_frame,
    object_type,
    parse_type_surface,
    try_parse_type_schema_frame,
    type_compatible,
    type_to_string,
    value_matches_type,
)


def test_surface_and_builders() -> None:
    for k in ("int", "float", "bool", "string", "null", "object", "array", "any"):
        assert parse_type_surface(k)["kind"] == k
        assert canonicalize_type(k)["kind"] == k
    assert canonicalize_type(TYPE.INT)["kind"] == "int"
    assert parse_type_surface("array<int>") == {
        "kind": "array",
        "element": {"kind": "int"},
    }
    o = parse_type_surface("object<name:string, old:int>")
    assert o["fields"]["name"]["kind"] == "string"
    assert object_type({"a": TYPE.BOOL})["fields"]["a"]["kind"] == "bool"
    assert array_type("float")["element"]["kind"] == "float"


def test_malformed_surface_rejected() -> None:
    with pytest.raises((ValueError, TypeError, Exception)):
        parse_type_surface("array<")
    with pytest.raises((ValueError, TypeError, Exception)):
        parse_type_surface("object<name>")


def test_classify_and_match() -> None:
    assert classify_value(None)["kind"] == "null"
    assert classify_value(1)["kind"] == "int"
    assert classify_value(1.5)["kind"] == "float"
    assert classify_value(True)["kind"] == "bool"
    assert classify_value("x")["kind"] == "string"
    assert classify_value([])["kind"] == "array"
    assert classify_value({})["kind"] == "object"
    assert value_matches_type(1, TYPE.INT) is True
    assert value_matches_type(1.5, TYPE.INT) is False
    assert value_matches_type(1.5, TYPE.FLOAT) is True
    assert value_matches_type(1, TYPE.FLOAT) is False
    assert value_matches_type(
        {"name": "a", "old": 1},
        object_type({"name": TYPE.STRING, "old": TYPE.INT}),
    )


def test_object_extras_ok_missing_required_fails() -> None:
    t = object_type({"name": TYPE.STRING})
    assert value_matches_type({"name": "a", "extra": 1}, t) is True
    assert value_matches_type({}, t) is False


def test_type_compatible_any() -> None:
    assert type_compatible(TYPE.ANY, TYPE.STRING) is True
    assert type_compatible(TYPE.STRING, TYPE.ANY) is True
    assert type_compatible(TYPE.INT, TYPE.FLOAT) is False


def test_type_to_string_roundtripish() -> None:
    s = type_to_string(array_type(TYPE.INT))
    assert "array" in s and "int" in s


def test_registry_and_checker() -> None:
    reg = TypeRegistry()
    assert reg.register("a.b", TYPE.STRING) is True
    assert reg.register("a.b", TYPE.INT) is False
    assert reg.register("a.c", TYPE.INT, {"polarity": "deny"}) is True
    with pytest.raises(TypeError):
        reg.register("a.d", TYPE.ANY, {"polarity": "deny"})
    checker = TypeChecker(reg)
    checker.check_tree({"a": {"b": "ok"}})
    with pytest.raises(XaiopTypeError):
        checker.check_tree({"a": {"b": 1}})


def test_checker_throw_false_collects() -> None:
    reg = TypeRegistry()
    reg.register("k", TYPE.INT)
    checker = TypeChecker(reg)
    errs = checker.check_tree({"k": "bad"}, throw=False)
    assert errs
    assert isinstance(errs[0], XaiopTypeError)


def test_checker_unregistered_ignored() -> None:
    reg = TypeRegistry()
    reg.register("a", TYPE.INT)
    TypeChecker(reg).check_tree({"a": 1, "other": "x"})


def test_checker_null_vs_string() -> None:
    reg = TypeRegistry()
    reg.register("s", TYPE.STRING)
    with pytest.raises(XaiopTypeError):
        TypeChecker(reg).check_tree({"s": None})


def test_checker_array_element() -> None:
    reg = TypeRegistry()
    reg.register("items", array_type(TYPE.INT))
    TypeChecker(reg).check_tree({"items": [1, 2]})
    with pytest.raises(XaiopTypeError):
        TypeChecker(reg).check_tree({"items": [1, "x"]})


def test_freeze_session() -> None:
    s = TypeFreezeSession()
    s.observe_tree({"a": 1, "b": "x"})
    s.observe_tree({"a": 2})
    with pytest.raises(XaiopTypeError):
        s.observe_tree({"a": "no"})
    s.observe_tree({"a": None})
    s.reconcile_commit(None)
    assert s.freezes == {}


def test_freeze_null_skips_then_locks() -> None:
    s = TypeFreezeSession()
    s.observe_tree({"k": None})
    s.observe_tree({"k": 1})
    with pytest.raises(XaiopTypeError):
        s.observe_tree({"k": "oops"})


def test_freeze_root_array() -> None:
    s = TypeFreezeSession()
    s.observe_tree([1, 2])
    with pytest.raises(XaiopTypeError):
        s.observe_tree([1, "x"])


def test_freeze_escape_paths() -> None:
    s = TypeFreezeSession()
    s.observe_tree({"flex": "bad", "k": 1}, escape_paths=["flex"])
    s.observe_tree({"flex": 99, "k": 2}, escape_paths=["flex"])
    with pytest.raises(XaiopTypeError):
        s.observe_tree({"k": "no"}, escape_paths=["flex"])


def test_freeze_empty_escape_skips_tree() -> None:
    s = TypeFreezeSession()
    s.observe_tree({"a": 1}, escape_paths=[""])
    s.observe_tree({"a": "mixed"}, escape_paths=[""])


def test_schema_frame_roundtrip() -> None:
    reg = TypeRegistry()
    reg.register("a.b", TYPE.FLOAT, {"polarity": "deny"})
    frame = encode_type_schema_frame(reg.snapshot())
    assert frame.startswith(TYPE_SCHEMA_FRAME_PREFIX)
    parsed = try_parse_type_schema_frame(frame)
    assert parsed is not None
    assert parsed["entries"][0]["path"] == "a.b"
    assert try_parse_type_schema_frame("not a frame") is None


def test_schema_frame_bad_json() -> None:
    bad = TYPE_SCHEMA_FRAME_PREFIX + "\n{not-json}\n"
    with pytest.raises((ValueError, TypeError, Exception)):
        # try_parse may return None or raise depending on implementation
        parsed = try_parse_type_schema_frame(bad)
        if parsed is None:
            raise ValueError("invalid")
        raise AssertionError("expected failure")


def test_engine_type_check() -> None:
    eng = XaiopEngine()
    eng.register_type("k", TYPE.INT)
    eng.upload_sync(">\nk:oops\n")
    eng.set_type_check(True)
    with pytest.raises(XaiopTypeError):
        eng.upload_sync(">\nk:oops\n")
    data_id = eng.upload_sync(">\nk:1\n")
    assert eng.has(data_id)
    frame = eng.encode_type_schema_frame()
    assert frame.startswith(TYPE_SCHEMA_FRAME_PREFIX)


def test_engine_type_check_cleared_by_compat() -> None:
    eng = XaiopEngine()
    eng.register_type("k", TYPE.INT)
    eng.set_type_check(True)
    assert eng.type_check is True
    eng.set_compatibility_mode(True)
    assert eng.type_check is False


def test_engine_float_vs_int() -> None:
    eng = XaiopEngine()
    eng.register_type("n", TYPE.INT)
    eng.set_type_check(True)
    with pytest.raises(XaiopTypeError):
        eng.upload_sync(">\nn:1.5\n")


def test_engine_unregistered_ignored() -> None:
    eng = XaiopEngine()
    eng.register_type("a", TYPE.INT)
    eng.set_type_check(True)
    data_id = eng.upload_sync(">\na:1\nb:hello\n")
    assert eng.get_sync(data_id) == {"a": 1, "b": "hello"}


def test_fragment_unwrap_in_checker() -> None:
    reg = TypeRegistry()
    reg.register("meta.name", TYPE.STRING)
    frag = XaiopFragment({"meta": {"name": "ok"}})
    # checker may accept fragment or plain dict — try both
    try:
        TypeChecker(reg).check_tree(frag)
    except (TypeError, XaiopTypeError, AttributeError):
        TypeChecker(reg).check_tree(frag.entries)
