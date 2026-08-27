"""Symbol-key mode: U+001F label escape for operator-headed JSON keys."""

from __future__ import annotations

LABEL_ESCAPE_INTRODUCER = "\u001f"


def key_needs_symbol_escape(key: str) -> bool:
    if not isinstance(key, str) or not key:
        return False
    c = ord(key[0])
    return c in (0x1F, 0x23, 0x40, 0x3E, 0x3C, 0x3D, 0x21, 0x26, 0x3F)


def encode_wire_label(key: str, symbol_keys: bool) -> str:
    if symbol_keys and key_needs_symbol_escape(key):
        return LABEL_ESCAPE_INTRODUCER + key
    return key


def decode_wire_label(wire_label: str, symbol_keys: bool) -> str:
    if (
        symbol_keys
        and isinstance(wire_label, str)
        and wire_label
        and ord(wire_label[0]) == 0x1F
    ):
        return wire_label[1:]
    return wire_label
