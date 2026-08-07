from xaiop import DOT_POLICY, encode_sync, parse_sync


def test_dot_policy_per_top_level_key() -> None:
    value = {"a": 1, "b": 2, "c": 3}
    wire = encode_sync(value, dot_policy=DOT_POLICY["PER_TOP_LEVEL_KEY"])
    assert wire.count("\n.\n") == 2
    assert parse_sync(wire) == value


def test_dot_policy_none_relative() -> None:
    value = {"a": 1, "b": 2}
    wire = encode_sync(value, dot_policy="none", style="relative")
    assert "\n.\n" not in wire
    assert wire.startswith(">\n")
    assert parse_sync(wire) == value


def test_dot_policy_per_n_keys() -> None:
    value = {"a": 1, "b": 2, "c": 3, "d": 4}
    wire = encode_sync(value, dot_policy="perNKeys", phase_every=2)
    assert wire.count("\n.\n") == 1
    assert parse_sync(wire) == value


def test_final_dot_option() -> None:
    value = {"a": 1}
    wire = encode_sync(value, dot_policy="none", style="relative", final_dot=True)
    assert wire.endswith(".\n")


def test_null_policy_omit() -> None:
    value = {"a": 1, "b": None, "c": 2}
    wire = encode_sync(value, dot_policy="none", style="relative", null_policy="omit")
    assert "b:null" not in wire
    assert parse_sync(wire) == {"a": 1, "c": 2}


def test_trailing_newline_always() -> None:
    wire = encode_sync({"a": 1}, dot_policy="none", style="relative")
    assert wire.endswith("\n")
