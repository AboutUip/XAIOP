"""Stream / request lifecycle states."""

from __future__ import annotations

StreamStatus = str

STREAM_STATUS = {
    "IDLE": "idle",
    "CONNECTING": "connecting",
    "STREAMING": "streaming",
    "COMPLETING": "completing",
    "COMPLETED": "completed",
    "ABORTED": "aborted",
    "ERROR": "error",
}

STREAM_IDLE_LIKE: tuple[str, ...] = (
    STREAM_STATUS["IDLE"],
    STREAM_STATUS["COMPLETED"],
    STREAM_STATUS["ABORTED"],
    STREAM_STATUS["ERROR"],
)


def is_stream_busy(status: str) -> bool:
    return status in (
        STREAM_STATUS["CONNECTING"],
        STREAM_STATUS["STREAMING"],
        STREAM_STATUS["COMPLETING"],
    )
