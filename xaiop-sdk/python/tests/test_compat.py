from xaiop import COMPAT_FIX_DEFAULTS, COMPAT_FIX_IDS, CompatPolicy, resolve_compat_options


def test_compat_fix_defaults_all_on() -> None:
    assert all(COMPAT_FIX_DEFAULTS[k] is True for k in COMPAT_FIX_IDS)


def test_compat_policy_defaults() -> None:
    policy = CompatPolicy()
    snap = policy.snapshot()
    assert snap == COMPAT_FIX_DEFAULTS


def test_compat_policy_overrides() -> None:
    policy = CompatPolicy({"forcedRoot": False, "popAndRetry": False})
    snap = policy.snapshot()
    assert snap["forcedRoot"] is False
    assert snap["popAndRetry"] is False
    assert snap["rewriteEnterLine"] is True


def test_compat_policy_reset() -> None:
    policy = CompatPolicy({"forcedRoot": False})
    policy.reset_to_defaults()
    assert policy.forcedRoot is True


def test_compat_policy_set() -> None:
    policy = CompatPolicy()
    assert policy.set("forcedRoot", False) is True
    assert policy.forcedRoot is False
    assert policy.set("nope", True) is False
    assert policy.set("forcedRoot", "yes") is False


def test_resolve_compat_options() -> None:
    assert resolve_compat_options(False) is None
    assert resolve_compat_options(None) is None
    assert resolve_compat_options(True) == COMPAT_FIX_DEFAULTS
    policy = CompatPolicy({"forcedRoot": False})
    assert resolve_compat_options(policy) == policy.snapshot()
    assert resolve_compat_options({"forcedRoot": False})["forcedRoot"] is False
