from xaiop import PROTOCOL_VERSION, SDK_VERSION, __version__


def test_protocol_version() -> None:
    assert PROTOCOL_VERSION == "0.6.0"


def test_sdk_version() -> None:
    assert SDK_VERSION == "0.15.1"
    assert __version__ == SDK_VERSION
