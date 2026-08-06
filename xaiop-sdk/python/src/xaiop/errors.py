"""XAIOP wire errors."""

from __future__ import annotations


class XaiopSyntaxError(Exception):
    """Syntax error while parsing XAIOP wire text."""

    def __init__(self, message: str, *, line: int | None = None) -> None:
        if line is not None:
            super().__init__(f"line {line}: {message}")
        else:
            super().__init__(message)
        self.line = line


class XaiopEncodeError(Exception):
    """Error while encoding a value to XAIOP wire."""

    def __init__(self, message: str, *, path: str | None = None) -> None:
        super().__init__(message)
        self.path = path
