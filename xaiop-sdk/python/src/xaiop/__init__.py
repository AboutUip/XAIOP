"""XAIOP Python SDK — core protocol track (wire v0.6.0 Frozen)."""

from __future__ import annotations

from .encode import encode_sync
from .errors import XaiopEncodeError, XaiopSyntaxError
from .fragment import XaiopFragment
from .materialize import materialize
from .parse import LiveParser, parse_sync

__version__ = "0.6.0a1"
PROTOCOL_VERSION = "0.6.0"
SDK_VERSION = __version__

__all__ = [
    "PROTOCOL_VERSION",
    "SDK_VERSION",
    "XaiopEncodeError",
    "XaiopFragment",
    "XaiopSyntaxError",
    "LiveParser",
    "__version__",
    "encode_sync",
    "materialize",
    "parse_sync",
]
