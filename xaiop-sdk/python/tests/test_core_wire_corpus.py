"""Load shared core-wire cases.json and assert protocol expectations."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from xaiop import (
    LiveParser,
    XaiopEncodeError,
    XaiopFragment,
    XaiopSyntaxError,
    encode_sync,
    materialize,
    parse_sync,
)

CORE = Path(__file__).resolve().parents[2] / "conformance" / "core-wire"
CASES = json.loads((CORE / "cases.json").read_text(encoding="utf-8"))["cases"]


def _num_eq(a, b) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    return a == b


def _deep_eq(a, b) -> bool:
    if isinstance(a, dict) and isinstance(b, dict):
        if set(a) != set(b):
            return False
        return all(_deep_eq(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_deep_eq(x, y) for x, y in zip(a, b))
    return _num_eq(a, b)


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_core_wire_case(case: dict) -> None:
    kind = case["kind"]

    if kind == "parse":
        parsed = parse_sync(case["wire"])
        assert isinstance(parsed, XaiopFragment) is bool(case.get("fragment"))
        assert _deep_eq(materialize(parsed), case["expect"])
        return

    if kind == "parse_file":
        wire = (CORE / case["file"]).read_text(encoding="utf-8")
        expect = json.loads((CORE / case["expect_file"]).read_text(encoding="utf-8"))
        assert _deep_eq(materialize(parse_sync(wire)), expect)
        return

    if kind == "parse_error":
        with pytest.raises(XaiopSyntaxError):
            parse_sync(case["wire"])
        return

    if kind == "live":
        live = LiveParser()
        for chunk in case["chunks"]:
            live.feed_text(chunk)
        assert _deep_eq(materialize(live.value()), case["expect"])
        return

    if kind == "encode":
        wire = encode_sync(
            case["value"],
            root=case.get("root", "auto"),
            key_order=case.get("key_order", "sorted"),
            dot_policy="none",
            style="relative",
        )
        assert wire == case["expect_wire"]
        return

    if kind == "encode_error":
        with pytest.raises(XaiopEncodeError):
            encode_sync(case["value"], root=case.get("root", "auto"))
        return

    if kind == "roundtrip":
        wire = encode_sync(case["value"], key_order=case.get("key_order", "sorted"))
        assert _deep_eq(materialize(parse_sync(wire)), case["value"])
        return

    raise AssertionError(f"unknown kind {kind}")
