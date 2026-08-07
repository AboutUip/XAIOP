import time

import pytest

from xaiop.modes import ALL_STREAM_MODES, STREAM_MODES, normalize_modes
from xaiop.states import STREAM_IDLE_LIKE, STREAM_STATUS, is_stream_busy


def test_normalize_modes_default_callback() -> None:
    modes = normalize_modes(None)
    assert modes == {STREAM_MODES["CALLBACK"]}


def test_normalize_modes_multi_select() -> None:
    modes = normalize_modes([STREAM_MODES["CALLBACK"], STREAM_MODES["PROMISE"]])
    assert modes == {STREAM_MODES["CALLBACK"], STREAM_MODES["PROMISE"]}


def test_normalize_modes_empty_falls_back_to_callback() -> None:
    modes = normalize_modes([])
    assert modes == {STREAM_MODES["CALLBACK"]}


def test_normalize_modes_unknown_raises() -> None:
    with pytest.raises(TypeError, match="unknown stream mode"):
        normalize_modes(["nope"])


def test_all_stream_modes_contains_floor() -> None:
    assert STREAM_MODES["CALLBACK"] in ALL_STREAM_MODES
    assert len(ALL_STREAM_MODES) == 4


def test_is_stream_busy() -> None:
    assert is_stream_busy(STREAM_STATUS["CONNECTING"]) is True
    assert is_stream_busy(STREAM_STATUS["STREAMING"]) is True
    assert is_stream_busy(STREAM_STATUS["COMPLETING"]) is True
    assert is_stream_busy(STREAM_STATUS["IDLE"]) is False
    assert is_stream_busy(STREAM_STATUS["COMPLETED"]) is False


def test_stream_idle_like() -> None:
    assert STREAM_STATUS["IDLE"] in STREAM_IDLE_LIKE
    assert STREAM_STATUS["STREAMING"] not in STREAM_IDLE_LIKE
