import json
from pathlib import Path

from xaiop import materialize, parse_sync

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "conformance" / "core-wire"


def test_complex_fixture() -> None:
    source = (FIXTURE_DIR / "complex.xaiop").read_text(encoding="utf-8")
    expected = json.loads(
        (FIXTURE_DIR / "complex.expected.json").read_text(encoding="utf-8")
    )
    assert materialize(parse_sync(source)) == expected
