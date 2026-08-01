from xaiop import PROTOCOL_VERSION


def test_protocol_version() -> None:
    assert PROTOCOL_VERSION == "0.1.0"
