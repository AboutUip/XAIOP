import pytest

from xaiop import PROTOCOL_VERSION, XaiopEngine, XaiopSyntaxError, parse_sync


def test_protocol_version() -> None:
    assert PROTOCOL_VERSION == "0.6.0"


def test_upload_and_get() -> None:
    eng = XaiopEngine()
    data_id = eng.upload_sync(">\nx:1")
    assert isinstance(data_id, str)
    assert eng.get_sync(data_id) == {"x": 1}

    data_id2 = eng.upload_sync("-\n:a")
    assert eng.get_sync(data_id2) == ["a"]


def test_static_parse() -> None:
    assert XaiopEngine.parse_sync(">\na:b") == {"a": "b"}


def test_compatibility_mode_toggle() -> None:
    eng = XaiopEngine()
    assert eng.compatibility_mode is False
    eng.set_compatibility_mode(True)
    assert eng.compatibility_mode is True

    eng_on = XaiopEngine(compatibility_mode=True)
    assert eng_on.compatibility_mode is True
    assert parse_sync(">\nx:1", True) == {"x": 1}
    data_id = eng_on.upload_sync(">\ny:2")
    assert eng_on.get_sync(data_id) == {"y": 2}


def test_compat_forced_root() -> None:
    source = """>meta
name:demo
.
>characters-
>
name:alice
<
"""
    strict = parse_sync(">meta\nname:demo")
    assert strict.is_fragment is True
    with pytest.raises(XaiopSyntaxError):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "meta": {"name": "demo"},
        "characters": [{"name": "alice"}],
    }


def test_compat_rewrite_bare_name_array() -> None:
    source = """>characters-
>
name:alice
aliases-
:tag1
<
"""
    with pytest.raises(XaiopSyntaxError):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "characters": [{"name": "alice", "aliases": ["tag1"]}],
    }


def test_compat_fix_apis_require_mode() -> None:
    eng = XaiopEngine()
    assert eng.compat_forced_root is True
    assert eng.set_compat_forced_root(False) is False
    eng.set_compatibility_mode(True)
    assert eng.set_compat_forced_root(False) is True
    assert eng.compat_forced_root is False


def test_compat_pop_and_retry_toggle() -> None:
    source = """>tags-
:a
>users-
>
id:1
<
"""
    eng = XaiopEngine(compatibility_mode=True)
    eng.set_compat_pop_and_retry(False)
    with pytest.raises(XaiopSyntaxError):
        eng.upload_sync(source)
    eng.set_compat_pop_and_retry(True)
    data_id = eng.upload_sync(source)
    assert eng.get_sync(data_id) == {"tags": ["a"], "users": [{"id": 1}]}


def test_unknown_data_id() -> None:
    eng = XaiopEngine()
    with pytest.raises(ValueError, match="unknown data id"):
        eng.get_sync("missing")


def test_type_check_strict_only() -> None:
    eng = XaiopEngine()
    assert eng.set_type_check(True) is True
    assert eng.type_check is True
    eng.set_compatibility_mode(True)
    assert eng.type_check is False
    assert eng.set_type_check(True) is False


def test_encode_type_schema_frame() -> None:
    eng = XaiopEngine()
    eng.register_type("k", "int")
    frame = eng.encode_type_schema_frame()
    assert frame.startswith("#!xaiop/types/v1\n")
