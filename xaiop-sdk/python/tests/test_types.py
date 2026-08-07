import pytest

from xaiop import (
    TYPE,
    TYPE_SCHEMA_FRAME_PREFIX,
    TypeChecker,
    TypeFreezeSession,
    TypeRegistry,
    XaiopEngine,
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


def test_classify_and_match() -> None:
    assert classify_value(None)["kind"] == "null"
    assert classify_value(1)["kind"] == "int"
    assert classify_value(1.5)["kind"] == "float"
    assert value_matches_type(1, TYPE.INT) is True
    assert value_matches_type(1.5, TYPE.INT) is False
    assert value_matches_type(1.5, TYPE.FLOAT) is True
    assert value_matches_type(
        {"name": "a", "old": 1},
        object_type({"name": TYPE.STRING, "old": TYPE.INT}),
    )


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


def test_freeze_session() -> None:
    s = TypeFreezeSession()
    s.observe_tree({"a": 1, "b": "x"})
    s.observe_tree({"a": 2})
    with pytest.raises(XaiopTypeError):
        s.observe_tree({"a": "no"})
    s.observe_tree({"a": None})
    s.reconcile_commit(None)
    assert s.freezes == {}


def test_schema_frame_roundtrip() -> None:
    reg = TypeRegistry()
    reg.register("a.b", TYPE.FLOAT, {"polarity": "deny"})
    frame = encode_type_schema_frame(reg.snapshot())
    assert frame.startswith(TYPE_SCHEMA_FRAME_PREFIX)
    parsed = try_parse_type_schema_frame(frame)
    assert parsed is not None
    assert parsed["entries"][0]["path"] == "a.b"
    assert try_parse_type_schema_frame("not a frame") is None


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
