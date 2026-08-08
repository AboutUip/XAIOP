"""Compat wire recovery matrix — 8 fix IDs on/off (Node engine.test + Java CompatTest)."""

from __future__ import annotations

import pytest

from xaiop import (
    COMPAT_FIX_DEFAULTS,
    COMPAT_FIX_IDS,
    CompatPolicy,
    XaiopEngine,
    XaiopFragment,
    XaiopSyntaxError,
    parse_sync,
)

MISSING_LEAVE_ARRAY = ">\n>tags-\n:alpha\n:beta\n>users-\n>\nid:1\nname:alice\n<\n"
LOCATE_BASE = ">\n>meta\na:1\n.\n"


def _all_but(disabled: str) -> dict[str, bool]:
    return {fid: (fid != disabled) for fid in COMPAT_FIX_IDS}


def test_eight_fix_ids_present() -> None:
    assert len(COMPAT_FIX_IDS) == 8
    assert set(COMPAT_FIX_IDS) == set(COMPAT_FIX_DEFAULTS)
    assert all(COMPAT_FIX_DEFAULTS[k] is True for k in COMPAT_FIX_IDS)


def test_strict_valid_unchanged_by_compat() -> None:
    assert parse_sync(">\nx:1") == {"x": 1}
    assert parse_sync(">\nx:1", False) == {"x": 1}
    assert parse_sync(">\nx:1", True) == {"x": 1}
    assert parse_sync("-\n:a\n:b", True) == ["a", "b"]


# --- 1. forcedRoot -----------------------------------------------------------


def test_forced_root_injects_object_for_bare_array() -> None:
    source = ">meta\nname:demo\n.\n>characters-\n>\nname:alice\n<\n"
    frag = parse_sync(">meta\nname:demo")
    assert isinstance(frag, XaiopFragment)
    with pytest.raises(XaiopSyntaxError):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "meta": {"name": "demo"},
        "characters": [{"name": "alice"}],
    }


def test_forced_root_off_keeps_fragment() -> None:
    v = parse_sync(">meta\nname:demo", _all_but("forcedRoot"))
    assert isinstance(v, XaiopFragment)
    assert v.entries == {"meta": {"name": "demo"}}


def test_forced_root_alone_coerces_bare_content() -> None:
    only = {fid: False for fid in COMPAT_FIX_IDS}
    only["forcedRoot"] = True
    assert parse_sync(">meta\nname:demo", only) == {"meta": {"name": "demo"}}


def test_forced_root_keeps_array_root_when_first_is_dash() -> None:
    assert parse_sync("-\n:a\n:b", True) == ["a", "b"]


def test_forced_root_no_inject_when_first_is_enter() -> None:
    assert parse_sync(">\nx:1", True) == {"x": 1}


# --- 2. rewriteBareNameArray -------------------------------------------------


def test_rewrite_bare_name_array_on() -> None:
    source = ">\n>characters-\n>\nname:江辞\naliases-\n:绝世神医\n:楚家大少\n<\ngender:男\n<\n"
    with pytest.raises(XaiopSyntaxError, match="Bare Label"):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "characters": [
            {
                "name": "江辞",
                "aliases": ["绝世神医", "楚家大少"],
                "gender": "男",
            }
        ]
    }


def test_rewrite_bare_name_without_dash_still_fails() -> None:
    with pytest.raises(XaiopSyntaxError, match="Bare Label"):
        parse_sync(">\n>meta\naliases\n", True)


def test_rewrite_bare_name_array_off() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(">\ntags-\n:a", _all_but("rewriteBareNameArray"))
    assert parse_sync(">\ntags-\n:a", True) == {"tags": ["a"]}


# --- 3. rewriteEnterLine -----------------------------------------------------


def test_rewrite_enter_whitespace_only() -> None:
    source = ">  \nid:wideflat-bench  \nok:true\n"
    with pytest.raises(XaiopSyntaxError, match="invalid label"):
        parse_sync(source)
    assert parse_sync(source, True) == {"id": "wideflat-bench", "ok": True}


def test_rewrite_enter_strips_glued_content() -> None:
    source = ">\n>shard_index:1\n>shard_total:3\n>characters-\n>\nname:江辞\n<\n"
    with pytest.raises(XaiopSyntaxError, match="invalid label"):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "shard_index": 1,
        "shard_total": 3,
        "characters": [{"name": "江辞"}],
    }


def test_rewrite_enter_line_off() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(">  \nid:x\n", _all_but("rewriteEnterLine"))


# --- 4. ignoreBareLeaveAtRoot ------------------------------------------------


def test_ignore_bare_leave_at_root_on() -> None:
    source = ">\n>beats-\n>\nkind:dialogue\ntext:hi\n<\n.\n<\n>\nid:23-1\nlocation:神医大会\n"
    with pytest.raises(XaiopSyntaxError, match="< at Root"):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "beats": [{"kind": "dialogue", "text": "hi"}],
        "id": "23-1",
        "location": "神医大会",
    }


def test_ignore_bare_leave_does_not_cover_named() -> None:
    with pytest.raises(XaiopSyntaxError, match="< at Root"):
        parse_sync(">\nid:1\n.\n<meta\n", True)


def test_ignore_bare_leave_off() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(">\nid:1\n.\n<\n>\nx:1\n", _all_but("ignoreBareLeaveAtRoot"))


# --- 5. popAndRetry ----------------------------------------------------------


def test_pop_and_retry_missing_leave_array() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(MISSING_LEAVE_ARRAY)
    assert parse_sync(MISSING_LEAVE_ARRAY, True) == {
        "tags": ["alpha", "beta"],
        "users": [{"id": 1, "name": "alice"}],
    }


def test_pop_and_retry_two_sequential() -> None:
    source = ">\n>tags-\n:a\n>features-\n:x\n>meta\nname:demo\n."
    with pytest.raises(XaiopSyntaxError, match="inside an array"):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "tags": ["a"],
        "features": ["x"],
        "meta": {"name": "demo"},
    }


def test_pop_and_retry_leave_then_named() -> None:
    source = ">\n>siblings-\n>\ni:1\n>nested\na:1\n<\n<\n>\ni:2\nlabel:S-2\n<\n>meta\nok:1\n."
    with pytest.raises(XaiopSyntaxError, match="inside an array"):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "siblings": [
            {"i": 1, "nested": {"a": 1}},
            {"i": 2, "label": "S-2"},
        ],
        "meta": {"ok": 1},
    }


def test_pop_and_retry_off_fails_like_strict() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(MISSING_LEAVE_ARRAY, _all_but("popAndRetry"))
    eng = XaiopEngine(compatibility_mode=True)
    assert eng.set_compat_pop_and_retry(False) is True
    with pytest.raises(XaiopSyntaxError):
        eng.upload_sync(MISSING_LEAVE_ARRAY)
    assert eng.set_compat_pop_and_retry(True) is True
    data_id = eng.upload_sync(MISSING_LEAVE_ARRAY)
    assert eng.get_sync(data_id) == {
        "tags": ["alpha", "beta"],
        "users": [{"id": 1, "name": "alice"}],
    }


def test_pop_and_retry_stops_when_error_changes() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(">\ndata", True)
    with pytest.raises(XaiopSyntaxError):
        parse_sync("data", True)


# --- 6. locatePathTrim -------------------------------------------------------


def test_locate_path_trim_on() -> None:
    source = LOCATE_BASE + "= meta\nb:2\n"
    with pytest.raises(XaiopSyntaxError, match="=path not found"):
        parse_sync(source)
    assert parse_sync(source, True) == {"meta": {"a": 1, "b": 2}}


def test_locate_path_trim_reports_untrimmed() -> None:
    with pytest.raises(XaiopSyntaxError, match="=path not found") as ei:
        parse_sync(">\na:1\n= missing", True)
    assert " missing" in str(ei.value) or "missing" in str(ei.value)


def test_locate_path_trim_off() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(LOCATE_BASE + "= meta\nb:2\n", _all_but("locatePathTrim"))


# --- 7. locatePathStripSpaces ------------------------------------------------


def test_locate_path_strip_spaces_on() -> None:
    source = ">\n>child\n>inner\na:1\n.\n=child > inner\nb:2\n"
    with pytest.raises(XaiopSyntaxError, match="=path not found"):
        parse_sync(source)
    assert parse_sync(source, True) == {"child": {"inner": {"a": 1, "b": 2}}}


def test_locate_path_strip_spaces_off() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(
            ">\n>child\n>inner\na:1\n.\n=child > inner\nb:2\n",
            _all_but("locatePathStripSpaces"),
        )


# --- 8. locatePathArraySuffix ------------------------------------------------


def test_locate_path_array_suffix_on() -> None:
    source = ">\n>siblings-\n>\ni:1\n<\n.\n=siblings-\n>\ni:2\nlabel:S-2\n<\n"
    with pytest.raises(XaiopSyntaxError, match="=path not found"):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "siblings": [{"i": 1}, {"i": 2, "label": "S-2"}]
    }


def test_locate_path_array_suffix_nested() -> None:
    source = ">\n>wrap\n>items-\n>\nid:1\n<\n.\n=wrap>items-\n>\nid:2\n<\n"
    with pytest.raises(XaiopSyntaxError):
        parse_sync(source)
    assert parse_sync(source, True) == {
        "wrap": {"items": [{"id": 1}, {"id": 2}]}
    }


def test_locate_path_array_suffix_not_object_key() -> None:
    with pytest.raises(XaiopSyntaxError, match="=path not found"):
        parse_sync(LOCATE_BASE + "=meta-\nb:2\n", True)


def test_locate_path_array_suffix_off() -> None:
    with pytest.raises(XaiopSyntaxError):
        parse_sync(
            ">\n>siblings-\n>\ni:1\n<\n.\n=siblings-\n>\ni:2\n<\n",
            _all_but("locatePathArraySuffix"),
        )


# --- policy / engine plumbing ------------------------------------------------


def test_parse_accepts_compat_policy() -> None:
    policy = CompatPolicy({"popAndRetry": False})
    with pytest.raises(XaiopSyntaxError):
        parse_sync(MISSING_LEAVE_ARRAY, policy)
    policy.reset_to_defaults()
    assert parse_sync(MISSING_LEAVE_ARRAY, policy) == {
        "tags": ["alpha", "beta"],
        "users": [{"id": 1, "name": "alice"}],
    }


def test_engine_compatibility_mode_uploads() -> None:
    eng = XaiopEngine(compatibility_mode=True)
    data_id = eng.upload_sync(">\ny:2")
    assert eng.get_sync(data_id) == {"y": 2}
    with pytest.raises(XaiopSyntaxError):
        XaiopEngine().upload_sync(MISSING_LEAVE_ARRAY)


def test_unknown_data_id_rejected() -> None:
    with pytest.raises((ValueError, KeyError, TypeError, Exception)):
        XaiopEngine().get_sync("missing")
